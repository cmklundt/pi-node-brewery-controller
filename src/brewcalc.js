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
  const b = r?.batch || {};
  // OG is measured at the fermenter; when a keg target is set the fermenter
  // volume is derived from it (keg + trub + dry-hop absorption)
  let gal = +b.sizeGal || 5.5;
  if (b.kegTargetGal) {
    const dryHopOz = (r?.hops || []).filter((h) => /dry/i.test(h.when || "")).reduce((a, h) => a + (+h.oz || 0), 0);
    gal = (+b.kegTargetGal) + (+b.fermenterTrubGal || 0) + dryHopOz * (b.dryHopAbsorpGalPerOz ?? 0.0625);
  }
  const boilMin = +b.boilMin || 60;
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

/* ── volume balance: strike → sparge → boil → fermenter → keg ─────
 * Traces water through every loss so you can see whether the batch
 * actually fills the keg. Loss constants live in batch (all editable).
 * Grain absorption ~0.125 gal/lb, cooling shrink ~4%, kettle trub +
 * hop absorption, fermenter trub/yeast + DRY-HOP absorption. */
export function computeVolumes(r) {
  const b = r?.batch || {}, w = r?.water || {};
  const grainLbs = (r?.grains || []).reduce((a, g) => a + (+g.lbs || 0), 0);
  const dryHopOz = (r?.hops || []).filter((h) => /dry/i.test(h.when || "")).reduce((a, h) => a + (+h.oz || 0), 0);

  const mashGal = +w.mashGal || 0;
  const spargeGal = +w.spargeGal || 0;
  const waterIn = mashGal + spargeGal;
  const absorp = grainLbs * (b.grainAbsorpGalPerLb ?? 0.125);
  const deadspace = +b.deadspaceGal || 0;
  const preBoil = Math.max(0, waterIn - absorp - deadspace);
  const boilLoss = +b.boilLossGal || 0;
  const postBoilHot = Math.max(0, preBoil - boilLoss);
  const chilled = postBoilHot * (1 - (+b.coolShrinkPct || 0) / 100);
  const kettleLoss = +b.kettleLossGal || 0;
  const toFermenter = Math.max(0, chilled - kettleLoss);
  // fermenter loss = base trub/yeast + dry-hop absorption (~0.06 gal/oz)
  const dryHopLoss = dryHopOz * (b.dryHopAbsorpGalPerOz ?? 0.0625);
  const fermLoss = (+b.fermenterTrubGal || 0) + dryHopLoss;
  const toKeg = Math.max(0, toFermenter - fermLoss);
  const kegSize = +b.kegSizeGal || 5;
  return {
    grainLbs, dryHopOz, mashGal, spargeGal, waterIn, absorp, deadspace,
    preBoil, boilLoss, postBoilHot, chilled, kettleLoss, toFermenter,
    dryHopLoss, fermTrub: +b.fermenterTrubGal || 0, fermLoss, toKeg, kegSize,
    kegFillPct: kegSize > 0 ? (toKeg / kegSize) * 100 : 0,
  };
}

/* ── back-solve: keg target → required water & grain ─────────────
 * The keg is the anchor. Work UP through every loss to the strike +
 * sparge water you must start with, and scale the grain bill so OG
 * still lands on target at the (larger) fermenter volume. */
export function computeBackSolve(r) {
  const b = r?.batch || {};
  const kegTarget = +b.kegTargetGal || 5;
  const dryHopOz = (r?.hops || []).filter((h) => /dry/i.test(h.when || "")).reduce((a, h) => a + (+h.oz || 0), 0);
  const dryHopLoss = dryHopOz * (b.dryHopAbsorpGalPerOz ?? 0.0625);
  const fermTrub = +b.fermenterTrubGal || 0;
  const kettleLoss = +b.kettleLossGal || 0;
  const shrink = (+b.coolShrinkPct || 0) / 100;
  const boilOff = +b.boilLossGal || 0;
  const absorpPerLb = b.grainAbsorpGalPerLb ?? 0.125;
  const deadspace = +b.deadspaceGal || 0;
  const mashThick = +b.mashThicknessQtPerLb || 1.5;
  const eff = (+b.mashEffPct || 75) / 100;
  const ogT = +b.ogTarget || 1.05;

  // volumes, working up from the keg
  const fermenterVol = kegTarget + fermTrub + dryHopLoss;
  const chilled = fermenterVol + kettleLoss;
  const postBoilHot = shrink < 1 ? chilled / (1 - shrink) : chilled;
  const preBoil = postBoilHot + boilOff;

  // grain to hit OG target at the fermenter volume (keeps the bill's ratio)
  const curPts = (r?.grains || []).reduce((a, g) => a + (+g.lbs || 0) * (((+g.ppg || 1.036) - 1) * 1000), 0);
  const neededPts = (ogT - 1) * 1000 * fermenterVol / eff;
  const scale = curPts > 0 ? neededPts / curPts : 1;
  const grains = (r?.grains || []).map((g) => ({ ...g, scaledLbs: +(((+g.lbs || 0) * scale)).toFixed(2) }));
  const grainLbs = grains.reduce((a, g) => a + g.scaledLbs, 0);

  // water: total needed, then split mash vs sparge by mash thickness
  const absorption = grainLbs * absorpPerLb;
  const totalWater = preBoil + absorption + deadspace;
  const mashWater = grainLbs * mashThick / 4;   // qt → gal
  const spargeWater = Math.max(0, totalWater - mashWater);

  return {
    kegTarget, dryHopOz, dryHopLoss, fermTrub, kettleLoss, boilOff, deadspace, absorption,
    fermenterVol, chilled, postBoilHot, preBoil, scale, grains, grainLbs,
    totalWater, mashWater, spargeWater, mashThick,
  };
}

