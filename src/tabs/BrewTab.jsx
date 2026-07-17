/** BrewTab — brew-day panel: rig diagram, phased step runner, timers, chart. */
import React, { useState, useEffect } from "react";
import { C, legend, mono, fmt, fmtLong, clamp } from "../theme.js";
import { Read, Ring, Stepper, Tap, Big, Panel } from "../ui.jsx";
import Herms from "../Herms.jsx";
import Graph from "../Graph.jsx";
import { post, get } from "../api.js";

const PHASE_LABEL = { mash: "Mash", boil: "Boil", transfer: "Transfer & Ferment" };
const PHASE_COLOR = { mash: C.amber, boil: C.ember, transfer: C.glycol };

export default function BrewTab({ state, config }) {
  const [range, setRange] = useState(60);
  const [series, setSeries] = useState({});
  const [rows, setRows] = useState([]);
  const [selVessel, setSelVessel] = useState(null);

  useEffect(() => {
    get(`/api/history?range=${range}`).then(setRows).catch(() => {});
    const id = setInterval(() => get(`/api/history?range=${range}`).then(setRows).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [range]);

  const st = state.steps;
  const step = st.steps[st.active];
  const pumpOn = !!state.actorOn?.recircPump || state.manual?.recircPump === "on";

  return (<>
    <Herms config={config} state={state} onSelectVessel={(id) => setSelVessel(id === selVessel ? null : id)} />

    {selVessel && (() => {
      const v = config.vessels.find((x) => x.id === selVessel);
      if (!v) return null;
      const lvl = state.levels?.[v.id] ?? 0;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: C.raised, border: `1px solid ${C.amber}`, borderRadius: 4, padding: "12px 16px", marginTop: 10 }}>
          <span style={{ ...legend, fontSize: 13, fontWeight: 700 }}>{v.name} — fill level</span>
          <div style={{ minWidth: 220, flex: "0 1 260px" }}>
            <Stepper label={`of ${v.volumeGal} gal`} v={lvl} unit="gal" step={0.5} c={C.glycol}
              set={(x) => post(`/api/vessels/${v.id}/level`, { gal: Math.max(0, Math.min(v.volumeGal, x)) })} />
          </div>
          <span style={{ fontSize: 11, color: C.faint, flex: 1, minWidth: 160 }}>
            No level sensors on the shield — set this when you fill or transfer, and the sight glass follows.
          </span>
          <Tap onClick={() => setSelVessel(null)} color={C.faint} pad="8px 12px" size={11}>✕</Tap>
        </div>
      );
    })()}

    {/* readouts */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, margin: "12px 0" }}>
      {config.vessels.map((v) => {
        const r = state.temps[v.sensor];
        const d = v.element ? state.duties[v.element] || 0 : undefined;
        const colors = { hlt: C.amber, mash: C.live, boil: C.ember, ferm: C.glycol };
        const on = v.element ? d > 0 : v.id === "ferm" && state.fermState !== "idle";
        return <Read key={v.id} label={v.name} v={r?.tempF} fault={r?.fault} on={on}
          c={colors[v.id] || C.amber} bar={d}
          sub={v.element ? `${config.actors.find((a) => a.id === v.element)?.name || ""} · ${d}%`
            : v.kind === "mashtun" ? (pumpOn ? "coil · recirculating" : "coil · pump off")
            : v.id === "ferm" ? state.fermState : ""}
          warn={v.kind === "mashtun" && !pumpOn} />;
      })}
    </div>

    {/* step runner + schedule */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12, marginBottom: 12 }}>
      <StepRunner state={state} config={config} />
      <PhaseSchedule st={st} />
    </div>

    {/* interlock + outlets + timers */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginBottom: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
        <div style={{ ...legend, fontSize: 14, fontWeight: 700 }}>Element interlock</div>
        <div style={{ fontSize: 11.5, color: C.faint, margin: "3px 0 12px" }}>
          Hardware selector — only one element can be energized. This mirrors it; it can't override it.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(config.interlock?.positions || ["HLT", "OFF", "BOIL"]).map((p) => (
            <Tap key={p} on={state.interlock === p} onClick={() => post("/api/interlock", { position: p })}
              color={p === "OFF" ? C.dim : p === "HLT" ? C.amber : C.ember} pad="16px 26px" size={15}>{p}</Tap>
          ))}
        </div>
        {config.actors.some((a) => a.control === "manual") && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.ruleSoft}` }}>
            <div style={{ ...legend, fontSize: 11, color: C.faint, marginBottom: 8 }}>
              Manual 120 V outlets — flip these when you flip the real switch
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {config.actors.filter((a) => a.control === "manual").map((a) => {
                const isOn = state.manual[a.id] === "on";
                return (
                  <Tap key={a.id} on={isOn} color={C.live} pad="14px 20px" size={13}
                    onClick={() => post(`/api/actors/${a.id}`, { mode: isOn ? "off" : "on" })}>
                    {a.name} {isOn ? "on" : "off"}
                  </Tap>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Timers state={state} />
    </div>

    <Graph rows={rows} config={config} series={series} setSeries={setSeries} range={range} setRange={setRange}
      refLine={step?.target ?? undefined} domain={[40, 220]} />
  </>);
}

/* ── the step runner card ─────────────────────────────────── */
function StepRunner({ state, config }) {
  const st = state.steps;
  const step = st.steps[st.active];
  if (!step) return <Panel title="No recipe loaded">Load a recipe in the Recipe tab.</Panel>;

  const vessel = step.vessel ? config.vessels.find((v) => v.id === step.vessel) : null;
  const sensed = vessel ? state.temps[vessel.sensor]?.tempF : null;
  const pct = step.mins ? 1 - st.left / (step.mins * 60) : 0;
  const manual = step.kind === "manual";
  const wantSide = step.vessel === "boil" ? "BOIL" : step.vessel ? "HLT" : null;
  const blocked = !manual && wantSide && state.interlock !== wantSide;
  const pc = PHASE_COLOR[step.phase] || C.amber;

  const status = st.awaiting ? "done — confirm to continue"
    : blocked ? `blocked — interlock is ${state.interlock}, needs ${wantSide}`
    : !st.running && st.session ? "paused"
    : !st.session ? "ready"
    : manual ? (step.mins ? "counting down" : "waiting on you")
    : st.atTemp ? "at temperature" : "heating";

  return (
    <div style={{ background: C.card, border: `1px solid ${st.awaiting ? C.live : C.rule}`, borderRadius: 4, padding: 16 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ ...legend, fontSize: 11, fontWeight: 700, color: pc, border: `1px solid ${pc}`, borderRadius: 3, padding: "3px 8px" }}>
          {PHASE_LABEL[step.phase] || step.phase}
        </span>
        <span style={{ ...legend, fontSize: 11, color: C.faint }}>step {st.active + 1} / {st.steps.length}</span>
      </div>
      <div style={{ ...legend, fontSize: 16, fontWeight: 700, margin: "6px 0" }}>
        {manual && <span title="manual step" style={{ marginRight: 7 }}>✋</span>}{step.name}
      </div>

      {/* instructions + ingredients */}
      {step.instructions && (
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>{step.instructions}</div>
      )}
      {step.ingredients?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {step.ingredients.map((ing, i) => (
            <span key={i} style={{ ...mono, fontSize: 12, padding: "7px 10px", borderRadius: 3, background: C.bezel, border: `1px solid ${pc}`, color: C.text }}>
              {ing.name} <b style={{ color: pc }}>{ing.amount}</b>
            </span>
          ))}
        </div>
      )}

      {/* gauge row */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        {(step.mins > 0 || !manual) && (
          <Ring pct={step.mins ? pct : st.atTemp ? 1 : 0} live={st.running && (manual || st.atTemp)} color={pc}>
            <div style={{ ...mono, fontSize: 24, fontWeight: 500 }}>{step.mins ? fmt(st.left) : manual ? "—" : "ramp"}</div>
            {step.mins > 0 && <div style={{ ...legend, fontSize: 9.5, color: C.faint }}>remaining</div>}
          </Ring>
        )}
        <div style={{ flex: 1, minWidth: 150 }}>
          {vessel && (
            <>
              <div style={{ ...mono, fontSize: 28, color: st.atTemp ? C.live : C.text }}>
                {sensed == null ? "—" : sensed.toFixed(1)}<span style={{ fontSize: 13, color: C.faint }}>°F</span>
              </div>
              {step.target != null && <div style={{ ...mono, fontSize: 12, color: C.dim }}>target {(+step.target).toFixed(1)}°F · {vessel.name}</div>}
            </>
          )}
          <div style={{ ...legend, fontSize: 11.5, marginTop: 6, color: st.awaiting ? C.live : blocked ? C.ember : st.running ? pc : C.dim }}>
            {status}
          </div>
        </div>
      </div>

      {/* per-step tuning */}
      {!manual && step.target != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <Stepper label="Target" v={step.target} unit="°F" step={1} c={pc}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { target: clamp(v, 32, 215) } })} />
          <Stepper label="Duration" v={step.mins ?? 0} unit="min" step={5} c={C.dim}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { mins: clamp(v, 0, 240) } })} />
        </div>
      )}

      {/* boil vigor — a human call: the sensor reads the same at a simmer
          and an eruption, so the on/off ratio is yours to dial in */}
      {step.vessel === "boil" && (() => {
        const bc = config.controllers.find((c) => c.type === "power");
        if (!bc) return null;
        return (
          <div style={{ marginTop: 12, padding: "10px 12px", background: C.bezel, borderRadius: 3, border: `1px solid ${C.ruleSoft}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
              <Stepper label={`Boil vigor — % of time element is on once boiling (at ${state.boilingPointF ?? 212}°F here)`}
                v={bc.params.power} unit="%" step={5} c={C.ember}
                set={(v) => post(`/api/controllers/${bc.id}`, { power: clamp(v, 20, 100) })} />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              Watch the kettle, not the screen: nudge down if it's climbing the walls, up if it's lazy.
              The temp sensor can't tell a simmer from an eruption — this knob is yours.
            </div>
          </div>
        );
      })()}

      {/* controls */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {st.awaiting ? (
          <Big onClick={() => post("/api/brew/next")} color={C.live}>Continue → next step</Big>
        ) : manual && st.running && !step.mins ? (
          <Big onClick={() => post("/api/brew/next")} color={C.live}>Done — next step</Big>
        ) : st.running ? (
          <Big onClick={() => post("/api/brew/pause")} color={C.ember}>Pause</Big>
        ) : (
          <Big onClick={() => post("/api/brew/start")} color={C.live}>{st.session ? "Resume" : "Start brew"}</Big>
        )}
        <Big onClick={() => post("/api/brew/restart")} color={C.dim} ghost>Restart step</Big>
        {!st.awaiting && <Big onClick={() => post("/api/brew/next")} color={C.faint} ghost>Skip</Big>}
      </div>

      {/* auto-advance + end session */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Tap on={step.autoAdvance !== false} color={C.glycol} pad="9px 14px" size={11}
          onClick={() => post("/api/brew/auto", { index: st.active, auto: step.autoAdvance === false })}>
          auto-continue {step.autoAdvance !== false ? "on" : "off"}
        </Tap>
        <span style={{ fontSize: 10.5, color: C.faint, flex: 1 }}>
          {step.autoAdvance !== false ? "flows into the next step when done" : "will hold for your confirmation when done"}
        </span>
        {st.session && !st.running && !st.awaiting && (
          <Tap onClick={() => confirm("End this brew session?") && post("/api/brew/end")} color={C.faint} pad="9px 14px" size={11}>End session</Tap>
        )}
      </div>
    </div>
  );
}

