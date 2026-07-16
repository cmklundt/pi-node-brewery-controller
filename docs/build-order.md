# Build Order — Definitive List

One choice per line. No alternates. Quantities included. Work top to bottom.

---

## First: the two canvases

**Schematic (where you are now)** — an infinite canvas. No board size, no outline. Position is for *your* readability only; connections come from wires and net labels. Nothing you do here has physical dimensions.

**PCB (doesn't exist yet)** — created later via **Design → Convert Schematic to PCB**. That's where the 125×95 mm outline, the header position, and the mounting holes live.

So there's no setup step. Open a sheet and start placing.

**Sheets:** our design is four sheets. In EasyEDA Std, use the **`+`** next to `Sheet_1` at the bottom to add them. Name them:
1. `Power`
2. `Sensing`
3. `Outputs`
4. `UI`

Net labels carry across sheets — a `+5V` on sheet 1 is the same net as `+5V` on sheet 3. That's what makes multi-sheet work.

---

## Sheet placement map

Convention: **signals flow left → right, power flows top → bottom.** Follow it and the sheet reads itself.

### Sheet 1 — Power
```
LEFT ─────────────────────────────────────► RIGHT
[DC jack] → [P-FET] → [TVS] → [PTC] → [buck] → [ideal diode] → +5V
                                          │
                              +12V ───────┴──── to JP1/JP2
BOTTOM: JP1 (SSR bank), JP2 (relay bank), rail symbols
```

### Sheet 2 — Sensing
```
TOP:    PT100 terminals ×4 (one above each chip)
MIDDLE: [MAX31865 ×4] side by side — each with its 430Ω + RC filter + 100nF
BOTTOM: SPI net labels (SCK/SDI/SDO) running under all four; CS1–CS4 to each
RIGHT:  1-Wire header, flow inputs
```

### Sheet 3 — Outputs
```
LEFT           CENTER              RIGHT
GPIO labels → [ISO7741 ×2] → [FETs + LEDs] → [terminals]
              ═══ barrier ═══
              GND left side      GND_ISO right side
```
Draw a literal vertical line down the middle and label it. It's the one thing on this board you must not blur.

### Sheet 4 — UI
Four loose blocks, no flow: encoder, OLED header, buzzer, EEPROM, selector opto. Position doesn't matter here.

---

## The build list

Place in this order. **Record each C-number in your BOM as you place it.**

### Group A — Sensing (Sheet 2) — start here, it's the heart of the board

| # | Qty | Part | Search | Tier |
|---|---|---|---|---|
| 1 | 4 | MAX31865ATP+T | `C118474` | Extended |
| 2 | 4 | 430 Ω 0.1% 0603 — RTD reference | `430R 0.1% 0603` | Basic |
| 3 | 8 | 100 Ω 0603 — RTD input filter | `100R 0603` | Basic |
| 4 | 8 | 10 nF 0603 — RTD input filter | `10nF 0603` | Basic |
| 5 | 4 | 100 nF 0603 — MAX31865 decoupling | `100nF 0603 50V` | Basic |
| 6 | 4 | 3-pos screw terminal — PT100 in | `terminal block 3.5mm 3P` | THT |
| 7 | 1 | 4.7 kΩ 0603 — 1-Wire pull-up | `4.7K 0603` | Basic |
| 8 | 1 | 3-pin header — DS18B20 | `header 2.54 1x3` | THT |
| 9 | 2 | 10 kΩ 0603 — flow pull-ups | `10K 0603` | Basic |
| 10 | 2 | 2-pos terminal — flow in | `terminal block 3.5mm 2P` | THT |

> **Why start here:** if the MAX31865 search works and places cleanly, your dialog is configured right. If it doesn't, stop and fix that before placing fifty parts.

### Group B — Outputs (Sheet 3)

| # | Qty | Part | Search | Tier |
|---|---|---|---|---|
| 11 | 2 | ISO7741 — digital isolator | `ISO7741` | Extended |
| 12 | 2 | 2N7002 — SSR trigger FET | `2N7002` | Basic |
| 13 | 4 | AO3400A — relay coil FET | `AO3400A` | Basic |
| 14 | 4 | 1N4148W — flyback | `1N4148W` | Basic |
| 15 | 6 | LED 0603 green — status | `LED 0603 green` | Basic |
| 16 | 6 | 1 kΩ 0603 — LED current limit | `1K 0603` | Basic |
| 17 | 6 | 10 kΩ 0603 — FET gate pulldown | `10K 0603` | Basic |
| 18 | 6 | 2-pos terminal — outputs | `terminal block 3.5mm 2P` | THT |

### Group C — Power (Sheet 1)

| # | Qty | Part | Search | Tier |
|---|---|---|---|---|
| 19 | 1 | DC barrel jack | `DC-005` | THT |
| 20 | 1 | AO3401A — reverse polarity P-FET | `AO3401A` | Basic |
| 21 | 1 | SMAJ16A — input TVS | `SMAJ16A` | Basic |
| 22 | 1 | PTC fuse 3A | `PTC 3A SMD` | Basic |
| 23 | 1 | **TPS5450 — 12V→5V buck** | `TPS5450` | Extended |
| 24 | 1 | LM66100 — ideal diode | `LM66100` | Extended |
| 25 | 1 | 100 µF 25V — input bulk | `100uF 25V SMD` | Basic |
| 26 | 1 | 100 µF 10V — output bulk | `100uF 10V SMD` | Basic |
| 27 | 2 | 3-pin jumper header — JP1/JP2 | `header 2.54 1x3` | THT |
| 28 | 1 | 2-pos terminal — drive V+ | `terminal block 3.5mm 2P` | THT |
| 29 | 1 | LED 0603 red + 1 kΩ — power on | `LED 0603 red` | Basic |

> **⚠ The buck needs supporting parts I can't list blind.** Its inductor, feedback divider, catch diode, and compensation come from the **TPS5450 datasheet's application circuit** — the values depend on the chip. Open the datasheet, copy its 12V→5V reference design, and place what it calls for. If the TPS5450 is out of stock, pick an in-stock 5V/4A buck and use *its* datasheet instead. This is the one block you can't build from my list alone.

### Group D — UI & ID (Sheet 4)

| # | Qty | Part | Search | Tier |
|---|---|---|---|---|
| 30 | 1 | AT24C32 — HAT ID EEPROM | `AT24C32` | Extended |
| 31 | 2 | 3.9 kΩ 0603 — EEPROM pull-ups | `3.9K 0603` | Basic |
| 32 | 1 | 2-pin header — EEPROM write protect | `header 2.54 1x2` | THT |
| 33 | 1 | PC817 — selector opto | `PC817` | Extended |
| 34 | 1 | **330 Ω 0603 — GPIO16 protection** | `C23138` | Basic |
| 35 | 1 | 10 kΩ 0603 — selector pull-up | `10K 0603` | Basic |
| 36 | 1 | 2-pos terminal — selector in | `terminal block 3.5mm 2P` | THT |
| 37 | 1 | EC11 rotary encoder | `EC11` | THT |
| 38 | 2 | 10 kΩ + 2× 100 nF — encoder debounce | `10K 0603` | Basic |
| 39 | 1 | 4-pin header — OLED I²C | `header 2.54 1x4` | THT |
| 40 | 1 | MMBT3904 — buzzer driver | `MMBT3904` | Basic |
| 41 | 1 | 1 kΩ 0603 — buzzer base resistor | `1K 0603` | Basic |
| 42 | 1 | Passive buzzer | `passive buzzer SMD` | — |

### Group E — The header (do last)

| # | Qty | Part | Search |
|---|---|---|---|
| 43 | 1 | 2×20 female header, 2.54 mm | `female header 2.54 2x20` |

> Left for last deliberately — it's the one most likely to fight you in the assembled library. If nothing comes up, say so before you resort to soldering it yourself.

---

## Tally

- **Extended (~$3 each, unique):** MAX31865, ISO7741, TPS5450, LM66100, AT24C32, PC817 = **6 unique** ≈ $18 in feeder fees
- **Basic:** everything else — free to place under Economic PCBA
- **Through-hole:** ~15 parts, hand-soldered by JLC at $3.50 + $0.0173/joint

> Four MAX31865s = **one** $3 fee. Fees are per unique part, not per placement.

---

## Honest caveats

1. **The buck's passives aren't in this list** — they come from its datasheet. Unavoidable; the values are chip-specific.
2. **Passive quantities are close, not final.** Exact counts settle as you wire and find you need another decoupling cap. Expect ±20%.
3. **Only C118474 and C23138 are verified.** The other searches are engineering selections — the parts panel tells you the truth about stock and tier, and it may override me.
4. **If a part is out of stock, substitute now**, and update the list. JLC's library is a design constraint, not a suggestion.
