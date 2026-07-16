# Brewery Carrier HAT — Design & Build Doc

A custom 2-layer PCB (125 × 95 mm) that seats onto the Raspberry Pi 40-pin header and integrates your sensor and drive electronics. **Design choice: carrier board.** The four MAX31865 modules and the ULN2803 plug into sockets rather than being soldered as raw chips — everything is through-hole and hand-solderable, modules are swappable, and there is still **zero mains on the board**. (If you'd rather have the MAX31865 chips soldered directly as SMD for a smaller board, that's a separate spin I can do too.)

See `carrier-hat-schematic.svg` (interconnect) and `carrier-hat-pcb.svg` (placement).

---

## What's on the board
- 1× 2×20 female header → seats on the Pi
- 4× 1×7 sockets → receive the MAX31865 breakouts (PT100 wires land on each module's own RTD terminal)
- 1× 18-pin DIP socket → ULN2803A buffer
- 7× 3.5 mm screw terminals → 5 drive outputs + DRIVE V+ input + selector-sense
- Support passives + 4× M2.5 mounting holes

---

## Connection table (netlist)

**Power**
| From | To |
|---|---|
| Pi 3V3 (pin 1) | 3V3 rail → each module `Vin` (×4) |
| Pi GND (pins 6/9/…) | GND rail → module GND, ULN2803 pin 9, terminal GND |
| DRIVE V+ terminal (ext 5–12 V) | ULN2803 pin 10 (COM) → each output terminal `V+` |

> Use the external DRIVE V+ supply for the SSR/relay rail — don't hang relay coils off the Pi's 5 V.

**SPI (shared bus to all 4 modules)**
| Pi pin | Net | Module pin |
|---|---|---|
| GPIO11 / pin 23 | SCK | CLK (all) |
| GPIO10 / pin 19 | SDI | SDI (all) |
| GPIO9 / pin 21 | SDO | SDO (all) |

**Chip selects**
| Pi pin | Module |
|---|---|
| GPIO8 / CE0 / pin 24 | #1 — HLT |
| GPIO7 / CE1 / pin 26 | #2 — Mash |
| GPIO25 / pin 22 | #3 — Boil |
| GPIO24 / pin 18 | #4 — Fermenter |

**ULN2803 drive channels**
| Pi pin | ULN in→out | Output terminal |
|---|---|---|
| GPIO17 / pin 11 | IN1→OUT1 | SSR — HLT element (240 V) |
| GPIO27 / pin 13 | IN2→OUT2 | SSR — Boil element (240 V) |
| GPIO22 / pin 15 | IN3→OUT3 | Relay A (120 V) |
| GPIO23 / pin 16 | IN4→OUT4 | Relay B (120 V) |
| GPIO5 / pin 29 | IN5→OUT5 | Relay C (120 V) |

Each output terminal is `[V+ | OUT]`: wire the external SSR/relay `+` to V+, `−` to OUT (the ULN sinks it to ground).

**Selector sense (optional):** GPIO6 / pin 31 → SELECTOR terminal, 10 kΩ pull-up to 3V3 on board; other terminal to GND (dry contact only — never tap the 240 V).

---

## Bill of Materials (board only — you have the rest)
| Qty | Part |
|---|---|
| 1 | Custom PCB, 2-layer, 125×95 mm, 1.6 mm, HASL |
| 1 | 2×20 female header, 2.54 mm (stacking if you want clearance) |
| 4 | 1×7 female header, 2.54 mm (module sockets) |
| 1 | ULN2803A + 18-pin DIP socket |
| 7 | 3.5 mm screw terminal, 2-pos |
| 1 | 10 kΩ resistor (selector pull-up) |
| 2 | 100 nF ceramic (decoupling) |
| 1 | 100 µF electrolytic (DRIVE V+ bulk) |
| 4 | M2.5 standoff + screw |

MAX31865 breakouts must be the **430 Ω** (PT100) version, set to **3-wire** mode with the 50/60 Hz filter on.

---

## Assembly
1. Solder the low-profile parts first: resistor, caps, DIP socket, screw terminals.
2. Solder the 4× 1×7 module sockets and the 2×20 GPIO header (keep it square).
3. Seat the ULN2803 in its socket (notch matching silk) and plug in the four MAX31865 modules.
4. Land each PT100's 3 wires on its module's RTD terminal; run drive wiring from the output terminals to your external SSRs/relays.

## Getting it fabbed
It's a simple 2-layer board — JLCPCB / PCBWay / OSHPark will all make 5 for a few dollars once it's routed. The schematic and placement here are complete; the remaining step is turning them into a routed KiCad project + Gerbers.

## Safety carryover
All SSRs, relays, the element interlock, pilot lights, and GFCI feed stay in the panel. If any 120 V channel drives a compressor (glycol chiller), size that relay for motor inrush and enforce a 3–5 min minimum-off in software.
