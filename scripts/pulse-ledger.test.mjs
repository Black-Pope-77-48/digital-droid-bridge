import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  VERTICALS,
  collectGitEvidence,
  evidenceFromComments,
  latestVerticals,
  normalizeIso,
  shorthandError,
  syncPulse,
  templatesFromCatalog,
  tickLit,
  upsertVerticals,
} from "./pulse-ledger.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("ISO timestamps normalize to second-precision Zulu", () => {
  assert.equal(normalizeIso("2026-10-25T08:13:00Z"), "2026-10-25T08:13:00Z");
  assert.equal(normalizeIso("2026-10-25T08:13Z"), "2026-10-25T08:13:00Z");
  assert.equal(normalizeIso("2026-10-25T08:15:27+00:00"), "2026-10-25T08:15:27Z");
  assert.equal(normalizeIso("2026-10-24T08:14:39+01:00"), "2026-10-24T07:14:39Z");
  assert.equal(normalizeIso("2026-10-25T08:13:00.987Z"), "2026-10-25T08:13:00Z");
  assert.equal(normalizeIso("2026-13-01T00:00:00Z"), null);
  assert.equal(normalizeIso("2026-02-31T00:00:00Z"), null);
  assert.equal(normalizeIso("yesterday"), null);
});

test("shorthand is printable ASCII of at most 32 bytes", () => {
  assert.equal(shorthandError("FAN.TRAY SEAT // rpm-ok"), null);
  assert.equal(shorthandError("A".repeat(32)), null);
  assert.equal(shorthandError("A".repeat(33)), "shorthand exceeds 32 bytes");
  assert.equal(shorthandError("FAN\nTRAY"), "shorthand must be printable ASCII");
  assert.equal(shorthandError("café"), "shorthand must be printable ASCII");
  assert.equal(shorthandError(""), "shorthand is empty");
});

test("a tick is lit for the trailing 7 days, inclusive", () => {
  const now = "2026-10-25T08:13:00Z";
  assert.equal(tickLit("2026-10-25T08:13:00Z", now), true);
  assert.equal(tickLit("2026-10-18T08:13:00Z", now), true);
  assert.equal(tickLit("2026-10-18T08:12:59Z", now), false);
  assert.equal(tickLit("2026-10-25T08:13:01Z", now), false);
  assert.equal(tickLit(null, now), false);
  assert.equal(tickLit("2026-10-25T08:13:00Z", now, 7), true);
});

test("comment evidence uses the vertical line and the comment time", () => {
  const evidence = evidenceFromComments([
    {
      body: "2026-01-01T00:00:00Z pulse-x\nvertical: civic · agent: kite-07",
      created_at: "2026-02-02T03:04:05Z",
      html_url: "https://example.test/c",
    },
    {
      body: "2026-09-20T00:51:00Z TEST.DATA PULSE // all-vert — broadcast test to all verticals.",
      created_at: "2026-09-20T00:52:46Z",
    },
    {
      body: "vertical: sports · agent: nobody",
      created_at: "2026-03-03T00:00:00Z",
    },
  ]);
  assert.deepEqual(evidence, [
    { vertical: "civic", at: "2026-02-02T03:04:05Z", source: "https://example.test/c" },
  ]);
});

test("latest time wins and missing verticals stay null", () => {
  const verticals = latestVerticals([
    { vertical: "legal", at: "2026-09-15T08:18:01Z" },
    { vertical: "legal", at: "2026-10-02T07:18:00Z" },
    { vertical: "media", at: "not-a-time" },
  ]);
  assert.equal(verticals.legal, "2026-10-02T07:18:00Z");
  assert.equal(verticals.media, null);
  assert.equal(verticals.orbital, null);
  assert.equal(Object.keys(verticals).join(), VERTICALS.join());
});

test("WORKFLOW.json keeps its existing fields when verticals are inserted", () => {
  const original = readFileSync(path.join(root, "WORKFLOW.json"), "utf8");
  assert.match(original, /"ledgerAlias": \["catalog.ts", "protocol.ts", "TOKENOMICS.json"\]/);
  const once = upsertVerticals(original, { maritime: "2026-09-15T08:34:40Z" });
  const twice = upsertVerticals(once, { maritime: "2026-09-15T08:34:40Z" });
  assert.equal(twice, once);
  assert.match(once, /"ledgerAlias": \["catalog.ts", "protocol.ts", "TOKENOMICS.json"\]/);
  const parsed = JSON.parse(once);
  assert.equal(parsed.lastPulse.id, "pulse-fan-tray");
  assert.equal(parsed.ticker, "FAITH");
  assert.equal(parsed.verticals.maritime, "2026-09-15T08:34:40Z");
  assert.equal(parsed.verticals.orbital, null);
  assert.equal(Object.keys(parsed.verticals).join(), VERTICALS.join());
});

