/**
 * engine.js — the 1 Hz control loop.
 *
 * Every tick: read sensors → run the step engine → run controllers →
 * arbitrate the two 240 V elements against the interlock → hand duties to
 * the modulator (4 s time-proportioned window for SSRs, plain on/off for
 * relays) → sample history → watch for alerts → broadcast state.
 *
 * Rules it must never break (from README / hardware.js):
 *  1. Mash steps drive the HLT element (HERMS), capped so the HLT never
 *     exceeds mash target + hltOvershootCapF.
 *  2. The interlock is hardware. Software mirrors it and refuses to drive
 *     an element the selector hasn't armed — but the real safety is the
 *     selector switch, not this file.
 *  3. Drive chain is non-inverting. INVERTED stays false.
 *  4. Fermenter hysteresis has a deadband + minimum hold so the glycol
 *     pump doesn't chatter.
 */
import { EventEmitter } from "node:events";
import { PID, Hysteresis, clamp } from "./pid.js";
import { StepEngine } from "./steps.js";
import { boilingPointF } from "../../src/hardware.js";

const MOD_WINDOW_MS = 4000;   // SSR time-proportioning window
const MOD_TICK_MS = 250;

export class Engine extends EventEmitter {
  constructor({ config, driver, alerts, history }) {
    super();
    this.config = config;
    this.driver = driver;
    this.alerts = alerts;
    this.history = history;

    this.readings = {};          // sensorId -> {tempF, fault}
    this.duties = {};            // actorId -> 0..100 (what control wants)
    this.actorOn = {};           // actorId -> bool  (what's actually driven this instant)
    this.manual = {};            // actorId -> "auto" | "on" | "off"
    this.interlock = "OFF";      // mirrored selector position
    this.fermState = "idle";
    this.uptimeSec = 0;
    this.paused = false;         // sim convenience only

    this.steps = new StepEngine((type, p) => this.#onStepEvent(type, p));
    this.steps.loadRecipe(config.recipe);

    this.#buildControllers();
  }

  #buildControllers() {
    this.pids = {};
    this.hys = {};
    for (const c of this.config.controllers) {
      if (c.type === "pid") this.pids[c.id] = new PID(c.params);
      if (c.type === "hysteresis") this.hys[c.id] = new Hysteresis(c.params);
    }
    // manual-outlet actors default to their declared soft-switch state (off);
    // GPIO actors default to controller-driven "auto"
    for (const a of this.config.actors)
      this.manual[a.id] ??= a.control === "manual" ? "off" : "auto";
    // vessel fill levels (gal) — no level sensors, operator sets them
    this.levels ??= {};
    for (const v of this.config.vessels) this.levels[v.id] ??= v.levelGal ?? 0;
  }

  /** hot-reload after a config edit from the Setup tab */
  applyConfig(config) {
    this.config = config;
    this.#buildControllers();
    if (!this.steps.session) this.steps.loadRecipe(config.recipe);
    this.emit("config", config);
  }

