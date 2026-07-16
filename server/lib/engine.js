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
    for (const a of this.config.actors) this.manual[a.id] ??= "auto";
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
    if (step) {
      const vessel = this.config.vessels.find((v) => v.id === step.vessel);
      this.steps.tick(this.readings[vessel?.sensor]?.tempF ?? null);
    }

    // 4 — controllers -> duties
    const duties = {};
    const targets = {};
    const ctrlState = [];
    const brewCtrl = this.#activeBrewController();

    for (const c of this.config.controllers) {
      const enabled = c.type === "hysteresis" ? c.enabled !== false : brewCtrl?.id === c.id;
      const meta = { id: c.id, name: c.name, enabled, activeTarget: null, sensor: c.sensor };

      if (c.type === "pid" && enabled && this.steps.running) {
        const target = this.steps.step.target;
        const t = this.readings[c.sensor]?.tempF;
        meta.activeTarget = target;
        targets[c.sensor] = target;
        if (t != null) {
          let duty = this.pids[c.id].update(target, t, 1);
          // HERMS guard: never let the HLT run away past mash target + cap
          const cap = c.constraints?.hltOvershootCapF;
          if (cap != null) {
            const hlt = this.readings[c.constraints.capSensor]?.tempF;
            if (hlt != null && hlt >= target + cap) duty = 0;
          }
          duties[c.actor] = Math.max(duties[c.actor] || 0, duty);
        }
      }

      if (c.type === "power" && enabled && this.steps.running) {
        const t = this.readings[c.sensor]?.tempF;
        meta.activeTarget = this.steps.step.target;
        targets[c.sensor] = this.steps.step.target;
        // full power to the boil, throttle to the power setting once boiling
        if (t != null) duties[c.actor] = t < this.steps.step.target - 2 ? 100 : c.params.power;
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

    // 7 — bookkeeping
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
    if (!this.config.actors.some((a) => a.id === actorId)) throw new Error("unknown actor");
    this.manual[actorId] = mode;
    this.alerts.event("manual", `${actorId} → ${mode}`, "info");
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
      simSpeed: this.driver.speed,
    };
  }
}
