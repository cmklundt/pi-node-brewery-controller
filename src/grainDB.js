/**
 * grainDB.js — quick-select catalog of common malts & fermentables.
 * ppg = potential gravity per lb per gallon; lov = color in °Lovibond.
 * Values are the commonly published ones (BeerSmith/Brewer's Friend range).
 */
/* Organized around what Northern Brewer stocks: Briess + Rahr (US),
 * Weyermann (German), Simpsons (UK). ppg/°L are the maltsters' published
 * specs. Edit freely — this is just a data file. */
export const GRAIN_DB = [
  // US base — Rahr & Briess (NB's house standards)
  { name: "Rahr 2-Row", ppg: 1.037, lov: 1.8 },
  { name: "Rahr Pale Ale", ppg: 1.036, lov: 3.2 },
  { name: "Rahr Pilsner", ppg: 1.036, lov: 1.7 },
  { name: "Rahr White Wheat", ppg: 1.039, lov: 3.2 },
  { name: "Briess 2-Row Brewers", ppg: 1.037, lov: 1.8 },
  { name: "Briess Red Wheat", ppg: 1.038, lov: 2.3 },
  // German base — Weyermann
  { name: "Weyermann Pilsner", ppg: 1.037, lov: 1.7 },
  { name: "Weyermann Vienna", ppg: 1.036, lov: 3.5 },
  { name: "Weyermann Munich I", ppg: 1.036, lov: 8 },
  { name: "Weyermann Munich II", ppg: 1.036, lov: 12 },
  { name: "Weyermann Rye Malt", ppg: 1.029, lov: 3.7 },
  { name: "Weyermann Acidulated", ppg: 1.027, lov: 3 },
  { name: "Weyermann Smoked (Rauch)", ppg: 1.037, lov: 5 },
  // UK base — Simpsons
  { name: "Simpsons Maris Otter", ppg: 1.038, lov: 3.8 },
  { name: "Simpsons Golden Promise", ppg: 1.038, lov: 3.0 },
  // adjuncts / flaked (Briess)
  { name: "Flaked Oats", ppg: 1.033, lov: 2.2 },
  { name: "Flaked Wheat", ppg: 1.034, lov: 2 },
  { name: "Flaked Barley", ppg: 1.032, lov: 2 },
  { name: "Flaked Corn (Maize)", ppg: 1.039, lov: 0.5 },
  { name: "Flaked Rice", ppg: 1.038, lov: 0.5 },
  // caramel / crystal — Briess + Weyermann + Gambrinus
  { name: "Briess Carapils", ppg: 1.033, lov: 1.5 },
  { name: "Gambrinus Honey Malt", ppg: 1.037, lov: 25 },
  { name: "Briess Caramel 10L", ppg: 1.035, lov: 10 },
  { name: "Briess Caramel 20L", ppg: 1.035, lov: 20 },
  { name: "Briess Caramel 40L", ppg: 1.034, lov: 40 },
  { name: "Briess Caramel 60L", ppg: 1.034, lov: 60 },
  { name: "Briess Caramel 80L", ppg: 1.034, lov: 80 },
  { name: "Briess Caramel 120L", ppg: 1.033, lov: 120 },
  { name: "Weyermann CaraFoam", ppg: 1.033, lov: 1.8 },
  { name: "Weyermann CaraMunich II", ppg: 1.034, lov: 45 },
  { name: "Weyermann CaraAroma", ppg: 1.034, lov: 130 },
  { name: "Simpsons DRC", ppg: 1.033, lov: 45 },
  { name: "Special B (Castle)", ppg: 1.030, lov: 180 },
  // toasted / biscuit
  { name: "Briess Victory", ppg: 1.034, lov: 28 },
  { name: "Briess Special Roast", ppg: 1.033, lov: 50 },
  { name: "Biscuit (Castle)", ppg: 1.036, lov: 23 },
  { name: "Briess Aromatic", ppg: 1.036, lov: 20 },
  { name: "Simpsons Brown Malt", ppg: 1.032, lov: 65 },
  // roasted
  { name: "Pale Chocolate (Simpsons)", ppg: 1.034, lov: 200 },
  { name: "Briess Chocolate", ppg: 1.028, lov: 350 },
  { name: "Weyermann Carafa Special II", ppg: 1.032, lov: 430 },
  { name: "Briess Black Malt", ppg: 1.025, lov: 500 },
  { name: "Briess Midnight Wheat", ppg: 1.025, lov: 550 },
  { name: "Briess Roasted Barley", ppg: 1.025, lov: 300 },
  // sugars & extracts
  { name: "Lactose", ppg: 1.043, lov: 0 },
  { name: "Corn Sugar (Dextrose)", ppg: 1.037, lov: 0 },
  { name: "Table Sugar", ppg: 1.046, lov: 0 },
  { name: "Honey", ppg: 1.032, lov: 1 },
  { name: "Briess Golden Light DME", ppg: 1.044, lov: 4 },
  { name: "Briess Pilsen Light LME", ppg: 1.036, lov: 2 },
];

/**
 * Brewing salts — ion contribution in ppm per gram per gallon of water.
 * Same numbers the EZ Water calculator uses.
 */
export const SALT_DB = {
  "Gypsum":            { Ca: 61.5, SO4: 147.4 },
  "Calcium Chloride":  { Ca: 72.0, Cl: 127.4 },
  "Epsom Salt":        { Mg: 26.1, SO4: 103.0 },
  "Canning Salt (NaCl)": { Na: 103.9, Cl: 160.3 },
  "Baking Soda":       { Na: 72.3, HCO3: 191.0 },
  "Chalk":             { Ca: 105.6, HCO3: 322.3 },
  "Slaked Lime":       { Ca: 143.4, HCO3: 0 },
};
export const SALT_NAMES = Object.keys(SALT_DB);
export const IONS = ["Ca", "Mg", "Na", "Cl", "SO4"];
