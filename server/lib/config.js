/**
 * config.js — persistent, extensible system configuration.
 *
 * The runtime config lives at data/config.json and is fully editable from
 * the Setup tab (add/remove sensors, actors, vessels, controllers as the
 * rig grows — requirement #5). First boot seeds it from src/hardware.js,
 * which stays the single source of truth for the shield's pin map.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as HW from "../../src/hardware.js";
import { creamsicleIPA, normalizeRecipe, SEED_REV } from "./recipes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.BREWERY_DATA || path.join(__dirname, "../../data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export function defaultConfig() {
  return {
    version: 1,
    name: "HERMS Control",
    units: "F",
    altitudeFt: 6900,   // brewery elevation — sets the local boiling point (~198.9°F here)
    ambientF: 62,       // brewery room temp — baseline for the learned duty-cycle feedforward
    rtd: { ...HW.RTD },
    inverted: HW.INVERTED,
    aux: { buzzer: HW.AUX.buzzer, oneWire: HW.AUX.oneWire, flow: HW.AUX.flow },

    sensors: HW.SENSORS.map((s) => ({
      id: s.id, name: s.name, type: "max31865", cs: s.cs,
      vessel: s.vessel, calibrationOffset: 0, simKey: s.id,
    })),

    actors: [
      ...HW.ACTORS.map((a) => ({ ...a, control: "gpio" })),
      /* Manually-switched 120 V outlets: no GPIO — the operator flips a
       * real switch and mirrors it with a soft switch in the UI. Flow and
       * chill animations follow the declared state. The shield's flow
       * inputs (GPIO 12/13) can later confirm a pump is actually moving
       * liquid; see docs. */
      /* Two physical pumps (like the rig): which PATH each one feeds is a
       * hose/port choice, modeled as flow routing below. */
      { id: "waterPump", name: "Water pump", control: "manual", gpio: null,
        kind: "outlet", volts: 120, role: "pump" },
      { id: "wortPump", name: "Wort pump", control: "manual", gpio: null,
        kind: "outlet", volts: 120, role: "pump" },
    ],

    vessels: [
      // Blichmann kettles — volumeGal sizes the drawing, levelGal is the
      // current fill (tap the sight glass on the panel to set it).
      { id: "hlt",  name: "HLT",       kind: "kettle",  sensor: "hlt",  element: "hltElement",  graphic: "kettle-coil", volumeGal: 15, levelGal: 12 },
      { id: "mash", name: "Mash tun",  kind: "mashtun", sensor: "mash", element: null,          graphic: "mashtun",     volumeGal: 15, levelGal: 0 },
      { id: "boil", name: "Boil",      kind: "kettle",  sensor: "boil", element: "boilElement", graphic: "kettle",      volumeGal: 20, levelGal: 0 },
      { id: "ferm", name: "Fermenter", kind: "conical", sensor: "ferm", element: null,          graphic: "conical",     volumeGal: 14, levelGal: 10 },
    ],

    /* Sense inputs: ANY free GPIO can be wired as a monitored input —
     * pilot-relay contacts across a manually-switched 120 V outlet, a
     * door switch, a float, a flow-pulse line read as level. Each shows
     * as a live indicator in Setup; linkedActor ties one to an actor so
     * the rig diagram follows hardware truth instead of the soft switch
     * (see docs/outlet-sensing.md). Add entries in the Setup tab. */
    inputs: [
      // example (uncommissioned until you set a real gpio):
      // { id: "recircSense", name: "Recirc outlet sense", gpio: 12,
      //   linkedActor: "recircPump", invert: false }
    ],

    /* Flow paths: which pump moves liquid where. Drawn as piping on the
     * rig diagram; the path animates while its pump runs (GPIO or manual
     * soft-switch). via:"coil" routes through the HERMS coil vessel. */
    /* One pump, several possible hose positions — each flow is one
     * position. routes[] says where each pump's hose is RIGHT NOW (tap a
     * path on the diagram to move it). Open transfers (from ≠ to, no via)
     * move volume + heat in the sim at rateGpm minus lossF in the hose. */
    flows: [
      { id: "hlt-loop", name: "HLT circulation", pump: "waterPump", from: "hlt", to: "hlt", via: null, kind: "water" },
      { id: "strike",   name: "HLT → Mash (strike/sparge)", pump: "waterPump", from: "hlt", to: "mash", via: null, kind: "water", rateGpm: 1.5, lossF: 1.5 },
      { id: "recirc",   name: "Mash recirc (HERMS)", pump: "wortPump", from: "mash", to: "mash", via: "hlt", kind: "wort" },
      { id: "sparge",   name: "Sparge runoff → Boil", pump: "wortPump", from: "mash", to: "boil", via: null, kind: "wort", rateGpm: 0.8, lossF: 2 },
      { id: "transfer", name: "Boil → Fermenter", pump: "wortPump", from: "boil", to: "ferm", via: null, kind: "wort", rateGpm: 1.5, lossF: 3 },
    ],
    routes: { waterPump: "hlt-loop", wortPump: "recirc" },

    controllers: [
      { id: "mash", name: "Mash (HERMS)", type: "pid", sensor: "mash", actor: "hltElement",
        vessel: "mash", params: { kp: 14, ki: 0.05, kd: 0, maxOutput: 100, integralClamp: 60 },
        constraints: { hltOvershootCapF: HW.SAFETY.hltOvershootCapF, capSensor: "hlt" },
        note: HW.KETTLES.find((k) => k.id === "mash")?.note },
      { id: "hlt", name: "HLT", type: "pid", sensor: "hlt", actor: "hltElement",
        vessel: "hlt", params: { kp: 14, ki: 0.05, kd: 0, maxOutput: 100, integralClamp: 60 } },
      { id: "boil", name: "Boil", type: "power", sensor: "boil", actor: "boilElement",
        vessel: "boil", params: { power: 75 } },
      { id: "ferm", name: "Fermenter", type: "hysteresis", sensor: "ferm",
        coolActor: "glycolPump", heatActor: "fermentHeat", vessel: "ferm",
        params: { target: 66, deadband: HW.FERMENTER.defaultDeadband, minHoldSec: 60 }, enabled: true },
    ],

    interlock: {
      positions: HW.SAFETY.interlockPositions,
      senseGpio: HW.AUX.selectorSense,
      // Software mirrors the panel selector; it can never override it.
      mode: "software",
    },

    alerts: {
      tempDeviationF: 4,       // warn if a controlled vessel drifts this far off target
      sensorFaultAfterSec: 10,
      buzzer: true,
    },

    recipe: creamsicleIPA(),
  };
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return migrate(cfg);
    } catch (e) {
      const bad = CONFIG_PATH + ".corrupt-" + Date.now();
      fs.copyFileSync(CONFIG_PATH, bad);
      console.error(`config.json unreadable (${e.message}) — backed up to ${bad}, using defaults`);
    }
  }
  const cfg = defaultConfig();
  saveConfig(cfg);
  return cfg;
}

