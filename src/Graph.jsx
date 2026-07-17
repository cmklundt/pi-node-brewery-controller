/** Graph.jsx — live + historical temperature chart (dynamic sensor set). */
import React from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { C, legend, mono } from "./theme.js";

const PALETTE = [C.amber, C.live, C.ember, C.glycol, "#B48EDE", "#E0C34E", "#6ED4B8"];

export function sensorColor(config, id) {
  const fixed = { hlt: C.amber, mash: C.live, boil: C.ember, ferm: C.glycol };
  if (fixed[id]) return fixed[id];
  const i = (config?.sensors || []).findIndex((s) => s.id === id);
  return PALETTE[i % PALETTE.length];
}

export default function Graph({ rows, config, series, setSeries, range, setRange, refLine, domain, only, title = "Measurements over time" }) {
  const sensorIds = only ? [only] : (config?.sensors || []).map((s) => s.id);
  const data = rows.map((r) => {
    const o = { t: r.t };
    for (const id of sensorIds) o[id] = r.temps?.[id]?.tempF ?? null;
    return o;
  });
  const fmtT = (v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ ...legend, fontSize: 14, fontWeight: 700 }}>{title}</span>
        {setRange && (
          <div style={{ display: "flex", gap: 6 }}>
            {[15, 60, 240, 1440].map((r) => (
              <button key={r} onClick={() => setRange(r)}
                style={{ ...legend, fontSize: 12, fontWeight: 600, padding: "8px 13px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${range === r ? C.dim : C.rule}`, background: range === r ? `${C.dim}22` : "transparent", color: range === r ? C.text : C.faint }}>
                {r < 60 ? `${r}m` : `${r / 60}h`}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={C.ruleSoft} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtT} tick={{ fill: C.faint, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}
              stroke={C.ruleSoft} tickLine={false} minTickGap={50} />
            <YAxis domain={domain || ["auto", "auto"]} tick={{ fill: C.faint, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}
              stroke={C.ruleSoft} tickLine={false} width={44} />
            {refLine != null && <ReferenceLine y={refLine} stroke={C.text} strokeDasharray="4 4" strokeOpacity={0.35} />}
            {sensorIds.filter((id) => only || !series || series[id] !== false).map((id) => (
              <Line key={id} type="monotone" dataKey={id} stroke={sensorColor(config, id)} dot={false}
                strokeWidth={id === "mash" ? 2.4 : 1.7} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!only && setSeries && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {sensorIds.map((id) => {
            const c = sensorColor(config, id);
            const onS = !series || series[id] !== false;
            return (
              <div key={id} onClick={() => setSeries((s) => ({ ...s, [id]: !(s?.[id] !== false) }))}
                style={{ ...legend, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "8px 12px", borderRadius: 3, border: `1px solid ${onS ? c : C.ruleSoft}`, color: onS ? c : C.faint, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 12, height: 2, background: onS ? c : C.dead }} />{id}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
