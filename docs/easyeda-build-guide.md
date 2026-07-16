# EasyEDA Build Guide — Brewery Shield

Transcribe the four schematic sheets into EasyEDA (JLCPCB's own tool), route, and order fab+assembly in one place. EasyEDA's parts panel shows live LCSC stock and tier as you place, which resolves the unverified BOM rows as you go.

**Target:** 5 assembled boards, ~$41–46/board. You solder nothing — JLCPCB does SMT by machine and through-hole by hand ($3.50 + $0.0173/joint, ~65 joints ≈ $4.60/board).

---

## 0. Verified mechanical rules (HAT+)

The original 65×56.5mm HAT spec is **deprecated**. Follow **HAT+**:

- **Dimensions are flexible.** HAT+ is intentionally less prescriptive. Our 125×95mm board is compliant.
- **At least one mounting hole must align** with one of the Pi's four mounting holes. Support the overhang with additional standoffs.
- **Standoffs: 15mm (16mm recommended)** — allows a Pi Active Cooler to fit underneath. (Old 8mm minimum is not enough for modern Pis.)
- **Do not foul the PoE header** (4-pin, near the top-right mounting hole on Pi 3B+/4/5). Keep copper and parts clear.
- **ID_SD / ID_SC (GPIO0/1):** ID EEPROM **only**, with 3.9kΩ pull-ups to 3V3. Nothing else may connect.
- **Back-powering the Pi via the 5V pins requires an ideal safety diode** — this is why U2 (LM66100) exists. Not optional.
- **GPIO 6 / 14 / 16 protection:** the board must protect against old firmware driving these at boot if the board also drives them. **Our selector-sense opto drives GPIO16 → add a series resistor (~330Ω) between the opto output and the pin.** Do not omit this.

---

## 1. Setup

1. Create an EasyEDA account → new project → new schematic.
2. Use **EasyEDA Std** (simpler) or **Pro**. Either exports to JLCPCB.
3. In the parts panel, filter by **JLCPCB Assembled** so you only place orderable parts. Prefer **Basic** tier wherever a choice exists — Basic parts have no feeder fee.

---

## 2. Schematic capture — sheet by sheet

Work from the four SVG sheets. Place, then wire by net label rather than dragging long wires.

### Sheet 1 — Power
`J1 DC jack → Q1 P-FET (reverse polarity) + D1 SMAJ16A TVS → F1 PTC 3A → U1 buck (12V→5V/4A) → U2 LM66100 ideal diode → Pi 5V`

- Rails: **+12V** (drive side), **+5V** (Pi + drive option), **+3V3** (from Pi, sensor domain only), **GND** / **GND_ISO** (keep as separate nets).
- **JP1** → SSR bank (OUT1–2) rail select: 5V / 12V. **JP2** → relay bank (OUT3–6) rail select: 5V / 12V.
- Silkscreen both jumpers, **default 5V**. Label clearly: 12V into a 5V relay coil destroys it.

### Sheet 2 — Sensing (3V3 domain)
4× **MAX31865ATP+** — LCSC **C404011** (~$3.14) or **C118474** (~$2.61, tape & reel). Package is **QFN-20-EP (5×5)**.

Per channel: 430Ω 0.1% reference, RC input filter (100Ω/10nF), 100nF decoupling, VDD = 3V3.
Shared SPI0: SCK GPIO11 · SDI GPIO10 · SDO GPIO9.
Chip selects: **U10 HLT ← GPIO8 (CE0)** · **U11 Mash ← GPIO7 (CE1)** · **U12 Boil ← GPIO25** · **U13 Ferm ← GPIO24**.
Plus: 1-Wire header (GPIO4, 4.7k pull-up) and Flow 1/2 (GPIO12/13, pull-up + RC debounce).

> All four MAX31865s = **one** extended-part fee (fees are per unique part, not per placement).

### Sheet 3 — Isolation & outputs
`GPIO → U20/U21 ISO7741 → logic-FET → pluggable screw terminal [V+ | OUT]`

| Out | GPIO | Load | Device |
|---|---|---|---|
| OUT1 | 17 | SSR — HLT element | 2N7002 |
| OUT2 | 27 | SSR — Boil element | 2N7002 |
| OUT3 | 22 | Relay A — glycol pump | AO3400 + flyback + snubber |
| OUT4 | 23 | Relay B — ferment heat | AO3400 + flyback |
| OUT5 | 5 | Relay C — spare | AO3400 + flyback |
| OUT6 | 6 | Relay D — spare | AO3400 + flyback |

Status LED per channel on the drive side. Keep **GND** and **GND_ISO** as distinct nets — never join them.

### Sheet 4 — UI / ID
- Encoder A=GPIO19, B=GPIO26, SW=GPIO20 (pull-ups + RC debounce)
- OLED I²C header: SDA1=GPIO2, SCL1=GPIO3
- Buzzer: GPIO21 → MMBT3904 + flyback
- **ID EEPROM AT24C32** on ID_SD/ID_SC + 3.9kΩ pull-ups + WP jumper
- **Selector sense: PC817 opto → 330Ω series → GPIO16.** Dry contact only from the selector's spare pole — never tap 240V.

Run **ERC** and clear every error before layout.

---

## 3. Layout

1. Board outline **125 × 95mm**, rounded corners.
2. Place the **2×20 female header** at the Pi's header coordinate — use EasyEDA's Pi HAT template/footprint rather than eyeballing.
3. **At least one mounting hole aligned** to a Pi hole; add standoffs for the overhang. **Keep clear of the PoE header.**
4. Zoning: sensors + 3V3 in one region; isolators on the barrier line; drive side + terminals along the opposite edge. Terminals on the board edge for screwdriver access.
5. **Isolation gap:** no copper — including ground pour — crossing under the ISO7741s. Maintain the barrier physically.
6. Analog care: short, matched runs from each MAX31865 to its RTD terminal; keep the reference resistor tight to the chip; keep switching (buck) noise away from the RTD front-ends.
7. Run **DRC** → clear all.
8. **3D viewer** with a Pi model → confirm it seats, header lines up, nothing fouls the USB/Ethernet jacks or PoE header.

---

## 4. Order

1. Export **Gerbers**, **BOM**, **CPL**.
2. Upload to JLCPCB → select **Economic** PCBA if possible (Basic parts free), green or black soldermask.
3. **Quantity 5** (minimum order is 5; assembly minimums are similar). Five costs barely more than one — fixed costs dominate. The 4 spares are your insurance since there's no prototype.
4. Enable **through-hole assembly** for the header, terminals, jack, encoder.
5. Review the DFM report and the parts-matching page — confirm every part matched and note anything flagged Standard-only.
6. Expect a fee for the **QFN assembly fixture** (MAX31865) — unpriced here; the live quote will show it.

---

## 5. Before you brew

Even with everything above, this board has had no bench validation. On arrival:

1. Power it with **no Pi attached** — confirm 5V rail is 5V, not 12V.
2. Check JP1/JP2 are set to your actual coil voltage **before** connecting relays.
3. Verify all four PT100s read plausible room temperature before wiring any mains.
4. Test each output switching its SSR/relay with the panel de-energized.
5. Only then bring up 240V — GFCI feed, interlock verified, pilot lights confirming real state.
