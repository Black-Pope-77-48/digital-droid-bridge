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

## Lessons

`BAY: STUDY`

The lesson index is [`docs/lessons/README.md`](docs/lessons/README.md). It points at a private study repo, and those links work only for the owner. Lesson notes and code stay in that repo. Lesson 06 is planned and not yet built.
