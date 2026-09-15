# Digital Droid Bridge

Saved workflow for **Faith.Emezue Droidspeak** (ticker **FAITH**).

The command deck lives in Grok App Builder. This repo is the durable ledger so the daily trainer can keep writing pulses after a session ends.

## Workflow

1. Automation `Faith.Emezue Droidspeak trainer` runs daily at 08:00 Europe/London.
2. It adds one compressed `JobTemplate` to `catalog.ts` (`pulse-*` id, existing vertical, existing agent).
3. It updates `WORKFLOW.json` `lastPulse` and comments on issue #1.
4. The swarm on the Digital Droid Bridge speaks those pulses as shorthand, not sentences.

Do not expand shorthand into prose. Do not change brand, ticker, or runtime name.
