/**
 * brewcalc.js — the spreadsheet's formulas, live.
 * Inputs (grain lbs/ppg, batch size, efficiency, hop oz/alpha/time,
 * yeast attenuation) → computed OG, FG, ABV, IBU (Tinseth), grain-bill
 * percentages and gravity-unit contributions.
 */
export function parseWhenMin(when = "", boilMin = 60) {
  const w = String(when).toLowerCase();
  if (w.includes("first wort") || w.includes("fwh")) return boilMin;
  if (w.includes("dry")) return null;
  if (w.includes("whirlpool") || w.includes("steep") || w.includes("post")) return 10; // ~10 boil-min equivalent
  const m = w.match(/(\d+)\s*m/);
  return m ? +m[1] : null;
}

export function computeRecipe(r) {
  const gal = +r?.batch?.sizeGal || 5.5;
  const boilMin = +r?.batch?.boilMin || 60;
  const eff = (+r?.batch?.mashEffPct || 75) / 100;
  const preBoil = +r?.batch?.preBoilGal || gal + 1.5;

  const grains = (r?.grains || []).map((g) => ({
    ...g,
    points: (+g.lbs || 0) * (((+g.ppg || 1.036) - 1) * 1000),
  }));
  const totalPts = grains.reduce((a, g) => a + g.points, 0);
  const totalLbs = grains.reduce((a, g) => a + (+g.lbs || 0), 0);
  const ogPts = gal > 0 ? (totalPts * eff) / gal : 0;
  const og = 1 + ogPts / 1000;

  const att = (+r?.yeast?.attenuationPct || 75) / 100;
  const fg = 1 + (ogPts * (1 - att)) / 1000;
  const abv = (og - fg) * 131.25;

  // Tinseth: utilization from boil gravity + time
  const gb = 1 + (ogPts / 1000) * (gal / preBoil);
  const hops = (r?.hops || []).map((h) => {
    const min = h.min ?? parseWhenMin(h.when, boilMin);
    let ibu = null;
    if (min != null && +h.alphaPct > 0) {
      const util = (1.65 * Math.pow(0.000125, gb - 1) * (1 - Math.exp(-0.04 * min))) / 4.15;
      ibu = ((+h.alphaPct / 100) * (+h.oz || 0) * 7490 / gal) * util;
    }
    return { ...h, effMin: min, computedIbu: ibu };
  });
  const ibuTotal = hops.reduce((a, h) => a + (h.computedIbu || 0), 0);

  return {
    og, fg, abv, ibuTotal, totalLbs, totalPts,
    grains: grains.map((g) => ({ ...g, pct: totalPts ? (g.points / totalPts) * 100 : 0 })),
    hops,
    buGu: ogPts > 0 ? ibuTotal / ogPts : 0,
  };
}

export const fmtSG = (g) => (Number.isFinite(g) ? g.toFixed(3) : "—");

/* ── beer color (Morey) ─────────────────────────────────────── */
export function computeColor(r) {
  const gal = +r?.batch?.sizeGal || 5.5;
  const mcu = (r?.grains || []).reduce((a, g) => a + (+g.lbs || 0) * (+g.lov || 0), 0) / gal;
  const srm = mcu > 0 ? 1.4922 * Math.pow(mcu, 0.6859) : 0;
  return { mcu, srm, ebc: srm * 1.97, hex: srmHex(srm) };
}

const SRM_HEX = ["#FFE699", "#FFD878", "#FFCA5A", "#FFBF42", "#FBB123", "#F8A600", "#F39C00", "#EA8F00", "#E58500", "#DE7C00",
  "#D77200", "#CF6900", "#CB6200", "#C35900", "#BB5100", "#B54C00", "#B04500", "#A63E00", "#A13700", "#9B3200",
  "#952D00", "#8E2900", "#882300", "#821E00", "#7B1A00", "#771900", "#701400", "#6A0E00", "#660D00", "#5E0B00",
  "#5A0A02", "#560A05", "#520907", "#4C0505", "#470606", "#440607", "#3F0708", "#3B0607", "#36080A", "#23030A"];
export const srmHex = (srm) => SRM_HEX[Math.max(0, Math.min(39, Math.round(srm) - 1))] || SRM_HEX[39];

/* ── water / salts (EZ Water model) ─────────────────────────── */
import { SALT_DB, IONS } from "./grainDB.js";

/**
 * source profile (ppm) + salt grams per stage / volume → resulting ppm.
 * mash profile uses mash water only; overall uses mash+sparge volumes with
 * all salts, matching the spreadsheet's "Mash + Sparge Water Profile".
 */
export function computeWater(r) {
  const w = r?.water || {};
  const src = w.source || {};
  const mashGal = +w.mashGal || 0;
  const spargeGal = +w.spargeGal || 0;
  const totalGal = mashGal + spargeGal;

  const apply = (salts, gal) => {
    const out = {};
    for (const ion of IONS) out[ion] = +src[ion] || 0;
    if (!gal) return out;
    for (const s of salts || []) {
      const ions = SALT_DB[s.name];
      if (!ions) continue;
      for (const ion of IONS) if (ions[ion]) out[ion] += (ions[ion] * (+s.g || 0)) / gal;
    }
    for (const ion of IONS) out[ion] = Math.round(out[ion]);
    return out;
  };

  const mash = apply(r?.salts?.mash, mashGal);
  const all = apply([...(r?.salts?.mash || []), ...(r?.salts?.boil || [])], totalGal);
  const clSo4 = all.SO4 > 0 ? all.Cl / all.SO4 : null;
  return { mash, all, clSo4, mashGal, spargeGal };
}
