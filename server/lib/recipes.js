/**
 * recipes.js — recipe schema v2 + the seeded sample.
 *
 * A recipe is the whole brew sheet, modeled on Christopher's spreadsheet
 * (Electric Brewery — Creamsicle NE IPA): batch targets, grain bill, hop
 * schedule, salts, water chemistry, yeast — and a phased STEP LIST that
 * mixes two kinds of steps, because a real brew day is a checklist:
 *
 *   kind "manual"             operator does something and checks it off
 *                             (optionally with a countdown once started)
 *   kind "ramp"/"rest"/"boil" controlled: the engine heats a vessel to
 *                             target and (rest/boil) holds it for a time,
 *                             timer gated on being at temperature
 *
 * Per-step flags:
 *   autoAdvance  true  → go to the next step automatically when done
 *                false → hold with an alert until the operator confirms
 *   instructions          shown on the step card
 *   ingredients [ {name, amount} ]  called out prominently (salts, hops…)
 *   alarm       true → at-temp / done fires an alert + buzzer + push
 */

export const SEED_REV = 4;

export function normalizeRecipe(r = {}) {
  return {
    name: r.name || "Untitled recipe",
    rev: r.rev,
    batch: {
      sizeGal: 5.5, boilMin: 60, ogTarget: 1.05, fgTarget: 1.014,
      abvTarget: 4.7, ibuTarget: 70, mashEffPct: 92, preBoilGal: 6.95,
      // volume-balance loss model (all editable in the Recipe tab)
      kegTargetGal: 5.0, mashThicknessQtPerLb: 1.5,
      grainAbsorpGalPerLb: 0.125, deadspaceGal: 0.25, boilLossGal: 0.7,
      coolShrinkPct: 4, kettleLossGal: 0.5,
      fermenterTrubGal: 0.5, dryHopAbsorpGalPerOz: 0.0625, kegSizeGal: 5.0,
      ...(r.batch || {}),
    },
    grains: r.grains || [],
    hops: r.hops || [],
    salts: r.salts || { mash: [], boil: [] },
    water: r.water || {},
    yeast: r.yeast || {},
    steps: (r.steps || []).map((s, i) => ({
      id: s.id ?? i + 1,
      phase: s.phase || "mash",
      name: s.name || `Step ${i + 1}`,
      kind: s.kind || "manual",
      vessel: s.vessel ?? null,
      target: s.target ?? null,
      mins: s.mins ?? 0,
      autoAdvance: s.autoAdvance !== false,
      instructions: s.instructions || "",
      ingredients: s.ingredients || [],
      hops: s.hops || undefined,   // boil-step hop alarms [{at, name}]
      routes: s.routes || undefined, // expected pump routing {pumpId: flowId}
      alarm: s.alarm !== false,
    })),
  };
}

/** The sample recipe, transcribed from the spreadsheet's Recipe +
 *  Brew Steps tabs. Ships as the default so brew day works out of the box. */
