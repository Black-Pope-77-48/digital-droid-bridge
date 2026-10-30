#!/usr/bin/env node
// Publish per-vertical last-seen times for the watch tick.
//
// The daily trainer is outside this repo. It commits WORKFLOW.json lastPulse
// on main and comments on ledger issue #1. This script is what keeps
// WORKFLOW.json verticals and root pulse.json on that same pulse.
//
//   node scripts/sync-pulse.mjs
//   node scripts/sync-pulse.mjs --check
//   node scripts/sync-pulse.mjs --backfill comments.json
//
// --backfill reads issue comments once. A `vertical:` line stamps that
// vertical at the comment's created_at. Comments that only name a pulse id
// use PULSE_TEMPLATES for the vertical and the same comment time. lastPulse.at
// is applied when it is later. Later runs without --backfill keep those times
// and only advance the vertical for the current lastPulse.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WINDOW_DAYS = 7;

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function parseCatalog(source) {
  const typeBlock = source.match(/export type Vertical =\s*([^;]+);/);
  if (!typeBlock) throw new Error("catalog missing Vertical type");
  const verticals = [...typeBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (verticals.length === 0) throw new Error("catalog Vertical type is empty");

  const listStart = source.indexOf("export const PULSE_TEMPLATES");
  if (listStart < 0) throw new Error("catalog missing PULSE_TEMPLATES");
  const list = source.slice(listStart);
  const end = list.indexOf("];");
  const body = end >= 0 ? list.slice(0, end) : list;
  const ids = [...body.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
  const templates = new Map();
  for (const object of body.match(/\{[\s\S]*?\}/g) ?? []) {
    const id = object.match(/id:\s*"([^"]+)"/);
    const vertical = object.match(/vertical:\s*"([^"]+)"/);
    if (!id || !vertical) continue;
    if (!verticals.includes(vertical[1])) {
      throw new Error(`template ${id[1]} has unknown vertical ${vertical[1]}`);
    }
    templates.set(id[1], vertical[1]);
  }
  if (ids.length === 0 || ids.length !== templates.size || ids.some((id) => !templates.has(id))) {
    throw new Error(`parsed ${templates.size} of ${ids.length} pulse templates`);
  }
  return { verticals, templates };
}

export function orderVerticals(verticals, map) {
  const ordered = {};
  for (const name of verticals) {
    const value = map?.[name];
    ordered[name] = value == null || value === "" ? null : value;
  }
  return ordered;
}

export function later(current, candidate) {
  if (typeof candidate !== "string" || Number.isNaN(Date.parse(candidate))) return current ?? null;
  if (current == null || Number.isNaN(Date.parse(current)) || Date.parse(candidate) > Date.parse(current)) {
    return candidate;
  }
  return current;
}

export function applyComment(map, templates, verticals, comment) {
  const at = comment?.created_at;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return;
  const body = String(comment.body ?? "");
  const named = [...body.matchAll(/vertical:\s*([a-z]+)/gi)].map((match) => match[1].toLowerCase());
  const known = named.filter((name) => verticals.includes(name));
  if (known.length > 0) {
    for (const name of known) map[name] = later(map[name], at);
    return;
  }
  const ids = body.match(/\bpulse-[a-z0-9-]+\b/g) ?? [];
  for (const id of new Set(ids)) {
    const vertical = templates.get(id);
    if (vertical && verticals.includes(vertical)) map[vertical] = later(map[vertical], at);
  }
}

export function applyLastPulse(map, templates, lastPulse) {
  if (!lastPulse?.id || !lastPulse.shorthand || !lastPulse.at) {
    throw new Error("lastPulse needs id, shorthand, and at");
  }
  const vertical = templates.get(lastPulse.id);
  if (!vertical) throw new Error(`lastPulse id ${lastPulse.id} is not in PULSE_TEMPLATES`);
  map[vertical] = later(map[vertical], lastPulse.at);
  return vertical;
}

export function pulseDocument(verticals, lastPulse, updatedAt) {
  return {
    windowDays: WINDOW_DAYS,
    updatedAt,
    lastPulse: {
      id: lastPulse.id,
      shorthand: lastPulse.shorthand,
      at: lastPulse.at,
    },
    verticals,
  };
}

