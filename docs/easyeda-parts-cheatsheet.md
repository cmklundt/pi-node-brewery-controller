# EasyEDA Part-Finding Cheat Sheet

What to literally type in the Library dialog, in the order to place.

---

## Dialog settings (set once)

| Field | Set to |
|---|---|
| **Search Engine** | **LCSC Electronics** (the NEW tab) — full live catalog with stock |
| **Types** | **Symbol** |
| **Classes** | **JLCPCB Assembled** — only parts JLC can mount |
| **Search box** | part number or LCSC keywords — **min 3 characters, then press Enter** |

**Make sure you're in the `brewery-shield` project**, not an untitled `*New Project`.

---

## Rule 1 — Search by part number whenever you have one

Paste the C-number, hit Enter, click **Place**. This never fails and never gives you the wrong part.

## Rule 2 — When you don't have a number, search like LCSC, not like a human

LCSC doesn't use colloquial names. Translate:

| You'd say | LCSC calls it | Type this |
|---|---|---|
| 2x20 female header | Female Header 2.54mm 40P | `female header 2.54 2x20` |
| screw terminal | Pluggable Terminal Block | `terminal block 3.5mm 2P` |
| barrel jack | DC Power Jack | `DC-005` or `power jack 5.5` |
| 430 ohm precision resistor | Chip Resistor 430R ±0.1% | `430R 0.1%` |
| relay driver FET | MOSFET N-Channel SOT-23 | `AO3400A` |

If a keyword search returns junk, you're searching a description. Find the part on **lcsc.com** in another tab, copy its C-number, and paste that instead. Faster than fighting the search.

---

## Placement order

Work top to bottom. Note each C-number in your BOM as you go — this is what fills in the VERIFY rows.

### Verified — type these exactly

| Part | Type this | Get |
|---|---|---|
| MAX31865 ×4 | `C404011` | MAX31865ATP+, QFN-20-EP, ~$3.14 |
| MAX31865 alt | `C118474` | MAX31865ATP+T, tape & reel, ~$2.61 |
| 330 Ω 0603 (GPIO16 protection) | `C23138` | 330R ±1% 0603, **Basic — free** |

### Passives — Basic tier, free to place

| Part | Search |
|---|---|
| 430 Ω 0.1% ×4 (RTD reference) | `430R 0.1% 0603` |
| 4.7 kΩ (1-Wire pull-up) | `4.7K 0603` |
| 3.9 kΩ ×2 (EEPROM pull-ups) | `3.9K 0603` |
| 10 kΩ (selector pull-up) | `10K 0603` |
| 100 Ω ×8 (RTD input filter) | `100R 0603` |
| 100 nF ×~10 (decoupling) | `100nF 0603 50V` |
| 10 nF ×8 (RTD filter) | `10nF 0603` |
| Bulk electrolytic | `100uF 25V SMD` |
| LEDs ×7 | `LED 0603 green` / `red` |

> **Check the tier badge on every passive.** Basic = free. If you accidentally pick an Extended 0603 resistor, you've spent $3 for nothing.

### Discretes

| Part | Search |
|---|---|
| AO3400 ×4 (relay coil drive) | `AO3400A` |
| 2N7002 ×2 (SSR trigger) | `2N7002` |
| P-FET (reverse polarity) | `AO3401A` |
| Flyback diodes ×4 | `1N4148W` or `B5819W` |
| TVS (input surge) | `SMAJ16A` |
| PTC fuse | `PTC 3A SMD` |
| Buzzer transistor | `MMBT3904` |

### ICs — the Extended ones (~$3 each, unique part)

| Part | Search | Notes |
|---|---|---|
| ISO7741 ×2 | `ISO7741` | quad digital isolator — **the isolation barrier** |
| Buck 12V→5V 4A | `TPS5450` → if no stock, `MP2307` or `LM2596` | **flexible — take what's in stock** |
| Ideal diode | `LM66100` | HAT+ requires this for 5V back-power |
| EEPROM | `AT24C32` | HAT ID |
| Opto | `PC817` | selector sense |

> If a search comes back empty or out of stock, **pick the in-stock equivalent now**. JLC's library is a hard design constraint — never design around a part you can't get.

### Through-hole — connectors

| Part | Search |
|---|---|
| 2×20 female header | `female header 2.54 2x20` |
| Screw terminals ×7 | `terminal block 3.5mm 2P pluggable` |
| DC jack | `DC-005` |
| Rotary encoder | `EC11` |
| OLED header (4P) | `female header 2.54 1x4` |
| Buzzer | `passive buzzer SMD` |

**If a through-hole connector isn't in the JLCPCB Assembled library**, you have three options — in order of preference:
1. Search for a different part number of the same thing that *is* listed
2. Place it, and mark it **do not assemble** — you'd solder that one part yourself
3. Uncheck `JLCPCB Assembled` to find any symbol, then manually attach an LCSC number that is assemblable

Option 2 is the one that breaks your no-soldering rule, so try 1 first.

---

## Sanity checks as you place

- **Tier badge:** Basic (free) vs Extended (~$3 per unique part). Watch it on every part.
- **Stock number:** if it's under a few hundred, consider an alternative — stock moves.
- **Footprint:** confirm the package matches what you expect (MAX31865 = QFN-20-EP, *not* TQFP).
- **Record the C-number** in your BOM immediately. Don't plan to reconstruct it later.

---

## If the search returns junk

You searched a description instead of a part number. Symptoms: results are unrelated parts in random packages, and the top hit doesn't resemble what you asked for.

**Fix:** open lcsc.com in another tab → search there (their filters are much better) → copy the C-number → paste into EasyEDA → Enter.
