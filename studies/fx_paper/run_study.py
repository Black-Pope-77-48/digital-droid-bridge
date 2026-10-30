#!/usr/bin/env python3
"""Paper-only cross-sectional FX momentum study.

No broker, no orders, no LIVE_TRADING switch. Downloads public Yahoo FX
bars, applies the paper system's OHLC stop rule and risk caps, and prints
a Monte Carlo. config.yaml is not read or written.
"""
from __future__ import annotations

import json
import sys
from bisect import bisect_left
from copy import deepcopy
from datetime import time
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

START_GBP = 1470.0
UNIVERSE = [
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
    "USDCHF", "NZDUSD", "EURGBP", "EURJPY",
]
LONDON = ZoneInfo("Europe/London")
# Paper-system execution and risk. Not loaded from config.yaml on purpose:
# this study must not edit that file, and it must not grow a live-trading flag.
BASE_RULES = {
    "risk_per_trade_pct": 1.0,
    "max_open_risk_pct": 3.0,
    "max_positions": 3,
    "max_same_ccy_same_direction": 2,
    "correlation_merge_threshold": 0.8,
    "correlation_window": 60,
    "daily_stop_pct": -3.0,
    "weekly_stop_pct": -6.0,
    "drawdown_pause_pct": -10.0,
    "max_effective_leverage": 10.0,
    "min_reward_risk": 1.5,
    "gap_allowance_mult": 1.5,
    "max_gap_risk_pct": 1.5,
    "slippage_pips": 0.6,
    "spread_pips": {"default": 1.0, "EURUSD": 0.6, "GBPUSD": 0.9, "USDJPY": 0.7, "EURGBP": 1.0},
    "lookback": 20,          # system's momentum window; BIS abstract did not state one
    "atr_n": 14,             # close-to-close, matching bots/_signal_common.atr_close
    # Same distances as bots/signal_momentum.py (2 ATR stop, 3.5 ATR target, 1.75R).
    # A 1.5 ATR stop is inside a typical daily high-low, so the OHLC rule stops the trade out.
    "stop_atr": 2.0,
    "target_atr": 3.5,
    "expires_after_bars": 15,
    "permanent_halt": True,
    "warmup": 60,
}
MC_PATHS = 10_000
MC_HORIZON = 20
MC_SEED = 20261022


def pip(pair: str) -> float:
    return 0.01 if pair.endswith("JPY") else 0.0001


def cost_px(pair: str, rules: dict) -> float:
    spread = rules["spread_pips"].get(pair, rules["spread_pips"]["default"])
    return (spread / 2.0 + rules["slippage_pips"]) * pip(pair)


def quote_to_gbp(pair: str, amount: float, px: dict) -> float:
    """Amount is in the pair's quote currency. Same mapping as common.quote_to_gbp."""
    q = pair[3:]
    gbpusd = px["GBPUSD"]
    per_gbp = {
        "GBP": 1.0,
        "USD": gbpusd,
        "JPY": gbpusd * px["USDJPY"],
        "CAD": gbpusd * px["USDCAD"],
        "CHF": gbpusd * px["USDCHF"],
    }[q]
    return amount / per_gbp


def base_to_gbp(pair: str, units: float, px: dict) -> float:
    b = pair[:3]
    if b == "GBP":
        return units
    if b == "USD":
        return units / px["GBPUSD"]
    if b == "EUR":
        return units * px["EURUSD"] / px["GBPUSD"]
    if b in ("AUD", "NZD"):
        return units * px[b + "USD"] / px["GBPUSD"]
    raise ValueError(b)


def legs(pair: str, side: str) -> dict:
    d = 1 if side == "buy" else -1
    return {pair[:3]: d, pair[3:]: -d}


def manage(positions, bar_i, ohlc_row, px, rules):
    """OHLC stops. Gap at open fills at open. If stop and target are both
    inside the bar, the stop is first. The entry bar is never judged.
    """
    closed = []
    for p in list(positions):
        if bar_i <= p["opened_i"]:
            continue
        o = ohlc_row[p["pair"]]["open"]
        h = ohlc_row[p["pair"]]["high"]
        l = ohlc_row[p["pair"]]["low"]
        c = px[p["pair"]]
        d = 1 if p["side"] == "buy" else -1
        adverse, favour = (l, h) if d > 0 else (h, l)
        hit = exit_raw = None
        gap = False
        if (o - p["stop"]) * d <= 0:
            hit, exit_raw, gap = "stop", o, True
        elif (o - p["target"]) * d >= 0:
            hit, exit_raw, gap = "target", o, True
        elif (adverse - p["stop"]) * d <= 0:
            hit, exit_raw = "stop", p["stop"]
        elif (favour - p["target"]) * d >= 0:
            hit, exit_raw = "target", p["target"]
        p["bars_held"] += 1
        if hit is None and p["bars_held"] >= p["expires_after_bars"]:
            hit, exit_raw = "time", c
        if hit is None:
            continue
        exit_px = exit_raw - d * cost_px(p["pair"], rules)
        pnl = quote_to_gbp(p["pair"], (exit_px - p["fill"]) * d * p["units"], px)
        r_mult = pnl / p["risk_gbp"] if p["risk_gbp"] else 0.0
        p["cash_account"]["cash"] += pnl
        positions.remove(p)
        closed.append({
            "pair": p["pair"], "side": p["side"], "reason": hit, "gap": gap,
            "pnl_gbp": pnl, "r": r_mult, "bars_held": p["bars_held"],
            "exit_raw": exit_raw, "exit_px": exit_px,
        })
    return closed


def mark(positions, cash, px):
    upl = 0.0
    for p in positions:
        d = 1 if p["side"] == "buy" else -1
        upl += quote_to_gbp(p["pair"], (px[p["pair"]] - p["fill"]) * d * p["units"], px)
    return cash + upl, upl