export function samePayload(left, right) {
  if (!left || !right) return false;
  return (
    left.windowDays === right.windowDays &&
    left.lastPulse?.id === right.lastPulse?.id &&
    left.lastPulse?.shorthand === right.lastPulse?.shorthand &&
    left.lastPulse?.at === right.lastPulse?.at &&
    JSON.stringify(left.verticals) === JSON.stringify(right.verticals)
  );
}

export function syncLedger({ workflow, catalogSource, comments = null, pulse = null, now }) {
  const { verticals, templates } = parseCatalog(catalogSource);
  const map = orderVerticals(verticals, workflow.verticals);
  if (comments) {
    for (const comment of comments) applyComment(map, templates, verticals, comment);
  }
  applyLastPulse(map, templates, workflow.lastPulse);
  const ordered = orderVerticals(verticals, map);
  const draft = pulseDocument(ordered, workflow.lastPulse, pulse?.updatedAt ?? now);
  const updatedAt = pulse && samePayload(pulse, draft) ? pulse.updatedAt : now;
  return {
    workflow: { ...workflow, verticals: ordered },
    pulse: pulseDocument(ordered, workflow.lastPulse, updatedAt),
  };
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function readJson(file) {
  const text = readText(file);
  return text == null ? null : JSON.parse(text);
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = { check: false, backfill: null, root: ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--backfill") {
      args.backfill = argv[i + 1];
      i += 1;
    } else if (arg === "--root") {
      args.root = path.resolve(argv[i + 1]);
      i += 1;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (args.backfill === undefined) throw new Error("--backfill needs a comments JSON file");
  return args;
}

function drift(before, after) {
  const lines = [];
  if (before == null) return ["pulse.json missing"];
  if (before.windowDays !== after.windowDays) lines.push("windowDays");
  if (before.lastPulse?.id !== after.lastPulse?.id) lines.push("lastPulse.id");
  if (before.lastPulse?.shorthand !== after.lastPulse?.shorthand) lines.push("lastPulse.shorthand");
  if (before.lastPulse?.at !== after.lastPulse?.at) lines.push("lastPulse.at");
  const names = new Set([...Object.keys(before.verticals ?? {}), ...Object.keys(after.verticals)]);
  for (const name of names) {
    if ((before.verticals ?? {})[name] !== after.verticals[name]) lines.push(name);
  }
  return lines;
}

export function run(argv, now = new Date().toISOString()) {
  const args = parseArgs(argv);
  const root = args.root;
  const workflowPath = path.join(root, "WORKFLOW.json");
  const pulsePath = path.join(root, "pulse.json");
  const catalogPath = path.join(root, "src/lib/catalog.ts");
  const workflow = readJson(workflowPath);
  if (!workflow) throw new Error(`missing ${workflowPath}`);
  const catalogSource = readText(catalogPath);
  if (catalogSource == null) throw new Error(`missing ${catalogPath}`);
  const comments = args.backfill ? readJson(path.resolve(args.backfill)) : null;
  if (args.backfill && !Array.isArray(comments)) {
    throw new Error("--backfill file must be a JSON array of issue comments");
  }
  const next = syncLedger({
    workflow,
    catalogSource,
    comments,
    pulse: readJson(pulsePath),
    now,
  });
  const workflowText = jsonText(next.workflow);
  const pulseText = jsonText(next.pulse);
  const changed = readText(workflowPath) !== workflowText || readText(pulsePath) !== pulseText;
  if (args.check) {
    if (changed) {
      console.error(`pulse drift: ${drift(readJson(pulsePath), next.pulse).join(", ")}`);
      return 1;
    }
    console.log("pulse ok");
    return 0;
  }
  if (!changed) {
    console.log(`pulse ok ${next.pulse.lastPulse.id}`);
    return 0;
  }
  writeFileSync(workflowPath, workflowText);
  writeFileSync(pulsePath, pulseText);
  console.log(`pulse wrote ${next.pulse.lastPulse.id} ${next.pulse.updatedAt}`);
  return 0;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (invokedDirectly()) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