/* ── phase-grouped schedule ───────────────────────────────── */
function PhaseSchedule({ st }) {
  const phases = [];
  st.steps.forEach((s, i) => {
    const last = phases[phases.length - 1];
    if (!last || last.phase !== (s.phase || "mash")) phases.push({ phase: s.phase || "mash", items: [] });
    phases[phases.length - 1].items.push({ ...s, i });
  });

  return (
    <Panel title={`Schedule — ${st.recipeName || ""}`}>
      <div style={{ maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
        {phases.map((ph) => {
          const pc = PHASE_COLOR[ph.phase] || C.amber;
          const done = ph.items.every((s) => s.i < st.active);
          return (
            <div key={ph.phase + ph.items[0].i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 6px" }}>
                <span style={{ ...legend, fontSize: 11, fontWeight: 700, color: done ? C.faint : pc }}>
                  {(PHASE_LABEL[ph.phase] || ph.phase).toUpperCase()}
                </span>
                <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
                {done && <span style={{ color: C.live, fontSize: 12 }}>✓</span>}
              </div>
              {ph.items.map((s) => (
                <div key={s.i} onClick={() => post("/api/brew/select", { index: s.i })}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", marginBottom: 4, borderRadius: 3, cursor: "pointer",
                    background: s.i === st.active ? C.raised : C.bezel,
                    border: `1px solid ${s.i === st.active ? pc : C.ruleSoft}`, opacity: s.i < st.active ? 0.45 : 1 }}>
                  <span style={{ ...mono, fontSize: 10, color: C.faint, width: 16, textAlign: "right" }}>{s.i + 1}</span>
                  <span style={{ fontSize: 11, width: 14, textAlign: "center" }}>
                    {s.i < st.active ? "✓" : s.kind === "manual" ? "✋" : "🔥"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...legend, fontSize: 12, fontWeight: 600, color: s.i === st.active ? C.text : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div style={{ ...mono, fontSize: 9.5, color: C.faint }}>
                      {[s.target ? `${s.target}°F` : null, s.mins ? `${s.mins}m` : null,
                        s.autoAdvance === false ? "confirm" : null].filter(Boolean).join(" · ") || "checklist"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── timers ───────────────────────────────────────────────── */
function Timers({ state }) {
  const [name, setName] = useState("");
  return (
    <Panel title="Timers" right={<span style={{ ...legend, fontSize: 10, color: C.faint }}>alerts push to your phone</span>}>
      {state.timers.length === 0 && <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>No timers running.</div>}
      {state.timers.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderRadius: 3 }}>
          <span style={{ ...mono, fontSize: 20, color: C.amber }}>{fmtLong(t.leftSec)}</span>
          <span style={{ ...legend, fontSize: 12, color: C.dim, flex: 1 }}>{t.name}</span>
          <Tap onClick={() => fetch(`/api/timers/${t.id}`, { method: "DELETE" })} color={C.faint} pad="8px 12px" size={11}>✕</Tap>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {[5, 10, 15, 30, 60].map((m) => (
          <Tap key={m} color={C.amber} pad="12px 16px" size={13}
            onClick={() => post("/api/timers", { name: name || `${m} min timer`, seconds: m * 60 })}>{m}m</Tap>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Timer name (whirlpool, chill…)"
        style={{ ...mono, width: "100%", boxSizing: "border-box", marginTop: 10, fontSize: 13, padding: "11px 10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }} />
    </Panel>
  );
}