def _corr(rets: pd.DataFrame, i: int, window: int) -> pd.DataFrame:
    block = rets.iloc[i - window + 1:i + 1]
    return block.corr()


def propose(closes: pd.DataFrame, i: int, rules: dict):
    """Long the 20-bar winner and short the 20-bar loser. Lookback is the
    paper system's momentum window. The BIS abstract did not publish one.
    """
    lb = rules["lookback"]
    window = closes.iloc[i - lb:i + 1]
    ret = window.iloc[-1] / window.iloc[0] - 1.0
    atrs = {}
    for pair in closes.columns:
        diff = closes[pair].iloc[i - rules["atr_n"]:i + 1].diff().abs()
        atrs[pair] = float(diff.mean())
    order = ret.sort_values(ascending=False)
    picks = []
    winner, loser = order.index[0], order.index[-1]
    for pair, side in ((winner, "buy"), (loser, "sell")):
        atr = atrs[pair]
        if not np.isfinite(atr) or atr <= 0 or not np.isfinite(ret[pair]):
            continue
        px = float(closes[pair].iloc[i])
        d = 1 if side == "buy" else -1
        stop = px - d * rules["stop_atr"] * atr
        target = px + d * rules["target_atr"] * atr
        picks.append({
            "pair": pair, "side": side, "entry": px, "stop": stop, "target": target,
            "atr": atr, "ret20": float(ret[pair]),
        })
    return picks


def approve(sig, positions, approved, equity, px, corr, rules):
    d = 1 if sig["side"] == "buy" else -1
    risk_px = (sig["entry"] - sig["stop"]) * d
    if risk_px <= 0:
        return None, "invalid stop"
    rr = (sig["target"] - sig["entry"]) * d / risk_px
    if rr < rules["min_reward_risk"] - 1e-9:
        return None, "rr"
    book = list(positions) + list(approved)
    if any(p["pair"] == sig["pair"] for p in book):
        return None, "pair open"
    if len(book) >= rules["max_positions"]:
        return None, "max positions"
    for p in book:
        rho = float(corr.loc[sig["pair"], p["pair"]]) if p["pair"] in corr.columns else 0.0
        if not np.isfinite(rho):
            rho = 0.0
        dp = 1 if p["side"] == "buy" else -1
        if rho * d * dp > rules["correlation_merge_threshold"]:
            return None, "correlated"
    cnt = {}
    for p in book:
        for ccy, s in legs(p["pair"], p["side"]).items():
            cnt[(ccy, s)] = cnt.get((ccy, s), 0) + 1
    for ccy, s in legs(sig["pair"], sig["side"]).items():
        if cnt.get((ccy, s), 0) + 1 > rules["max_same_ccy_same_direction"]:
            return None, "currency cap"
    risk_gbp = equity * rules["risk_per_trade_pct"] / 100.0
    unit_risk = quote_to_gbp(sig["pair"], risk_px, px)
    if unit_risk <= 0:
        return None, "unit risk"
    units = risk_gbp / unit_risk
    gap_unit = quote_to_gbp(sig["pair"], risk_px * rules["gap_allowance_mult"], px)
    gap_units = (equity * rules["max_gap_risk_pct"] / 100.0) / gap_unit
    if gap_units < units:
        units = gap_units
        risk_gbp = quote_to_gbp(sig["pair"], risk_px * units, px)
    units = int(round(units))
    if units <= 0:
        return None, "zero units"
    risk_gbp = quote_to_gbp(sig["pair"], risk_px * units, px)
    open_risk = sum(p["risk_gbp"] for p in book) + risk_gbp
    if open_risk / equity * 100.0 > rules["max_open_risk_pct"] + 1e-9:
        return None, "open risk"
    open_notional = sum(p["notional_gbp"] for p in book)
    notional = base_to_gbp(sig["pair"], units, px)
    if (open_notional + notional) / equity > rules["max_effective_leverage"]:
        room = rules["max_effective_leverage"] * equity - open_notional
        if room <= 0 or notional <= 0:
            return None, "leverage cap"
        units = int(round(units * room / notional))
        if units <= 0:
            return None, "leverage cap"
        risk_gbp = quote_to_gbp(sig["pair"], risk_px * units, px)
        notional = base_to_gbp(sig["pair"], units, px)
    return {
        "pair": sig["pair"], "side": sig["side"], "units": units,
        "stop": sig["stop"], "target": sig["target"], "entry": sig["entry"],
        "risk_gbp": risk_gbp, "notional_gbp": notional, "risk_px": risk_px,
    }, "ok"


def _fill(order, positions, cash_account, px, bar_i, rules, entry_px):
    d = 1 if order["side"] == "buy" else -1
    fill = entry_px + d * cost_px(order["pair"], rules)
    positions.append({
        "pair": order["pair"], "side": order["side"], "units": order["units"],
        "fill": fill, "stop": order["stop"], "target": order["target"],
        "risk_gbp": order["risk_gbp"], "notional_gbp": order["notional_gbp"],
        "opened_i": bar_i, "bars_held": 0,
        "expires_after_bars": rules["expires_after_bars"],
        "cash_account": cash_account,
    })


