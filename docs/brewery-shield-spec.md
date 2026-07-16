# Brewery Control Shield — "Max" Spec

A single Raspberry Pi HAT that integrates temperature sensing, isolated actuator drive, fermentation control, and UI — designed to be **100% fab-assembled by JLCPCB** so the builder never solders. Beats BrewThings v2 / CraftBeerPi Basic Shield / Terragady on channel count, isolation, and fermentation features.

**Build model:** JLCPCB PCBA (turnkey). All SMD + through-hole parts populated by the fab. The builder plugs the finished board onto the Pi and lands probe/SSR/relay wires on pluggable screw terminals with a screwdriver.

---

## Capabilities (the full set)

- **4× on-board PT100 channels** — bare-chip MAX31865 per channel (beats BrewThings' 3), 3-wire, 430Ω reference
- **Bonus 1-Wire header** (DS18B20) + **2× flow-meter pulse inputs**
- **2× opto-isolated SSR-drive outputs** for the 240V elements, sized for continuous time-proportioning
- **4× isolated general outputs** (external relays/SSRs) for 120V on/off loads
- **Glycol pump channel** — relay drive sized for motor inrush (chiller self-regulates; no compressor switching, so no hardware lockout needed)
- **Full galvanic isolation** between the Pi and the actuator-drive side (digital isolators), with flyback, TVS, reverse-polarity, and a resettable fuse
- **On-board 12V→5V buck (4A)** — one brick powers Pi + board + drive rail, with back-power protection to the Pi
- **UI/aux:** rotary encoder + I²C OLED header, buzzer, per-output status LEDs, power/health LED
- **Selector-sense** opto-isolated input (which element is armed)
- **HAT ID EEPROM** (auto-identify at boot)

---

## Functional blocks & key parts

**Power.** 12V barrel input → reverse-polarity P-FET + SMAJ TVS + resettable fuse → 5V/4A buck (TPS5450-class). 5V feeds the Pi through an ideal-diode controller (LM66100) so board and Pi USB power can't fight. 12V rail also serves relay coils and the isolated drive side. 3.3V taken from the Pi for the sensor domain.

**Sensing.** 4× MAX31865ATP+ (TQFP-20), each with a 430Ω 0.1% reference and the standard RC input filter, all sharing SPI0 with individual chip-selects. 3-wire mode, 50/60 Hz filter enabled in software. Plus a 1-Wire header (GPIO4, 4.7k pull-up) and two hall flow-sensor inputs with pull-ups/RC debounce.

**Isolation barrier.** ISO7741 quad digital isolators carry the six output-drive signals across a galvanic barrier. The Pi/sensor side stays clean; the drive side (SSR triggers, relay coils, fault current) is a separate ground domain powered from 12V. A fault on the actuator wiring cannot reach the Pi.

**Outputs.** On the isolated side, one logic-level N-MOSFET per channel (AO3400 for coils, 2N7002 for SSR triggers) with flyback diodes, brought to 3.5mm pluggable screw terminals as `[V+ | OUT]`. Two channels are the element SSR-drives; four are general. Each channel has a status LED reflecting real drive state.

**Glycol pump channel.** The chiller is self-regulating, so this output only switches the glycol circulation pump — no compressor, hence no hardware anti-short-cycle timer. The pump is an inductive motor load: drive it with an external relay/contactor rated for motor inrush (not a resistive-rated SSR), with the on-board flyback and snubber provisions populated. Cycle protection is just a sensible deadband in software, not a hardware lockout.

**UI / ID.** Rotary encoder (A/B/switch) + I²C OLED header on SDA1/SCL1; piezo buzzer via a small transistor; HAT ID EEPROM (AT24C32) on ID_SD/ID_SC with 3.9k pull-ups and a write-protect jumper; opto-isolated selector-sense input.

---

## GPIO map

| Function | BCM | Notes |
|---|---|---|
| SPI SCLK / MOSI / MISO | 11 / 10 / 9 | shared, 4× MAX31865 |
| CS HLT / Mash / Boil / Ferm | 8 / 7 / 25 / 24 | CE0, CE1, + 2 soft-CS |
| SSR-drive — HLT / Boil | 17 / 27 | via isolator → MOSFET → ext SSR |
| General out A–D | 22 / 23 / 5 / 6 | isolated; A = glycol pump, B = fermenter heat |
| 1-Wire | 4 | DS18B20 bonus |
| Flow 1 / 2 | 12 / 13 | pulse inputs |
| Selector-sense | 16 | opto-isolated input |
| Encoder A / B / switch | 19 / 26 / 20 | |
| Buzzer | 21 | |
| OLED I²C (SDA1/SCL1) | 2 / 3 | display header |
| HAT EEPROM (ID_SD/ID_SC) | 0 / 1 | reserved, auto-ID |

Free for expansion: GPIO14/15 (UART — RS485 option), GPIO18.

---

## Assembly & ordering

- **JLCPCB PCBA**, 2-layer (4-layer optional for cleaner analog/isolation grounding — worth considering), 1.6mm, HASL or ENIG, green. Upload Gerbers + BOM + pick-and-place; the fab populates everything.
- **Insurance order (strongly recommended):** in the same run, also fab-assemble a **socketed fallback** version that takes known-good MAX31865 *modules* instead of bare chips. ~$15–30 extra. If the bare-chip analog front-end has a first-spin quirk, you swap to the fallback instead of scrapping the run.

---

## Honest risk & validation

This is a mixed-signal board going from design straight to a populated run with no breadboard, switching 240V at ~23A. Every virtual check will be run before ordering — schematic **ERC**, layout **DRC**, KiCad **3D fit** against a Pi model (confirms it seats), and JLCPCB's automated **DFM**. Those catch the majority of errors. What they cannot fully guarantee is first-spin analog performance — which is exactly why the socketed fallback board is part of the plan rather than optional.

---

## Next steps
1. Lock this spec (must-haves confirmed).
2. Schematic capture → ERC.
3. PCB layout (isolation gap, analog grounding, 3D fit check).
4. DRC + DFM.
5. Order fab-assembled boards (Max + fallback).
