/**
 * RecipeTab — brew setup: the whole brew sheet, editable.
 * Batch targets, grain bill, hops, salts, water, yeast, and the phased
 * step list (manual + controlled steps, times, temps, auto-advance).
 * Mirrors the structure of the brew spreadsheet.
 */
import React, { useState } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Row, Tap, Note, Field, Big } from "../ui.jsx";
import { put } from "../api.js";

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

      {/* ── batch ── */}
      <Panel title={draft ? "Batch" : `${r.name}`}>
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

      {/* ── grain bill ── */}
      <Panel title={`Grain bill (${(r.grains || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => addTo("grains", { name: "New grain", lbs: 1, pct: 0 })}>+ Add</Tap>}>
        {(r.grains || []).map((g, i) => draft ? (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, alignItems: "end", marginBottom: 4 }}>
            <Field label={i === 0 ? "Grain" : ""} value={g.name} onChange={(v) => updList("grains", i, { name: v })} />
            <Field label={i === 0 ? "lbs" : ""} type="number" value={g.lbs} onChange={(v) => updList("grains", i, { lbs: v })} />
            <Field label={i === 0 ? "%" : ""} type="number" value={g.pct} onChange={(v) => updList("grains", i, { pct: v })} />
            <Tap onClick={() => dropFrom("grains", i)} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
          </div>
        ) : (
          <Row key={i} k={g.name} v={`${g.lbs} lb`} sub={g.pct ? `${g.pct}% of bill` : ""} ok />
        ))}
        {!draft && <Note>Total {(r.grains || []).reduce((a, g) => a + (+g.lbs || 0), 0).toFixed(1)} lb</Note>}
      </Panel>

      {/* ── hops & additions ── */}
      <Panel title={`Hops & additions (${(r.hops || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => addTo("hops", { name: "Hop", oz: 1, when: "60 min" })}>+ Add</Tap>}>
        {(r.hops || []).map((h, i) => draft ? (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1.6fr auto", gap: 6, alignItems: "end", marginBottom: 4 }}>
            <Field label={i === 0 ? "Name" : ""} value={h.name} onChange={(v) => updList("hops", i, { name: v })} />
            <Field label={i === 0 ? "oz" : ""} type="number" value={h.oz} onChange={(v) => updList("hops", i, { oz: v })} />
            <Field label={i === 0 ? "When" : ""} value={h.when} onChange={(v) => updList("hops", i, { when: v })} />
            <Tap onClick={() => dropFrom("hops", i)} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
          </div>
        ) : (
          <Row key={i} k={`${h.name} — ${h.oz} oz`} v={h.ibu ? `${h.ibu} IBU` : ""} sub={`${h.when}${h.note ? " · " + h.note : ""}`} ok />
        ))}
      </Panel>

      {/* ── water & salts ── */}
      <Panel title="Water & salts">
        {r.water?.targets && !draft && (
          <div style={{ ...mono, fontSize: 11.5, color: C.dim, marginBottom: 10, lineHeight: 1.8 }}>
            targets&nbsp; {Object.entries(r.water.targets).map(([k, v]) => `${k} ${v}`).join(" · ")}<br />
            result&nbsp;&nbsp; {r.water.result ? Object.entries(r.water.result).filter(([k]) => k !== "clSo4Ratio").map(([k, v]) => `${k} ${v}`).join(" · ") : "—"}<br />
            mash pH {r.water?.mashPh || "—"} · sparge pH {r.water?.spargePh || "—"}
          </div>
        )}
        {["mash", "boil"].map((stage) => (
          <div key={stage} style={{ marginBottom: 8 }}>
            <div style={{ ...legend, fontSize: 10.5, color: C.faint, marginBottom: 5 }}>{stage} salts</div>
            {(r.salts?.[stage] || []).map((s, i) => draft ? (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, marginBottom: 4 }}>
                <Field label="" value={s.name} onChange={(v) => set({ salts: { ...r.salts, [stage]: r.salts[stage].map((x, j) => j === i ? { ...x, name: v } : x) } })} />
                <Field label="" type="number" value={s.g} onChange={(v) => set({ salts: { ...r.salts, [stage]: r.salts[stage].map((x, j) => j === i ? { ...x, g: v } : x) } })} />
                <Tap onClick={() => set({ salts: { ...r.salts, [stage]: r.salts[stage].filter((_, j) => j !== i) } })} color={C.faint} pad="10px 10px" size={11}>✕</Tap>
              </div>
            ) : (
              <Row key={i} k={s.name} v={`${s.g} g`} ok />
            ))}
            {draft && <Tap color={C.live} pad="7px 11px" size={10.5}
              onClick={() => set({ salts: { ...r.salts, [stage]: [...(r.salts?.[stage] || []), { name: "Salt", g: 0 }] } })}>+ {stage} salt</Tap>}
          </div>
        ))}
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