export function creamsicleIPA() {
  return normalizeRecipe({
    name: "Creamsicle NE IPA",
    rev: 4,
    batch: {
      sizeGal: 5.5, boilMin: 60, ogTarget: 1.050, fgTarget: 1.014,
      abvTarget: 4.7, ibuTarget: 70, mashEffPct: 92, preBoilGal: 6.95,
      spargeGal: 4.39,
    },
    // lbs back-computed from the sheet's per-grain gravity-unit column
    // (total ≈ 313 GU → OG 1.050 at 92% efficiency into 5.5 gal)
    grains: [
      { name: "Domestic 2-row", lbs: 2.5, ppg: 1.037, lov: 1.8 },
      { name: "Carapils", lbs: 0.7, ppg: 1.033, lov: 1.5 },
      { name: "Flaked Oats", lbs: 1.3, ppg: 1.033, lov: 2.2 },
      { name: "Maris Otter", lbs: 2.4, ppg: 1.038, lov: 3.8 },
      { name: "Honey Malt 25L", lbs: 0.45, ppg: 1.037, lov: 25 },
      { name: "White Wheat 3.1L", lbs: 1.25, ppg: 1.040, lov: 3.1 },
    ],
    hops: [
      { name: "Sabro", oz: 0.5, alphaPct: 15.8, when: "first wort", ibu: 7.9 },
      { name: "Lactose", oz: 4.0, when: "10 min", note: "adjunct, non-fermentable" },
      { name: "Sabro", oz: 1.5, alphaPct: 15.8, when: "5 min", ibu: 23.7 },
      { name: "Sabro", oz: 2.0, alphaPct: 15.8, when: "whirlpool 180°F 30 min", ibu: 31.6 },
      { name: "Sabro", oz: 2.0, alphaPct: 15.8, when: "dry hop day 1" },
      { name: "Sabro", oz: 2.0, alphaPct: 9.4, when: "dry hop day 3 (yeast dump)" },
    ],
    // Straight from the sheet's EZ-Water salt columns (Gypsum 0 · CaCl2 ·
    // Epsom). Resulting profile is chloride-forward (Cl:SO4 ≈ 2), as a
    // NEIPA should be.
    salts: {
      mash: [{ name: "Calcium Chloride", g: 4.5 }, { name: "Epsom Salt", g: 3.0 }],
      boil: [{ name: "Calcium Chloride", g: 5.33 }, { name: "Epsom Salt", g: 3.56 }],
    },
    water: {
      // starting profile from the EZ Water tab (city water report)
      source: { Ca: 12, Mg: 2.4, Na: 24, Cl: 30, SO4: 8 },
      targets: { Ca: 100, Mg: 18, Na: 24, Cl: 200, SO4: 100 },
      mashGal: 3.7, spargeGal: 4.39,
      grainTempF: 68, tunLossF: 2,   // strike temp calculator inputs
      mashPh: "5.2–5.4", spargePh: "5.6–5.8",
    },
    yeast: { strain: "Wyeast 1318 London Ale III", attenuationPct: 73, pitchF: 68, fermF: 68, raiseToF: 71 },

    steps: [
      /* ── MASH ── */
      { phase: "mash", kind: "manual", name: "Fill HLT with 10 gal",
        instructions: "Fill the HLT to 10 gallons (0% distilled). Add 250 mg potassium metabisulphite." },
      { phase: "mash", kind: "manual", name: "Start HLT recirculation", routes: { waterPump: "hlt-loop" },
        instructions: "Hook up the water pump to circulate the HLT and switch the pump outlet on. Lid on." },
      { phase: "mash", kind: "ramp", name: "Heat strike water", vessel: "hlt", target: 162,
        autoAdvance: false, instructions: "HLT element heats to strike temperature. Alarm sounds at temp — silence it and continue." },
      { phase: "mash", kind: "manual", name: "Transfer strike water", vessel: "hlt", target: 162, routes: { waterPump: "strike" },
        instructions: "Switch the water pump line to HLT → Mash and transfer the strike water. Then restore the HLT to 10 gallons. (HLT holds 162°F while you work.)" },
      { phase: "mash", kind: "manual", name: "Connect recirc hoses", vessel: "hlt", target: 162, routes: { waterPump: "hlt-loop", wortPump: "recirc" },
        instructions: "Reconnect the water pump to HLT circulation and set the wort pump to the mash recirc loop. Turn both pumps on." },
      { phase: "mash", kind: "ramp", name: "Mash-in temperature", vessel: "mash", target: 160,
        autoAdvance: false, instructions: "HERMS brings HLT and mash tun to mash-in temp before the grain goes in." },
      { phase: "mash", kind: "manual", name: "Add grains", vessel: "mash", target: 160,
        instructions: "Dough in slowly, stirring to avoid dough balls. (HERMS holds mash temp while you work.)",
        ingredients: [
          { name: "Domestic 2-row", amount: "2.0 lb" }, { name: "Carapils", amount: "3.5 lb" },
          { name: "Flaked Oats", amount: "1.0 lb" }, { name: "Maris Otter", amount: "3.0 lb" },
          { name: "Honey Malt 25L", amount: "0.5 lb" }, { name: "White Wheat", amount: "3.1 lb" },
        ] },
      { phase: "mash", kind: "manual", name: "Add mash salts & check pH", vessel: "mash", target: 160,
        instructions: "Stir salts in, then measure mash pH. Target 5.2–5.4 — add 88% lactic acid 0.5 mL at a time (usually 1–2 mL total).",
        ingredients: [{ name: "Calcium Chloride", amount: "4.50 g" }, { name: "Epsom Salt", amount: "3.00 g" }] },
      { phase: "mash", kind: "rest", name: "Saccharification rest", vessel: "mash", target: 160, mins: 90,
        instructions: "Single-infusion rest. Timer counts only while the mash is at temperature." },
      { phase: "mash", kind: "rest", name: "Mash out", vessel: "mash", target: 168, mins: 10,
        instructions: "Raise to mash-out and hold. Check HLT pH is 5.6–5.8 at mash temp for the sparge." },
      { phase: "mash", kind: "manual", name: "First wort hops", vessel: "hlt", target: 168,
        instructions: "Add first-wort hops to the boil kettle before sparging. (HLT holds sparge temp.)",
        ingredients: [{ name: "Sabro", amount: "0.5 oz" }] },
      { phase: "mash", kind: "rest", name: "Sparge → Boil kettle", vessel: "hlt", target: 168, mins: 45, autoAdvance: false,
        routes: { waterPump: "strike", wortPump: "sparge" },
        instructions: "Fly-sparge — this is the wort transfer to the boil kettle. WATER pump runs HLT → Mash (168°F sparge water into the top); WORT pump runs Mash → Boil (runoff out the bottom, over your first-wort hops). Collect 6.95 gal total in the boil kettle (4.39 gal of sparge water). Match pump rates to keep 1–2 inches above the grain bed (binder-clip trick). Take a pre-boil sample for pH and gravity." },

      /* ── BOIL ── */
      { phase: "boil", kind: "ramp", name: "Bring to a boil", vessel: "boil", target: 212, autoAdvance: false,
        instructions: "Flip the interlock to BOIL and run the element at full power, lid off. Alarm at boil — silence and confirm." },
      { phase: "boil", kind: "manual", name: "Add boil salts",
        ingredients: [{ name: "Calcium Chloride", amount: "5.33 g" }, { name: "Epsom Salt", amount: "3.56 g" }] },
      { phase: "boil", kind: "boil", name: "Boil", vessel: "boil", target: 212, mins: 60,
        instructions: "60-minute boil. Hop and Whirlfloc alarms fire at their times.",
        hops: [
          { at: 45, name: "Whirlfloc ½ tablet" },
          { at: 10, name: "Lactose 4 oz" },
          { at: 5, name: "Sabro 1.5 oz" },
        ] },
      { phase: "boil", kind: "rest", name: "Whirlpool hop steep", vessel: "boil", target: 180, mins: 30, autoAdvance: false,
        instructions: "Let the boil cool to 180°F, add whirlpool hops, and steep.",
        ingredients: [{ name: "Sabro", amount: "2.0 oz" }] },

      /* ── TRANSFER & FERMENT ── */
      { phase: "transfer", kind: "manual", name: "Set up transfer",
        instructions: "Hook up hoses for transfer through the counter-flow chiller. All conical valves closed. Run cold water through the chiller." },
      { phase: "transfer", kind: "manual", name: "Chill & transfer to fermenter", autoAdvance: false, routes: { wortPump: "transfer" },
        instructions: "Set the wort pump line to Boil → Fermenter and pump the boil kettle through the counter-flow chiller into the conical, targeting 68°F. Take a sample: record OG and pH." },
      { phase: "transfer", kind: "manual", name: "Oxygenate",
        instructions: "Sanitize the carb stone, attach to the racking port, connect O₂, open the racking valve 1–2 minutes (blow-off hose in sanitizer). Close, disconnect, sanitize the butterfly valve; clean the stone in PBW / blow out with CO₂." },
      { phase: "transfer", kind: "manual", name: "Pitch yeast",
        instructions: "Pitch at 68°F. Fermenter controller holds 68°F.",
        ingredients: [{ name: "Wyeast 1318 London Ale III", amount: "1 pack" }] },
      { phase: "transfer", kind: "manual", name: "Dry hop — day 1",
        instructions: "Add the first dry hop a day after pitching.",
        ingredients: [{ name: "Sabro", amount: "2.0 oz" }] },
      { phase: "transfer", kind: "manual", name: "Dry hop — day 3 & raise temp",
        instructions: "At yeast dump, add the second dry hop and raise the fermenter to 71°F for the finish.",
        ingredients: [{ name: "Sabro", amount: "2.0 oz" }] },
    ],
  });
}
