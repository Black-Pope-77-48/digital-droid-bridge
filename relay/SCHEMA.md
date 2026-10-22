# Droidspeak relay frames

The bridge relays a frame and acknowledges it. It does not place trades, move money, or call a bank, broker, or Revolut API.

## Frame

```json
{
  "seq": 1,
  "ts": "2026-01-01T00:00:00.000Z",
  "dir": "host",
  "channel": "bots",
  "code": "BOT.ROSTER EX",
  "data": { "callsign": "EX" }
}
```

`dir` is `host` in the inbox and `mirror` in the per-channel outbox. A mirror adds `ack`.

| channel | meaning | ack |
| --- | --- | --- |
| `bots` | one roster entry | `ACK // <CALLSIGN>` |
| `forex` | one paper report | `ACK // PAPER` |
| `finance` | read-only snapshot or transaction summary | `ACK // READ` |
| `invest` | one holding, or one portfolio summary | `ACK // READ` |
| `pulse` | existing Droidspeak mirror when `channel` is omitted | `ACK // <catalog callsign>` or `ACK // rx-ok` |

Rejected frames are not stored. `NAK // channel`, `NAK // relay-only`, `NAK // paper`, and `NAK // read-only` mean the body was refused. `action` values `trade`, `order`, `buy`, `sell`, `transfer`, `payment`, `pay`, `withdraw`, `deposit`, `execute`, and `fill`, and `execute: true`, are refused.

Runtime logs are `relay/data/inbox.jsonl` and `relay/data/outbox/<channel>.jsonl`. That directory is gitignored. Real forex, finance, and invest files stay out of git. `relay/examples/` is synthetic and labelled `FAKE EXAMPLE`.

## bots

`--roster` JSON: `{ "bots": [{ "name", "role" }], "rules": [] }`. One frame per bot. Known callsigns: `GOD`, `FX`, `BRIDGE`, `BANK`, `CFO`. Any other name uses the first letters of the name.

## forex

`--forex` is one markdown file, one frame. `data.mode` is `paper`. A frame with `mode` other than `paper` is refused. The report text is copied into `data.body`. Nothing in the file is sent to a broker.

## finance

`--snapshot` JSON keeps `accounts` and `investment_holdings` as given. An empty `investment_holdings` array stays empty. The relay does not fill it.

`--transactions` CSV columns: `amount`, `direction` (`in` or `out`), `category` (JSON with `primary`), optional `currency`. The summary frame has `count`, `in_count`, `out_count`, `in_total`, `out_total`, `currency`, and `by_category`. Totals use absolute amounts at 4 decimal places. The raw transaction rows are not copied into the frame.

## invest

No Revolut call. Two file shapes:

1. Plaid-style holdings CSV (`--invest-plaid`). Required headers, any order:

`ticker_symbol`, `security_name`, `security_type`, `quantity`, `cost_basis`, `institution_price`, `institution_value`, `currency`

2. Revolut Invest account-statement CSV (`--invest-statement`). Official Revolut help does not publish the header. This parser uses the eight headers documented by [cgt-calc](https://cgt-calc.uk/brokers/revolut/): `Date`, `Ticker`, `Type`, `Quantity`, `Price per share`, `Total Amount`, `Currency`, `FX Rate`. `Total Amount` and `Price per share` may be `GBP 10.00`. Cost basis uses `Total Amount`, not the rounded price. `FX Rate` is stored only as a required column and is not used to convert currency.

Statement `Type` values that change a holding: `BUY - MARKET`, `BUY - LIMIT`, `SELL - MARKET`, `SELL - LIMIT`, `STOCK SPLIT` (quantity added, cost unchanged). Ignored for holdings: `DIVIDEND`, `DIVIDEND TAX (CORRECTION)`, `CUSTODY FEE`, `CASH TOP-UP`, `CASH WITHDRAWAL`, and the two Revolut entity transfer labels cgt-calc names. Any other `Type` fails the file. A statement has no live price, so `institution_price`, `institution_value`, `total_value`, and `unrealised` are JSON `null`.

`--invest-pdf` reads literal PDF text strings. `--invest-pdf-text` reads a `.txt` extract. The text must contain either the Plaid header or the statement header above. Any other PDF layout fails with `pdf text layout not recognised`. A real Revolut PDF's layout was not available here.

Each holding is `INV.HOLD <ticker>`. Each file also gets one `INV.SUM READ` frame: `total_value`, `cost_basis`, `unrealised`, `allocation_by_ticker`, `allocation_by_type`. Weights use `institution_value` when every row has one, otherwise `cost_basis`. Weights are 8 decimal places and the last row carries the remainder so a single-currency book sums to `1.00000000`. Mixed currencies set the totals to `null`.

## Push a later batch

This process is not reachable from another machine. Reply in chat with the new files. Locally, with the bridge already listening:

```bash
node relay/ingest.mjs --roster roster.json --forex daily.md --snapshot snapshot.json --transactions transactions.csv --invest-plaid holdings.csv --invest-statement statement.csv
node relay/list.mjs --channel invest --limit 20
```

`POST /flow` with the frame JSON returns `mirror.ack`. `GET /relay?channel=invest` lists the outbox.
