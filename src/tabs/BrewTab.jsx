/** BrewTab — brew-day panel: rig graphic, step engine, schedule, timers, chart. */
import React, { useState, useEffect } from "react";
import { C, legend, mono, fmt, fmtLong, clamp } from "../theme.js";
import { Read, Ring, Stepper, Tap, Big, Panel } from "../ui.jsx";
import Herms from "../Herms.jsx";
import Graph from "../Graph.jsx";
import { post, get } from "../api.js";

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
  const vessel = config.vessels.find((v) => v.id === step?.vessel);
  const sensed = vessel ? state.temps[vessel.sensor]?.tempF : null;
  const target = step?.target ?? 0;
  const pct = step?.mins ? 1 - st.left / (step.mins * 60) : 0;
  const isElementStep = vessel?.kind !== "fermenter";
  const wantSide = step?.vessel === "boil" ? "BOIL" : "HLT";
  const blocked = step && state.interlock !== wantSide;

  const pumpOn = !!state.actorOn?.recircPump;

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

    {/* step engine + schedule */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginBottom: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ ...legend, fontSize: 14, fontWeight: 700 }}>
            Step {st.active + 1} — {step?.name}
          </span>
          <span style={{ ...legend, fontSize: 11, color: C.faint }}>{vessel?.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <Ring pct={pct} live={st.running && st.atTemp} color={step?.kind === "boil" ? C.ember : C.amber}>
            <div style={{ ...mono, fontSize: 26, fontWeight: 500 }}>{step?.mins ? fmt(st.left) : "—"}</div>
            <div style={{ ...legend, fontSize: 9.5, color: C.faint }}>{step?.kind === "ramp" ? "ramp" : "remaining"}</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ ...mono, fontSize: 30, color: st.atTemp ? C.live : C.text }}>
              {sensed == null ? "—" : sensed.toFixed(1)}<span style={{ fontSize: 14, color: C.faint }}>°F</span>
            </div>
            <div style={{ ...mono, fontSize: 12, color: C.dim }}>target {target.toFixed(1)}°F</div>
            <div style={{ ...legend, fontSize: 11, marginTop: 6, color: blocked ? C.ember : st.atTemp ? C.live : C.amber }}>
              {blocked ? `blocked — interlock is ${state.interlock}` : st.atTemp ? "at temperature" : st.running ? "heating" : "held"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <Stepper label="Target" v={target} unit="°F" step={1} c={C.amber}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { target: clamp(v, 32, 215) } })} />
          <Stepper label="Duration" v={step?.mins ?? 0} unit="min" step={5} c={C.dim}
            set={(v) => post("/api/steps/update", { index: st.active, patch: { mins: clamp(v, 0, 240) } })} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Big onClick={() => post(st.running ? "/api/brew/hold" : "/api/brew/start")} color={st.running ? C.ember : C.live}>
            {st.running ? "Hold" : st.session ? "Resume" : "Start brew"}
          </Big>
          <Big onClick={() => post("/api/brew/next")} color={C.dim} ghost>Next</Big>
          {st.session && !st.running && (
            <Big onClick={() => confirm("End this brew session?") && post("/api/brew/end")} color={C.faint} ghost>End</Big>
          )}
        </div>
      </div>

      <Panel title="Schedule">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {st.steps.map((s, i) => (
            <div key={s.id ?? i} onClick={() => post("/api/brew/select", { index: i })}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 3, cursor: "pointer", background: i === st.active ? C.raised : C.bezel, border: `1px solid ${i === st.active ? C.amber : C.ruleSoft}`, opacity: i < st.active ? 0.5 : 1 }}>
              <span style={{ ...mono, fontSize: 11, color: C.faint, width: 14 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...legend, fontSize: 12.5, fontWeight: 600, color: i === st.active ? C.text : C.dim }}>{s.name}</div>
                <div style={{ ...mono, fontSize: 10, color: C.faint }}>{s.vessel} · {s.target}°F{s.mins ? ` · ${s.mins}m` : ""}</div>
              </div>
              {i < st.active && <span style={{ color: C.live, fontSize: 14 }}>✓</span>}
            </div>
          ))}
        </div>
        {step?.hops && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.ruleSoft}` }}>
            <div style={{ ...legend, fontSize: 11, color: C.faint, marginBottom: 6 }}>Hop additions</div>
            {step.hops.map((h) => (
              <div key={h.at} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ ...legend, fontSize: 11.5, color: st.firedHops.includes(`${step.id}-${h.at}`) ? C.faint : C.dim }}>{h.name}</span>
                <span style={{ ...mono, fontSize: 11, color: C.faint }}>@ {h.at}m</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>

    {/* interlock + pump + timers */}
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
        {/* manually-switched 120 V outlets — soft switches mirroring the wall switch */}
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
      refLine={target} domain={[40, 220]} />
  </>);
}

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
