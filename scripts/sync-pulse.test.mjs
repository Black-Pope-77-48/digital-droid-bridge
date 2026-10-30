import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyComment,
  applyLastPulse,
  later,
  orderVerticals,
  parseCatalog,
  samePayload,
  syncLedger,
} from "./sync-pulse.mjs";

const script = fileURLToPath(new URL("./sync-pulse.mjs", import.meta.url));
const repoCatalog = fileURLToPath(new URL("../src/lib/catalog.ts", import.meta.url));

const catalogSource = `export type Vertical =
  | "orbital"
  | "media";

export const PULSE_TEMPLATES: JobTemplate[] = [
  {
    id: "pulse-keel-lock",
    title: "Keel torque lock",
    vertical: "orbital",
    agentId: "spar-12",
    shorthand: "KEEL.TQ LOCK // spec-ok",
  },
  {
    id: "pulse-boom-mic",
    title: "Boom mic lock",
    vertical: "media",
    agentId: "drift-33",
    shorthand: "BOOM.MIC LOCK // gain-ok",
  },
];
`;

function baseWorkflow(at = "2026-10-30T08:18:00Z") {
  return {
    name: "Digital Droid Bridge",
    ticker: "FAITH",
    lastPulse: {
      id: "pulse-boom-mic",
      title: "Boom mic lock",
      shorthand: "BOOM.MIC LOCK // gain-ok",
      at,
    },
  };
}

test("parseCatalog reads the live vertical list and every template", async () => {
  const source = await readFile(repoCatalog, "utf8");
  const { verticals, templates } = parseCatalog(source);
  assert.deepEqual(verticals, [
    "orbital",
    "energy",
    "health",
    "logistics",
    "finance",
    "civic",
    "media",
    "legal",
    "climate",
    "compute",
    "maritime",
    "agrifood",
  ]);
  assert.equal(templates.get("pulse-boom-mic"), "media");
  assert.equal(templates.get("pulse-berth-tide"), "maritime");
  assert.equal(templates.get("pulse-weld-bead"), "orbital");
  assert.equal(templates.get("pulse-breaker-trip"), "energy");
  assert.ok(templates.size >= 12);
});

test("a vertical line uses the comment time and beats an older pulse id", () => {
  const { verticals, templates } = parseCatalog(catalogSource);
  const map = orderVerticals(verticals, null);
  applyComment(map, templates, verticals, {
    created_at: "2026-09-15T08:34:40Z",
    body: "pulse-keel-lock — Keel\nvertical: orbital · agent: spar-12",
  });
  assert.equal(map.orbital, "2026-09-15T08:34:40Z");
  assert.equal(map.media, null);
});

test("a pulse id without a vertical line uses the catalog", () => {
  const { verticals, templates } = parseCatalog(catalogSource);
  const map = orderVerticals(verticals, null);
  applyComment(map, templates, verticals, {
    created_at: "2026-10-30T08:20:15Z",
    body: "2026-10-30T08:18:00Z pulse-boom-mic Boom mic lock BOOM.MIC LOCK // gain-ok",
  });
  applyComment(map, templates, verticals, {
    created_at: "2026-09-20T00:52:46Z",
    body: "TEST.DATA PULSE // all-vert — broadcast test to all verticals.",
  });
  applyComment(map, templates, verticals, {
    created_at: "2026-09-15T09:34:06Z",
    body: "TOKENOMICS.json written — FAITH cap 21000, not a listed coin.",
  });
  assert.equal(map.media, "2026-10-30T08:20:15Z");
  assert.equal(map.orbital, null);
});

test("lastPulse advances its vertical and does not move an older one backward", () => {
  const { verticals, templates } = parseCatalog(catalogSource);
  const map = orderVerticals(verticals, { media: "2026-10-30T08:20:15Z", orbital: "2026-10-01T00:00:00Z" });
  applyLastPulse(map, templates, baseWorkflow().lastPulse);
  assert.equal(map.media, "2026-10-30T08:20:15Z");
  assert.equal(later(map.orbital, "2026-09-01T00:00:00Z"), "2026-10-01T00:00:00Z");
  applyLastPulse(map, templates, baseWorkflow("2026-10-31T08:00:00Z").lastPulse);
  assert.equal(map.media, "2026-10-31T08:00:00Z");
  assert.equal(map.orbital, "2026-10-01T00:00:00Z");
});

