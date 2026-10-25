#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERTICALS, syncPulse } from "./pulse-ledger.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const { changed, document, evidence } = await syncPulse({
  root,
  write: !check,
  now: new Date(),
});

for (const name of VERTICALS) {
  const at = document.verticals[name];
  const sources = evidence.filter((item) => item.vertical === name && item.at === at).map((item) => item.source);
  console.log(`${name}\t${at ?? "null"}\t${sources.join(" | ") || "no pulse recorded"}`);
}
console.log(`lastPulse ${document.lastPulse.id} ${document.lastPulse.at} windowDays=${document.windowDays}`);

if (check && changed) {
  console.error("pulse ledger is out of date. Run: node scripts/sync-pulse.mjs");
  process.exit(1);
}