def run_daily(frames: dict, rules: dict):
    closes = pd.DataFrame({p: frames[p]["close"] for p in UNIVERSE}).dropna()
    opens = pd.DataFrame({p: frames[p]["open"] for p in UNIVERSE}).reindex(closes.index)
    highs = pd.DataFrame({p: frames[p]["high"] for p in UNIVERSE}).reindex(closes.index)
    lows = pd.DataFrame({p: frames[p]["low"] for p in UNIVERSE}).reindex(closes.index)
    rets = closes.pct_change()
    index = closes.index
    cash_account = {"cash": START_GBP}
    positions = []
    trades = []
    equity_rows = []
    equity = START_GBP
    peak = START_GBP
    halted = False
    halt_i = None
    week_start = START_GBP
    week_key = None
    rejects = {}
    for i, ts in enumerate(index):
        px = {p: float(closes.iloc[i][p]) for p in UNIVERSE}
        if i < rules["warmup"]:
            continue
        # `equity` is the previous close. Today's close is not used until after stops.
        wk = ts.isocalendar()[:2]
        if wk != week_key:
            week_start = equity
            week_key = wk
        day_start = equity
        row = {
            p: {
                "open": float(opens.iloc[i][p]),
                "high": float(highs.iloc[i][p]),
                "low": float(lows.iloc[i][p]),
            }
            for p in UNIVERSE
        }
        trades.extend(manage(positions, i, row, px, rules))
        equity, _upl = mark(positions, cash_account["cash"], px)
        peak = max(peak, equity)
        if rules.get("permanent_halt", True) and (equity / peak - 1.0) * 100.0 <= rules["drawdown_pause_pct"]:
            if not halted:
                halt_i = i
            halted = True
        block = None
        if halted:
            block = "halt"
        elif (equity / day_start - 1.0) * 100.0 <= rules["daily_stop_pct"]:
            block = "daily"
        elif (equity / week_start - 1.0) * 100.0 <= rules["weekly_stop_pct"]:
            block = "weekly"
        if block is None:
            corr = _corr(rets, i, rules["correlation_window"])
            approved = []
            for sig in propose(closes, i, rules):
                order, why = approve(sig, positions, approved, equity, px, corr, rules)
                if order is None:
                    rejects[why] = rejects.get(why, 0) + 1
                    continue
                _fill(order, positions, cash_account, px, i, rules, px[order["pair"]])
                approved.append(order)
            equity, _upl = mark(positions, cash_account["cash"], px)
            peak = max(peak, equity)
            if rules.get("permanent_halt", True) and (equity / peak - 1.0) * 100.0 <= rules["drawdown_pause_pct"]:
                if not halted:
                    halt_i = i
                halted = True
        else:
            rejects[block] = rejects.get(block, 0) + 1
        equity_rows.append((str(pd.Timestamp(ts).date()), equity, halted))
    if equity_rows:
        equity_rows.insert(0, ("start", START_GBP, False))
    return _summarise("daily", equity_rows, trades, positions, cash_account["cash"], halted, halt_i, rejects, index, rules)


def run_hourly(daily_frames: dict, hourly_frames: dict, rules: dict):
    """Daily winner/loser signal. Fill on a later London-session hour.
    Stops use hourly OHLC. Time stop is 15 London dates, not 15 hours.
    """
    d_close = pd.DataFrame({p: daily_frames[p]["close"] for p in UNIVERSE}).dropna()
    d_idx = pd.DatetimeIndex(pd.to_datetime(d_close.index))
    if d_idx.tz is not None:
        d_idx = d_idx.tz_convert(LONDON).tz_localize(None)
    d_close.index = d_idx.normalize()
    d_close = d_close[~d_close.index.duplicated(keep="last")].sort_index()
    h_index = None
    aligned = {}
    for p in UNIVERSE:
        df = hourly_frames[p].copy()
        df.index = pd.DatetimeIndex(pd.to_datetime(df.index))
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        df.index = df.index.tz_convert(LONDON)
        df = df[~df.index.duplicated(keep="last")].sort_index()
        aligned[p] = df
        h_index = df.index if h_index is None else h_index.intersection(df.index)
    h_index = h_index.sort_values()
    # Signals known at the daily close. Entry only on a later London date.
    signals_by_date = {}
    rets = d_close.pct_change()
    for i, ts in enumerate(d_close.index):
        if i < rules["warmup"]:
            continue
        corr = _corr(rets, i, rules["correlation_window"])
        px = {p: float(d_close.iloc[i][p]) for p in UNIVERSE}
        pending = []
        for sig in propose(d_close, i, rules):
            pending.append((sig, corr, px))
        signals_by_date[ts.date()] = pending

    rules_h = deepcopy(rules)
    # Count hourly bars per London date so 15 daily bars ~= 15 sessions of hours.
    dates = pd.Index(h_index.date)
    bars_per_day = int(np.median(pd.Series(1, index=dates).groupby(level=0).sum()))
    rules_h["expires_after_bars"] = 15 * bars_per_day

    signal_dates = sorted(signals_by_date)
    next_session = {}
    london_dates = list(dict.fromkeys(h_index.date))
    for sig_date in signals_by_date:
        for d in london_dates:
            if d > sig_date:
                next_session[sig_date] = d
                break
    cash_account = {"cash": START_GBP}
    positions = []
    trades = []
    peak = START_GBP
    halted = False
    halt_i = None
    week_start = START_GBP
    week_key = None
    day_key = None
    day_start = START_GBP
    equity = START_GBP
    rejects = {}
    filled_days = set()
    daily_equity = []
    prev_date = None
    prev_equity = START_GBP
    prev_halt = False
    recording = False
    for i, ts in enumerate(h_index):
        px = {p: float(aligned[p].loc[ts, "close"]) for p in UNIVERSE}
        if any(not np.isfinite(v) or v <= 0 for v in px.values()):
            continue
        london_date = ts.date()
        wk = ts.isocalendar()[:2]
        if day_key != london_date:
            day_start = equity
            day_key = london_date
        if wk != week_key:
            week_start = equity
            week_key = wk
        row = {}
        for p in UNIVERSE:
            bar = aligned[p].loc[ts]
            row[p] = {"open": float(bar["open"]), "high": float(bar["high"]), "low": float(bar["low"])}
        trades.extend(manage(positions, i, row, px, rules_h))
        equity, _upl = mark(positions, cash_account["cash"], px)
        peak = max(peak, equity)
        if (equity / peak - 1.0) * 100.0 <= rules_h["drawdown_pause_pct"]:
            if not halted:
                halt_i = i
            halted = True
        session = _london_entry_ok(ts)
        block = halted or (equity / day_start - 1.0) * 100.0 <= rules_h["daily_stop_pct"] or (
            equity / week_start - 1.0) * 100.0 <= rules_h["weekly_stop_pct"]
        pos = bisect_left(signal_dates, london_date)
        sig_date = signal_dates[pos - 1] if pos else None
        # One entry attempt: the first in-session hour of the next London date. Later days expire.
        fresh = (
            sig_date is not None
            and sig_date not in filled_days
            and next_session.get(sig_date) == london_date
            and session
            and not block
        )
        if fresh:
            filled_days.add(sig_date)
            approved = []
            for sig, corr, _sig_px in signals_by_date[sig_date]:
                # Re-base stop/target on this bar's open so distances stay 1.5/3.0 ATR.
                atr = sig["atr"]
                entry = row[sig["pair"]]["open"]
                dside = 1 if sig["side"] == "buy" else -1
                shifted = dict(sig)
                shifted["entry"] = entry
                shifted["stop"] = entry - dside * rules_h["stop_atr"] * atr
                shifted["target"] = entry + dside * rules_h["target_atr"] * atr
                order, why = approve(shifted, positions, approved, equity, px, corr, rules_h)
                if order is None:
                    rejects[why] = rejects.get(why, 0) + 1
                    continue
                _fill(order, positions, cash_account, px, i, rules_h, entry)
                approved.append(order)
            equity, _upl = mark(positions, cash_account["cash"], px)
            peak = max(peak, equity)
        if sig_date is not None:
            recording = True
        if recording and prev_date is not None and london_date != prev_date:
            daily_equity.append((str(prev_date), prev_equity, prev_halt))
        prev_date = london_date
        prev_equity = equity
        prev_halt = halted
    if recording and prev_date is not None:
        daily_equity.append((str(prev_date), prev_equity, prev_halt))
    if daily_equity:
        daily_equity.insert(0, ("start", START_GBP, False))
    out = _summarise("hourly", daily_equity, trades, positions, cash_account["cash"], halted, halt_i, rejects, h_index, rules_h)
    out["hourly_bars"] = int(len(h_index))
    out["median_bars_per_london_date"] = bars_per_day
    out["expires_after_hourly_bars"] = rules_h["expires_after_bars"]
    out["entry_rule"] = "daily signal enters on a later London-session hour, at that hour's open; 15-day time stop"
    return out


