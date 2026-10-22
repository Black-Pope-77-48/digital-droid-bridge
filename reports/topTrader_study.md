# Top-trader study: 10% to 40% a day on a £1,470 paper account

Paper only. No broker was called. No order was sent. `LIVE_TRADING` is not a switch in this study, and `config.yaml` was not edited. Every return below is either a sentence from a page fetched for this study or a number printed by `studies/fx_paper/run_study.py` (yfinance 1.7.0, seed 20261022, 10,000 paths, 20 trading days).

The target needs a daily return of **0.10** or **0.40**. Compounded for 20 trading days, the script printed:

- `compound_10pct_20d_multiple=6.7274999493`
- `compound_10pct_20d_end_gbp=9889.4249255086`
- `compound_40pct_20d_multiple=836.6825542528`
- `compound_40pct_20d_end_gbp=1229923.3547516849`

So 10% a day lands at £9,889.42 (6.7275×). 40% a day lands at £1,229,923.35 (836.6826×). That matches the stated 6.73× / £9,889 and 836.68× / £1,229,923 once rounded.

## What the fetched record actually shows

### Retail CFD accounts lose money

ESMA, 27 March 2018, [press release](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors):

> NCAs’ analyses on CFD trading across different EU jurisdictions shows that 74-89% of retail accounts typically lose money on their investments, with average losses per client ranging from €1,600 to €29,000.

The same page sets the leverage caps ESMA agreed: 30:1 for major currency pairs and 20:1 for non-major currency pairs. It also sets a 50% margin close-out and negative-balance protection.

