# Digital Droid Bridge

Saved workflow for **Faith.Emezue Droidspeak** (ticker **FAITH**).

The command deck lives in Grok App Builder. This repo is the durable ledger so the daily trainer can keep writing pulses after a session ends.

## App Builder paths (merged)

- `src/lib/catalog.ts` — source of truth for `PULSE_TEMPLATES` + `AGENTS`
- `src/lib/protocol.ts` — `VERTICAL_HINTS` + encode/match
- `src/lib/store.ts` — last-pulse helper
- `src/routes/train.tsx` — train surface
- root `catalog.ts` / `protocol.ts` re-export the src modules so the automation ledger stays valid

## Workflow

1. Automation `Faith.Emezue Droidspeak trainer` runs daily at 08:00 Europe/London.
2. It adds one compressed `JobTemplate` to `src/lib/catalog.ts` (`pulse-*` id, existing vertical, existing agent).
3. It updates `WORKFLOW.json` `lastPulse` and comments on issue #1.
4. The swarm on the Digital Droid Bridge speaks those pulses as shorthand, not sentences.

Do not expand shorthand into prose. Do not change brand, ticker, or runtime name.