def _london_entry_ok(ts) -> bool:
    if ts.weekday() >= 5:
        return False
    hm = ts.timetz().replace(tzinfo=None)
    if ts.weekday() == 4 and hm >= time(20, 0):
        return False
    if time(21, 0) <= hm < time(23, 0):
        return False
    return (time(8, 0) <= hm < time(12, 0)) or (time(13, 0) <= hm < time(17, 0))


def _summarise(label, equity_rows, trades, positions, cash, halted, halt_i, rejects, index, rules):
    eq = np.array([e for _d, e, _h in equity_rows], dtype=float)
    # Daily simple returns after warmup, from the recorded path.
    rets = eq[1:] / eq[:-1] - 1.0
    rets = rets[np.isfinite(rets)]
    peak = np.maximum.accumulate(eq) if len(eq) else np.array([START_GBP])
    dd = eq / peak - 1.0
    rs = np.array([t["r"] for t in trades], dtype=float) if trades else np.array([])
    pnls = np.array([t["pnl_gbp"] for t in trades], dtype=float) if trades else np.array([])
    return {
        "label": label,
        "rules_risk_per_trade_pct": rules["risk_per_trade_pct"],
        "rules_max_open_risk_pct": rules["max_open_risk_pct"],
        "rules_max_gap_risk_pct": rules["max_gap_risk_pct"],
        "bars": int(len(index)),
        "equity_points": int(len(eq)),
        "start": str(index[0]) if len(index) else None,
        "end": str(index[-1]) if len(index) else None,
        "start_gbp": START_GBP,
        "end_gbp": float(eq[-1]) if len(eq) else None,
        "total_return": float(eq[-1] / START_GBP - 1.0) if len(eq) else None,
        "max_drawdown": float(dd.min()) if len(dd) else None,
        "halted": bool(halted),
        "halt_index": halt_i,
        "open_positions_end": len(positions),
        "cash_end": cash,
        "n_trades": int(len(trades)),
        "win_rate": float(np.mean(pnls > 0)) if len(pnls) else None,
        "mean_r": float(rs.mean()) if len(rs) else None,
        "sum_r": float(rs.sum()) if len(rs) else None,
        "sum_pnl_gbp": float(pnls.sum()) if len(pnls) else None,
        "reasons": {k: int(v) for k, v in pd.Series([t["reason"] for t in trades]).value_counts().items()} if trades else {},
        "gap_exits": int(sum(1 for t in trades if t["gap"])),
        "trades": [
            {"pair": t["pair"], "side": t["side"], "reason": t["reason"], "gap": bool(t["gap"]),
             "r": round(t["r"], 4), "pnl_gbp": round(t["pnl_gbp"], 4), "bars_held": t["bars_held"]}
            for t in trades
        ],
        "rejects": rejects,
        "mean_daily_return": float(rets.mean()) if len(rets) else None,
        "std_daily_return": float(rets.std(ddof=1)) if len(rets) > 1 else None,
        "best_daily_return": float(rets.max()) if len(rets) else None,
        "worst_daily_return": float(rets.min()) if len(rets) else None,
        "n_daily_returns": int(len(rets)),
        "n_zero_daily_returns": int(np.sum(np.abs(rets) < 1e-15)) if len(rets) else 0,
        "daily_returns": rets.tolist(),
        "daily_returns_until_halt": (until := _until_halt(equity_rows, rets)),
        "n_returns_until_halt": len(until),
    }


