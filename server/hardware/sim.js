/**
 * sim.js — thermal simulation driver. Same interface as real.js:
 *   init(config) / readSensors() -> {id: °F} / setActor(id, on) /
 *   readInterlock() / close()
 *
 * The model is ported from the original App.jsx sim loop so behavior on
 * screen matches what Christopher already validated: elements heat their
 * vessels, the HERMS coil moves heat HLT->mash only while the recirc pump
 * runs, everything loses heat to ambient.
 */
const AMBIENT = 62;
const K = {
  hltGain: 0.055, boilGain: 0.05,
  hltLoss: 0.0013, boilLoss: 0.0016, mashLoss: 0.0006, fermLoss: 0.0004,
  coil: 0.0078, fermGlycol: 0.010, fermHeat: 0.006,
};

export class SimDriver {
  constructor() {
    this.temps = { hlt: 68, mash: 66, boil: 64, ferm: 70 };
    this.actorState = {};       // id -> boolean (post-modulation, this tick)
    this.interlock = "OFF";     // sim stand-in for the hardware selector
    this.speed = 1;             // sim time multiplier
    this.config = null;
    this._accum = 0;
  }

  get name() { return "sim"; }

  async init(config) {
    this.config = config;
    for (const a of config.actors) this.actorState[a.id] = false;
    return this;
  }

  /** advance the model by dt (real seconds * speed) and return temps */
  step(dt) {
    const on = (id) => this.actorState[id] ? 1 : 0;
    const t = this.temps;
    for (let i = 0; i < Math.max(1, Math.round(dt * this.speed)); i++) {
      const nx = { ...t };
      nx.hlt += on("hltElement") * K.hltGain - (t.hlt - AMBIENT) * K.hltLoss;
      nx.boil += on("boilElement") * K.boilGain - (t.boil - AMBIENT) * K.boilLoss;
      if (nx.boil > 212.4) nx.boil = 212.4; // rolling boil ceiling
      if (on("recircPump")) {
        const dT = t.hlt - t.mash;
        nx.mash += dT * K.coil;
        nx.hlt -= dT * K.coil * 0.55;
      }
      nx.mash -= (t.mash - AMBIENT) * K.mashLoss;
      nx.ferm += on("fermentHeat") * K.fermHeat - on("glycolPump") * K.fermGlycol
        - (t.ferm - AMBIENT) * K.fermLoss;
      Object.assign(t, nx);
    }
    return this.readSensors();
  }

  async readSensors() {
    const out = {};
    for (const s of this.config.sensors) {
      const key = s.simKey || s.id;
      const base = this.temps[key];
      out[s.id] = base === undefined
        ? { tempF: AMBIENT, fault: false }
        : { tempF: +(base + (Math.random() - 0.5) * 0.08).toFixed(2), fault: false };
    }
    return out;
  }

  async setActor(id, on) {
    // sim honors the interlock exactly like the hardware selector would
    if (id === "hltElement" && this.interlock !== "HLT") on = false;
    if (id === "boilElement" && this.interlock !== "BOIL") on = false;
    this.actorState[id] = !!on;
  }

  async readInterlock() { return this.interlock; }
  setInterlock(pos) { this.interlock = pos; }
  setSpeed(x) { this.speed = Math.max(1, Math.min(120, +x || 1)); }

  async setBuzzer() { /* no-op in sim */ }
  async close() { }
}