/* ── gravity-first correction at a checkpoint ────────────────────
 * You measured actual volume + gravity. Sugar (gravity-units) is fixed;
 * boiling only concentrates it. So the honest question isn't "how do I
 * hit my volume" but "boil to what volume to hit OG" — accepting a
 * smaller batch beats diluting a beer below target. */
export function computeGravityPlan(r, measuredVol, measuredSG) {
  const b = r?.batch || {};
  const points = (measuredSG - 1) * 1000;
  if (!(measuredVol > 0) || !(points > 0)) return null;
  const gu = measuredVol * points;                       // gravity-units in the kettle now
  const ogPts = ((+b.ogTarget || 1.05) - 1) * 1000;

  // boil to this post-boil volume to land exactly on OG
  const postBoilForOg = gu / ogPts;
  const shrink = (+b.coolShrinkPct || 0) / 100;
  const dryHopOz = (r?.hops || []).filter((h) => /dry/i.test(h.when || "")).reduce((a, h) => a + (+h.oz || 0), 0);
  const dryHopLoss = dryHopOz * (b.dryHopAbsorpGalPerOz ?? 0.0625);
  const toFermenter = postBoilForOg * (1 - shrink) - (+b.kettleLossGal || 0);
  const kegAtOg = toFermenter - (+b.fermenterTrubGal || 0) - dryHopLoss;

  // if instead you boil to the ORIGINAL plan volume, what OG do you get?
  const bs = computeBackSolve(r);
  const ogIfPlanned = 1 + (gu / bs.postBoilHot) / 1000;
  // to keg full volume at target OG you'd need this much water added (dilution)
  const kegTarget = +b.kegTargetGal || 5;
  const guForFullKeg = ogPts * (bs.postBoilHot); // GU needed to fill plan at OG
  const shortGU = guForFullKeg - gu;             // >0 means you're short on sugar

  return {
    gu, points, postBoilForOg, kegAtOg, ogIfPlanned, kegTarget,
    boilOffToOg: measuredVol - postBoilForOg,    // gal to boil off from now to hit OG
    kegShortfall: kegTarget - kegAtOg,           // how much less than a full keg
    shortOnSugar: shortGU > 0,
  };
}

/* ── strike water temperature ───────────────────────────────────
 * Standard infusion formula: strike = target + (0.2/R)(target − grainT)
 * where R = qts water per lb grain, plus a tun/transfer loss allowance.
 * (0.2 is the grain:water specific-heat ratio constant.) */
export function computeStrike(r) {
  const bs = computeBackSolve(r);
  const grainLbs = bs.grainLbs;
  const grainT = +r?.water?.grainTempF || 68;
  const lossF = +r?.water?.tunLossF ?? 2;
  // mash target = first rest step's target, else first mash-vessel target
  const steps = r?.steps || [];
  const rest = steps.find((s) => s.kind === "rest" && s.phase === "mash" && s.target);
  const target = rest?.target ?? steps.find((s) => s.phase === "mash" && s.target)?.target ?? 152;
  if (!grainLbs) return { target, ratio: null, strikeF: null };
  const R = bs.mashThick; // qt/lb — mash thickness IS the ratio
  const strikeF = target + (0.2 / R) * (target - grainT) + lossF;
  return { target, ratio: R, strikeF, grainLbs: bs.grainLbs, grainT, lossF, mashGal: bs.mashWater };
}

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
  // mash + sparge volumes are DERIVED from the keg back-solve, not stored:
  // mash water = grain × thickness; sparge = total needed − mash
  const bs = computeBackSolve(r);
  const mashGal = bs.mashWater;
  const spargeGal = bs.spargeWater;
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