def _until_halt(equity_rows, rets):
    """Returns that land on equity points up to and including the first halt."""
    halt_at = next((n for n, row in enumerate(equity_rows) if row[2]), None)
    if halt_at is None:
        return rets.tolist()
    return rets[:halt_at].tolist()


def monte_carlo(daily_returns, start, n=MC_PATHS, horizon=MC_HORIZON, halt=-0.10, seed=MC_SEED):
    rets = np.asarray(daily_returns, dtype=float)
    rets = rets[np.isfinite(rets)]
    if len(rets) == 0:
        return {"error": "no returns"}
    rng = np.random.default_rng(seed)
    sampled = rets[rng.integers(0, len(rets), size=(n, horizon))]
    equity = np.full(n, float(start))
    peak = np.full(n, float(start))
    halted = np.zeros(n, dtype=bool)
    applied = np.empty((n, horizon))
    for d in range(horizon):
        r = np.where(halted, 0.0, sampled[:, d])
        applied[:, d] = r
        equity = equity * (1.0 + r)
        peak = np.maximum(peak, equity)
        halted = halted | ((equity / peak - 1.0) <= halt)
    avg = applied.mean(axis=1)
    target10 = start * (1.10 ** horizon)
    target40 = start * (1.40 ** horizon)
    return {
        "n_paths": n,
        "horizon_trading_days": horizon,
        "seed": seed,
        "n_source_returns": int(len(rets)),
        "source_mean": float(rets.mean()),
        "source_std": float(rets.std(ddof=1)) if len(rets) > 1 else None,
        "count_avg_ge_10pct": int(np.sum(avg >= 0.10)),
        "count_avg_ge_40pct": int(np.sum(avg >= 0.40)),
        "p_avg_daily_ge_10pct": float(np.mean(avg >= 0.10)),
        "p_avg_daily_ge_40pct": float(np.mean(avg >= 0.40)),
        "count_end_ge_compound_10": int(np.sum(equity >= target10)),
        "count_end_ge_compound_40": int(np.sum(equity >= target40)),
        "p_end_ge_compound_10": float(np.mean(equity >= target10)),
        "p_end_ge_compound_40": float(np.mean(equity >= target40)),
        "median_end_gbp": float(np.median(equity)),
        "p05_end_gbp": float(np.quantile(equity, 0.05, method="linear")),
        "p95_end_gbp": float(np.quantile(equity, 0.95, method="linear")),
        "mean_end_gbp": float(equity.mean()),
        "min_end_gbp": float(equity.min()),
        "max_end_gbp": float(equity.max()),
        "count_halt": int(np.sum(halted)),
        "p_halt_-10pct": float(np.mean(halted)),
        "compound_10_end_gbp": float(target10),
        "compound_40_end_gbp": float(target40),
    }


def flat_monte_carlo(daily_return, start, label, n=MC_PATHS, horizon=MC_HORIZON):
    """Every path is the same constant daily return. This is not a risk distribution."""
    r = float(daily_return)
    equity = start * (1.0 + r) ** horizon
    avg = r
    halt = (equity / max(start, equity) - 1.0) <= -0.10 and r < 0
    # A positive constant never draws down. A negative constant halts on the day equity/peak <= -10%.
    # Peak stays at start if r<0. Halt day is the first d where (1+r)**d <= 0.9.
    halted = False
    if r < 0:
        eq = start
        for _d in range(horizon):
            eq *= (1.0 + r)
            if eq / start - 1.0 <= -0.10:
                halted = True
                break
    target10 = start * (1.10 ** horizon)
    target40 = start * (1.40 ** horizon)
    ge10 = 1 if avg >= 0.10 else 0
    ge40 = 1 if avg >= 0.40 else 0
    end_ge10 = 1 if equity >= target10 else 0
    end_ge40 = 1 if equity >= target40 else 0
    h = 1 if halted else 0
    return {
        "label": label,
        "kind": "flat_constant_daily_return",
        "note": "All paths identical. Not a sampled risk distribution. No volatility was published for this input.",
        "daily_return": r,
        "n_paths": n,
        "horizon_trading_days": horizon,
        "count_avg_ge_10pct": ge10 * n,
        "count_avg_ge_40pct": ge40 * n,
        "p_avg_daily_ge_10pct": float(ge10),
        "p_avg_daily_ge_40pct": float(ge40),
        "count_end_ge_compound_10": end_ge10 * n,
        "count_end_ge_compound_40": end_ge40 * n,
        "p_end_ge_compound_10": float(end_ge10),
        "p_end_ge_compound_40": float(end_ge40),
        "median_end_gbp": float(equity),
        "p05_end_gbp": float(equity),
        "p95_end_gbp": float(equity),
        "mean_end_gbp": float(equity),
        "min_end_gbp": float(equity),
        "max_end_gbp": float(equity),
        "count_halt": h * n,
        "p_halt_-10pct": float(h),
        "compound_10_end_gbp": float(target10),
        "compound_40_end_gbp": float(target40),
    }


