# Brewery Controller

Touch UI + hardware design for a HERMS electric brewery on a Raspberry Pi with a custom shield.

**Rig:** HERMS · 2× 240 V elements on SSRs · 4× PT100 (MAX31865) · glycol-cooled conical · 3× 120 V relay loads · hardware element interlock.

---

## Run the UI

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. The dev server binds to `0.0.0.0`, so you can also hit it from a tablet on the same network at `http://<your-ip>:5173` — worth doing early, since this is a touch interface and it feels different on glass.

```bash
npm run build     # production build → dist/
npm run preview   # serve the build
```

---

## What's here

```
src/
  App.jsx          ← the touch panel (current)
  PanelV1.jsx      ← first version, kept for reference
  hardware.js      ← pin map: single source of truth
  main.jsx

docs/
  brewery-shield-spec.md         full board spec
  board-elements-explained.md    every part, why it's there, vs competitors
  build-order.md                 43-line ordered parts list for EasyEDA
  shield-bom-jlcpcb.md           BOM + sourcing status
  easyeda-walkthrough.md         click-level build + order guide
  easyeda-parts-cheatsheet.md    exact search strings
  easyeda-build-guide.md         capture guide + HAT+ mechanical rules
  craftbeerpi-config.md          CBPi 4 sensor/actor/kettle mapping
  schematics/                    4 sheets (SVG)
  archive/                       superseded carrier-HAT design
```

---

## UI architecture

Everything is currently **simulated** — there's no hardware behind it. The sim lives in the `useEffect` loop in `App.jsx` and models:

- HLT and boil elements heating their vessels (time-proportioned duty)
- HERMS coil transferring HLT → mash **only while the recirc pump runs**
- Fermenter with deadband hysteresis on glycol/heat
- The interlock physically gating which element can fire

Three tabs: **Brew** (step engine, timers, hop alarms), **Ferment**, **Setup**.

**`hardware.js` is the contract.** The pin map, kettle mapping, and safety constraints live there so the UI and any future backend agree. Change a GPIO once, in one place.

### Wiring it to real hardware later

The sim loop is deliberately the only thing that touches temperatures. To go live, replace it with either:

- **CraftBeerPi's REST/websocket API** (see `docs/craftbeerpi-config.md`) — CBPi already handles sensors, actors, PID and steps; this UI becomes a front-end
- **Your own Python/FastAPI service** reading the MAX31865s and driving GPIO

The first is far less work and keeps you on the maintained `cbpi4-pt100x` plugin path.

---

## Things the UI must not get wrong

1. **The mash kettle drives the HLT actor.** The mash tun has no element. This is the HERMS trick and the classic config bug.
2. **The interlock is hardware.** The UI reflects it; it can never override it. Two 5500 W elements = ~46 A.
3. **Inverted = off.** The drive chain is non-inverting.
4. **Deadband on the fermenter.** Too tight and the glycol pump chatters.
5. **Pilot lights are ground truth.** Panel lights are wired load-side and show real power at the plug; on-screen state is a report, not proof.

---

## Status

- ✅ Board spec, schematics, BOM, CBPi mapping
- ✅ Touch UI (simulated)
- 🔧 **In progress:** schematic capture in EasyEDA (Group A — sensing)
- ⬜ PCB layout, DRC, 3D fit check
- ⬜ Order (qty 5, ~$41–46/board + QFN fixture fee)
- ⬜ Bring-up, then wire the UI to real data

**Open unknowns:** the QFN assembly fixture fee, and several LCSC part numbers that resolve in EasyEDA's parts panel as you place.

---

## Safety

All mains switching — SSRs, relays, contactors, the element interlock, pilot lights, GFCI feed — lives in the panel, never on the HAT. The board carries logic-level DC only. A 5500 W element at 240 V draws ~23 A.

Bring the boards up in stages (rail voltage with no Pi → jumper check → sensors reading room temp → outputs clicking with the panel dead → *then* 240 V). That staged bring-up is doing the job a breadboard would have.
