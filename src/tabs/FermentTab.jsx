/** FermentTab — conical temp control (server-side hysteresis). */
import React, { useState, useEffect } from "react";
import { C, legend, mono, clamp } from "../theme.js";
import { Stepper, Pilot, Tap } from "../ui.jsx";
import Graph from "../Graph.jsx";
import { post, get } from "../api.js";

export default function FermentTab({ state, config }) {
  const ctrl = config.controllers.find((c) => c.type === "hysteresis");
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState(240);

  useEffect(() => {
    get(`/api/history?range=${range}`).then(setRows).catch(() => {});
    const id = setInterval(() => get(`/api/history?range=${range}`).then(setRows).catch(() => {}), 10000);
    return () => clearInterval(id);
  }, [range]);

  if (!ctrl) return <div style={{ color: C.faint }}>No fermenter controller configured — add one in Setup.</div>;

  const t = state.temps[ctrl.sensor]?.tempF;
  const fs = state.fermState;
  const target = ctrl.params.target, deadband = ctrl.params.deadband;
  const coolActor = config.actors.find((a) => a.id === ctrl.coolActor);
  const heatActor = config.actors.find((a) => a.id === ctrl.heatActor);
  const setP = (params) => post(`/api/controllers/${ctrl.id}`, params);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ ...legend, fontSize: 14, fontWeight: 700 }}>Conical</div>
          <Tap on={ctrl.enabled !== false} color={C.live} pad="8px 14px" size={11}
            onClick={() => setP({ enabled: ctrl.enabled === false })}>
            {ctrl.enabled !== false ? "Enabled" : "Disabled"}
          </Tap>
        </div>
        <div style={{ ...mono, fontSize: 56, lineHeight: 1, color: fs === "cooling" ? C.glycol : fs === "heating" ? C.amber : C.text }}>
          {t == null ? "—" : t.toFixed(1)}<span style={{ fontSize: 20, color: C.faint }}>°F</span>
        </div>
        <div style={{ ...legend, fontSize: 12, color: C.dim, marginTop: 8 }}>
          {fs === "idle" ? `in band ±${deadband}°F` : fs}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
          <Stepper label="Target" v={target} step={0.5} unit="°F" c={C.glycol}
            set={(v) => setP({ target: clamp(v, 34, 90) })} />
          <Stepper label="Deadband" v={deadband} step={0.1} unit="°F" c={C.glycol}
            set={(v) => setP({ deadband: clamp(+v.toFixed(1), 0.2, 3) })} />
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
          Chiller self-regulates its bath — this output only moves glycol. A tight deadband makes the pump chatter
          (a {ctrl.params.minHoldSec || 60}s minimum hold is enforced server-side).
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
          <Pilot label={coolActor?.name || "Glycol"} gpio={coolActor?.gpio} on={!!state.actorOn[ctrl.coolActor]} c={C.glycol} />
          <Pilot label={heatActor?.name || "Heat"} gpio={heatActor?.gpio} on={!!state.actorOn[ctrl.heatActor]} c={C.amber} />
        </div>
      </div>
      <Graph rows={rows} config={config} range={range} setRange={setRange} only={ctrl.sensor}
        refLine={target} domain={[Math.min(34, target - 10), Math.max(80, target + 10)]} title="Fermentation" />
    </div>
  );
}
