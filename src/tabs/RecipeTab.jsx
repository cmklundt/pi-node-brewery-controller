/**
 * RecipeTab — brew setup: the whole brew sheet, editable.
 * Batch targets, grain bill, hops, salts, water, yeast, and the phased
 * step list (manual + controlled steps, times, temps, auto-advance).
 * Mirrors the structure of the brew spreadsheet.
 */
import React, { useState } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Row, Tap, Note, Field, Big, Computed } from "../ui.jsx";
import { put } from "../api.js";
import { computeRecipe, computeColor, computeWater, computeStrike, fmtSG } from "../brewcalc.js";
import { GRAIN_DB, SALT_NAMES, IONS } from "../grainDB.js";
import { HOP_DB } from "../hopDB.js";

const PHASES = ["mash", "boil", "transfer"];
const KINDS = ["manual", "ramp", "rest", "boil"];

export default function RecipeTab({ config, setConfig, state }) {
  const [draft, setDraft] = useState(null);
  const [openStep, setOpenStep] = useState(null);
  const [msg, setMsg] = useState("");
  const r = draft || config.recipe;
  const live = !!state.steps?.session;

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
  const startEdit = () => setDraft(JSON.parse(JSON.stringify(config.recipe)));
  const set = (patch) => setDraft({ ...draft, ...patch });
  const setBatch = (k, v) => set({ batch: { ...draft.batch, [k]: v } });

  async function save() {
    try {
      await put("/api/recipe", draft);
      setConfig({ ...config, recipe: draft });
      setDraft(null); setOpenStep(null);
      flash(live ? "Saved — applies after this brew session" : "Saved");
    } catch (e) { flash("✗ " + e.message); }
  }

  const updStep = (i, patch) => set({ steps: r.steps.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const moveStep = (i, dir) => {
    const s = [...r.steps]; const j = i + dir;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    set({ steps: s }); setOpenStep(j);
  };
  const addStep = () => {
    set({ steps: [...r.steps, { id: Date.now(), phase: "mash", kind: "manual", name: "New step", mins: 0, autoAdvance: true, instructions: "", ingredients: [] }] });
    setOpenStep(r.steps.length);
  };
  const removeStep = (i) => { set({ steps: r.steps.filter((_, j) => j !== i) }); setOpenStep(null); };

  const updList = (key, i, patch) => set({ [key]: r[key].map((x, j) => j === i ? { ...x, ...patch } : x) });
  const addTo = (key, tpl) => set({ [key]: [...(r[key] || []), tpl] });
  const dropFrom = (key, i) => set({ [key]: r[key].filter((_, j) => j !== i) });

  const calc = computeRecipe(r);   // the spreadsheet's formulas, live
  const color = computeColor(r);
  const water = computeWater(r);
  const strike = computeStrike(r);

  return (<>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
      {!draft
        ? <Tap onClick={startEdit} color={C.amber} pad="12px 20px" size={13}>Edit recipe</Tap>
        : <>
          <Tap onClick={save} on color={C.live} pad="12px 20px" size={13}>Save recipe</Tap>
          <Tap onClick={() => { setDraft(null); setOpenStep(null); }} color={C.faint} pad="12px 20px" size={13}>Discard</Tap>
        </>}
      {msg && <span style={{ ...legend, fontSize: 12, color: msg.startsWith("✗") ? C.ember : C.live }}>{msg}</span>}
      <span style={{ flex: 1 }} />
      {live && <span style={{ ...legend, fontSize: 11, color: C.amber }}>brew in progress — edits apply to the next session</span>}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>

      {/* ── recipe summary: every computed output in one place ── */}
      <div style={{ gridColumn: "1 / -1" }}>
        <Panel title={`${r.name} — computed summary`}
          right={<span style={{ ...legend, fontSize: 10, color: C.faint }}>ƒ from the inputs below · ▸ = your target</span>}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8 }}>
            <SummaryStat label="OG" v={fmtSG(calc.og)} target={r.batch?.ogTarget ? fmtSG(+r.batch.ogTarget) : null}
              good={!r.batch?.ogTarget || Math.abs(calc.og - r.batch.ogTarget) < 0.004} />
            <SummaryStat label="FG" v={fmtSG(calc.fg)} target={r.batch?.fgTarget ? fmtSG(+r.batch.fgTarget) : null}
              good={!r.batch?.fgTarget || Math.abs(calc.fg - r.batch.fgTarget) < 0.004} />
            <SummaryStat label="ABV" v={calc.abv.toFixed(2) + "%"} target={r.batch?.abvTarget ? r.batch.abvTarget + "%" : null}
              good={!r.batch?.abvTarget || Math.abs(calc.abv - r.batch.abvTarget) < 0.8} />
            <SummaryStat label="IBU" v={calc.ibuTotal.toFixed(0)} target={r.batch?.ibuTarget ?? null}
              good={!r.batch?.ibuTarget || Math.abs(calc.ibuTotal - r.batch.ibuTarget) < 12} />
            <SummaryStat label="BU : GU" v={calc.buGu.toFixed(2)} />
            <div style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderLeft: `3px solid ${C.glycol}88`, borderRadius: 3, padding: "9px 11px" }}>
              <div style={{ ...legend, fontSize: 10, fontWeight: 600, color: C.dim }}>ƒ Color</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ width: 26, height: 26, borderRadius: 5, background: color.hex, border: `1px solid ${C.rule}`, flexShrink: 0 }} />
                <div>
                  <div style={{ ...mono, fontSize: 16, color: C.glycol }}>{color.srm.toFixed(1)}<span style={{ fontSize: 9.5, color: C.faint }}> SRM</span></div>
                  <div style={{ ...mono, fontSize: 9, color: C.faint }}>{color.ebc.toFixed(0)} EBC · MCU {color.mcu.toFixed(1)}</div>
                </div>
              </div>
            </div>
            <SummaryStat label="Grain" v={calc.totalLbs.toFixed(1) + " lb"} />
            <SummaryStat label="Cl : SO₄" v={water.clSo4 != null ? water.clSo4.toFixed(2) : "—"} />
            <SummaryStat label="Strike temp" v={strike.strikeF != null ? strike.strikeF.toFixed(1) + "°F" : "—"}
              target={strike.ratio ? `${strike.ratio.toFixed(2)} qt/lb → ${strike.target}°F mash` : null} />
          </div>
        </Panel>
      </div>

      {/* ── batch ── */}
      <Panel title={draft ? "Batch" : "Batch targets"}>
        {draft && <Field label="Recipe name" value={r.name} onChange={(v) => set({ name: v })} />}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[["sizeGal", "Batch (gal)"], ["boilMin", "Boil (min)"], ["preBoilGal", "Pre-boil (gal)"],
            ["ogTarget", "OG target"], ["fgTarget", "FG target"], ["abvTarget", "ABV %"],
            ["ibuTarget", "IBU"], ["mashEffPct", "Mash eff %"], ["spargeGal", "Sparge (gal)"]].map(([k, label]) => (
            draft
              ? <Field key={k} label={label} type="number" value={r.batch?.[k]} onChange={(v) => setBatch(k, v)} />
              : <Stat key={k} label={label} v={r.batch?.[k]} />
          ))}
        </div>
        {!draft && r.yeast?.strain && (
          <Note>Yeast: {r.yeast.strain} · pitch {r.yeast.pitchF}°F · ferment {r.yeast.fermF}°F{r.yeast.raiseToF ? ` → ${r.yeast.raiseToF}°F` : ""} · {r.yeast.attenuationPct}% attenuation</Note>
        )}
        {draft && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
            <Field label="Yeast strain" value={r.yeast?.strain} onChange={(v) => set({ yeast: { ...r.yeast, strain: v } })} />
            <Field label="Pitch °F" type="number" value={r.yeast?.pitchF} onChange={(v) => set({ yeast: { ...r.yeast, pitchF: v } })} />
            <Field label="Ferm °F" type="number" value={r.yeast?.fermF} onChange={(v) => set({ yeast: { ...r.yeast, fermF: v } })} />
            <Field label="Raise °F" type="number" value={r.yeast?.raiseToF} onChange={(v) => set({ yeast: { ...r.yeast, raiseToF: v } })} />
          </div>
        )}
      </Panel>

      {/* ── grain bill: lbs + ppg + °L are inputs, % / GU / color computed ── */}
      <Panel title={`Grain bill (${(r.grains || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => addTo("grains", { name: "New grain", lbs: 1, ppg: 1.036, lov: 2 })}>+ Add</Tap>}>
        {draft && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ ...legend, fontSize: 10.5, fontWeight: 600, color: C.dim, marginBottom: 3 }}>Quick add from catalog (fills sugars + color)</div>
            <select value="" onChange={(e) => {
              const g = GRAIN_DB.find((x) => x.name === e.target.value);
              if (g) addTo("grains", { name: g.name, lbs: 1, ppg: g.ppg, lov: g.lov });
            }} style={{ ...mono, width: "100%", fontSize: 13, padding: "10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }}>
              <option value="">— pick a malt / fermentable —</option>
              {GRAIN_DB.map((g) => <option key={g.name} value={g.name}>{g.name}  ({g.ppg} ppg · {g.lov}°L)</option>)}
            </select>
          </label>
        )}
        {(r.grains || []).map((g, i) => {
          const cg = calc.grains[i] || {};
          return draft ? (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.9fr 0.8fr 0.9fr 0.7fr 1fr auto", gap: 6, alignItems: "end", marginBottom: 4 }}>
              <Field label={i === 0 ? "Grain" : ""} value={g.name} onChange={(v) => updList("grains", i, { name: v })} />
              <Field label={i === 0 ? "lbs" : ""} type="number" value={g.lbs} onChange={(v) => updList("grains", i, { lbs: v })} />
              <Field label={i === 0 ? "ppg" : ""} type="number" value={g.ppg} onChange={(v) => updList("grains", i, { ppg: v })} />
              <Field label={i === 0 ? "°L" : ""} type="number" value={g.lov} onChange={(v) => updList("grains", i, { lov: v })} />
              <div style={{ ...mono, fontSize: 11.5, color: C.glycol, paddingBottom: 12, textAlign: "right" }}>
                {i === 0 && <div style={{ ...legend, fontSize: 9.5, color: C.dim, marginBottom: 6 }}>ƒ % · GU</div>}
                {cg.pct?.toFixed(1)}% · {cg.points?.toFixed(0)}
              </div>
              <Tap onClick={() => dropFrom("grains", i)} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
            </div>
          ) : (
            <Row key={i} k={g.name} v={`${g.lbs} lb`} sub={`${cg.pct?.toFixed(1)}% of bill · ${cg.points?.toFixed(0)} GU · ${g.ppg || "?"} ppg · ${g.lov ?? "?"}°L`} ok />
          );
        })}
        <Note>Total {calc.totalLbs.toFixed(1)} lb → {calc.totalPts.toFixed(0)} gravity units before efficiency · {color.srm.toFixed(1)} SRM ({color.ebc.toFixed(0)} EBC).</Note>
      </Panel>

      {/* ── hops: oz/alpha/when are inputs, IBU is computed (Tinseth) ── */}
      <Panel title={`Hops & additions (${(r.hops || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => addTo("hops", { name: "Hop", oz: 1, alphaPct: 10, when: "60 min" })}>+ Add</Tap>}>
        {draft && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ ...legend, fontSize: 10.5, fontWeight: 600, color: C.dim, marginBottom: 3 }}>Quick add from catalog (fills typical α% — override with your bag's label)</div>
            <select value="" onChange={(e) => {
              const h = HOP_DB.find((x) => x.name === e.target.value);
              if (h) addTo("hops", { name: h.name, oz: 1, alphaPct: h.aa, when: "60 min" });
            }} style={{ ...mono, width: "100%", fontSize: 13, padding: "10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }}>
              <option value="">— pick a hop —</option>
              {HOP_DB.map((h) => <option key={h.name} value={h.name}>{h.name}  (~{h.aa}% α · {h.notes})</option>)}
            </select>
          </label>
        )}
        {(r.hops || []).map((h, i) => {
          const ch = calc.hops[i] || {};
          return draft ? (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.4fr 0.8fr auto", gap: 6, alignItems: "end", marginBottom: 4 }}>
              <Field label={i === 0 ? "Name" : ""} value={h.name} onChange={(v) => updList("hops", i, { name: v })} />
              <Field label={i === 0 ? "oz" : ""} type="number" value={h.oz} onChange={(v) => updList("hops", i, { oz: v })} />
              <Field label={i === 0 ? "α %" : ""} type="number" value={h.alphaPct} onChange={(v) => updList("hops", i, { alphaPct: v })} />
              <Field label={i === 0 ? "When (60 min, whirlpool, dry…)" : ""} value={h.when} onChange={(v) => updList("hops", i, { when: v })} />
              <div style={{ ...mono, fontSize: 11.5, color: C.glycol, paddingBottom: 12, textAlign: "right" }}>
                {i === 0 && <div style={{ ...legend, fontSize: 9.5, color: C.dim, marginBottom: 6 }}>ƒ IBU</div>}
                {ch.computedIbu != null ? ch.computedIbu.toFixed(1) : "—"}
              </div>
              <Tap onClick={() => dropFrom("hops", i)} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
            </div>
          ) : (
            <Row key={i} k={`${h.name} — ${h.oz} oz${h.alphaPct ? ` · ${h.alphaPct}% α` : ""}`}
              v={ch.computedIbu != null ? `${ch.computedIbu.toFixed(1)} IBU` : ""}
              sub={`${h.when}${h.note ? " · " + h.note : ""}`} ok />
          );
        })}
        <Note>ƒ IBU is Tinseth from oz × α × boil time (whirlpool counted as ~10 boil-minutes; dry hops contribute none). Total: {calc.ibuTotal.toFixed(0)} IBU.</Note>
      </Panel>

      {/* ── water calculator: source ppm + volumes + salt grams → computed profile ── */}
      <Panel title="Water & salts calculator">
        <div style={{ ...legend, fontSize: 10.5, fontWeight: 600, color: C.dim, marginBottom: 5 }}>Starting water (ppm — from your water report)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {IONS.map((ion) => draft
            ? <Field key={ion} label={ion} type="number" value={r.water?.source?.[ion]}
                onChange={(v) => set({ water: { ...r.water, source: { ...r.water?.source, [ion]: v } } })} />
            : <Stat key={ion} label={ion} v={r.water?.source?.[ion] ?? "—"} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
          {draft ? <>
            <Field label="Mash water (gal)" type="number" value={r.water?.mashGal} onChange={(v) => set({ water: { ...r.water, mashGal: v } })} />
            <Field label="Sparge water (gal)" type="number" value={r.water?.spargeGal} onChange={(v) => set({ water: { ...r.water, spargeGal: v } })} />
            <Field label="Grain temp (°F)" type="number" value={r.water?.grainTempF} onChange={(v) => set({ water: { ...r.water, grainTempF: v } })} />
            <Field label="Tun/transfer loss (°F)" type="number" value={r.water?.tunLossF} onChange={(v) => set({ water: { ...r.water, tunLossF: v } })} />
          </> : <>
            <Stat label="Mash water" v={`${r.water?.mashGal ?? "—"} gal`} />
            <Stat label="Sparge water" v={`${r.water?.spargeGal ?? "—"} gal`} />
            <Stat label="Grain temp" v={`${r.water?.grainTempF ?? 68}°F`} />
            <Stat label="Tun loss" v={`${r.water?.tunLossF ?? 2}°F`} />
          </>}
        </div>
        {strike.strikeF != null && (
          <div style={{ ...mono, fontSize: 11.5, color: C.glycol, marginTop: 8, padding: "8px 10px", background: C.bezel, borderRadius: 3, borderLeft: `3px solid ${C.glycol}88` }}>
            ƒ Strike: heat {r.water?.mashGal} gal to <b>{strike.strikeF.toFixed(1)}°F</b> ({strike.ratio.toFixed(2)} qt/lb, {strike.grainLbs.toFixed(1)} lb grain at {strike.grainT}°F, +{strike.lossF}°F tun loss) → mash lands at {strike.target}°F. Set your strike-water step target to this.
          </div>
        )}

        {["mash", "boil"].map((stage) => (
          <div key={stage} style={{ marginTop: 10 }}>
            <div style={{ ...legend, fontSize: 10.5, fontWeight: 600, color: C.dim, marginBottom: 5 }}>{stage} salts (g)</div>
            {(r.salts?.[stage] || []).map((s, i) => draft ? (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, marginBottom: 4 }}>
                <select value={s.name} onChange={(e) => set({ salts: { ...r.salts, [stage]: r.salts[stage].map((x, j) => j === i ? { ...x, name: e.target.value } : x) } })}
                  style={{ ...mono, fontSize: 13, padding: "10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }}>
                  {!SALT_NAMES.includes(s.name) && <option value={s.name}>{s.name}</option>}
                  {SALT_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <Field label="" type="number" value={s.g} onChange={(v) => set({ salts: { ...r.salts, [stage]: r.salts[stage].map((x, j) => j === i ? { ...x, g: v } : x) } })} />
                <Tap onClick={() => set({ salts: { ...r.salts, [stage]: r.salts[stage].filter((_, j) => j !== i) } })} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
              </div>
            ) : (
              <Row key={i} k={s.name} v={`${s.g} g`} ok />
            ))}
            {draft && <Tap color={C.live} pad="7px 11px" size={10.5}
              onClick={() => set({ salts: { ...r.salts, [stage]: [...(r.salts?.[stage] || []), { name: "Gypsum", g: 1 }] } })}>+ {stage} salt</Tap>}
          </div>
        ))}

        {/* computed resulting profile vs targets */}
        <div style={{ ...legend, fontSize: 10, color: C.dim, margin: "12px 0 6px" }}>ƒ Resulting profile (mash + sparge) vs target</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(78px,1fr))", gap: 6 }}>
          {IONS.map((ion) => {
            const got = water.all[ion], want = r.water?.targets?.[ion];
            const good = want == null || Math.abs(got - want) <= Math.max(20, want * 0.25);
            return (
              <div key={ion} style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderLeft: `3px solid ${good ? C.glycol : C.ember}88`, borderRadius: 3, padding: "8px 10px" }}>
                <div style={{ ...legend, fontSize: 9.5, fontWeight: 600, color: C.dim }}>ƒ {ion}</div>
                <div style={{ ...mono, fontSize: 14, color: good ? C.glycol : C.ember, marginTop: 2 }}>{got}</div>
                <div style={{ ...mono, fontSize: 9, color: C.faint }}>▸ {want ?? "—"}</div>
              </div>
            );
          })}
          <Computed label="Cl : SO₄" v={water.clSo4 != null ? water.clSo4.toFixed(2) : "—"} />
        </div>
        <Note>Cl:SO₄ over ~1.3 leans malty/full (NEIPA territory); under ~0.8 leans dry/bitter. Mash-only profile: {IONS.map((i2) => `${i2} ${water.mash[i2]}`).join(" · ")}. Target mash pH {r.water?.mashPh || "5.2–5.4"} — measure and trim with lactic acid; a pH model can come later.</Note>
      </Panel>

      {/* ── steps ── */}
      <div style={{ gridColumn: "1 / -1" }}>
        <Panel title={`Brew day steps (${(r.steps || []).length})`} right={draft &&
          <Tap color={C.live} pad="8px 12px" size={11} onClick={addStep}>+ Add step</Tap>}>
          {(r.steps || []).map((s, i) => (
            <div key={s.id ?? i}>
              <div onClick={() => draft && setOpenStep(openStep === i ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", marginBottom: 4, background: openStep === i ? C.raised : C.bezel, border: `1px solid ${openStep === i ? C.amber : C.ruleSoft}`, borderRadius: 3, cursor: draft ? "pointer" : "default" }}>
                <span style={{ ...mono, fontSize: 10, color: C.faint, width: 18, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontSize: 12 }}>{s.kind === "manual" ? "✋" : "🔥"}</span>
                <span style={{ ...legend, fontSize: 10.5, fontWeight: 700, width: 62, color: s.phase === "boil" ? C.ember : s.phase === "transfer" ? C.glycol : C.amber }}>{s.phase}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...legend, fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ ...mono, fontSize: 9.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[s.vessel && `${s.vessel}${s.target ? ` → ${s.target}°F` : ""}`, s.mins ? `${s.mins} min` : null,
                      s.autoAdvance === false ? "confirm to continue" : "auto-continues",
                      s.ingredients?.length ? `${s.ingredients.length} ingredient${s.ingredients.length > 1 ? "s" : ""}` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {draft && <span style={{ color: C.faint, fontSize: 11 }}>{openStep === i ? "▲" : "▼"}</span>}
              </div>

              {draft && openStep === i && (
                <div style={{ background: C.raised, border: `1px solid ${C.amber}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                    <Field label="Name" value={s.name} onChange={(v) => updStep(i, { name: v })} />
                    <Sel label="Phase" value={s.phase} opts={PHASES} onChange={(v) => updStep(i, { phase: v })} />
                    <Sel label="Kind" value={s.kind} opts={KINDS} onChange={(v) => updStep(i, { kind: v })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <Sel label="Vessel (hold/control)" value={s.vessel || ""} opts={["", ...config.vessels.map((v) => v.id)]} onChange={(v) => updStep(i, { vessel: v || null })} />
                    <Field label="Target °F" type="number" value={s.target} onChange={(v) => updStep(i, { target: v || null })} />
                    <Field label="Minutes" type="number" value={s.mins} onChange={(v) => updStep(i, { mins: v || 0 })} />
                    <div style={{ paddingTop: 16 }}>
                      <Tap on={s.autoAdvance !== false} color={C.glycol} pad="10px 12px" size={11}
                        onClick={() => updStep(i, { autoAdvance: s.autoAdvance === false })}>
                        auto-continue {s.autoAdvance !== false ? "on" : "off"}
                      </Tap>
                    </div>
                  </div>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    <div style={{ ...legend, fontSize: 10, color: C.faint, marginBottom: 3 }}>Instructions</div>
                    <textarea value={s.instructions || ""} onChange={(e) => updStep(i, { instructions: e.target.value })} rows={2}
                      style={{ ...mono, width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: 9, background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3, resize: "vertical" }} />
                  </label>
                  <div style={{ ...legend, fontSize: 10, color: C.faint, marginBottom: 4 }}>Ingredients called out on the step card</div>
                  {(s.ingredients || []).map((ing, k) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, marginBottom: 4 }}>
                      <Field label="" value={ing.name} onChange={(v) => updStep(i, { ingredients: s.ingredients.map((x, j) => j === k ? { ...x, name: v } : x) })} />
                      <Field label="" value={ing.amount} onChange={(v) => updStep(i, { ingredients: s.ingredients.map((x, j) => j === k ? { ...x, amount: v } : x) })} />
                      <Tap onClick={() => updStep(i, { ingredients: s.ingredients.filter((_, j) => j !== k) })} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <Tap color={C.live} pad="9px 13px" size={11} onClick={() => updStep(i, { ingredients: [...(s.ingredients || []), { name: "", amount: "" }] })}>+ ingredient</Tap>
                    <span style={{ flex: 1 }} />
                    <Tap color={C.dim} pad="9px 13px" size={11} onClick={() => moveStep(i, -1)}>↑ move up</Tap>
                    <Tap color={C.dim} pad="9px 13px" size={11} onClick={() => moveStep(i, 1)}>↓ move down</Tap>
                    <Tap color={C.ember} pad="9px 13px" size={11} onClick={() => confirm("Remove this step?") && removeStep(i)}>Remove</Tap>
                  </div>
                </div>
              )}
            </div>
          ))}
          <Note>✋ manual steps wait for you (with an optional countdown); 🔥 controlled steps heat a vessel and gate their timer on being at temperature. "Confirm to continue" holds with an alarm instead of flowing on. A manual step with a vessel + target keeps holding that temperature while you work.</Note>
        </Panel>
      </div>
    </div>
  </>);
}

function SummaryStat({ label, v, target, good }) {
  return (
    <div style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderLeft: `3px solid ${good === false ? C.ember : C.glycol}88`, borderRadius: 3, padding: "9px 11px" }}>
      <div style={{ ...legend, fontSize: 10, fontWeight: 600, color: C.dim }}>ƒ {label}</div>
      <div style={{ ...mono, fontSize: 19, color: good === false ? C.ember : C.glycol, marginTop: 3 }}>{v}</div>
      {target != null && <div style={{ ...mono, fontSize: 9.5, color: C.faint, marginTop: 1 }}>▸ {target}</div>}
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderRadius: 3, padding: "8px 10px" }}>
      <div style={{ ...legend, fontSize: 9.5, color: C.faint }}>{label}</div>
      <div style={{ ...mono, fontSize: 15, color: C.text, marginTop: 2 }}>{v ?? "—"}</div>
    </div>
  );
}

function Sel({ label, value, opts, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ ...legend, fontSize: 10, color: C.faint, marginBottom: 3 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...mono, width: "100%", fontSize: 13, padding: "10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }}>
        {opts.map((o) => <option key={o} value={o}>{o === "" ? "(none)" : o}</option>)}
      </select>
    </label>
  );
}
