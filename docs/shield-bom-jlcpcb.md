# Brewery Shield — JLCPCB BOM & Sourcing Status

**Status: partial.** Verified entries are confirmed against JLCPCB/LCSC listings. Entries marked **VERIFY** are engineering selections whose LCSC part numbers have *not* been confirmed — do not order against them until checked in JLCPCB's BOM Tool with live stock.

---

## Verified

| Ref | Part | LCSC / JLC # | Package | Tier | Price | Note |
|---|---|---|---|---|---|---|
| U10–U13 | MAX31865ATP+ | **C404011** | QFN-20-EP (5×5) | Extended | ~$3.14 | Needs assembly fixture |
| U10–U13 (alt) | MAX31865ATP+T | **C118474** | QFN-20-EP (5×5) | Extended | ~$2.61 | Tape & reel; cheaper, same die |

**Correction to earlier spec:** this part is **QFN-20 with exposed pad**, not TQFP-20. It cannot be hand-soldered. Fab assembly is required, not optional.

---

## VERIFY — selections needing live LCSC confirmation

| Ref | Intended part | Function |
|---|---|---|
| U20, U21 | ISO7741 (quad digital isolator) | Pi ↔ drive-side galvanic barrier |
| U1 | TPS5450 (or equivalent buck) | 12V → 5V @ 4A |
| U2 | LM66100 (ideal diode) | Back-power protection to Pi 5V |
| U3 | AT24C32 | HAT ID EEPROM |
| U4 | PC817 | Opto-isolated selector sense |
| Q1 | AO3401A P-FET | Reverse-polarity protection (Basic-list candidate) |
| Q10–Q11 | 2N7002 | SSR trigger drive |
| Q12–Q15 | AO3400 | Relay coil drive |
| D1 | SMAJ16A TVS | Input surge |
| F1 | PTC 3A | Resettable fuse |

Passives (0603 R/C), LEDs, headers, and 3.5mm pluggable terminals: mostly Basic-tier, resolve during layout.

---

## Cost reality

- **Economic vs Standard PCBA:** Economic makes Basic parts free. Standard adds ~$25 *and* a loading fee on every component. This board is dominated by **Extended** parts (4× MAX31865, 2× isolator, buck, EEPROM) — each carries a feeder/loading fee.
- **Assembly fixture** required for the MAX31865 QFN-EP — additional charge.
- **Net:** this is not a "$2 PCB." Budget low hundreds for a small assembled run. Get a live quote via JLCPCB's BOM Tool before committing.

---

## Open risks

1. **No prototype validation.** Board goes design → populated run with no bench test, switching 240V at ~23A. Virtual checks (ERC, DRC, 3D fit, DFM) catch most but not all first-spin analog issues.
2. **Socketed fallback still recommended** — a second board variant taking known-good MAX31865 *modules*, ordered in the same run, as insurance.
3. **Unverified part numbers above are the current blocker** to a real BOM upload.

---

## Next actions
1. Resolve every VERIFY row in JLCPCB's BOM Tool (live stock + tier + price).
2. Schematic capture in EasyEDA (JLC-native, parts library integrated) → ERC.
3. Layout → DRC → 3D fit against a Pi model.
4. Export Gerbers + BOM + CPL → quote → order.
