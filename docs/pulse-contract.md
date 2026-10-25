# Pulse contract

A watch reads one file and lights one tick for each industry vertical that has pulsed inside the published window.

## Files

| Path | Role |
| --- | --- |
| `pulse.json` | The file the watch fetches. Keep it small. |
| `WORKFLOW.json` | Ledger. Its `verticals` map matches `pulse.json`. `lastPulse` here also keeps `title`. |

`verticals` has exactly these keys, in this order: `orbital`, `energy`, `health`, `logistics`, `finance`, `civic`, `media`, `legal`, `climate`, `compute`, `maritime`, `agrifood`. Each value is an ISO UTC timestamp or `null`. `null` means that vertical has never pulsed.

## Raw URLs

The watch fetches:

`https://raw.githubusercontent.com/Black-Pope-77-48/digital-droid-bridge/main/pulse.json`

The same map is also at:

`https://raw.githubusercontent.com/Black-Pope-77-48/digital-droid-bridge/main/WORKFLOW.json`

GitHub may cache the raw response. Refetch at least once a day and use `updatedAt` to see whether the body changed.

## Schema

```json
{
  "verticals": {
    "orbital": "2026-10-05T07:16:00Z",
    "energy": "2026-10-24T07:14:00Z",
    "health": "2026-10-20T07:13:00Z",
    "logistics": "2026-10-22T07:13:00Z",
    "finance": "2026-10-15T07:16:00Z",
    "civic": "2026-10-01T07:11:00Z",
    "media": "2026-10-04T07:16:00Z",
    "legal": "2026-10-02T07:18:00Z",
    "climate": "2026-09-30T07:12:00Z",
    "compute": "2026-10-25T08:13:00Z",
    "maritime": "2026-10-23T07:14:00Z",
    "agrifood": "2026-10-17T07:15:00Z"
  },
  "lastPulse": {
    "id": "pulse-fan-tray",
    "shorthand": "FAN.TRAY SEAT // rpm-ok",
    "at": "2026-10-25T08:13:00Z"
  },
  "windowDays": 7,
  "updatedAt": "2026-10-25T22:59:51Z"
}
```

That object is the publication snapshot. Later trainer runs replace the timestamps. The raw file is the one to read.

`lastPulse.id` is a `pulse-` id. `lastPulse.shorthand` is the Droidspeak code. `lastPulse.at` is when that pulse was recorded. `updatedAt` is when this file was written. `windowDays` is `7`.

## What consumers must validate

Reject the file, and light nothing, unless all of the following hold:

- The body is one JSON object with `verticals`, `lastPulse`, `windowDays`, and `updatedAt`.
- `verticals` has exactly the 12 names above. Each value is JSON `null` or a timestamp.
- `lastPulse` is an object with string `id`, string `shorthand`, and timestamp `at`.
- `shorthand` is printable ASCII only (bytes `0x20` through `0x7E`) and its UTF-8 length is at most 32 bytes.
- Every timestamp matches `YYYY-MM-DDTHH:mm:ssZ`. Reject offsets, milliseconds, and local times.
- `windowDays` is the number `7`.
- `updatedAt` is a timestamp in that same form.

Ignore unknown extra keys. Do not guess a vertical that is missing.

## Seven-day tick

Evaluate this per vertical after the file has passed validation. Use the watch's current UTC time as `now`.

Light the tick when `verticals[name]` is a timestamp, that timestamp is not after `now`, and `now - at` is less than or equal to 7 × 24 hours (168 hours). The boundary is inclusive: a pulse exactly 168 hours old stays lit, and one second older goes dark.

Leave the tick dark when the value is `null`, when the timestamp is in the future, or when the file was rejected.

`lastPulse` does not light a tick by itself. Ticks come only from `verticals`.

## Where the times come from

The sync script rebuilds `verticals` from evidence already recorded. It does not invent a clock.

1. Issue #1 comments. A line that starts with `vertical:` names one of the 12 verticals. The time is that comment's `created_at`. The only such comment today is [issuecomment-5677217420](https://github.com/Black-Pope-77-48/digital-droid-bridge/issues/1#issuecomment-5677217420) (`maritime`, `2026-09-15T08:34:40Z`). A later maritime pulse supersedes it.
2. Commit history of `WORKFLOW.json`. When a commit records `lastPulse.id` and `lastPulse.at`, the id is mapped to a vertical through `PULSE_TEMPLATES` in `src/lib/catalog.ts`, and `lastPulse.at` is the candidate time.
3. Commit history of `src/lib/catalog.ts`, only as a fallback. If a template was added in a commit and that id never appears as `lastPulse`, the candidate is that commit's author time in UTC.

The latest candidate for each vertical is stored. A vertical with no candidate stays `null`.

## How the two files stay updated

The daily trainer is not a workflow in this repo. It commits to `main` as the repository owner, edits `lastPulse` inside `WORKFLOW.json`, adds a template to `src/lib/catalog.ts`, and comments on issue #1. It does not write `pulse.json`.

`.github/workflows/pulse-sync.yml` runs `node scripts/sync-pulse.mjs` when `main` changes those files, and again at 07:30 and 08:30 UTC. Those hours cover the trainer's 08:15 Europe/London run in both BST and GMT. The script rewrites `WORKFLOW.json` `verticals` and `pulse.json` together. When they differ from `main`, the workflow commits them as `github-actions[bot]`. A second run with the same evidence does not change `updatedAt`.

The bot's own push does not start another run. `workflow_dispatch` can repair a missed day. Pull requests run the script with `--check` and do not push.
