/**
 * pid.js — PID controller with anti-windup and derivative-on-measurement.
 * Output is 0–100 (% duty). Tuned defaults suit slow thermal loads
 * (5500 W element in 10–20 gal of water).
 */
export class PID {
  constructor({ kp = 14, ki = 0.02, kd = 0, maxOutput = 100, integralClamp = 40 } = {}) {
    this.kp = kp; this.ki = ki; this.kd = kd;
    this.maxOutput = maxOutput;
    this.integralClamp = integralClamp;
    this.integral = 0;
    this.lastMeasure = null;
  }

  reset() { this.integral = 0; this.lastMeasure = null; }

  setParams(p = {}) {
    for (const k of ["kp", "ki", "kd", "maxOutput", "integralClamp"]) {
      if (p[k] !== undefined && Number.isFinite(+p[k])) this[k] = +p[k];
    }
  }

  /** @param target °F  @param measure °F  @param dt seconds
   *  @param ff feedforward duty (learned steady-state baseline) — the PID
   *  then only trims the residual, so it settles in seconds, not minutes.
   *  @returns duty 0..100 */
  update(target, measure, dt = 1, ff = 0) {
    const err = target - measure;
    this.integral = clamp(this.integral + err * this.ki * dt, -this.integralClamp, this.integralClamp);
    let d = 0;
    if (this.kd && this.lastMeasure !== null) d = -this.kd * (measure - this.lastMeasure) / dt;
    this.lastMeasure = measure;
    const out = ff + this.kp * err + this.integral + d;
    return clamp(out, 0, this.maxOutput);
  }
}

/**
 * Hysteresis (deadband) controller for the fermenter: cooling and/or
 * heating around a target. Returns "cooling" | "heating" | "idle".
 * Includes a minimum state hold so motor loads don't chatter.
 */
export class Hysteresis {
  constructor({ deadband = 0.8, minHoldSec = 60 } = {}) {
    this.deadband = deadband;
    this.minHoldSec = minHoldSec;
    this.state = "idle";
    this.lastChange = 0;
  }

  setParams(p = {}) {
    if (Number.isFinite(+p.deadband)) this.deadband = +p.deadband;
    if (Number.isFinite(+p.minHoldSec)) this.minHoldSec = +p.minHoldSec;
  }

  update(target, measure, nowSec) {
    let next = this.state;
    if (measure > target + this.deadband) next = "cooling";
    else if (measure < target - this.deadband) next = "heating";
    else if (this.state === "cooling" && measure <= target) next = "idle";
    else if (this.state === "heating" && measure >= target) next = "idle";

    if (next !== this.state) {
      if (nowSec - this.lastChange < this.minHoldSec && this.state !== "idle" && next !== "idle") {
        return this.state; // don't flip cool<->heat inside the hold window
      }
      this.state = next;
      this.lastChange = nowSec;
    }
    return this.state;
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
