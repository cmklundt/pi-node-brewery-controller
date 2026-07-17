# Brewery Controller

Touch UI + Node.js control server + hardware design for a HERMS electric
brewery on a Raspberry Pi 5 with a custom shield.

**Rig:** HERMS · 2× 240 V elements on SSRs · 4× PT100 (MAX31865) ·
glycol-cooled conical · 120 V relay loads · hardware element interlock.

---

## Quick start (any machine — simulation)

```bash
npm install
npm run build
npm start          # control server + UI on http://localhost:8080
```

or for UI development with hot reload:

```bash
npm run dev        # server on :8080, vite dev UI on :5173 (proxied)
```

No hardware needed — the server runs a thermal model of the whole rig
behind the same driver interface the Pi uses. This *is* the simulator:
same control loop, same step engine, same alerts; only the chip drivers
are swapped out. A `SIM` badge shows in the header, and the Setup tab
gets a time-multiplier (1×/10×/60×) so a 60-minute mash takes a minute.

## On the Pi (real hardware)

One command from a fresh Raspberry Pi OS install:

```bash
bash install/install.sh && sudo reboot
```

Full walkthrough — flashing the card, kiosk boot, touchscreen, phone
alerts, HTTPS: **[docs/pi-setup.md](docs/pi-setup.md)**.

## What's here

```
server/
  index.js            entry — HTTP :8080, HTTPS :8443 (when certs exist)
  lib/engine.js       1 Hz control loop, interlock arbitration, SSR windowing
  lib/steps.js        brew step engine (timer gate, ramps, hop alarms)
  lib/pid.js          PID + hysteresis controllers
  lib/alerts.js       events, alert rules, named timers, buzzer
  lib/push.js         Web Push (VAPID) to phones
  lib/history.js      24 h ring + per-brew JSONL logs + CSV reports
  lib/config.js       extensible config store (data/config.json)
  lib/api.js          REST + WebSocket
  hardware/
    sim.js            thermal model driver
    real.js           Pi 5 driver — libgpiod GPIO + spi-device MAX31865
    max31865.js       register map + Callendar–Van Dusen (pure, testable)

src/                  React UI (panel + phone PWA)
  App.jsx             shell: Brew / Ferment / Reports / Setup
  Herms.jsx           live SVG rig diagram
  tabs/               the four tabs
  hardware.js         ← the pin contract; server seeds its config from this

public/               PWA: manifest, service worker, icons
install/install.sh    Pi provisioning (idempotent)
docs/                 setup guide + shield design docs + schematics
```

## Architecture

```
 ┌────────────┐ WebSocket ┌──────────────────────────────┐  libgpiod  ┌────────┐
 │ kiosk UI   │◄─────────►│  Node control server         │───────────►│ shield │
 │ laptop     │   REST    │  engine · steps · alerts     │ spi-device │ SSRs   │
 │ phone PWA  │◄──────────│  history · push · config     │───────────►│ MAX318 │
 └────────────┘  Web Push └──────────────────────────────┘            └────────┘
```

- **The server owns all control logic.** The UI is a live view + command
  surface; closing every browser changes nothing about the brew.
- **Config is data.** Sensors, outputs, vessels, controllers and the
  recipe live in `data/config.json`, editable from the Setup tab — add a
  kettle or a pump without touching code. First boot seeds it from
  `src/hardware.js`, the single source of truth for the shield pin map.
- **Sessions are logged** to append-only JSONL; the Reports tab charts
  any past brew and exports CSV.

## Things the software must not get wrong

1. **The mash controller drives the HLT element.** The mash tun has no
   element — HERMS heats it through the coil. Classic config bug.
2. **The interlock is hardware.** Software mirrors it and refuses to
   drive an unarmed element, but the selector switch is the safety.
3. **Inverted = off.** The drive chain is non-inverting.
4. **Deadband + minimum hold on the fermenter** so the glycol pump
   doesn't chatter.
5. **Pilot lights are ground truth.** Panel lights are wired load-side;
   on-screen state is a report, not proof.
