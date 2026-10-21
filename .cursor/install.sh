#!/usr/bin/env bash
# Idempotent ledger check for Cloud Agent builds. Reads only; safe to rerun.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 - <<'PY'
import json
from pathlib import Path

root = Path(".")
workflow = json.loads((root / "WORKFLOW.json").read_text())
tokenomics = json.loads((root / "TOKENOMICS.json").read_text())
catalog = (root / "src/lib/catalog.ts").read_text()
protocol = (root / "src/lib/protocol.ts").read_text()
lab = (root / "robot-communicate-lab.html").read_text()

pulse = workflow["lastPulse"]
pulse_id = pulse["id"]
if f'id: "{pulse_id}"' not in catalog:
    raise SystemExit(f"catalog missing {pulse_id}")
if pulse["shorthand"] not in catalog:
    raise SystemExit(f"catalog missing shorthand for {pulse_id}")
if workflow.get("ticker") != tokenomics.get("ticker"):
    raise SystemExit("WORKFLOW.json and TOKENOMICS.json ticker mismatch")
if workflow.get("ticker") != "FAITH":
    raise SystemExit("unexpected ticker")
if "export function encode" not in protocol or "export function matchJob" not in protocol:
    raise SystemExit("protocol encode/matchJob missing")
if "Droidspeak Pulse" not in lab or "mirrorPulse" not in lab:
    raise SystemExit("robot-communicate-lab.html missing the pulse surface")

print(f"ledger ok: {pulse_id} ticker={workflow['ticker']}")
PY

node --experimental-strip-types --import ./bridge/register.mjs --input-type=module <<'JS'
import { lastPulse } from "./src/lib/store.ts";
import { encode } from "./src/lib/protocol.ts";
const pulse = lastPulse();
if (!pulse.shorthand || encode("keel pass complete") !== "KEEL.PASS DONE") {
  throw new Error("bridge ledger import failed");
}
console.log(`bridge ok: ${pulse.id}`);
JS

# mempool is cloned beside this repo for the shared environment. Its full
# npm/rust install is intentionally not run here: the default image already
# has Node and Rust, and backend preinstall rebuilds rust-gbt.
found_mempool=0
for candidate in \
  "$ROOT/../mempool/backend/package.json" \
  "/workspace/mempool/backend/package.json" \
  "/agent/repos/mempool/backend/package.json"
do
  if [[ -f "$candidate" ]]; then
    echo "mempool checkout present: $candidate"
    found_mempool=1
    break
  fi
done
if [[ "$found_mempool" -eq 0 ]]; then
  echo "mempool checkout not beside this repo; bridge ledger check still applies"
fi