FCA, 6 December 2016, [press release](https://www.fca.org.uk/news/press-releases/fca-proposes-stricter-rules-contract-difference-products):

> The FCA’s analysis of a representative sample of client accounts for CFD firms found that 82% of clients lost money on these products.

The notes on that page repeat: “82% of clients lose money on CFD products.” The products named include rolling spot foreign exchange.

FCA consultation CP18/38, [PDF](https://www.fca.org.uk/publication/consultation/cp18-38.pdf), paragraph 2.9 of the text retrieved for this study:

> According to the standardised risk warnings of firms, an estimated 78% of active retail client accounts were loss-making. Retail consumers lost £268.4mn from trading over a 3-month period from August to October 2017, equal to a projected loss of £1.07bn a year.

Footnote 7 in that text says the 78% is a weighted average of the risk warnings published by 7 firms representing about 65% of the UK retail CFD market. Footnote 8 says the £268.4mn is from ESMA’s information request and that the three-month window may not represent a full year.

FCA, 1 July 2019, [press release](https://www.fca.org.uk/news/press-releases/fca-confirms-permanent-restrictions-sale-cfds-and-cfd-options-retail-consumers): the temporary ESMA restrictions were made permanent from 1 August 2019 for CFDs. Firms must limit leverage to between 30:1 and 2:1 and must tell customers the percentage of their own retail accounts that lose money. That page does not restate a single loss percentage.

IG’s CFD calculator page, fetched as [this page](https://www.ig.com/uk/cfd-trading/cfd-calculator), last update “Friday 14 August 2026”, prints:

> 69% Of retail investor accounts lose money when trading CFDs with us.

The same page says the material “is considered to be a marketing communication” and that major forex pairs take a 3.3% retail margin (30:1). The 69% figure is the firm’s own warning on that page, not an audit of a named trader.

None of these sources publish a daily return distribution. A loss rate cannot be turned into a 10%-a-day forecast without inventing the size of the wins and the losses. That was not done.

### The academic FX momentum spread is about 10% a year, not a day

BIS Working Paper 366, [Currency Momentum Strategies](https://www.bis.org/publ/work366.pdf), 13 December 2011. The fetch returned the abstract, not the tables:

> We find a signiffcant cross-sectional spread in excess returns of up to 10% p.a. between past winner and loser currencies. This spread in excess returns is not explained by traditional risk factors, it is partially explained by transaction costs and shows behavior consistent with investor under- and over-reaction. … there seem to be very effective limits to arbitrage which prevent momentum returns from being easily exploitable in currency markets.

No standard deviation, no formation window, and no holding period appeared in the text that came back. Those details are **UNVERIFIED** here. “Up to 10% p.a.” is a winner-minus-loser spread, not one retail account’s return. Dividing by 252 is a flat translation, not a risk model:

- daily simple return used: `0.10/252 = 0.000396825397`
- 10,000 identical paths, 20 days
- `p_avg_daily_ge_10pct = 0.0` (0/10000)
- `p_avg_daily_ge_40pct = 0.0` (0/10000)
- ending balance on every path: `1481.7107530427932`
- `p_halt_-10pct = 0.0`

A constant positive number never draws down, so the halt probability is zero because the path never falls. It is not evidence that a real book avoids a 10% drawdown.

### The Myfxbook page is not a verified track record

Fetched page: [AUDITED ACCOUNT by ANDRE0520](https://www.myfxbook.com/members/ANDRE0520/audited-account/9779058). “AUDITED ACCOUNT” is the system’s title. The fetched text contains no “Track Record Verified” or “Trading Privileges” badge. Tracking is 0. Updated “Nov 21, 2023”. The page says “Data includes last 200 transactions.” **UNVERIFIED.** Treat it as unreliable.

Figures printed on that page, as fetched:

| Field | Displayed |
|---|---|
| Gain | +90.64% |
| Abs. Gain | +57.76% |
| Daily | 0.04% |
| Monthly | 6.72% |
| Drawdown | 1.62% |
| Balance | $21,704.41 |
| Highest | $35,084.01 (Feb 10) |
| Profit | $16,136.25 |
| Deposits | $27,938.00 |
| Withdrawals | $22,369.84 |
| Trades | 3,057 |
| Average win | 6.23 pips / $15.23 |
| Average loss | -3.44 pips / -$10.39 |
| Longs won | (769/1,280) 60% |
| Shorts won | (1,101/1,777) 61% |
| Best trade | $252.44 |
| Worst trade | -$463.32 |
| Avg. trade length | 32s |
| Profit factor | 2.31 |
| Standard deviation | $20.396 |
| Sharpe | 0 |
| Expectancy | 2.5 pips / $5.28 |
| AHPR | 0.02% |
| GHPR | 0.01% |
| Broker line | Real (USD), FxWinning, 1:30, MetaTrader 5 |

Deposits and withdrawals are large relative to the balance, so the “Gain” is not a return on a constant £1,470. The displayed daily 0.04% is `0.0004/0.10 = 0.004` of the 10%-a-day target. The 32-second holding period was not copied. A flat 0.04% a day, labelled unverified, was run as 10,000 identical paths:

- `p_avg_daily_ge_10pct = 0.0`
- `p_avg_daily_ge_40pct = 0.0`
- ending balance on every path: `1481.8047954337594`
- `p_halt_-10pct = 0.0`

Monthly 6.72% was not converted into a made-up daily volatility.

### This paper system’s own replays

From the uploaded archive, read this session and not copied into git:

`state_replay/REPLAY_SUMMARY.md` (60 days, source yahoo): ending equity £1346.61 from £1470, max drawdown -11.36% on step closes, HALT true, worst trade -3.85R momentum EURJPY (stop, gap true), 6 gap fills. Closed-trade table: forex_trader 7 trades, 1 win, -4.88R, £-66.58; momentum 4 trades, 0 wins, -7.16R, £-101.31; mean_reversion 10 trades, 5 wins, +3.19R, £+44.50. The dated daily report in that replay says equity £1,346.61 and -8.39%, halt on. `(1346.61-1470)/1470 = -0.0839387755`.

`runs/mc10k/per_bot_expectancy.csv` is a different sample (192 closed trades, 15 windows, 2025-08-27 to 2026-10-22):

| bot | trades | win rate | expectancy R | sd R | sum R | pnl £ | se R |
|---|---|---|---|---|---|---|---|
| forex_trader | 71 | 0.2817 | -0.3211 | 1.4688 | -22.8 | -310.58 | 0.1743 |
| mean_reversion | 48 | 0.2083 | -0.4838 | 1.7976 | -23.22 | -342.88 | 0.2595 |
| momentum | 73 | 0.4247 | 0.0401 | 1.5768 | 2.93 | 53.16 | 0.1846 |
| ALL | 192 | 0.3177 | -0.2244 | 1.6032 | -43.09 | -600.3 | 0.1157 |

Momentum’s +0.0401R is smaller than its standard error of 0.1846. Mean reversion is the only positive bot in the 60-day replay and the worst bot in the 192-trade pool. Both statements are in the files. Neither sample is a proven edge.

`runs/mc10k/mc_results.json`: 10,000 paths, horizon 20, start 1470, median end £1425.47, 5th £1316.45, 95th £1571.54, mean end £1431.5, prob profit 0.294, prob halt -10% 0.1475, prob reach 38000 0.0, max end £1845.83. The best of the 15 windows ended at £1605.04 (`(1605.04-1470)/1470 = 0.0918639456` over the window, not per day). The worst ended at £1300.16.

`state/news_events.json` in the archive is `[]`. The news blackout never had events to block. This study does not invent a calendar.

## The paper variant

`studies/fx_paper/run_study.py` trades the system’s nine pairs. It is long the highest 20-day return and short the lowest. The 20-day window is the system’s existing momentum window. The BIS abstract did not state a window, so this study does not claim the paper’s formation length.

Stops and targets use the system’s momentum distances: 2× and 3.5× the 14-day close-to-close average absolute change (1.75R, above the 1.5 minimum). A tighter 1.5× stop was run as a sensitivity (below). It sits inside a normal daily high-low, so the OHLC rule stops the trade out.

Costs match the paper rules: half the configured spread plus 0.6 pips of slippage. Spreads are 0.6 EURUSD, 0.9 GBPUSD, 0.7 USDJPY, 1.0 EURGBP, 1.0 otherwise. Risk is 1% per trade, 3% open, 2 positions in the same currency and direction, correlation merge above 0.8, daily stop -3%, weekly stop -6%, halt at -10% from peak, leverage cap 10:1, and the 1.5× gap rule. The gap rule pins size at 1%: `max_gap_risk_pct / gap_allowance_mult = 1.5/1.5 = 1.0`. Raising the 1% figure alone does not increase size.

OHLC exits follow the paper executor. A gap through the stop or the target at the open fills at the open. If both levels are inside the bar, the stop is first. The entry bar is not judged. The self-test asserts those three cases and prints `SELF_TEST_OK`.

Daily fills use that day’s close. Hourly fills use the open of the first London entry hour on the next London date (08:00–12:00 or 13:00–17:00, Europe/London), with the same daily signal. Yahoo hourly timestamps with no timezone were treated as UTC and converted to London. The time stop on hourly bars is 15 London dates (median 24 bars a date, so 360 hourly bars), not 15 hours.

Prices: Yahoo Finance via yfinance, symbols `PAIR=X`, daily `period=5y` `interval=1d` (1300 bars, 2021-10-22 to 2026-10-22), hourly `period=730d` `interval=1h` (17125 bars, 2024-01-05 00:00 UTC to 2026-10-22 21:00 Europe/London).

## Backtest at the paper 1% risk

Daily, halt left on:

- end £1313.6304930343956, total return -0.10637381426231596, max drawdown -0.10637381426231596
- halted true at bar index 90
- 16 closed trades, win rate 0.125, mean R -0.6972451897510952, sum R -11.155923036017523, pnl £-156.36950696560444
- exits: stop 13, target 2, time 1, gap exits 1
- best day 0.013855655288777413, worst day -0.020192210907141517
- 1209 of 1240 daily returns are zero, because the halt blocks new trades and the book then sits in cash

Hourly OHLC, halt left on:

- end £1331.5640561541993, total return -0.09417411145972832
- London-date max drawdown -0.09701276646641555, and `halted: true` (halt index 1174). The halt is marked on an hourly bar. The London-date series does not have to print -10% on the stored day-end equity.
- 20 trades, win rate 0.2, mean R -0.48414238838360585, pnl £-138.43594384580047
- exits: stop 16, target 4
- best London day 0.03020499832511203, worst -0.03056448995900163
- 680 of 730 daily returns are zero

Diagnostic, same rules, permanent halt not applied (daily and weekly stops still on). This is not a config change. It shows the book if it is allowed to keep trading:

- end £667.364434204926, total return -0.5460105889762408, max drawdown -0.620070167426651
- 612 trades, win rate 0.34967320261437906, mean R -0.11704309527993162, sum R -71.63037431131815, pnl £-808.6472877421111
- exits: stop 386, target 204, time 22, gap exits 106
- mean daily return -0.0005707095013444553, best day 0.05326906091224948, worst day -0.04348362067238287
- zero daily returns: 0

The best day in any of these runs is about 5.3%, on the diagnostic. No run printed a day at or above 10%.

Sensitivity, daily, stop 1.5× ATR and target 3.0× ATR, saved in `studies/fx_paper/sensitivity_1_5atr.json`: end £1283.8896152620632, 15 trades, win rate 0.06666666666666667, mean R -0.8897189301079019, 14 stops and 1 target, halt true at index 77, best day 0.01233688408164113. The wider 2 / 3.5 ATR stop is the one reported above because it is the system’s own momentum distance. It does not produce an edge either.

## Monte Carlo, 10,000 paths, 20 trading days

`P(average daily return >= 10%)` and `P(>= 40%)` are counts of paths whose arithmetic mean of the 20 applied daily returns clears 0.10 or 0.40. After a path’s equity is 10% or more below its own peak, later days are frozen at a zero return. The compounded-balance probabilities ask whether the path ends at or above £9889.424925508649 or £1229923.354751685.

The full-path samples include the long run of exact zeros after the halt. Those zeros pull the 20-day average toward zero and keep most paths off the halt. The “until halt” samples use only the days up to and including the day the halt first fired. That is the distribution of a fresh account that is still allowed to trade. The diagnostic sample is the 1,240-day book with the halt switched off.

| Distribution | source days | mean daily | P(avg≥10%) | P(avg≥40%) | median end £ | 5th £ | 95th £ | P(halt) |
|---|---|---|---|---|---|---|---|---|
| Daily full path | 1240 | -0.00008972276553737673 | 0/10000 | 0/10000 | 1470.0 | 1444.4837847674085 | 1478.8431360398974 | 0/10000 |
| Daily until halt | 31 | -0.0035889106214950692 | 0/10000 | 0/10000 | 1366.4099156986983 | 1313.6112742654416 | 1447.564195439948 | 2278/10000 |
| Hourly full path | 730 | -0.00013122925625304937 | 0/10000 | 0/10000 | 1470.0 | 1431.4131113276933 | 1499.6997730121666 | 0/10000 |
| Hourly until halt | 50 | -0.0019159471412945207 | 0/10000 | 0/10000 | 1411.9700648587668 | 1317.2433160049638 | 1530.6640365194323 | 1284/10000 |
| Daily, halt off | 1240 | -0.0005707095013444553 | 0/10000 | 0/10000 | 1450.6296993789879 | 1328.3429274834582 | 1579.7554556644275 | 700/10000 |
| BIS 10%/year, flat | constant | 0.0003968253968253968 | 0/10000 | 0/10000 | 1481.7107530427932 | 1481.7107530427932 | 1481.7107530427932 | 0/10000 |
| Myfxbook 0.04%/day, UNVERIFIED, flat | constant | 0.0004 | 0/10000 | 0/10000 | 1481.8047954337594 | 1481.8047954337594 | 1481.8047954337594 | 0/10000 |

`p_end_ge_compound_10` and `p_end_ge_compound_40` were also 0/10000 on every row. The highest ending balance printed in any of these 10,000-path runs was £1742.3883037079356, on the no-halt diagnostic. The historical no-halt path itself ended at £667.36; the bootstrap median is higher because a 20-day draw does not relive the whole five-year loss, and because losses are not forced to arrive in their historical order.

No verified source supplied a daily standard deviation for a top FX trader. A normal distribution was not invented to fill that gap. The BIS and Myfxbook rows are flat paths. They are not risk distributions.

## Risk required to aim at 10% a day

Printed by the script from the variant’s 1.75R target and the paper caps:

- Under the 3% open-risk cap, a perfect day (every open position hits its target, and nothing else loses) pays at most `0.0525` (5.25%). `ten_pct_reachable_under_unchanged_caps: false`.
- To make +10% on that perfect day, open risk has to be `5.714285714285714%`.
- That is `1.9047619047619049%` on each of three positions, or `2.857142857142857%` on each of two. This variant only signals two names, the winner and the loser.
- The gap rule pins risk at 1.0% unless `max_gap_risk_pct` is lifted with the per-trade figure. The 10:1 leverage cap can still shrink the position. Those caps were left in the paper rules.

The historical mean daily return at 1% risk is negative on the full path (`-8.972276553737673e-05`), on the pre-halt slice (`-0.0035889106214950692`), and with the halt turned off (`-0.0005707095013444553`). The script set `risk_pct_that_scales_mean_to_10pct_per_day` to null. No positive multiple of a negative mean becomes +10% a day.

A counterfactual daily backtest then raised per-trade risk to 1.9047619047619049%, open risk to 5.714285714285714%, and the gap cap to 2.857142857142857%, inside the script only. The historical path halted at bar 73, ended at £1312.2184614991766, and closed 9 trades with win rate 0.1111111111111111 and mean R -0.6491170633166358. Its until-halt Monte Carlo (14 source days) printed:

- `p_avg_daily_ge_10pct = 0.0` (0/10000)
- `p_avg_daily_ge_40pct = 0.0` (0/10000)
- median end £1316.9050264823272
- 5th £1284.7405707308628
- 95th £1408.2212959973974
- `count_halt = 8644` so `p_halt_-10pct = 0.8644`

The full-path counterfactual, stuffed with post-halt zeros, printed `count_halt = 0`. That zero is the zero-inflation, not a safer book. The path itself halted.

## Forecast

On this evidence the probability that a £1,470 paper account running these rules averages 10% a day for 20 trading days is 0/10000. The probability it averages 40% a day is 0/10000. The same counts hold for ending at the compounded £9,889.42 or £1,229,923.35.

The published retail record points the other way: 74–89% of CFD accounts lose money (ESMA), 82% in the FCA’s 2016 sample, about 78% in CP18/38, and 69% on IG’s own warning. The only academic spread fetched here is up to 10% a year before costs and arbitrage limits. The one public Myfxbook page inspected is unverified, stale, and its displayed daily return is 0.04%. This system’s own 60-day replay ended -8.39% with the halt on, and its 192-trade pool has a negative average R.

Nothing in the fetched record or in the Yahoo backtest supports 10% to 40% profit per day.