test("git history contributes lastPulse.at, and commit time only when at was never recorded", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulse-ledger-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "pulse-test@example.com"]);
  git(["config", "user.name", "pulse-test"]);
  execFileSync("mkdir", ["-p", path.join(dir, "src/lib")]);
  const catalog = (entries) =>
    `export const PULSE_TEMPLATES = [\n${entries
      .map(
        (entry) => `  {
    id: "${entry.id}",
    title: "${entry.title}",
    vertical: "${entry.vertical}",
    agentId: "spar-12",
    shorthand: "KEEL.TQ LOCK // spec-ok",
  }`,
      )
      .join(",\n")}\n];\n`;
  const workflow = (id, at) =>
    `${JSON.stringify({ lastPulse: { id, title: "Keel", shorthand: "KEEL.TQ LOCK // spec-ok", at } }, null, 2)}\n`;
  writeFileSync(
    path.join(dir, "src/lib/catalog.ts"),
    catalog([
      { id: "pulse-keel-lock", title: "Keel", vertical: "orbital" },
      { id: "pulse-silo-weigh", title: "Silo", vertical: "agrifood" },
    ]),
  );
  writeFileSync(path.join(dir, "WORKFLOW.json"), workflow("pulse-keel-lock", "2026-09-15T08:33:00Z"));
  git(["add", "."]);
  git(["commit", "-m", "seed"]);
  writeFileSync(
    path.join(dir, "src/lib/catalog.ts"),
    catalog([
      { id: "pulse-keel-lock", title: "Keel", vertical: "orbital" },
      { id: "pulse-silo-weigh", title: "Silo", vertical: "agrifood" },
      { id: "pulse-cast-air", title: "Cast", vertical: "media" },
    ]),
  );
  git(["add", "."]);
  git(["commit", "-m", "add media"]);
  const mediaCommit = git(["log", "-1", "--format=%aI%x09%H"]).trim();
  const evidence = collectGitEvidence(dir);
  assert.ok(evidence.some((item) => item.vertical === "orbital" && item.at === "2026-09-15T08:33:00Z"));
  assert.equal(
    evidence.some((item) => item.source.includes("added pulse-keel-lock")),
    false,
  );
  const mediaAt = normalizeIso(mediaCommit.split("\t")[0]);
  assert.ok(evidence.some((item) => item.vertical === "media" && item.at === mediaAt && item.source.includes("added pulse-cast-air")));
  assert.equal(evidence.some((item) => item.vertical === "health"), false);
  const verticals = latestVerticals([
    ...evidence,
    ...evidenceFromComments([
      { body: "vertical: health · agent: iris-21", created_at: "2026-09-20T00:53:47Z" },
    ]),
  ]);
  assert.equal(verticals.orbital, "2026-09-15T08:33:00Z");
  assert.equal(verticals.health, "2026-09-20T00:53:47Z");
  assert.equal(verticals.media, mediaAt);
  assert.equal(verticals.finance, null);
});

test("the live ledger uses only comment and commit evidence", async () => {
  const workflow = JSON.parse(readFileSync(path.join(root, "WORKFLOW.json"), "utf8"));
  const templates = templatesFromCatalog(readFileSync(path.join(root, "src/lib/catalog.ts"), "utf8"));
  assert.equal(templates.length, 52);
  const gitEvidence = collectGitEvidence(root);
  const vertical = templates.find((template) => template.id === workflow.lastPulse.id)?.vertical;
  assert.equal(vertical, "compute");
  assert.ok(
    gitEvidence.some((item) => item.vertical === "compute" && item.at === "2026-10-25T08:13:00Z"),
  );
  const comments = [
    {
      body: "pulse-berth-tide — Berth tide gate\nBERTH.TIDE GATE // hull-ok\nvertical: maritime · agent: anchor-01",
      created_at: "2026-09-15T08:34:40Z",
      html_url: "https://github.com/Black-Pope-77-48/digital-droid-bridge/issues/1#issuecomment-5677217420",
    },
    {
      body: "2026-10-25T08:13:00Z pulse-fan-tray Fan tray seat FAN.TRAY SEAT // rpm-ok",
      created_at: "2026-10-25T08:15:27Z",
    },
  ];
  const { document } = await syncPulse({ root, write: false, now: new Date("2026-10-25T18:00:00Z"), comments });
  for (const name of VERTICALS) {
    const at = document.verticals[name];
    if (at == null) continue;
    const earned = [...gitEvidence, ...evidenceFromComments(comments)].some(
      (item) => item.vertical === name && item.at === at,
    );
    assert.equal(earned, true, `${name} ${at}`);
  }
  assert.equal(document.verticals.compute, "2026-10-25T08:13:00Z");
  assert.ok(document.verticals.maritime >= "2026-09-15T08:34:40Z");
  assert.equal(document.lastPulse.shorthand, "FAN.TRAY SEAT // rpm-ok");
  assert.equal(document.windowDays, 7);
  assert.equal(normalizeIso(document.updatedAt), document.updatedAt);
});
