# Sensing manually-switched 120 V outlets

The panel has 120 V outlets switched by hand. The software models them as
`control: "manual"` actors — a soft switch in the UI mirrors the real one,
and the flow/chill animations follow it. That's *trust*. This doc is about
*truth*: letting the Pi detect that an outlet is actually hot.

## Software contract (already implemented)

Give any manual actor a `senseGpio` in the config:

```json
{ "id": "wortPump", "name": "Wort pump", "control": "manual",
  "kind": "outlet", "volts": 120, "role": "pump", "senseGpio": 12 }
```

When the input is wired, the engine reads it every second, the UI shows the
sensed state, and if it disagrees with the soft switch for 5 s the panel
logs it and syncs the soft switch to reality. Not wired → soft switch only.
You can add sensing outlet-by-outlet; no software changes needed.

## Hardware options

### 1. Pilot relay in parallel — easiest, no shield change

Wire a small 120 V-coil relay (any cube/ice-cube relay, ~$4) across the
switched side of the outlet. Outlet hot → coil pulls in → dry contacts
close a low-voltage loop: shield GPIO input ↔ contact ↔ GND, with the
input's pull-up enabled (closed = low; set the sense polarity in config if
needed). One relay per outlet. All mains stays in the panel; only a
low-voltage pair runs to the shield.

### 2. AC-input opto channel — cleanest, shield rev 2

The shield already carries exactly this circuit once: the selector-sense
channel (GPIO 16, opto-isolated, 330 Ω series per the HAT+ boot rule). A
rev-2 board adds 2–4 copies using an AC-input optocoupler (H11AA1-style,
back-to-back LEDs) behind a dropper so 120 V across the input lights the
opto directly. Same isolation philosophy as the rest of the board: mains
never touches the HAT.

### 3. Flow sensor — best signal for pumps

GPIO 12/13 are already reserved as hall-effect flow-pulse inputs. An
inline flow sensor (½" food-safe hall sensor in the pump loop) proves
liquid is *moving* — which also catches a dry pump, a closed valve, or a
popped breaker, none of which outlet sensing sees. For pumps, prefer this;
for the glycol chiller or heat wraps, use option 1 or 2.

Pulse counting isn't in the engine yet — the current sense path treats a
steady high/low as on/off, which works with a pilot relay on 12/13 today.
When a real flow sensor lands, the driver grows a pulse counter and the
config gains `senseType: "flow"` with a pulses-per-liter constant (that
also unlocks volume-transferred tracking for the level display).

## Priority when both exist

Sensed state always beats the soft switch in the UI and in the engine's
view of the rig. The soft switch remains useful as *intent* — "I'm about
to start recirculating" — and the mismatch alert is the panel telling you
the rig disagrees.
