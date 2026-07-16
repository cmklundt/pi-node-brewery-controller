/**
 * hardware.js — single source of truth for the shield's pin map.
 *
 * Keep this in sync with docs/brewery-shield-spec.md and the CraftBeerPi
 * config. If a GPIO changes on the board, it changes here once, and the UI
 * and any future backend both follow.
 */

/* ── Sensors: 4× PT100 → MAX31865 on shared SPI0 ──────────── */
export const SPI = { miso: 9, mosi: 10, clk: 11 };

export const SENSORS = [
  { id: "hlt",  name: "HLT",       cs: 8,  vessel: "Hot liquor tank" },
  { id: "mash", name: "Mash",      cs: 7,  vessel: "Mash tun" },
  { id: "boil", name: "Boil",      cs: 25, vessel: "Boil kettle" },
  { id: "ferm", name: "Fermenter", cs: 24, vessel: "Conical" },
];

export const RTD = {
  refResistor: 430,   // ohms — PT100 (4300 would be PT1000)
  wires: 3,
  filterHz: 60,
};

/* ── Actors: 2 SSR drives + 4 isolated relay channels ─────── */
export const ACTORS = [
  { id: "hltElement",  name: "HLT element",  gpio: 17, kind: "ssr",   volts: 240, modulated: true  },
  { id: "boilElement", name: "Boil element", gpio: 27, kind: "ssr",   volts: 240, modulated: true  },
  { id: "glycolPump",  name: "Glycol pump",  gpio: 22, kind: "relay", volts: 120, modulated: false, inductive: true },
  { id: "fermentHeat", name: "Ferment heat", gpio: 23, kind: "relay", volts: 120, modulated: false },
  { id: "spareC",      name: "Spare C",      gpio: 5,  kind: "relay", volts: 120, modulated: false },
  { id: "spareD",      name: "Spare D",      gpio: 6,  kind: "relay", volts: 120, modulated: false },
];

/* Drive chain is GPIO high → isolator → FET on → load on.
 * Non-inverting. CraftBeerPi "Inverted" must be OFF.
 * (Cheap eBay relay boards are active-low and need Inverted ON — not this board.) */
export const INVERTED = false;

/* ── Aux I/O ──────────────────────────────────────────────── */
export const AUX = {
  oneWire: 4,            // bonus DS18B20 header (CBPi native path)
  flow: [12, 13],        // hall pulse inputs
  selectorSense: 16,     // opto-isolated; needs 330R series (HAT+ boot rule)
  encoder: { a: 19, b: 26, sw: 20 },
  buzzer: 21,
  i2c: { sda: 2, scl: 3 },      // OLED
  eepromId: { sd: 0, sc: 1 },   // HAT ID — reserved, nothing else on these
};

/* ── Kettle mapping — the HERMS trick ─────────────────────────
 * The mash tun has NO element. Mash temperature is controlled
 * indirectly: the mash sensor drives the HLT element, which heats
 * the HERMS coil. Getting this wrong is the classic HERMS config bug. */
export const KETTLES = [
  { id: "mash", name: "Mash", sensor: "mash", actor: "hltElement", logic: "pid",
    note: "HERMS — mash sensor drives the HLT element via the coil" },
  { id: "boil", name: "Boil", sensor: "boil", actor: "boilElement", logic: "pid",
    note: "Direct" },
  { id: "hlt",  name: "HLT",  sensor: "hlt",  actor: "hltElement", logic: "pid",
    note: "Strike water only — do not run at the same time as Mash" },
];

export const FERMENTER = {
  sensor: "ferm",
  coolingActor: "glycolPump",
  heatingActor: "fermentHeat",
  defaultDeadband: 0.8,   // °F — tighter than ~0.5 and the pump chatters
};

/* ── Safety constraints the UI should respect ─────────────── */
export const SAFETY = {
  /* Hardware selector routes 240V to ONE element. Software cannot
   * override it — the UI only reflects which element is armed. */
  interlockPositions: ["HLT", "OFF", "BOIL"],

  /* HLT may exceed mash target by at most this, or the coil starts
   * denaturing enzymes. */
  hltOvershootCapF: 10,

  /* Glycol chiller self-regulates its own bath; this output only moves
   * the circulation pump. No compressor => no min-off lockout needed,
   * but the pump is a motor: don't cycle it every few seconds. */
  glycolSwitchesCompressor: false,
};

export const PIN_COUNT_USED =
  3 + SENSORS.length + ACTORS.length + 2 /* flow */ + 1 /* selector */ + 3 /* encoder */ + 1 /* buzzer */;