export function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_PATH); // atomic — a power cut mid-write can't eat the config
  return cfg;
}

function migrate(cfg) {
  const merged = { ...defaultConfig(), ...cfg };
  // configs written before recipe v2 carry a bare "Default" recipe with no
  // batch data — replace it with the full seeded sample rather than showing
  // an empty brew sheet
  const stale = cfg.recipe?.name === "Creamsicle NE IPA" && (cfg.recipe.rev || 0) < SEED_REV;
  if (!cfg.recipe?.batch || !cfg.recipe?.grains?.length || stale) merged.recipe = creamsicleIPA();
  else merged.recipe = normalizeRecipe(cfg.recipe);
  // older configs: migrate to the two-pump + hose-routing model
  const d = defaultConfig();
  merged.actors = merged.actors.filter((a) => a.id !== "recircPump");
  for (const p of ["waterPump", "wortPump"]) {
    if (!merged.actors.some((a) => a.id === p)) merged.actors.push(d.actors.find((a) => a.id === p));
  }
  if (!merged.flows?.some((f) => f.id === "hlt-loop") || merged.flows.some((f) => f.pump === "recircPump")) {
    merged.flows = d.flows;
  }
  merged.routes ??= d.routes;
  return merged;
}

/** shallow structural validation for config PUTs from the UI */
export function validateConfig(cfg) {
  const errs = [];
  const ids = new Set();
  for (const kind of ["sensors", "actors", "vessels", "controllers"]) {
    if (!Array.isArray(cfg[kind])) { errs.push(`${kind} must be an array`); continue; }
    for (const e of cfg[kind]) {
      if (!e.id || typeof e.id !== "string") errs.push(`${kind}: entry missing id`);
      const key = `${kind}:${e.id}`;
      if (ids.has(key)) errs.push(`duplicate ${key}`);
      ids.add(key);
    }
  }
  const gpios = new Map();
  for (const a of cfg.actors || []) {
    if (a.gpio != null) {
      if (gpios.has(a.gpio)) errs.push(`GPIO ${a.gpio} used by both ${gpios.get(a.gpio)} and ${a.id}`);
      gpios.set(a.gpio, a.id);
    }
  }
  for (const c of cfg.controllers || []) {
    if (c.sensor && !(cfg.sensors || []).some((s) => s.id === c.sensor))
      errs.push(`controller ${c.id}: unknown sensor ${c.sensor}`);
    for (const k of ["actor", "coolActor", "heatActor"]) {
      if (c[k] && !(cfg.actors || []).some((a) => a.id === c[k]))
        errs.push(`controller ${c.id}: unknown actor ${c[k]}`);
    }
  }
  return errs;
}
