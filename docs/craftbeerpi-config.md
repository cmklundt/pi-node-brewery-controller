# CraftBeerPi 4 Configuration — Brewery Shield

Software setup mapped to the shield's pinout. Verified against the current cbpi4-pt100x plugin (v0.2.1, Nov 2025).

---

## 1. Prerequisites

- **CraftBeerPi 4.6.0 or newer** (required by the PT100 plugin).
- **Enable SPI** via `raspi-config` → Interface Options → SPI → Enable. Nothing reads without this.
- **Pi 5 note:** `RPi.GPIO` does not work on Pi 5; cbpi uses `rpi-lgpio` instead. From cbpi 4.4.x onward you must remove `RPi.GPIO` from the system and venv — follow the current install instructions rather than an old guide.

---

## 2. Plugins to install

```bash
# PT100 sensors (required)
pipx runpip cbpi4 install cbpi4-pt100x

# or latest from GitHub:
pipx runpip cbpi4 install https://github.com/PiBrewing/cbpi4-pt100x/archive/main.zip

# Buzzer (optional — drives the onboard buzzer on notifications)
pipx runpip cbpi4 install cbpi4-buzzer
```

Verify with `cbpi plugins`. Restart cbpi after installing.

---

## 3. Sensors — Hardware page

Add four **PT100** sensors. Shared for all: **MISO 9 · MOSI 10 · CLK 11**. Set **reference resistor = 430** and **3-wire** on each.

| Sensor name | CS pin | Vessel |
|---|---|---|
| HLT | 8 | Hot liquor tank |
| Mash | 7 | Mash tun |
| Boil | 25 | Boil kettle |
| Fermenter | 24 | Conical |

> The CS pin is the only per-sensor difference — this is exactly how the plugin expects multiple probes.

Optional extras: a **OneWire** sensor on GPIO4 (bonus DS18B20 header), and flow sensors on GPIO12/13 if you add a flow plugin.

---

## 4. Actors — Hardware page

All are **GPIO Actor** type. The board's isolation and buffering are invisible to cbpi — it just toggles a pin.

| Actor name | GPIO | Drives | Notes |
|---|---|---|---|
| HLT Element | 17 | External SSR (240V) | Inverted = **off**. PID/time-proportioned. |
| Boil Element | 27 | External SSR (240V) | Inverted = **off**. PID/time-proportioned. |
| Glycol Pump | 22 | Relay A (120V) | On/off only. |
| Ferment Heat | 23 | Relay B (120V) | On/off only. |
| Spare C | 5 | Relay C | e.g. recirc pump if you automate it later. |
| Spare D | 6 | Relay D | |

**Inverted setting:** our drive chain (GPIO high → isolator → FET on → load on) is *non*-inverting, so leave **Inverted = off**. Simple eBay relay boards are usually active-low and need Inverted = on — that's not our board. If an output behaves backwards on first bring-up, this is the setting to check.

---

## 5. Kettles — HERMS logic

**This is the part that's specific to HERMS.** The mash tun has no element; mash temperature is controlled *indirectly* by regulating the HLT, which heats the HERMS coil.

| Kettle | Sensor | Actor | Logic |
|---|---|---|---|
| **Mash** | **Mash** | **HLT Element** | PID (the key mapping — mash sensor drives HLT) |
| **Boil** | Boil | Boil Element | PID / time-proportional |
| **HLT** (optional) | HLT | HLT Element | For strike-water heating before mash-in |

Only run one of Mash-control or HLT-control at a time — both target the same element.

**Element interlock:** even though the hardware selector makes double-firing physically impossible, don't configure both elements to heat simultaneously. If you wired the selector-sense input (GPIO16), you can add a sensor/step to surface which element is armed.

**HLT overshoot guard:** in HERMS the HLT can run hotter than mash target. Consider capping HLT setpoint (e.g. mash target + 8–10°F) to avoid denaturing enzymes at the coil. This is a recipe/step concern, not a hardware one.

---

## 6. Fermenter

Add a **Fermenter** with:

- **Sensor:** Fermenter (PT100, CS 24)
- **Cooling actor:** Glycol Pump (GPIO22)
- **Heating actor:** Ferment Heat (GPIO23)

**Deadband/hysteresis:** set a sensible deadband (e.g. ±0.5–1.0°F) so the pump isn't chattering on and off. The chiller self-regulates its own bath, so this output only moves glycol — no compressor protection needed, but a circulation pump still shouldn't cycle every few seconds.

Fermenter profiles handle lager ramps and diacetyl rests using both actors.

---

## 7. First bring-up order

1. SPI enabled, plugins installed, cbpi restarted.
2. Add the four sensors → confirm **all four read plausible room temperature** before any mains wiring.
3. Add actors → toggle each one with the panel **de-energized**; confirm the right relay/SSR clicks or LEDs light.
4. Check the **Inverted** setting if any output is backwards.
5. Build kettles + fermenter; verify the Mash kettle drives the **HLT** actor.
6. Only then energize 240V — GFCI feed, interlock verified, pilot lights confirming true state.

---

## 8. Dashboard

Define separate dashboards for brew day (HLT/Mash/Boil, step timer) and fermentation (fermenter temp, target, cooling/heating state). CBPi supports up to 10, plus a simplified mobile view.
