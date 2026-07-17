/**
 * steps.js — the brew-day step engine, server-side.
 *
 * v2: a brew day is a phased checklist (modeled on the Brew Steps tab of
 * the brew spreadsheet) mixing:
 *   - manual steps: the operator does something and confirms; an optional
 *     countdown runs once the step starts (no temp gate). A manual step
 *     may still carry vessel+target — the engine HOLDS that temperature
 *     while the operator works (e.g. holding mash temp while doughing in).
 *   - controlled steps (ramp/rest/boil): temp-gated as before — a rest's
 *     timer only counts while the vessel is at temperature; ramps complete
 *     on arrival; boil steps fire hop alarms at minutes-remaining.
 *
 * Per-step autoAdvance: true → flow straight into the next step;
 * false → hold in "awaiting confirm" with an alert until the operator
 * taps Continue. Pause freezes the timer; Restart resets the step.
 *
 * Emits: brew-started, step-start, at-temp, hop, step-complete,
 * step-awaiting, brew-complete, brew-held, brew-resumed, step-restarted.
 */
export class StepEngine {
  constructor(emit) {
    this.emit = emit;
    this.steps = [];
    this.active = 0;
    this.running = false;
    this.awaiting = false;     // step done, autoAdvance=false, waiting on operator
    this.left = 0;
    this.atTemp = false;
    this.firedHops = new Set();
    this.session = null;
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
    this.awaiting = false;
  }

  get step() { return this.steps[this.active]; }

  start() {
    if (!this.session) {
      this.session = { startedAt: new Date().toISOString(), recipeName: this.recipeName };
      this.firedHops.clear();
      this.emit("brew-started", { recipe: this.recipeName });
    }
    if (this.awaiting) return this.next();          // "continue" after a confirm-hold
    const resuming = !this.running && this.left > 0 && this.left < (this.step?.mins || 0) * 60;
    this.running = true;
    this.emit(resuming ? "brew-resumed" : "step-start", { index: this.active, step: this.step });
  }

  pause() {
    this.running = false;
    this.emit("brew-held", { index: this.active, step: this.step });
  }

  /** reset the active step: full timer, temp gate re-armed, its hop alarms cleared */
  restart() {
    const s = this.step;
    if (!s) return;
    this.left = (s.mins || 0) * 60;
    this.atTemp = false;
    this.awaiting = false;
    for (const k of [...this.firedHops]) if (k.startsWith(`${s.id}-`)) this.firedHops.delete(k);
    this.emit("step-restarted", { index: this.active, step: s });
  }

  /** operator confirm: completes a manual step / clears an awaiting hold / skips */
  next() {
    if (this.awaiting) {
      this.awaiting = false;
      this.#goto(this.active + 1);
      return;
    }
    this.emit("step-complete", { index: this.active, step: this.step, manual: true });
    this.#goto(this.active + 1);
  }

  setAutoAdvance(index, auto) {
    const s = this.steps[index];
    if (s) s.autoAdvance = !!auto;
  }

  endSession() {
    const s = this.session;
    this.session = null;
    this.running = false;
    this.awaiting = false;
    return s;
  }

  /** once per engine second. sensedF = temp of the step's vessel (or null);
   *  dt = simulated seconds per real second. */
  tick(sensedF, dt = 1) {
    const step = this.step;
    if (!step || !this.running || this.awaiting) return;

    const controlled = step.kind !== "manual";
    if (controlled) {
      if (sensedF == null) return;
      const reached = sensedF >= step.target - 0.6;
      if (reached && !this.atTemp) this.emit("at-temp", { index: this.active, step, tempF: sensedF });
      this.atTemp = reached;
      if (!reached) return;
      if (step.kind === "ramp") return this.#complete();
    }
    // manual with no timer: nothing counts down — waits for operator Done
    if (!step.mins) { if (controlled) this.#complete(); return; }

    this.left = Math.max(0, this.left - dt);
    if (step.hops) {
      for (const h of step.hops) {
        const key = `${step.id}-${h.at}`;
        if (this.left <= h.at * 60 && !this.firedHops.has(key)) {
          this.firedHops.add(key);
          this.emit("hop", { name: h.name, at: h.at, step: step.name });
        }
      }
    }
    if (this.left <= 0) this.#complete();
  }

  #complete() {
    this.emit("step-complete", { index: this.active, step: this.step });
    if (this.step.autoAdvance === false) {
      this.awaiting = true;
      this.running = false;
      this.emit("step-awaiting", { index: this.active, step: this.step });
      return;
    }
    this.#goto(this.active + 1);
  }

  #goto(n) {
    if (n >= this.steps.length) {
      this.running = false;
      this.emit("brew-complete", { recipe: this.recipeName });
      return;
    }
    this.select(n);
    this.running = true;
    this.emit("step-start", { index: this.active, step: this.step });
  }

  snapshot() {
    return {
      recipeName: this.recipeName,
      steps: this.steps,
      active: this.active,
      running: this.running,
      awaiting: this.awaiting,
      left: this.left,
      atTemp: this.atTemp,
      firedHops: [...this.firedHops],
      session: this.session,
    };
  }
}