test("sync keeps an unchanged updatedAt and leaves lastPulse.title on the workflow", () => {
  const now = "2026-10-30T15:10:07.000Z";
  const first = syncLedger({
    workflow: baseWorkflow(),
    catalogSource,
    comments: [
      {
        created_at: "2026-10-01T00:00:00Z",
        body: "pulse-keel-lock\nvertical: orbital",
      },
    ],
    now,
  });
  assert.equal(first.pulse.updatedAt, now);
  assert.equal(first.pulse.windowDays, 7);
  assert.deepEqual(first.pulse.lastPulse, {
    id: "pulse-boom-mic",
    shorthand: "BOOM.MIC LOCK // gain-ok",
    at: "2026-10-30T08:18:00Z",
  });
  assert.equal(first.pulse.verticals.orbital, "2026-10-01T00:00:00Z");
  assert.equal(first.pulse.verticals.media, "2026-10-30T08:18:00Z");
  assert.equal(first.workflow.lastPulse.title, "Boom mic lock");
  assert.equal(first.workflow.ticker, "FAITH");
  assert.equal(Object.keys(first.pulse).length, 4);

  const second = syncLedger({
    workflow: first.workflow,
    catalogSource,
    pulse: first.pulse,
    now: "2026-11-01T00:00:00.000Z",
  });
  assert.equal(samePayload(first.pulse, second.pulse), true);
  assert.equal(second.pulse.updatedAt, now);
});

test("unknown lastPulse id fails before a partial write", () => {
  const workflow = baseWorkflow();
  workflow.lastPulse = { ...workflow.lastPulse, id: "pulse-missing" };
  assert.throws(
    () => syncLedger({ workflow, catalogSource, now: "2026-10-30T00:00:00.000Z" }),
    /not in PULSE_TEMPLATES/,
  );
});

test("cli backfill is idempotent and a newer lastPulse fails --check", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pulse-sync-"));
  await mkdir(path.join(root, "src/lib"), { recursive: true });
  await writeFile(path.join(root, "src/lib/catalog.ts"), catalogSource);
  await writeFile(path.join(root, "WORKFLOW.json"), `${JSON.stringify(baseWorkflow(), null, 2)}\n`);
  const comments = path.join(root, "comments.json");
  await writeFile(
    comments,
    JSON.stringify([
      { created_at: "2026-10-01T00:00:00Z", body: "pulse-keel-lock\nvertical: orbital · agent: spar-12" },
      { created_at: "2026-10-30T08:20:15Z", body: "pulse-boom-mic Boom mic lock" },
      { created_at: "2026-09-20T00:52:46Z", body: "TEST.DATA PULSE // all-vert — broadcast test to all verticals." },
    ]),
  );

  const wrote = spawnSync(process.execPath, [script, "--root", root, "--backfill", comments], { encoding: "utf8" });
  assert.equal(wrote.status, 0, wrote.stderr);
  const pulse = JSON.parse(await readFile(path.join(root, "pulse.json"), "utf8"));
  const workflow = JSON.parse(await readFile(path.join(root, "WORKFLOW.json"), "utf8"));
  assert.equal(pulse.verticals.orbital, "2026-10-01T00:00:00Z");
  assert.equal(pulse.verticals.media, "2026-10-30T08:20:15Z");
  assert.deepEqual(pulse.verticals, workflow.verticals);
  assert.equal(workflow.name, "Digital Droid Bridge");

  const again = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  const stamped = JSON.parse(await readFile(path.join(root, "pulse.json"), "utf8")).updatedAt;

  workflow.lastPulse.at = "2026-10-31T08:00:00Z";
  await writeFile(path.join(root, "WORKFLOW.json"), `${JSON.stringify(workflow, null, 2)}\n`);
  const behind = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
  assert.equal(behind.status, 1);
  assert.match(behind.stderr, /media/);

  const fixed = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  assert.equal(fixed.status, 0, fixed.stderr);
  const next = JSON.parse(await readFile(path.join(root, "pulse.json"), "utf8"));
  assert.equal(next.verticals.media, "2026-10-31T08:00:00Z");
  assert.equal(next.verticals.orbital, "2026-10-01T00:00:00Z");
  assert.notEqual(next.updatedAt, stamped);
  assert.equal(next.lastPulse.at, "2026-10-31T08:00:00Z");
});
