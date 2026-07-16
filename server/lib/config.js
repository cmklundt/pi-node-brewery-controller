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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.BREWERY_DATA || path.join(__dirname, "../../data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export function defaultConfig() {
  return {
    version: 1,
    name: "HERMS Control",
    units: "F",
    rtd: { ...HW.RTD },
    inverted: HW.INVERTED,
    aux: { buzzer: HW.AUX.buzzer, oneWire: HW.AUX.oneWire, flow: HW.AUX.flow },

    sensors: HW.SENSORS.map((s) => ({
      id: s.id, name: s.name, type: "max31865", cs: s.cs,
      vessel: s.vessel, calibrationOffset: 0, simKey: s.id,
    })),

    actors: [
      ...HW.ACTORS.filter((a) => a.id !== "spareC").map((a) => ({ ...a })),
      // Spare C carries the recirc pump — the HERMS coil only moves heat
      // while this runs. Rename/remap freely in Setup if it lands elsewhere.
      { id: "recircPump", name: "Recirc pump", gpio: 5, kind: "relay",
        volts: 120, modulated: false, inductive: true, wasSpare: "C" },
    ],

    vessels: [
      { id: "hlt",  name: "HLT",       kind: "kettle",  sensor: "hlt",  element: "hltElement",  graphic: "kettle-coil", volumeGal: 15 },
      { id: "mash", name: "Mash tun",  kind: "mashtun", sensor: "mash", element: null,          graphic: "mashtun",     volumeGal: 15 },
      { id: "boil", name: "Boil",      kind: "kettle",  sensor: "boil", element: "boilElement", graphic: "kettle",      volumeGal: 20 },
      { id: "ferm", name: "Fermenter", kind: "conical", sensor: "ferm", element: null,          graphic: "conical",     volumeGal: 14 },
    ],

    controllers: [
      { id: "mash", name: "Mash (HERMS)", type: "pid", sensor: "mash", actor: "hltElement",
        vessel: "mash", params: { kp: 14, ki: 0.02, kd: 0, maxOutput: 100 },
        constraints: { hltOvershootCapF: HW.SAFETY.hltOvershootCapF, capSensor: "hlt" },
        note: HW.KETTLES.find((k) => k.id === "mash")?.note },
      { id: "hlt", name: "HLT", type: "pid", sensor: "hlt", actor: "hltElement",
        vessel: "hlt", params: { kp: 14, ki: 0.02, kd: 0, maxOutput: 100 } },
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

    recipe: {
      name: "Default",
      steps: [
        { id: 1, name: "Heat strike water", vessel: "hlt",  target: 168, mins: 0,  kind: "ramp" },
        { id: 2, name: "Mash in",           vessel: "mash", target: 152, mins: 0,  kind: "ramp" },
        { id: 3, name: "Saccharification",  vessel: "mash", target: 152, mins: 60, kind: "rest" },
        { id: 4, name: "Mash out",          vessel: "mash", target: 168, mins: 10, kind: "rest" },
        { id: 5, name: "Boil",              vessel: "boil", target: 212, mins: 60, kind: "boil",
          hops: [{ at: 60, name: "Magnum 1 oz" }, { at: 15, name: "Cascade 1 oz" },
                 { at: 5, name: "Citra 2 oz" }, { at: 0, name: "Flameout 2 oz" }] },
      ],
    },
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
  // future schema upgrades go here, keyed off cfg.version
  return { ...defaultConfig(), ...cfg };
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
