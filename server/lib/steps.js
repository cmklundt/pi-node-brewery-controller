/**
 * steps.js — the brew-day step engine, server-side.
 *
 * Ported from the App.jsx prototype so the behavior Christopher tuned on
 * mobile is preserved: a step only counts down once its vessel is at
 * temperature ("timer gate"), ramp steps auto-advance on arrival, boil
 * steps fire hop alarms at their scheduled minutes-remaining.
 *
 * Emits (via the callback bus): step-start, at-temp, hop, step-complete,
 * brew-complete, brew-started, brew-held.
 */
export class StepEngine {
  constructor(emit) {
    this.emit = emit;         // (type, payload) => void
    this.steps = [];
    this.active = 0;
    this.running = false;
    this.left = 0;            // seconds remaining in the active step
    this.atTemp = false;
    this.firedHops = new Set();
    this.session = null;      // { startedAt, recipeName } while a brew is live
  }

  loadRecipe(recipe) {
    this.steps = (recipe.steps || []).map((s) => ({ ...s }));
    this.recipeName = recipe.name || "Recipe";
    this.select(0);
  }

  select(i) {
    if (i < 0 || i >= this.steps.length) return;
    this.active = i;
    this.left = (this.steps[i].mins || 0) * 60;
    this.atTemp = false;
  }

  get step() { return this.steps[this.active]; }

  start() {
    if (!this.session) {
      this.session = { startedAt: new Date().toISOString(), recipeName: this.recipeName };
      this.firedHops.clear();
      this.emit("brew-started", { recipe: this.recipeName });
    }
    this.running = true;
    this.emit("step-start", { index: this.active, step: this.step });
  }

  hold() { this.running = false; this.emit("brew-held", { index: this.active }); }

  next() { this.#advance(true); }

  endSession() {
    const s = this.session;
    this.session = null;
    this.running = false;
    return s;
  }

  /** Called once per second with the sensed temp of the active step's vessel. */
  tick(sensedF) {
    const step = this.step;
    if (!step || !this.running || sensedF == null) return;

    const reached = sensedF >= step.target - 0.6;
    if (reached && !this.atTemp) this.emit("at-temp", { index: this.active, step, tempF: sensedF });
    this.atTemp = reached;
    if (!reached) return;

    if (step.kind === "ramp") return this.#advance();

    this.left = Math.max(0, this.left - 1);
    if (step.hops) {
      for (const h of step.hops) {
        const key = `${step.id}-${h.at}`;
        if (this.left <= h.at * 60 && !this.firedHops.has(key)) {
          this.firedHops.add(key);
          this.emit("hop", { name: h.name, at: h.at, step: step.name });
        }
      }
    }
    if (this.left <= 0) this.#advance();
  }

  #advance(manual = false) {
    const done = this.steps[this.active];
    if (!manual) this.emit("step-complete", { index: this.active, step: done });
    if (this.active + 1 >= this.steps.length) {
      this.running = false;
      this.emit("brew-complete", { recipe: this.recipeName });
      return;
    }
    this.select(this.active + 1);
    this.emit("step-start", { index: this.active, step: this.step });
  }

  snapshot() {
    return {
      recipeName: this.recipeName,
      steps: this.steps,
      active: this.active,
      running: this.running,
      left: this.left,
      atTemp: this.atTemp,
      firedHops: [...this.firedHops],
      session: this.session,
    };
  }
}
