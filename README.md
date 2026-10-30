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
5. A push to `main` runs `scripts/sync-pulse.mjs` (`.github/workflows/sync-pulse.yml`). The script looks up `lastPulse.id` in `PULSE_TEMPLATES` and advances that vertical's timestamp in `WORKFLOW.json` `verticals` and `pulse.json`.

The trainer is not a workflow in this repo. It commits to `main` as the repo owner just after 08:00 Europe/London. The GitHub Action is the hook that still updates both files when that commit only edits `lastPulse`.

## Watch ticks

[`pulse.json`](pulse.json) is the small file a watch fetches:

https://raw.githubusercontent.com/Black-Pope-77-48/digital-droid-bridge/main/pulse.json

`WORKFLOW.json` `verticals` is the same map. Existing `WORKFLOW.json` fields stay, including `lastPulse.title`. `pulse.json` `lastPulse` keeps only `id`, `shorthand`, and `at`.

| Field | Content |
| --- | --- |
| `windowDays` | `7` |
| `updatedAt` | ISO UTC time this file last changed |
| `lastPulse.id` | Job id from `PULSE_TEMPLATES` |
| `lastPulse.shorthand` | Spoken code |
| `lastPulse.at` | Pulse time, ISO UTC |
| `verticals.<name>` | ISO UTC of that vertical's latest pulse, or `null` |

Light a tick when `verticals.<name>` is within the last `windowDays`. The twelve keys follow the `Vertical` union in `src/lib/catalog.ts`: orbital, energy, health, logistics, finance, civic, media, legal, climate, compute, maritime, agrifood.

The first map was filled from the comments on issue #1. A comment with a `vertical:` line stamps that vertical at the comment's `created_at`. The other pulse comments name a `pulse-*` id and no vertical; those use the catalog lookup and the same comment time. `lastPulse.at` is applied when it is later. A later trainer run does not read the issue again. It only moves the current pulse's vertical forward.

Do not expand shorthand into prose. Do not change brand, ticker, or runtime name.

## Relay

`bridge/agent.mjs` still mirrors a pulse on `POST /flow`. A frame may also set `channel` to `bots`, `forex`, `finance`, or `invest`. The relay validates it, appends the host frame to `relay/data/inbox.jsonl`, and appends the mirror to `relay/data/outbox/<channel>.jsonl`. See `relay/SCHEMA.md`.

`relay/data/` is gitignored. Do not commit real forex, Revolut, Plaid, or Invest files, or frames made from them. `relay/examples/` is fake.

The bridge does not place trades, move money, or call Revolut. Forex frames are paper reports. Finance and invest frames are read-only files.

Another machine with no inbound network cannot open a socket to this bridge. Send the next files back in chat. On a machine that already has this repo and a local bridge:

```bash
node --experimental-strip-types --import ./bridge/register.mjs ./bridge/agent.mjs
node relay/ingest.mjs --roster roster.json --forex daily.md --snapshot snapshot.json --transactions tx.csv --invest-plaid holdings.csv
node relay/list.mjs
```