  start() {
    this._tick = setInterval(() => this.tick().catch((e) => this.#err(e)), 1000);
    this._mod = setInterval(() => this.#modulate().catch((e) => this.#err(e)), MOD_TICK_MS);
  }

  async stop() {
    clearInterval(this._tick); clearInterval(this._mod);
    for (const a of this.config.actors) await this.driver.setActor(a.id, false);
    await this.driver.close();
  }

  #err(e) { this.alerts.event("engine-error", e.message, "fault"); }

  async tick() {
    this.uptimeSec++;
    if (this.paused) return;

    // 1 — sensors (sim advances its model here too)
    this.readings = this.driver.name === "sim"
      ? this.driver.step(1)
      : await this.driver.readSensors();
    if (this.readings instanceof Promise) this.readings = await this.readings;

    // 2 — interlock: hardware sense wins when wired, else the software mirror
    const sensed = await this.driver.readInterlock();
    if (sensed !== null && this.config.interlock.mode === "gpio") {
      if (sensed === "OFF") this.interlock = "OFF";
      // an "armed" sense with a software-declared position keeps the declared side
    }

    // 3 — step engine gets the temp of its step's vessel
    const step = this.steps.step;
    // altitude: no target can exceed the local boiling point
    const bp = boilingPointF(this.config.altitudeFt);
    const effTarget = (t) => (t != null && t > bp ? bp : t);
    if (step) {
      const vessel = this.config.vessels.find((v) => v.id === step.vessel);
      const dt = this.driver.name === "sim" ? (this.driver.speed || 1) : 1;
      const ovr = step.target != null && step.target > bp ? bp : null;
      this.steps.tick(this.readings[vessel?.sensor]?.tempF ?? null, dt, ovr);
    }

    // 4 — controllers -> duties
    const duties = {};
    const targets = {};
    const ctrlState = [];
    const brewCtrl = this.#activeBrewController();

    for (const c of this.config.controllers) {
      const enabled = c.type === "hysteresis" ? c.enabled !== false : brewCtrl?.id === c.id;
      const meta = { id: c.id, name: c.name, enabled, activeTarget: null, sensor: c.sensor };

      const brewActive = this.steps.running || this.steps.awaiting; // hold temps during confirm-holds
      if (c.type === "pid" && enabled && brewActive && this.steps.step?.target != null) {
        const target = effTarget(this.steps.step.target);
        const t = this.readings[c.sensor]?.tempF;
        meta.activeTarget = target;
        targets[c.sensor] = target;
        if (t != null) {
          // learned feedforward: duty that historically holds this temp
          const amb = this.config.ambientF ?? 62;
          const ff = (c.params.lossCoeff || 0) * Math.max(0, target - amb);
          let duty = this.pids[c.id].update(target, t, 1, ff);
          // HERMS guard: never let the HLT run away past mash target + cap
          const cap = c.constraints?.hltOvershootCapF;
          if (cap != null) {
            const hlt = this.readings[c.constraints.capSensor]?.tempF;
            if (hlt != null && hlt >= target + cap) duty = 0;
          }
          duties[c.actor] = Math.max(duties[c.actor] || 0, duty);
          // learn: after holding within ±0.75°F for 30 consecutive ticks
          // (a true settle, not the approach transient), the applied duty IS
          // the loss curve — remember duty-per-°F-above-ambient (EMA)
          this._settle ??= {};
          this._settle[c.id] = Math.abs(target - t) < 0.75 ? (this._settle[c.id] || 0) + 1 : 0;
          if (this._settle[c.id] > 30 && duty > 1 && duty < 98 && t > amb + 5) {
            const k = duty / (t - amb);
            const prev = c.params.lossCoeff;
            c.params.lossCoeff = +((prev ? 0.98 * prev + 0.02 * k : k)).toFixed(4);
            this._learnedDirty = true;
          }
        }
      }

      if (c.type === "power" && enabled && (this.steps.running || this.steps.awaiting) && this.steps.step?.target != null) {
        const t = this.readings[c.sensor]?.tempF;
        const target = effTarget(this.steps.step.target); // local boiling point at altitude
        meta.activeTarget = target;
        targets[c.sensor] = target;
        // full power to the boil, throttle to the power setting once boiling
        if (t != null) duties[c.actor] = t < target - 2 ? 100 : c.params.power;
      }

      if (c.type === "hysteresis" && enabled) {
        const t = this.readings[c.sensor]?.tempF;
        meta.activeTarget = c.params.target;
        targets[c.sensor] = c.params.target;
        if (t != null) {
          this.fermState = this.hys[c.id].update(c.params.target, t, this.uptimeSec);
          duties[c.coolActor] = this.fermState === "cooling" ? 100 : 0;
          duties[c.heatActor] = this.fermState === "heating" ? 100 : 0;
        }
      }
      ctrlState.push(meta);
    }
    this._ctrlState = ctrlState;

    // 5 — manual overrides + interlock gate
    for (const a of this.config.actors) {
      let d = duties[a.id] || 0;
      if (this.manual[a.id] === "on") d = 100;
      if (this.manual[a.id] === "off") d = 0;
      if (a.id === "hltElement" && this.interlock !== "HLT") d = 0;
      if (a.id === "boilElement" && this.interlock !== "BOIL") d = 0;
      this.duties[a.id] = Math.round(clamp(d, 0, 100));
    }

    // 6 — non-modulated actors switch here (motors/contactors: 1 Hz max)
    for (const a of this.config.actors.filter((x) => !x.modulated)) {
      const on = this.duties[a.id] > 0;
      if (this.actorOn[a.id] !== on) {
        this.actorOn[a.id] = on;
        await this.driver.setActor(a.id, on);
      }
    }

    // 6b — sense inputs: read every declared pin; hardware truth wins
    // over soft switches for linked actors (see docs/outlet-sensing.md)
    this.inputStates = {};
    const senses = [
      // generic inputs (any pin), optionally linked to an actor
      ...(this.config.inputs || []).map((i) => ({ key: i.id, gpio: i.gpio, invert: i.invert, actorId: i.linkedActor })),
      // shorthand: senseGpio directly on a manual actor
      ...this.config.actors.filter((a) => a.senseGpio != null)
        .map((a) => ({ key: `${a.id}.sense`, gpio: a.senseGpio, invert: a.senseInvert, actorId: a.id })),
    ];
    for (const s of senses) {
      let v = await this.driver.readGpio?.(s.gpio);
      if (v == null) continue;
      if (s.invert) v = !v;
      this.inputStates[s.key] = v;
      const a = s.actorId && this.config.actors.find((x) => x.id === s.actorId);
      if (!a || a.control !== "manual") continue;
      this.actorOn[a.id] = v;
      const declared = this.manual[a.id] === "on";
      if (v !== declared) {
        this._senseMismatch ??= {};
        this._senseMismatch[a.id] ??= this.uptimeSec;
        if (this.uptimeSec - this._senseMismatch[a.id] === 5) {
          this.alerts.event("sense-mismatch",
            `${a.name}: switch is ${v ? "ON" : "OFF"} but panel says ${declared ? "on" : "off"} — syncing`, "info");
          this.manual[a.id] = v ? "on" : "off";
          delete this._senseMismatch[a.id];
        }
      } else if (this._senseMismatch) delete this._senseMismatch[a.id];
    }

    // 7 — bookkeeping
    if (this._learnedDirty && this.uptimeSec % 120 === 0) {
      this._learnedDirty = false;
      this.emit("learned"); // index.js persists the learned coefficients
    }
    this.history.sample(this.uptimeSec, this.readings, { ...this.duties }, targets);
    this.alerts.watch(this.uptimeSec, ctrlState, this.readings);
    this.alerts.tickTimers();
    this.emit("state", this.snapshot());
  }

  /** SSR time-proportioning: 250 ms slots over a 4 s window */
  async #modulate() {
    if (this.paused) return;
    const phase = (Date.now() % MOD_WINDOW_MS) / MOD_WINDOW_MS; // 0..1
    for (const a of this.config.actors.filter((x) => x.modulated)) {
      const on = phase < (this.duties[a.id] || 0) / 100;
      if (this.actorOn[a.id] !== on) {
        this.actorOn[a.id] = on;
        await this.driver.setActor(a.id, on);
      }
    }
  }

  /** which brew-side controller owns its element right now */
  #activeBrewController() {
    const step = this.steps.step;
    if (!step) return null;
    return this.config.controllers.find((c) => c.vessel === step.vessel && c.type !== "hysteresis") || null;
  }

  #onStepEvent(type, p) {
    this.alerts.stepEvent(type, p);
    if (type === "brew-started") this.history.startSession(this.steps.session);
    if (type === "brew-complete") this.history.endSession({ recipe: p.recipe });
    if (type === "step-start") Object.values(this.pids).forEach((pid) => pid.reset());
    this.history.logEvent({ type, ts: new Date().toISOString(), ...("step" in (p || {}) ? { step: p.step?.name } : p) });
  }

