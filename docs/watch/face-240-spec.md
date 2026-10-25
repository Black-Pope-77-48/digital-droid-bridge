`L06::TARGET` Lesson 06 target. No hardware result exists yet.
# Droidspeak watch face: 240x240 round (Lesson 06 visual spec)
From Creative God. The mock image (face-240-mock.jpg) is a mood reference only. Its labels at 5, 6 and 9 o'clock are wrong (it shows MID, a missing tick and CMR). This spec is the source of truth.

## Palette (RGB565-safe)
| Role | Hex | RGB565 |
|---|---|---|
| Background | #000000 | 0x0000 |
| Time, main text | #FFFFFF | 0xFFFF |
| Pulse code, lit tick | #22E5FF | 0x273F |
| Lit tick halo (1px each side) | #0A4A55 | 0x0A4A |
| Dark tick, labels | #2A3540 | 0x29A8 |
| Label text | #6B7785 | 0x6BB0 |
| Age, fresh (<12h) | #6B7785 grey | 0x6BB0 |
| Age, aging (12-48h) | #FFB020 amber | 0xFD84 |
| Age, stale (>48h) | #FF4D4D red | 0xFA69 |

## Layout (centre 120,120)
- Ticks run from r=104 to r=116 at 30° steps, with 0° = 12 o'clock. Order clockwise from 12: ORB, NRG, HLT, LOG, FIN, CIV, MED, LGL, CLM, CMP, MAR, AGR.
  - Lit: a filled 4px-wide cyan bar, plus 1px halo lines.
  - Dark: a 2px-wide #2A3540 bar. It must stay visible, so a dead vertical reads as "not connected" rather than missing.
  - The vertical of today's pulse (MAR for WINCH.BRK) also gets a 3px cyan dot at r=98.
- Labels: optional on 240px. If used, put them in 8px mono at r=88, in #6B7785. If they crowd, show only the label of today's pulse vertical.
- Time: HH:MM in 36-40px mono, white, centred at y=78, with "UK" in 10px grey after it.
- Pulse: 2 lines in 14px mono, centred, split at " // ".
  - Line 1 (code) is cyan, at y=124.
  - Line 2 ("// verdict") is white, at y=144.
  - Max 15 characters per line. If a line is longer, truncate it with "…".
- Age pill: centred at y=172, about 56x16, 1px rounded border in the age colour, 10px mono text in that colour.
- Footer: "DROIDSPEAK" in 8px grey at y=206. If used at all, FAITH appears as plain text only.

## Pulse age
- Compute age = now − pulse timestamp, in UK time.
- Show "now" under 1h, then "6h old" up to 47h, then "3d old".
- Colours: grey when fresh, amber from 12h, red from 48h.
- Over 7 days, replace line 2 with "// no-pulse", dim line 1 to grey, and show the date of the last good pulse.

## Lit rule
A tick is lit when its vertical had a live pulse in the last 7 days, and dark otherwise. Optionally fade the lit colour with age (full cyan within 24h, #1690A0, RGB565 0x1494, from 1 to 7 days), so the "flow" visibly decays.

No coin or BTC visuals.