def required_risk():
    """Math only. Does not edit config. RR is target_atr/stop_atr = 2."""
    rr = BASE_RULES["target_atr"] / BASE_RULES["stop_atr"]
    positions = BASE_RULES["max_positions"]
    open_cap = BASE_RULES["max_open_risk_pct"] / 100.0
    per_trade = BASE_RULES["risk_per_trade_pct"] / 100.0
    # Gap rule: max_gap / gap_mult is the largest risk that survives sizing.
    gap_pin = BASE_RULES["max_gap_risk_pct"] / BASE_RULES["gap_allowance_mult"]
    max_perfect_day = open_cap * rr
    # To net +10% in one day, every open-risk unit must pay `rr`.
    open_risk_needed = 0.10 / rr
    per_trade_if_three = open_risk_needed / positions
    per_trade_if_two = open_risk_needed / 2.0
    return {
        "reward_risk": rr,
        "configured_risk_per_trade_pct": BASE_RULES["risk_per_trade_pct"],
        "configured_max_open_risk_pct": BASE_RULES["max_open_risk_pct"],
        "gap_rule_pins_risk_at_pct": gap_pin,
        "max_perfect_day_return_under_open_risk_cap": max_perfect_day,
        "ten_pct_reachable_under_unchanged_caps": bool(max_perfect_day >= 0.10 - 1e-15),
        "open_risk_pct_required_for_10pct_if_all_pay_target": open_risk_needed * 100.0,
        "per_trade_risk_pct_if_three_positions_all_pay_target": per_trade_if_three * 100.0,
        "per_trade_risk_pct_if_two_positions_all_pay_target": per_trade_if_two * 100.0,
        "per_trade_at_1pct_times_three": per_trade * positions * 100.0,
        "note": (
            "A perfect day means every open position hits its target on the same day "
            "and nothing else loses. This variant pays 1.75R at the target "
            "(3.5 ATR / 2 ATR, the system's momentum distances). Under the 3% open-risk "
            "cap that day pays at most 5.25%. Reaching 10% needs 5.714...% of equity at "
            "risk: 1.904...% on each of three positions, or 2.857...% on each of two. "
            "The 1.5x gap rule pins size at 1% unless max_gap_risk_pct is lifted with it. "
            "config.yaml is not modified."
        ),
    }


def self_test():
    rules = deepcopy(BASE_RULES)
    px = {p: 1.25 for p in UNIVERSE}
    px["USDJPY"] = 150.0
    px["EURJPY"] = 160.0
    px["EURUSD"] = 1.10
    px["GBPUSD"] = 1.25
    cash = {"cash": 1470.0}
    # Buy EURUSD filled at 1.10009, stop 1.09, target 1.12. Cost 0.00009.
    c = cost_px("EURUSD", rules)
    assert abs(c - 0.00009) < 1e-12, c
    pos = [{
        "pair": "EURUSD", "side": "buy", "units": 10000, "fill": 1.10 + c,
        "stop": 1.09, "target": 1.12, "risk_gbp": 10.0, "notional_gbp": 100.0,
        "opened_i": 0, "bars_held": 0, "expires_after_bars": 15, "cash_account": cash,
    }]
    bar = {p: {"open": px[p], "high": px[p], "low": px[p]} for p in UNIVERSE}
    # Entry bar is not judged.
    assert manage(pos, 0, bar, px, rules) == []
    assert len(pos) == 1 and pos[0]["bars_held"] == 0
    # Gap through the stop at the open.
    bar["EURUSD"] = {"open": 1.08, "high": 1.08, "low": 1.07}
    closed = manage(pos, 1, bar, px, rules)
    assert len(closed) == 1 and closed[0]["reason"] == "stop" and closed[0]["gap"] is True
    assert abs(closed[0]["exit_raw"] - 1.08) < 1e-12
    assert abs(closed[0]["exit_px"] - (1.08 - c)) < 1e-12
    # Both stop and target inside the bar: stop first.
    cash["cash"] = 1470.0
    pos = [{
        "pair": "EURUSD", "side": "buy", "units": 10000, "fill": 1.10 + c,
        "stop": 1.09, "target": 1.12, "risk_gbp": 10.0, "notional_gbp": 100.0,
        "opened_i": 0, "bars_held": 0, "expires_after_bars": 15, "cash_account": cash,
    }]
    bar["EURUSD"] = {"open": 1.10, "high": 1.13, "low": 1.08}
    closed = manage(pos, 1, bar, px, rules)
    assert closed[0]["reason"] == "stop" and closed[0]["gap"] is False
    assert abs(closed[0]["exit_raw"] - 1.09) < 1e-12
    # Gap through the target at the open.
    cash["cash"] = 1470.0
    pos = [{
        "pair": "EURUSD", "side": "buy", "units": 10000, "fill": 1.10 + c,
        "stop": 1.09, "target": 1.12, "risk_gbp": 10.0, "notional_gbp": 100.0,
        "opened_i": 0, "bars_held": 0, "expires_after_bars": 15, "cash_account": cash,
    }]
    bar["EURUSD"] = {"open": 1.13, "high": 1.14, "low": 1.125}
    closed = manage(pos, 1, bar, px, rules)
    assert closed[0]["reason"] == "target" and closed[0]["gap"] is True
    assert abs(closed[0]["exit_raw"] - 1.13) < 1e-12
    math = required_risk()
    assert math["ten_pct_reachable_under_unchanged_caps"] is False
    assert abs(math["reward_risk"] - 1.75) < 1e-12
    assert abs(math["max_perfect_day_return_under_open_risk_cap"] - 0.0525) < 1e-12
    assert abs(math["per_trade_risk_pct_if_three_positions_all_pay_target"] - (10.0 / 1.75 / 3.0)) < 1e-12
    assert abs(math["gap_rule_pins_risk_at_pct"] - 1.0) < 1e-12
    end10 = START_GBP * (1.10 ** 20)
    end40 = START_GBP * (1.40 ** 20)
    flat = flat_monte_carlo(0.10 / 252.0, START_GBP, "bis")
    assert flat["p_avg_daily_ge_10pct"] == 0.0
    assert flat["p_halt_-10pct"] == 0.0
    print("SELF_TEST_OK")
    print(f"compound_10pct_20d_multiple={1.10 ** 20:.10f}")
    print(f"compound_10pct_20d_end_gbp={end10:.10f}")
    print(f"compound_40pct_20d_multiple={1.40 ** 20:.10f}")
    print(f"compound_40pct_20d_end_gbp={end40:.10f}")
    print(f"per_trade_risk_pct_for_10pct_perfect_day={math['per_trade_risk_pct_if_three_positions_all_pay_target']:.10f}")
    print(f"max_perfect_day_under_3pct_open_and_variant_R={math['max_perfect_day_return_under_open_risk_cap']:.10f}")
    rng = np.random.default_rng(1)
    n = 120
    idx = pd.bdate_range("2022-01-03", periods=n)
    seeds = {
        "EURUSD": 1.10, "GBPUSD": 1.30, "USDJPY": 130.0, "AUDUSD": 0.70,
        "USDCAD": 1.30, "USDCHF": 0.90, "NZDUSD": 0.62, "EURGBP": 0.85, "EURJPY": 143.0,
    }
    frames = {}
    for pair, p0 in seeds.items():
        close = p0 * np.exp(np.cumsum(rng.normal(0, 0.004, n)))
        open_ = np.r_[p0, close[:-1]]
        high = np.maximum(open_, close) * 1.002
        low = np.minimum(open_, close) * 0.998
        frames[pair] = pd.DataFrame(
            {"open": open_, "high": high, "low": low, "close": close}, index=idx)
    synthetic = run_daily(frames, deepcopy(BASE_RULES))
    assert synthetic["n_trades"] >= 1, synthetic["n_trades"]
    assert np.isfinite(synthetic["end_gbp"])
    synthetic_mc = monte_carlo(synthetic["daily_returns"], START_GBP)
    assert synthetic_mc["n_paths"] == MC_PATHS
    assert synthetic_mc["horizon_trading_days"] == MC_HORIZON
    print(f"synthetic_trades={synthetic['n_trades']}")
    print(f"synthetic_end_gbp={synthetic['end_gbp']:.6f}")
    print(f"synthetic_mc_paths={synthetic_mc['n_paths']}")
    return {
        "self_test": "SELF_TEST_OK",
        "compound_10pct_20d_multiple": 1.10 ** 20,
        "compound_10pct_20d_end_gbp": end10,
        "compound_40pct_20d_multiple": 1.40 ** 20,
        "compound_40pct_20d_end_gbp": end40,
        "daily_return_needed_for_10pct_target": 0.10,
        "daily_return_needed_for_40pct_target": 0.40,
        "required_risk": math,
    }