  // ── commands from the API ──
  setInterlock(pos) {
    if (!this.config.interlock.positions.includes(pos)) throw new Error("bad position");
    this.interlock = pos;
    if (this.driver.setInterlock) this.driver.setInterlock(pos); // sim mirrors it
    this.alerts.event("interlock", `Interlock → ${pos}`, "info");
  }

  setManual(actorId, mode) {
    if (!["auto", "on", "off"].includes(mode)) throw new Error("bad mode");
    const a = this.config.actors.find((x) => x.id === actorId);
    if (!a) throw new Error("unknown actor");
    if (a.control === "manual" && mode === "auto") mode = "off"; // no controller drives an outlet
    this.manual[actorId] = mode;
    this.alerts.event("manual", `${a.name} → ${mode}`, "info");
  }

  setLevel(vesselId, gal) {
    const v = this.config.vessels.find((x) => x.id === vesselId);
    if (!v) throw new Error("unknown vessel");
    this.levels[vesselId] = Math.max(0, Math.min(v.volumeGal ?? 999, +gal || 0));
    v.levelGal = this.levels[vesselId]; // persisted with the config document
    return this.levels[vesselId];
  }

  setControllerParams(id, params) {
    const c = this.config.controllers.find((x) => x.id === id);
    if (!c) throw new Error("unknown controller");
    c.params = { ...c.params, ...params };
    if (params.enabled !== undefined) c.enabled = !!params.enabled;
    this.pids[id]?.setParams(c.params);
    this.hys[id]?.setParams(c.params);
    return c;
  }

  snapshot() {
    return {
      ts: Date.now(),
      driver: this.driver.name,
      uptimeSec: this.uptimeSec,
      temps: this.readings,
      duties: this.duties,
      actorOn: this.actorOn,
      manual: this.manual,
      interlock: this.interlock,
      fermState: this.fermState,
      controllers: this._ctrlState || [],
      steps: this.steps.snapshot(),
      timers: this.alerts.timerSnapshot(),
      levels: this.levels,
      inputs: this.inputStates || {},
      boilingPointF: boilingPointF(this.config.altitudeFt),
      simSpeed: this.driver.speed,
      paused: this.paused,
    };
  }
}
