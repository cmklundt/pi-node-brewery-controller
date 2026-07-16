# Building the Shield on EasyEDA → JLCPCB

A click-level walkthrough. The whole path lives in one tool: **Schematic → assign footprints → PCB → Gerbers → order**, and the netlist carries over automatically — no import/export between steps.

Work from the four schematic sheets (`shield-sch-1-power` … `-4-ui`) and `board-elements-explained.md`.

---

## Stage 1 — Account & project (10 min)

1. Go to easyeda.com → create a free account (Google sign-in works).
2. Open the **Editor** → **New Project**. Name it `brewery-shield`.
3. Choose **EasyEDA Std** if you want the simpler UI, **Pro** for the newer one. Both order to JLCPCB. Std is easier for a first board.
4. New Schematic inside the project.

> Your design lives on their servers. That's the trade for zero setup.

---

## Stage 2 — Schematic capture (the long part)

**The golden rule:** place parts **from the JLCPCB/LCSC library**, not the generic one. In the parts panel, filter by **JLCPCB Assembled** (or "LCSC Parts"). Each result shows live stock, price, and Basic/Extended tier. That's what resolves the ten VERIFY rows in your BOM — as you place, not before.

**Prefer Basic tier** wherever there's a choice. Basic parts are free to place under Economic PCBA; every unique Extended part adds ~$3.

### Order of work — easiest to hardest

**1. Passives and connectors first** (all Basic, builds momentum)
- 40-pin 2×20 female header
- 7× 3.5 mm pluggable screw terminal
- DC barrel jack
- Resistors: 430 Ω 0.1% ×4, 4.7 k, 3.9 k ×2, 10 k, **330 Ω (LCSC C23138, Basic)**
- Caps: 100 nF ×~8, bulk electrolytics
- LEDs ×7, buzzer, encoder, OLED 4-pin header

**2. Discrete semis** (mostly Basic)
- Q1 P-FET (reverse polarity), D1 TVS, F1 PTC
- 2N7002 ×2 (SSR triggers), AO3400 ×4 (relay coils), flyback diodes ×4
- MMBT3904 (buzzer)

**3. The ICs** (Extended — search each, note the C-number as you go)
- **MAX31865ATP+ ×4 — C404011** (~$3.14) or **C118474** (~$2.61, tape & reel). QFN-20-EP.
- ISO7741 ×2 — quad digital isolator
- Buck 12 V→5 V @4 A (TPS5450 or whatever's in stock — this one's flexible)
- LM66100 ideal diode
- AT24C32 EEPROM
- PC817 opto

> **If a part is out of stock, pick the in-stock equivalent now.** JLC's library availability is a hard design constraint. Don't design around a part you can't get.

### Wire it up
Use **net labels**, not long wires. Label `+12V`, `+5V`, `+3V3`, `GND`, `GND_ISO`, `SCK`, `SDI`, `SDO`, `CS1`–`CS4`, `OUT1`–`OUT6`. Anything with the same label is connected. This keeps four sheets' worth of circuit readable.

**Keep `GND` and `GND_ISO` as separate nets.** Never label them the same thing. That separation *is* the isolation.

### Then
- Save.
- **Design → Check Net Errors** (or run ERC). Clear every error. A warning you don't understand is a warning to investigate, not dismiss.

---

## Stage 3 — Convert to PCB

1. **Design → Convert Schematic to PCB.**
2. It asks *"Do you want to check for net errors?"* → **Yes.** Always. This is the free catch.
3. Fix anything it reports, then convert.

You land in the PCB editor with all footprints in a pile and a rat's nest of connections.

---

## Stage 4 — Layout

### 4a. Outline and mounting
1. Draw the board outline on the **BoardOutline** layer: **125 × 95 mm**, rounded corners.
2. Place the **2×20 header** using a Pi HAT template/footprint — do not eyeball this. Search "Raspberry Pi HAT" in the library for a template with the header pre-positioned.
3. **At least one mounting hole aligned** with a Pi hole (HAT+ requirement — the old rigid 65×56.5 mm outline is deprecated, so your size is fine). Add holes for the overhang.
4. **Keep clear of the PoE header** (4-pin, near the top-right Pi mounting hole).
5. Plan for **15–16 mm standoffs** so a Pi Active Cooler fits underneath.

### 4b. Zoning (place before routing)
Think in three bands:

```
┌──────────────────────────────────────────────┐
│  PT100 terminals along top edge              │
│  [MAX31865 ×4]  ← 3V3 / analog zone          │
│                                              │
│  ═══ ISO7741 barrier ═══ (no copper crosses) │
│                                              │
│  [FETs + LEDs]   ← drive zone (GND_ISO)      │
│  Output terminals along right/bottom edge    │
│                                              │
│  [buck + protection]  [40-pin header]        │
└──────────────────────────────────────────────┘
```

- **Terminals on board edges** — screwdriver access.
- **Buck away from the MAX31865s** — switching noise is the enemy of an RTD front-end.

### 4c. Routing rules that matter
1. **Isolation gap:** no copper under or across the ISO7741s. **Not even ground pour.** Two separate pours: `GND` on the Pi side, `GND_ISO` on the drive side. If you pour a single ground plane across the whole board, you have destroyed the isolation and the board's main differentiator with one click.
2. **Analog:** short, matched traces from each MAX31865 to its RTD terminal. Keep the 430 Ω reference tight to its chip.
3. **Power:** wider traces on 12 V and the drive rails.
4. Route manually or use the autorouter for the easy nets — but **never let the autorouter near the isolation barrier**.
5. **Pin-1 dots on every IC** and polarity marks on LEDs/electrolytics. JLC needs these; designators aren't required.

### 4d. Check
1. **DRC** → clear every error.
2. **3D viewer** → drop in a Pi model (Raspberry Pi mechanical files are published; community STEP models exist on GrabCAD). Confirm it seats, the header lines up, nothing fouls the USB/Ethernet jacks or PoE header. **This is the virtual answer to "will it fit."**

---

## Stage 5 — Export

- **Fabrication → PCB Fabrication File (Gerber)** — review the preview.
- **Export BOM** — must carry the LCSC part numbers.
- **Export CPL / Pick-and-Place** — XY + rotation for every part.

All three are required. Gerbers alone won't get you an assembled board.

---

## Stage 6 — Order

1. From EasyEDA, **Order at JLCPCB** (one-click), or upload the Gerbers manually at jlcpcb.com.
2. Board settings: **2-layer, 1.6 mm, HASL lead-free or ENIG, green** (green or black is required if you want the 2-piece assembly option).
3. **Tick PCB Assembly.**
4. **PCBA Qty:** defaults to **5**, accepts **2–5**. PCB minimum is 5 either way — so 5 costs barely more than 2, and the spares are your only insurance without a prototype. **Order 5.**
5. Choose **Economic** PCBA if offered (Basic parts free; Standard adds ~$25 plus a loading fee on *every* component).
6. Upload **BOM** and **CPL** on the next screens.
7. **Parts matching page — read every line.** Confirm each part matched to what you intended. Anything unmatched or substituted, fix now.
8. **Enable through-hole assembly** for the header, terminals, jack, encoder. Cost: **$3.50 + $0.0173/joint** (~65 joints ≈ **$4.60/board**). This is what keeps your hands off a soldering iron.
9. Review the **DFM report**.
10. Expect a **QFN assembly fixture fee** for the MAX31865 — it'll show here. This is the one number I couldn't estimate.
11. Confirm and pay.

**Expect ~$205–230 total for 5 assembled boards** (~$41–46 each), plus the fixture fee and shipping. Roughly a week to California.

---

## Stage 7 — When they arrive

Do not skip this. You have no prototype, and this board switches 240 V at ~23 A.

1. **Power with no Pi attached.** Meter the 5 V rail. Confirm it reads 5 V, not 12 V. If it reads 12 V, you just saved your Pi.
2. **Check JP1/JP2** against your actual relay coil voltage *before* connecting anything. (Read the relay can: `SRD-05VDC-SL-C` = 5 V, `SRD-12VDC-SL-C` = 12 V. Or measure the coil: ~60–70 Ω = 5 V, ~350–400 Ω = 12 V.)
3. Seat on the Pi. Confirm it boots. Confirm all four PT100s read plausible room temperature.
4. Toggle every output with the **panel de-energized** — confirm the right relay clicks and the right LED lights.
5. Only then bring up 240 V: GFCI feed, interlock verified, pilot lights confirming true state.

---

## Realistic time

- Schematic capture: **an evening** (2–4 hrs), most of it finding parts
- Layout: **an evening or two** — the isolation gap and analog zoning are the thinking parts
- Checks + export + order: **an hour**

If that's not time you want to spend, this document set is complete enough to hand to a freelance PCB designer. A few hundred dollars gets you Gerbers from someone who does this weekly.