def _ohlc_from_download(raw, pair):
    ticker = pair + "=X"
    if isinstance(raw.columns, pd.MultiIndex):
        if ticker in raw.columns.get_level_values(0):
            df = raw[ticker].copy()
        else:
            # group_by may be column-first: Open/EURUSD=X
            df = pd.DataFrame({
                "Open": raw["Open"][ticker],
                "High": raw["High"][ticker],
                "Low": raw["Low"][ticker],
                "Close": raw["Close"][ticker],
            })
    else:
        df = raw.copy()
    df = df.rename(columns={c: str(c).lower() for c in df.columns})
    keep = df[["open", "high", "low", "close"]].apply(pd.to_numeric, errors="coerce")
    keep = keep.dropna(subset=["close"])
    keep = keep[keep["close"] > 0]
    for col in ("open", "high", "low"):
        keep[col] = keep[col].where(keep[col] > 0, keep["close"])
    keep["high"] = keep[["high", "close", "open"]].max(axis=1)
    keep["low"] = keep[["low", "close", "open"]].min(axis=1)
    return keep


def download(interval, period):
    import yfinance as yf
    tickers = [p + "=X" for p in UNIVERSE]
    raw = yf.download(
        tickers, period=period, interval=interval, auto_adjust=False,
        progress=False, group_by="ticker", threads=False,
    )
    frames = {}
    for pair in UNIVERSE:
        frames[pair] = _ohlc_from_download(raw, pair)
        if frames[pair].empty:
            raise RuntimeError(f"empty Yahoo download for {pair} interval={interval}")
    return frames


def _public_summary(block):
    skip = {"daily_returns", "daily_returns_until_halt", "trades"}
    return {k: v for k, v in block.items() if k not in skip}


