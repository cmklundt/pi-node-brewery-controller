# Electric Brewery Pi HAT — Build Spec

**System:** HERMS (2× 240V elements) + glycol-cooled conical, PT100 sensing, CraftBeerPi-compatible.

**Core principle:** The HAT is **low-voltage DC only**. It reads sensors and provides buffered logic-level drive signals to *external* SSRs and relays. Every SSR, relay, contactor, pilot light, and the element interlock lives in the panel — never on the board.

---

## Block Diagram

```
Raspberry Pi (40-pin header)
│
├─ SPI0 bus ──┬─ MAX31865 #1 ── PT100  → HLT
│             ├─ MAX31865 #2 ── PT100  → Mash
│             ├─ MAX31865 #3 ── PT100  → Boil
│             └─ MAX31865 #4 ── PT100  → Fermenter
│
├─ GPIO17 ─► ULN2803 ─► [ext DC-in SSR] ─► 240V HLT element
├─ GPIO27 ─► ULN2803 ─► [ext DC-in SSR] ─► 240V Boil element
│
├─ GPIO22 ─► ULN2803 ─► [ext relay] ─► 120V load A
├─ GPIO23 ─► ULN2803 ─► [ext relay] ─► 120V load B
├─ GPIO5  ─► ULN2803 ─► [ext relay] ─► 120V load C
│
└─ GPIO6  ◄── selector-sense (dry contact, LOW-V only, optional)

PANEL / AC SIDE (not on HAT):
  • Element interlock selector (HLT / OFF / Boil) — routes 240V hot to ONE SSR
  • Pilot lights wired load-side across each outlet
  • GFCI / spa-panel feed, breakers, fusing
```

---

## GPIO Pinout

| Function | BCM | Phys pin | Notes |
|---|---|---|---|
| SPI SCLK | GPIO11 | 23 | shared across all 4 MAX31865 |
| SPI MOSI | GPIO10 | 19 | shared |
| SPI MISO | GPIO9 | 21 | shared |
| CS – HLT | GPIO8 (CE0) | 24 | MAX31865 #1 |
| CS – Mash | GPIO7 (CE1) | 26 | MAX31865 #2 |
| CS – Boil | GPIO25 | 22 | #3, software CS |
| CS – Fermenter | GPIO24 | 18 | #4, software CS |
| SSR drive – HLT element | GPIO17 | 11 | → ULN2803 → ext SSR |
| SSR drive – Boil element | GPIO27 | 13 | → ULN2803 → ext SSR |
| Relay drive – 120V A | GPIO22 | 15 | → ULN2803 → ext relay |
| Relay drive – 120V B | GPIO23 | 16 | → ULN2803 → ext relay |
| Relay drive – 120V C | GPIO5 | 29 | → ULN2803 → ext relay |
| Selector sense (opt) | GPIO6 | 31 | dry contact only |
| Buzzer / spare (opt) | GPIO13 | 33 | optional |
| 3.3V | — | 1, 17 | MAX31865 Vdd |
| 5V | — | 2, 4 | ULN2803 / SSR & relay coil supply |
| GND | — | 6, 9, 14, 20, 25, 30, 34, 39 | common |

**Budget:** 12 GPIO used of ~26 usable. Plenty of headroom (LEDs, encoder, more channels). GPIO4 (the 1-Wire default) is left free if you ever want to add a DS18B20.

---

## Bill of Materials

**Board:**
- Raspberry Pi (3B+/4/Zero 2 W all fine)
- 4× MAX31865 RTD breakout — must have **430Ω** reference resistor (correct for PT100; 4300Ω = PT1000). Adafruit ships the 430Ω version.
- 1× ULN2803A Darlington array (buffer/driver, integral flyback diodes for relay coils)
- Perfboard or custom PCB + 40-pin **stacking** header
- Screw-terminal blocks (sensor leads + SSR/relay control out)
- Shielded cable for PT100 probe extensions

**In the panel (external, not on HAT):**
- 4× PT100 probes, 3-wire *(you have these)*
- 2× DC-input SSR, ≥25A, **on heatsinks** — a 23A element makes the SSR dissipate ~25W, so use a real heatsink (fan for tight enclosures)
- 3× relay or contactor rated for their 120V loads
- Element interlock selector switch (HLT / OFF / Boil)
- Pilot lights (one per outlet, load-side)
- GFCI/spa panel, breakers, fusing, ferrules

---

## Wiring & Safety Notes

- **All mains switching external to the HAT.** The board only carries logic-level DC.
- **Element interlock is hardware.** The selector physically routes the 240V hot leg to one element's SSR — software cannot double-fire. (Two 5500W elements = ~46A, would trip the panel anyway.)
- **Pilot lights load-side** so they show real power at the plug, independent of the Pi.
- **SSR drive:** feed external SSR input from +5V (or +12V) with the return sinking through the ULN2803. Tie that supply's ground to Pi GND.
- **If any 120V channel drives a compressor** (e.g., the glycol chiller): use a relay/contactor rated for **motor inrush**, add a **3–5 min minimum-off** in software, and never PWM it.
- **MAX31865 setup:** 3-wire mode, enable the 50/60 Hz notch filter, keep shielded probe leads away from the 240V and pump wiring. Common-ground the breakouts to the Pi.

---

## CraftBeerPi 4 Mapping

- **Sensors:** PT100 isn't CBPi's built-in path (that's 1-Wire), so read the MAX31865s via a plugin. *Verify the currently maintained plugin before committing.*
- **HERMS:** define HLT and Boil as time-proportional/PID kettles. The **mash** sensor drives the **HLT** SSR (indirect control via the coil).
- **Elements:** even with the hardware interlock, set logic so only one element heats at a time.
- **Fermenter:** a fermentation controller with a cooling actor (glycol) + heating actor (belt), min-off enforced on cooling.
