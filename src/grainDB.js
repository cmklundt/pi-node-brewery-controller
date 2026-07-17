/**
 * grainDB.js — quick-select catalog of common malts & fermentables.
 * ppg = potential gravity per lb per gallon; lov = color in °Lovibond.
 * Values are the commonly published ones (BeerSmith/Brewer's Friend range).
 */
export const GRAIN_DB = [
  // base malts
  { name: "2-Row Pale (US)", ppg: 1.037, lov: 1.8 },
  { name: "Pale Ale Malt", ppg: 1.037, lov: 3.5 },
  { name: "Maris Otter", ppg: 1.038, lov: 3.8 },
  { name: "Golden Promise", ppg: 1.038, lov: 3.0 },
  { name: "Pilsner Malt", ppg: 1.037, lov: 1.6 },
  { name: "Vienna Malt", ppg: 1.036, lov: 3.5 },
  { name: "Munich 10L", ppg: 1.035, lov: 10 },
  { name: "Munich 20L", ppg: 1.035, lov: 20 },
  { name: "White Wheat Malt", ppg: 1.040, lov: 3.1 },
  { name: "Red Wheat Malt", ppg: 1.038, lov: 2.5 },
  { name: "Rye Malt", ppg: 1.029, lov: 3.7 },
  { name: "Smoked Malt", ppg: 1.037, lov: 5 },
  { name: "Acidulated Malt", ppg: 1.027, lov: 3 },
  // adjuncts / flaked
  { name: "Flaked Oats", ppg: 1.033, lov: 2.2 },
  { name: "Flaked Wheat", ppg: 1.034, lov: 2 },
  { name: "Flaked Barley", ppg: 1.032, lov: 2 },
  { name: "Flaked Corn", ppg: 1.039, lov: 0.5 },
  { name: "Flaked Rice", ppg: 1.038, lov: 0.5 },
  // caramel / crystal
  { name: "Carapils (Dextrine)", ppg: 1.033, lov: 1.5 },
  { name: "Honey Malt", ppg: 1.037, lov: 25 },
  { name: "Caramel/Crystal 10L", ppg: 1.035, lov: 10 },
  { name: "Caramel/Crystal 20L", ppg: 1.035, lov: 20 },
  { name: "Caramel/Crystal 40L", ppg: 1.034, lov: 40 },
  { name: "Caramel/Crystal 60L", ppg: 1.034, lov: 60 },
  { name: "Caramel/Crystal 80L", ppg: 1.034, lov: 80 },
  { name: "Caramel/Crystal 120L", ppg: 1.033, lov: 120 },
  { name: "Special B", ppg: 1.030, lov: 180 },
  // toasted / biscuit
  { name: "Victory Malt", ppg: 1.034, lov: 28 },
  { name: "Biscuit Malt", ppg: 1.036, lov: 23 },
  { name: "Aromatic Malt", ppg: 1.036, lov: 26 },
  { name: "Brown Malt", ppg: 1.032, lov: 65 },
  // roasted
  { name: "Pale Chocolate", ppg: 1.034, lov: 200 },
  { name: "Chocolate Malt", ppg: 1.028, lov: 350 },
  { name: "Carafa Special II", ppg: 1.032, lov: 430 },
  { name: "Black Patent", ppg: 1.025, lov: 500 },
  { name: "Roasted Barley", ppg: 1.025, lov: 300 },
  // sugars
  { name: "Lactose", ppg: 1.043, lov: 0 },
  { name: "Corn Sugar (Dextrose)", ppg: 1.037, lov: 0 },
  { name: "Table Sugar", ppg: 1.046, lov: 0 },
  { name: "Honey", ppg: 1.032, lov: 1 },
  { name: "Dry Malt Extract", ppg: 1.044, lov: 8 },
  { name: "Liquid Malt Extract", ppg: 1.036, lov: 10 },
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