def main():
    header = self_test()
    if "--self-test" in sys.argv:
        print(json.dumps(header, indent=2, default=str))
        return
    import yfinance as yf
    errors = {}
    daily = hourly = None
    try:
        dframes = download("1d", "5y")
        daily = run_daily(dframes, deepcopy(BASE_RULES))
    except Exception as exc:
        errors["daily"] = f"{type(exc).__name__}: {exc}"
    try:
        hframes = download("1h", "730d")
        if daily is None:
            dframes = download("1d", "5y")
        hourly = run_hourly(dframes, hframes, deepcopy(BASE_RULES))
    except Exception as exc:
        errors["hourly"] = f"{type(exc).__name__}: {exc}"

    mc = {}
    if daily and daily.get("daily_returns"):
        mc["backtest_daily_full_path_includes_post_halt_flats"] = monte_carlo(daily["daily_returns"], START_GBP)
        mc["backtest_daily_until_halt"] = monte_carlo(daily["daily_returns_until_halt"], START_GBP)
    if hourly and hourly.get("daily_returns"):
        mc["backtest_hourly_full_path_includes_post_halt_flats"] = monte_carlo(hourly["daily_returns"], START_GBP)
        mc["backtest_hourly_until_halt"] = monte_carlo(hourly["daily_returns_until_halt"], START_GBP)

    # BIS abstract: "up to 10% p.a." No standard deviation in the fetched text.
    # Simple division by 252 trading days. Flat on purpose.
    mc["bis_up_to_10pct_pa_flat"] = flat_monte_carlo(0.10 / 252.0, START_GBP, "bis_10pct_pa_simple_over_252")
    # Myfxbook page displayed Daily 0.04%. Page did not show a verification badge. UNVERIFIED.
    mc["myfxbook_displayed_0.04pct_daily_UNVERIFIED_flat"] = flat_monte_carlo(
        0.0004, START_GBP, "myfxbook_displayed_daily_UNVERIFIED")

    risk = required_risk()
    counter = None
    counter_mc = None
    if daily is not None:
        # Expectation-matching scale only exists when the base mean is positive.
        mu = daily["mean_daily_return"]
        risk["base_mean_daily_return_at_1pct"] = mu
        if mu is None or mu <= 0:
            risk["risk_pct_that_scales_mean_to_10pct_per_day"] = None
            risk["scale_conclusion"] = (
                "Base mean daily return is not positive. No positive multiple of this "
                "risk produces an expected +10% per day."
            )
        else:
            scale = 0.10 / mu
            risk["risk_pct_that_scales_mean_to_10pct_per_day"] = BASE_RULES["risk_per_trade_pct"] * scale
            risk["scale_conclusion"] = "Linear scale of the positive mean. Leverage and gap caps make this approximate."
        # Counterfactual sizing that makes a perfect target-hit day equal +10%.
        # Gap pin and open-risk cap are relaxed only inside this run. config.yaml is not touched.
        alt = deepcopy(BASE_RULES)
        alt["risk_per_trade_pct"] = risk["per_trade_risk_pct_if_three_positions_all_pay_target"]
        alt["max_open_risk_pct"] = risk["open_risk_pct_required_for_10pct_if_all_pay_target"]
        alt["max_gap_risk_pct"] = BASE_RULES["gap_allowance_mult"] * alt["risk_per_trade_pct"]
        try:
            counter = run_daily(dframes, alt)
            counter_mc = {
                "full_path_includes_post_halt_flats": monte_carlo(counter["daily_returns"], START_GBP),
                "until_halt": monte_carlo(counter["daily_returns_until_halt"], START_GBP),
            }
        except Exception as exc:
            errors["counterfactual"] = f"{type(exc).__name__}: {exc}"
        diagnostic_rules = deepcopy(BASE_RULES)
        diagnostic_rules["permanent_halt"] = False
        try:
            diagnostic = run_daily(dframes, diagnostic_rules)
            mc["backtest_daily_no_permanent_halt_diagnostic"] = monte_carlo(
                diagnostic["daily_returns"], START_GBP)
        except Exception as exc:
            diagnostic = None
            errors["diagnostic_no_halt"] = f"{type(exc).__name__}: {exc}"
    else:
        diagnostic = None
    if daily is not None and daily.get("daily_returns_until_halt"):
        risk["base_mean_daily_return_until_halt"] = float(np.mean(daily["daily_returns_until_halt"]))
    if diagnostic is not None:
        mu_open = diagnostic["mean_daily_return"]
        risk["base_mean_daily_return_no_permanent_halt"] = mu_open
        if mu_open is None or mu_open <= 0:
            risk["no_halt_scale_conclusion"] = (
                "With the permanent halt turned off and every other cap left as in the paper rules, "
                "the mean daily return is still not positive. No positive risk multiple produces an expected +10% per day."
            )
            risk["risk_pct_that_scales_no_halt_mean_to_10pct_per_day"] = None
        else:
            risk["risk_pct_that_scales_no_halt_mean_to_10pct_per_day"] = BASE_RULES["risk_per_trade_pct"] * (0.10 / mu_open)
            risk["no_halt_scale_conclusion"] = "Linear scale of the no-halt mean. Gap and leverage caps make this approximate."

    payload = {
        "paper_only": True,
        "live_trading": False,
        "config_yaml_modified": False,
        "yfinance_version": yf.__version__,
        "header": header,
        "price_source": "Yahoo Finance via yfinance. Symbols PAIR=X. Daily period=5y interval=1d. Hourly period=730d interval=1h.",
        "required_risk": risk,
        "daily": _public_summary(daily) if daily else None,
        "hourly": _public_summary(hourly) if hourly else None,
        "diagnostic_no_permanent_halt": _public_summary(diagnostic) if diagnostic else None,
        "monte_carlo": mc,
        "counterfactual_perfect_day_sizing": _public_summary(counter) if counter else None,
        "counterfactual_monte_carlo": counter_mc,
        "errors": errors,
    }
    # Keep the return arrays out of the human summary but available for a rerun check.
    payload["daily_returns_sha_n"] = {
        "daily_n": None if not daily else len(daily["daily_returns"]),
        "hourly_n": None if not hourly else len(hourly["daily_returns"]),
    }
    out_path = "studies/fx_paper/results.json"
    # Daily returns can be large; store them so the MC is auditable, they are market stats not personal data.
    if daily:
        payload["daily_return_series"] = daily["daily_returns"]
        payload["daily_trades"] = daily["trades"]
    if hourly:
        payload["hourly_daily_return_series"] = hourly["daily_returns"]
        payload["hourly_trades"] = hourly["trades"]
    if diagnostic:
        payload["diagnostic_trades"] = diagnostic["trades"]
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    printable = deepcopy(payload)
    for key in ("daily_return_series", "hourly_daily_return_series", "daily_trades", "hourly_trades", "diagnostic_trades"):
        printable.pop(key, None)
    print(json.dumps(printable, indent=2, default=str))
    print(f"WROTE {out_path}")


if __name__ == "__main__":
    main()
