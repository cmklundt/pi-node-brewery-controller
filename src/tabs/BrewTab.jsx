/** BrewTab — brew-day panel: rig diagram, phased step runner, timers, chart. */
import React, { useState, useEffect } from "react";
import { C, legend, mono, fmt, fmtLong, clamp } from "../theme.js";
import { Read, Ring, Stepper, Tap, Big, Panel } from "../ui.jsx";
import Herms from "../Herms.jsx";
import Graph from "../Graph.jsx";
import { post, get } from "../api.js";
import { computeBackSolve, computeGravityPlan } from "../brewcalc.js";

const PHASE_LABEL = { mash: "Mash", boil: "Boil", transfer: "Transfer & Ferment" };
const PHASE_COLOR = { mash: C.amber, boil: C.ember, transfer: C.glycol };

// resolve a step's volume checkpoint to a target gallons + the loss-model rate
export function checkpointTarget(recipe, stage) {
  const b = computeBackSolve(recipe);
  return { preBoil: b.preBoil, postBoil: b.postBoilHot, fermenter: b.fermenterVol, keg: b.kegTarget }[stage] ?? 0;
}

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
  const pumpOn = (state.activeFlows || []).includes("recirc"); // wort pump running + hose on the HERMS loop
  // active step's volume target → a "stop here" line on the destination kettle
  const targetLevels = step?.volumeCheck
    ? { [step.volumeCheck.vessel]: checkpointTarget(config.recipe, step.volumeCheck.stage) } : null;

  return (<>
    <Herms config={config} state={state} targetLevels={targetLevels} onSelectVessel={(id) => setSelVessel(id === selVessel ? null : id)} />

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

    {/* readouts — each vessel card also hosts the pump(s) whose source is
        that vessel (on/off + line selector), so control lives with the tank */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10, margin: "12px 0", alignItems: "start" }}>
      {config.vessels.map((v) => {
        const r = state.temps[v.sensor];
        const d = v.element ? state.duties[v.element] || 0 : undefined;
        const colors = { hlt: C.amber, mash: C.live, boil: C.ember, ferm: C.glycol };
        const on = v.element ? d > 0 : v.id === "ferm" && state.fermState !== "idle";
        const homedPumps = pumpsForVessel(config, v.id);
        return <Read key={v.id} label={v.name} v={r?.tempF} fault={r?.fault} on={on}
          c={colors[v.id] || C.amber} bar={d}
          sub={v.element ? `${config.actors.find((a) => a.id === v.element)?.name || ""} · ${d}%`
            : v.kind === "mashtun" ? (pumpOn ? "coil · recirculating" : "coil · pump off")
            : v.id === "ferm" ? state.fermState : ""}
          warn={v.kind === "mashtun" && !pumpOn}
          footer={homedPumps.length > 0 && <PumpFooter config={config} state={state} pumps={homedPumps} />} />;
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
            <div style={{ ...legend, fontSize: 12, color: C.faint, marginBottom: 8 }}>
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
        <span style={{ ...legend, fontSize: 12, fontWeight: 700, color: pc, border: `1px solid ${pc}`, borderRadius: 3, padding: "3px 8px" }}>
          {PHASE_LABEL[step.phase] || step.phase}
        </span>
        <span style={{ ...legend, fontSize: 12, color: C.faint }}>step {st.active + 1} / {st.steps.length}</span>
      </div>
      <div style={{ ...legend, fontSize: 16, fontWeight: 700, margin: "6px 0" }}>
        {manual && <span title="manual step" style={{ marginRight: 7 }}>✋</span>}{step.name}
      </div>

      {/* instructions + ingredients */}
      {step.instructions && (
        <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>{step.instructions}</div>
      )}
      {step.ingredients?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {step.ingredients.map((ing, i) => (
            <span key={i} style={{ ...mono, fontSize: 13, padding: "9px 12px", borderRadius: 3, background: C.bezel, border: `1px solid ${pc}`, color: C.text }}>
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
          <div style={{ ...legend, fontSize: 12.5, marginTop: 6, color: st.awaiting ? C.live : blocked ? C.ember : st.running ? pc : C.dim }}>
            {status}
          </div>
        </div>
      </div>

      {/* volume checkpoint — measure vs plan, correct, and stop the
          transfer when the destination hits target */}
      {step.volumeCheck && <VolumeCheck step={step} config={config} state={state} />}

      {/* pump routing this step expects — flags a mis-set line before you
          pump wort the wrong way; tap Set to apply */}
      {step.routes && (() => {
        const flows = config.flows || [];
        const vessels = config.vessels || [];
        const fname = (fid) => flows.find((f) => f.id === fid)?.name || fid;
        const pname = (pid) => config.actors.find((a) => a.id === pid)?.name || pid;
        const entries = Object.entries(step.routes);
        const wrong = entries.filter(([pump, fid]) => (state.routes?.[pump] ?? flows.find((f) => f.pump === pump)?.id) !== fid);
        const ok = wrong.length === 0;
        return (
          <div style={{ marginTop: 12, padding: "9px 12px", background: C.bezel, borderRadius: 3, border: `1px solid ${ok ? C.ruleSoft : C.amber}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...legend, fontSize: 10.5, fontWeight: 700, color: ok ? C.live : C.amber }}>
                {ok ? "✓ pumps routed for this step" : "⚠ check pump routing"}
              </span>
              <div style={{ flex: 1 }} />
              {!ok && (
                <Tap color={C.amber} pad="8px 14px" size={11}
                  onClick={() => entries.forEach(([pump, fid]) => post("/api/flows/route", { pump, flowId: fid }))}>
                  Set lines
                </Tap>
              )}
            </div>
            <div style={{ ...mono, fontSize: 10.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
              {entries.map(([pump, fid]) => `${pname(pump)} → ${fname(fid)}`).join("  ·  ")}
            </div>
          </div>
        );
      })()}

      {/* live duty cycle of whichever element this step drives (HERMS:
          mash steps drive the HLT element), with Auto/Manual override.
          Boil steps keep their own richer panel below — no toggle here. */}
      {(() => {
        if (!step.vessel) return null;
        const ctrl = config.controllers.find((c) => c.vessel === step.vessel && c.type !== "hysteresis");
        const actorId = ctrl?.actor;
        if (!actorId) return null;
        const actor = config.actors.find((a) => a.id === actorId);
        const duty = state.duties?.[actorId] ?? 0;
        const onNow = !!state.actorOn?.[actorId];
        const isPid = ctrl.type === "pid";
        const isManual = ctrl.params.manualDuty != null;
        return (
          <div style={{ marginTop: 12, padding: "8px 11px", background: C.bezel, borderRadius: 3, border: `1px solid ${isManual ? C.amber : duty > 0 ? C.ember + "66" : C.ruleSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: onNow ? C.ember : C.dead, boxShadow: onNow ? `0 0 6px ${C.ember}` : "none" }} />
              <span style={{ ...legend, fontSize: 11.5, fontWeight: 600, color: C.dim, whiteSpace: "nowrap" }}>
                {(actor?.name || actorId).toUpperCase()} DUTY
              </span>
              <div style={{ flex: 1, height: 5, background: C.dead, borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${duty}%`, background: isManual ? C.amber : C.ember, borderRadius: 2, transition: "width .4s" }} />
              </div>
              <span style={{ ...mono, fontSize: 14, color: duty > 0 ? (isManual ? C.amber : C.ember) : C.faint, width: 42, textAlign: "right" }}>{duty}%</span>
              {isPid && <>
                <Tap on={!isManual} color={C.dim} pad="7px 11px" size={10}
                  onClick={() => post(`/api/controllers/${ctrl.id}`, { manualDuty: null })}>auto</Tap>
                <Tap on={isManual} color={C.amber} pad="7px 11px" size={10}
                  onClick={() => post(`/api/controllers/${ctrl.id}`, { manualDuty: duty })}>manual</Tap>
              </>}
            </div>
            {isPid && isManual && (
              <div style={{ marginTop: 8 }}>
                <Stepper label="Manual duty — PID off; HERMS overshoot cap and interlock still apply" v={ctrl.params.manualDuty} unit="%" step={5} c={C.amber}
                  set={(v) => post(`/api/controllers/${ctrl.id}`, { manualDuty: clamp(v, 0, 100) })} />
              </div>
            )}
          </div>
        );
      })()}

      {/* per-step tuning — live: changes apply on the next control tick,
          including during manual hold-steps and confirm-holds */}
      {step.target != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <Stepper label="Target" v={step.target} unit="°F" step={1} c={pc}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { target: clamp(v, 32, 215) } })} />
          <Stepper label="Duration" v={step.mins ?? 0} unit="min" step={5} c={C.dim}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { mins: clamp(v, 0, 240) } })} />
        </div>
      )}

      {/* boil duty — a human call: the sensor reads the same at a simmer
          and an eruption, so the on/off ratio is yours to dial in. Auto
          ramps at 100% then holds the vigor %; Manual is direct duty
          control for the whole phase (ride the hot break down). */}
      {step.vessel === "boil" && (() => {
        const bc = config.controllers.find((c) => c.type === "power");
        if (!bc) return null;
        const isManual = bc.params.manualDuty != null;
        const liveDuty = state.duties[bc.actor] ?? 0;
        return (
          <div style={{ marginTop: 12, padding: "10px 12px", background: C.bezel, borderRadius: 3, border: `1px solid ${isManual ? C.ember : C.ruleSoft}` }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <Tap on={!isManual} color={C.dim} pad="8px 13px" size={11}
                onClick={() => post(`/api/controllers/${bc.id}`, { manualDuty: null })}>Auto</Tap>
              <Tap on={isManual} color={C.ember} pad="8px 13px" size={11}
                onClick={() => post(`/api/controllers/${bc.id}`, { manualDuty: liveDuty || bc.params.power })}>Manual duty</Tap>
              <span style={{ ...mono, fontSize: 12, color: C.faint, marginLeft: "auto" }}>
                element now: <b style={{ color: liveDuty > 0 ? C.ember : C.faint }}>{liveDuty}%</b>
              </span>
            </div>
            {isManual ? (
              <Stepper label={`Manual duty — direct on/off ratio, all of boil phase (boils at ${state.boilingPointF ?? 212}°F here)`}
                v={bc.params.manualDuty} unit="%" step={5} c={C.ember}
                set={(v) => post(`/api/controllers/${bc.id}`, { manualDuty: clamp(v, 0, 100) })} />
            ) : (
              <Stepper label={`Boil vigor — % once boiling (100% during ramp; boils at ${state.boilingPointF ?? 212}°F here)`}
                v={bc.params.power} unit="%" step={5} c={C.ember}
                set={(v) => post(`/api/controllers/${bc.id}`, { power: clamp(v, 20, 100) })} />
            )}
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              {isManual
                ? "You own the element. Classic use: drop to 60–70% as the hot break foams up, then back to your vigor number. Auto restores ramp-then-vigor."
                : "Watch the kettle, not the screen: nudge down if it's climbing the walls, up if it's lazy. Switch to Manual to control duty during the ramp too."}
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
        <span style={{ fontSize: 11.5, color: C.faint, flex: 1 }}>
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
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 11px", marginBottom: 5, borderRadius: 3, cursor: "pointer",
                    background: s.i === st.active ? C.raised : C.bezel,
                    border: `1px solid ${s.i === st.active ? pc : C.ruleSoft}`, opacity: s.i < st.active ? 0.45 : 1 }}>
                  <span style={{ ...mono, fontSize: 10, color: C.faint, width: 16, textAlign: "right" }}>{s.i + 1}</span>
                  <span style={{ fontSize: 11, width: 14, textAlign: "center" }}>
                    {s.i < st.active ? "✓" : s.kind === "manual" ? "✋" : "🔥"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...legend, fontSize: 13, fontWeight: 600, color: s.i === st.active ? C.text : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div style={{ ...mono, fontSize: 10.5, color: C.faint }}>
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

/* ── volume checkpoint on a step ──────────────────────────────
 * Shows the planned target for a vessel, a live "stop transfer" alert
 * when it's reached, and a measured-vs-target correction (top up if
 * short, boil down or accept lower gravity if over). */
function VolumeCheck({ step, config, state }) {
  const [measVol, setMeasVol] = useState("");
  const [measSG, setMeasSG] = useState("");
  const vc = step.volumeCheck;
  const target = checkpointTarget(config.recipe, vc.stage);
  const vessel = config.vessels.find((v) => v.id === vc.vessel);
  const live = state.levels?.[vc.vessel] ?? 0;
  const reached = live >= target - 0.05;
  const gravityStage = vc.stage === "preBoil" || vc.stage === "postBoil";
  const stageLabel = { preBoil: "pre-boil (in the kettle)", postBoil: "post-boil", fermenter: "into the fermenter", keg: "into the keg" }[vc.stage] || vc.stage;

  const mv = parseFloat(measVol), sg = parseFloat(measSG);
  const gp = gravityStage && Number.isFinite(mv) && Number.isFinite(sg) ? computeGravityPlan(config.recipe, mv, sg) : null;
  const volDiff = Number.isFinite(mv) ? mv - target : null;

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: C.bezel, borderRadius: 3, border: `1px solid ${reached ? C.live : C.ruleSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...legend, fontSize: 11, fontWeight: 700, color: C.dim }}>Volume check — {vessel?.name}, {stageLabel}</span>
        <div style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 12, color: C.faint }}>plan</span>
        <span style={{ ...mono, fontSize: 16, color: C.glycol }}>{target.toFixed(2)}<span style={{ fontSize: 9.5, color: C.faint }}> gal</span></span>
      </div>

      {/* live fill vs plan — the "stop transfer" signal */}
      <div style={{ marginTop: 8 }}>
        <div style={{ position: "relative", height: 8, background: C.dead, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (live / Math.max(target, 0.1)) * 100)}%`, background: reached ? C.live : C.glycol, transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ ...mono, fontSize: 10.5, color: C.faint }}>now {live.toFixed(2)} gal</span>
          {reached
            ? <span style={{ ...legend, fontSize: 11, fontWeight: 700, color: C.live }}>✋ STOP — plan volume reached</span>
            : <span style={{ ...mono, fontSize: 10.5, color: C.amber }}>{(target - live).toFixed(2)} gal to go</span>}
        </div>
      </div>

      {/* measured volume + gravity → GRAVITY-FIRST correction */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ ...legend, fontSize: 10.5, color: C.faint }}>measured</span>
        <input type="number" value={measVol} onChange={(e) => setMeasVol(e.target.value)} placeholder="gal"
          style={{ ...mono, width: 70, fontSize: 13, padding: "8px 8px", background: C.card, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }} />
        {gravityStage && <>
          <span style={{ ...legend, fontSize: 10.5, color: C.faint }}>@ SG</span>
          <input type="number" value={measSG} onChange={(e) => setMeasSG(e.target.value)} placeholder="1.0__"
            style={{ ...mono, width: 84, fontSize: 13, padding: "8px 8px", background: C.card, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }} />
        </>}
        {volDiff != null && <span style={{ ...mono, fontSize: 12, color: Math.abs(volDiff) < 0.1 ? C.live : C.amber }}>{volDiff >= 0 ? "+" : ""}{volDiff.toFixed(2)} gal vs plan</span>}
      </div>

      {/* gravity-first recommendation */}
      {gp && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: C.card, borderRadius: 3, borderLeft: `3px solid ${C.live}` }}>
          <div style={{ ...legend, fontSize: 10, fontWeight: 700, color: C.live, marginBottom: 4 }}>Hit your OG — don't dilute</div>
          <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.55 }}>
            {gp.boilOffToOg > 0.05
              ? <>Boil off <b style={{ color: C.glycol }}>{gp.boilOffToOg.toFixed(2)} gal</b> more (to {gp.postBoilForOg.toFixed(2)} gal post-boil) to land on OG {(+config.recipe.batch.ogTarget).toFixed(3)}.</>
              : gp.boilOffToOg < -0.05
                ? <>You're already below the OG volume — you have <b style={{ color: C.amber }}>more sugar than planned</b>. Add up to {(-gp.boilOffToOg).toFixed(2)} gal water to reach OG at a fuller batch, or boil as-is for a higher OG.</>
                : <>Right on — boil as planned.</>}
          </div>
          <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 5 }}>
            → yields <b style={{ color: gp.kegShortfall > 0.05 ? C.amber : C.live }}>{gp.kegAtOg.toFixed(2)} gal to keg</b> at target OG
            {gp.kegShortfall > 0.05 && ` (${gp.kegShortfall.toFixed(2)} gal shy of full — take it; beats a watered-down beer)`}
            {gp.kegShortfall < -0.05 && ` (${(-gp.kegShortfall).toFixed(2)} gal over a full keg — bonus)`}
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>
            Boil to plan volume instead → OG {gp.ogIfPlanned.toFixed(3)} (vs target {(+config.recipe.batch.ogTarget).toFixed(3)}).
          </div>
        </div>
      )}
      {gravityStage && !gp && Number.isFinite(mv) && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Enter the measured gravity too for the gravity-first call.</div>
      )}
    </div>
  );
}

/* ── pump controls, hosted inside a vessel readout card ───────
 * A pump lives on the card of its source vessel (water pump → HLT,
 * wort pump → Mash). Shows on/off + a line selector so you tap the
 * destination you want — no fiddling with the little diagram valve. */
export function pumpsForVessel(config, vesselId) {
  const flows = config.flows || [];
  return (config.actors || []).filter((a) => a.role === "pump").filter((a) => {
    const home = a.homeVessel ?? flows.find((f) => f.pump === a.id)?.from;
    return home === vesselId;
  });
}

function PumpFooter({ config, state, pumps }) {
  const flows = config.flows || [];
  const vessels = config.vessels || [];
  const vn = (id) => vessels.find((v) => v.id === id)?.name || id;
  const shortLabel = (f) => f.via ? "Recirc" : f.from === f.to ? "Circulate" : `→ ${vn(f.to)}`;

  return pumps.map((pump) => {
    const pflows = flows.filter((f) => f.pump === pump.id);
    const routedId = state.routes?.[pump.id] ?? pflows[0]?.id;
    const running = !!state.actorOn?.[pump.id] || state.manual?.[pump.id] === "on";
    return (
      <div key={pump.id} style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${C.ruleSoft}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: running ? C.live : C.dead, boxShadow: running ? `0 0 6px ${C.live}` : "none" }} />
          <span style={{ ...legend, fontSize: 11, fontWeight: 600, color: running ? C.live : C.dim, flex: 1, whiteSpace: "nowrap" }}>{pump.name}</span>
          <Tap on={running} color={C.live} pad="8px 14px" size={11}
            onClick={() => post(`/api/actors/${pump.id}`, { mode: running ? "off" : "on" })}>
            {running ? "On" : "Off"}
          </Tap>
        </div>
        {pflows.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pflows.map((f) => {
              const active = f.id === routedId;
              const col = f.kind === "water" ? C.glycol : C.live;
              return (
                <Tap key={f.id} on={active} color={col} pad="9px 12px" size={11}
                  onClick={() => post("/api/flows/route", { pump: pump.id, flowId: f.id })}>
                  {shortLabel(f)}
                </Tap>
              );
            })}
          </div>
        )}
      </div>
    );
  });
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
