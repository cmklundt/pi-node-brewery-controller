/**
 * alerts.js — event log, alert rules, named timers, buzzer patterns.
 *
 * Everything noteworthy flows through here: step engine events, temp
 * deviations, sensor faults, timer completions. Each event is kept in a
 * ring for the UI, broadcast over WebSocket, and (for alert-severity
 * events) pushed to phones.
 */
export class AlertCenter {
  constructor({ push, buzzer, config, broadcast }) {
    this.push = push;              // PushCenter
    this.buzzer = buzzer;          // async (pattern) => void
    this.config = config;
    this.broadcast = broadcast;    // (msg) => void  (WS fanout)
    this.events = [];              // ring, newest first
    this.timers = new Map();       // id -> {id, name, endsAt, totalSec}
    this._timerSeq = 0;
    this._deviationSince = {};     // controllerId -> ts when deviation began
    this._faultSince = {};         // sensorId -> ts
  }

  /** severity: info | ok | alert | fault */
  event(type, msg, severity = "info", data = {}) {
    const e = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(), type, msg, severity, data };
    this.events.unshift(e);
    this.events.length = Math.min(this.events.length, 200);
    this.broadcast({ kind: "event", event: e });

    if (severity === "alert" || severity === "fault") {
      this.push.send({ title: severityTitle(severity, type), body: msg, urgent: severity === "fault" })
        .catch(() => {});
      if (this.config.alerts.buzzer) this.buzzer(severity === "fault" ? "long" : "double").catch(() => {});
    }
    return e;
  }

  /** wire the step engine's emit() here */
  stepEvent(type, p) {
    switch (type) {
      case "brew-started": return this.event(type, `Brew started — ${p.recipe}`, "ok", p);
      case "step-start":   return this.event(type, `Step ${p.index + 1} — ${p.step.name}`, "info", p);
      case "at-temp":      return this.event(type, `${p.step.name}: at temperature (${p.tempF.toFixed(1)}°F)`, "alert", p);
      case "hop":          return this.event(type, `Hop addition — ${p.name}`, "alert", p);
      case "step-complete":return this.event(type, `Step complete — ${p.step.name}`, "alert", p);
      case "brew-complete":return this.event(type, `Brew complete — ${p.recipe}`, "alert", p);
      case "brew-held":    return this.event(type, "Brew held", "info", p);
    }
  }

  /** called every engine tick to watch for drift and dead probes */
  watch(now, controllers, readings) {
    const devF = this.config.alerts.tempDeviationF;
    for (const c of controllers) {
      if (!c.activeTarget || !c.enabled) { delete this._deviationSince[c.id]; continue; }
      const r = readings[c.sensor];
      if (!r || r.tempF == null) continue;
      const off = Math.abs(r.tempF - c.activeTarget) > devF;
      if (off) {
        this._deviationSince[c.id] ??= now;
        if (now - this._deviationSince[c.id] === 120) { // 2 min of drift, fire once
          this.event("temp-deviation",
            `${c.name}: ${r.tempF.toFixed(1)}°F is ${devF}°F+ off target ${c.activeTarget}°F`, "alert");
        }
      } else delete this._deviationSince[c.id];
    }
    for (const [id, r] of Object.entries(readings)) {
      if (r.fault) {
        this._faultSince[id] ??= now;
        if (now - this._faultSince[id] === this.config.alerts.sensorFaultAfterSec) {
          this.event("sensor-fault", `Sensor ${id}: RTD fault${r.faultBits ? ` (0x${r.faultBits.toString(16)})` : ""} — check probe wiring`, "fault");
        }
      } else delete this._faultSince[id];
    }
  }

  // ── named timers (requirement #6: phone-synced timers) ──
  addTimer(name, seconds) {
    const id = `t${++this._timerSeq}`;
    this.timers.set(id, { id, name, totalSec: seconds, endsAt: Date.now() + seconds * 1000 });
    this.event("timer-set", `Timer set — ${name} (${Math.round(seconds / 60)}m)`, "info");
    return id;
  }

  cancelTimer(id) { this.timers.delete(id); }

  tickTimers() {
    const now = Date.now();
    for (const [id, t] of this.timers) {
      if (now >= t.endsAt) {
        this.timers.delete(id);
        this.event("timer-done", `Timer done — ${t.name}`, "alert");
      }
    }
  }

  timerSnapshot() {
    const now = Date.now();
    return [...this.timers.values()].map((t) => ({
      id: t.id, name: t.name, totalSec: t.totalSec,
      leftSec: Math.max(0, Math.round((t.endsAt - now) / 1000)),
    }));
  }
}

function severityTitle(sev, type) {
  if (sev === "fault") return "⚠️ Brewery fault";
  if (type === "hop") return "🌿 Hop addition";
  if (type === "timer-done") return "⏱ Timer done";
  return "🍺 Brewery";
}
