/**
 * Herms.jsx — live piping & instrumentation diagram of the rig.
 *
 * Everything is driven by config + live state:
 *  - vessels[] draws each kettle to scale (volumeGal) in a Blichmann-ish
 *    style with a sight glass showing the current fill (levelGal —
 *    tap a kettle to set it, since the shield has no level sensors)
 *  - flows[] draws the piping; a path animates while its pump runs,
 *    whether that pump is a shield relay (GPIO) or a manually-switched
 *    120 V outlet mirrored with a soft switch (tap the pump to toggle)
 *  - element glow + duty bars follow the SSR drive, temps overlay live,
 *    glycol/heat jackets light on the fermenter
 */
import React from "react";
import { C, legend, mono } from "./theme.js";

const VW = 250;            // slot width per vessel
const FLOOR = 268;         // kettle bottoms sit on this line
const RAIL0 = 302;         // first piping rail
const RAIL_GAP = 30;

const STEEL = "#39434F";
const STEEL_HI = "#4C5866";
const WATER = "#3D5A6E";
const WORT = "#8A5A28";

export default function Herms({ config, state, onSelectVessel }) {
  if (!config || !state) return null;
  const vessels = config.vessels || [];
  const flows = config.flows || [];
  const w = Math.max(4, vessels.length) * VW;
  const pumpCount = new Set(flows.map((f) => f.pump)).size;
  const h = RAIL0 + Math.max(1, pumpCount) * RAIL_GAP + 26;

  const slot = (id) => vessels.findIndex((v) => v.id === id);
  const temp = (v) => state.temps?.[v.sensor];
  const target = (v) => (state.controllers || []).find((x) => x.enabled && x.sensor === v.sensor)?.activeTarget ?? null;
  const duty = (id) => (id ? state.duties?.[id] || 0 : 0);
  const on = (id) => !!state.actorOn?.[id] || state.manual?.[id] === "on";
  const level = (v) => state.levels?.[v.id] ?? v.levelGal ?? 0;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "10px 8px 2px", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: Math.min(w, 780), display: "block" }}>
        <defs>
          <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={STEEL} /><stop offset="0.18" stopColor={STEEL_HI} />
            <stop offset="0.5" stopColor={STEEL} /><stop offset="0.82" stopColor={STEEL_HI} />
            <stop offset="1" stopColor={STEEL} />
          </linearGradient>
          <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={WATER} /><stop offset="1" stopColor="#2E4657" />
          </linearGradient>
          <linearGradient id="wort" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={WORT} /><stop offset="1" stopColor="#5C3D1D" />
          </linearGradient>
        </defs>

        {vessels.map((v, i) => v.kind === "conical"
          ? <Conical key={v.id} x={i * VW + 30} v={v} tempR={temp(v)} targetF={target(v)}
              levelGal={level(v)} glycolOn={on("glycolPump")} heatOn={on("fermentHeat")}
              onTap={() => onSelectVessel?.(v.id)} />
          : <Kettle key={v.id} x={i * VW + 26} v={v} tempR={temp(v)} targetF={target(v)}
              levelGal={level(v)} elementDuty={duty(v.element)} elementOn={on(v.element)}
              coil={v.graphic === "kettle-coil"} mash={v.kind === "mashtun"}
              boilF={state.boilingPointF ?? 212}
              onTap={() => onSelectVessel?.(v.id)} />
        )}

        {/* one line per PUMP → its currently-routed destination. This is a
            read-only schematic; pump on/off + line selection live in the
            vessel cards below. */}
        {[...new Set(flows.map((f) => f.pump))].map((pumpId, i) => {
          const pflows = flows.filter((f) => f.pump === pumpId);
          const routedId = state.routes?.[pumpId] ?? pflows[0]?.id;
          const f = pflows.find((x) => x.id === routedId) || pflows[0];
          if (!f) return null;
          return (
            <FlowPath key={pumpId} flow={f} rail={RAIL0 + i * RAIL_GAP} vessels={vessels} slot={slot}
              running={on(pumpId)} pumpActor={config.actors.find((a) => a.id === pumpId)} />
          );
        })}
      </svg>
    </div>
  );
}

/* kettle geometry shared with FlowPath */
function kettleGeom(v, x) {
  const W = 176;
  const H = Math.round(120 + (v.volumeGal || 10) * 5.4);  // 15 gal ≈ 201, 20 gal ≈ 228
  const top = FLOOR - H;
  return { x, W, H, top, cx: x + W / 2 };
}

function Kettle({ x, v, tempR, targetF, levelGal, elementDuty, elementOn, coil, mash, boilF = 212, onTap }) {
  const { W, H, top, cx } = kettleGeom(v, x);
  const tempF = tempR?.tempF;
  const fault = tempR?.fault;
  const hot = elementDuty > 0;
  const frac = Math.max(0, Math.min(1, (levelGal || 0) / (v.volumeGal || 1)));
  const innerTop = top + 14, innerBot = FLOOR - 10;
  const liqH = (innerBot - innerTop) * frac;
  const liqY = innerBot - liqH;

  return (
    <g onClick={onTap} style={{ cursor: "pointer" }}>
      {/* shell */}
      <rect x={x} y={top} width={W} height={H} rx="7" fill="url(#steel)" stroke="#222B34" strokeWidth="1.5" />
      {/* rolled rim + tri-clad base band */}
      <rect x={x - 4} y={top - 5} width={W + 8} height="9" rx="4.5" fill={STEEL_HI} stroke="#222B34" strokeWidth="1" />
      <rect x={x + 2} y={FLOOR - 16} width={W - 4} height="12" rx="3" fill="#2E3742" />
      {/* handles */}
      <path d={`M ${x - 3} ${top + 34} q -12 12 0 24`} fill="none" stroke="#232C35" strokeWidth="5" strokeLinecap="round" />
      <path d={`M ${x + W + 3} ${top + 34} q 12 12 0 24`} fill="none" stroke="#232C35" strokeWidth="5" strokeLinecap="round" />
      {/* liquid */}
      {frac > 0.01 && (
        <>
          <rect x={x + 5} y={liqY} width={W - 10} height={liqH} rx="4" fill={mash ? "url(#wort)" : "url(#liq)"} opacity="0.92" />
          <ellipse cx={cx} cy={liqY} rx={(W - 10) / 2} ry="4" fill={mash ? "#9A6A33" : "#4E7186"} opacity="0.8" />
        </>
      )}
      {/* mash bed */}
      {mash && frac > 0.05 && <rect x={x + 10} y={Math.max(liqY + 8, FLOOR - 60)} width={W - 20} height={Math.min(44, innerBot - liqY - 8)} rx="4" fill="#3A2C1C" opacity=".85" />}
      {/* HERMS coil */}
      {coil && (
        <g stroke={C.glycol} strokeWidth="3" fill="none" opacity="0.8">
          {[0, 1, 2].map((i) => <ellipse key={i} cx={cx} cy={FLOOR - 52 + i * 13} rx="46" ry="6.5" />)}
        </g>
      )}
      {/* steam near the LOCAL boiling point (altitude-aware) */}
      {tempF > boilF - 6 && [0, 1, 2].map((i) => (
        <path key={i} d={`M ${x + 44 + i * 40} ${top - 12} q 6 -9 0 -18 q -6 -9 0 -16`}
          fill="none" stroke={C.dim} strokeWidth="2" opacity="0.5" style={{ animation: `pulse ${1.2 + i * .3}s infinite` }} />
      ))}
      {/* sight glass */}
      <g>
        <rect x={x + W + 7} y={innerTop} width="9" height={innerBot - innerTop} rx="4" fill="#161C23" stroke="#222B34" />
        {frac > 0.01 && <rect x={x + W + 9} y={liqY} width="5" height={liqH} rx="2.5" fill={mash ? WORT : "#5B87A2"} />}
        {Array.from({ length: Math.floor((v.volumeGal || 0) / 5) }, (_, i) => {
          const g5 = (i + 1) * 5;
          const ty = innerBot - (innerBot - innerTop) * (g5 / v.volumeGal);
          return <line key={g5} x1={x + W + 16} x2={x + W + 21} y1={ty} y2={ty} stroke={C.faint} strokeWidth="1" />;
        })}
        <text x={x + W + 12} y={innerBot + 14} textAnchor="middle" fill={C.faint} fontSize="10.5" style={mono}>
          {levelGal ?? 0}g
        </text>
      </g>
      {/* spigot */}
      <path d={`M ${x - 2} ${FLOOR - 26} h -12 v 8 h 12`} fill="none" stroke="#232C35" strokeWidth="5" />
      {/* element + duty */}
      {v.element && (
        <g>
          <path d={`M ${x + 22} ${FLOOR - 22} h ${W - 66} v -9 h -${W - 88} v -9 h ${W - 88}`}
            fill="none" stroke={hot ? C.ember : "#4A5765"} strokeWidth="5" strokeLinecap="round"
            style={hot ? { filter: `drop-shadow(0 0 6px ${C.ember})` } : undefined} />
          <rect x={x + 10} y={FLOOR + 10} width={W - 20} height="5" rx="2" fill={C.dead} />
          <rect x={x + 10} y={FLOOR + 10} width={(W - 20) * elementDuty / 100} height="5" rx="2" fill={C.ember} />
          <circle cx={x + 17} cy={FLOOR + 27} r="4.5" fill={elementOn ? C.ember : C.dead}
            style={elementOn ? { filter: `drop-shadow(0 0 5px ${C.ember})` } : undefined} />
          <text x={x + 27} y={FLOOR + 30} fill={C.faint} fontSize="11" style={legend}>ELEMENT</text>
          <text x={x + W - 10} y={FLOOR + 30} textAnchor="end" fill={C.faint} fontSize="11" style={mono}>{elementDuty}%</text>
        </g>
      )}
      {/* label + temps */}
      <text x={x + 10} y={top - 12} fill={C.dim} fontSize="15" fontWeight="700" style={legend}>{v.name}</text>
      <text x={cx} y={top + 46} textAnchor="middle" fill={fault ? C.ember : C.text} fontSize="31" fontWeight="500" style={mono}
        stroke={C.panel} strokeWidth="0.5" paintOrder="stroke">
        {fault || tempF == null ? "—" : tempF.toFixed(1) + "°"}
      </text>
      {targetF != null && <text x={cx} y={top + 65} textAnchor="middle" fill={C.dim} fontSize="12" style={mono}>▸ {targetF}°</text>}
    </g>
  );
}

function Conical({ x, v, tempR, targetF, levelGal, glycolOn, heatOn, onTap }) {
  const W = 140;
  const H = Math.round(120 + (v.volumeGal || 10) * 5.4);
  const top = FLOOR - H;
  const cx = x + W / 2;
  const bodyBot = FLOOR - Math.round(H * 0.34);
  const tempF = tempR?.tempF;
  const frac = Math.max(0, Math.min(1, (levelGal || 0) / (v.volumeGal || 1)));
  const liqTop = FLOOR - 6 - (FLOOR - 6 - (top + 12)) * frac;

  return (
    <g onClick={onTap} style={{ cursor: "pointer" }}>
      <path d={`M ${x + 14} ${top} h ${W - 28} v ${bodyBot - top} l -${(W - 28) / 2} ${FLOOR - bodyBot} l -${(W - 28) / 2} -${FLOOR - bodyBot} z`}
        fill="url(#steel)" stroke="#222B34" strokeWidth="1.5" />
      {/* liquid (clipped to cone) */}
      <clipPath id={`cone-${v.id}`}>
        <path d={`M ${x + 19} ${top + 5} h ${W - 38} v ${bodyBot - top - 5} l -${(W - 38) / 2} ${FLOOR - bodyBot - 6} l -${(W - 38) / 2} -${FLOOR - bodyBot - 6} z`} />
      </clipPath>
      {frac > 0.02 && <rect x={x} y={liqTop} width={W} height={FLOOR - liqTop} fill="url(#wort)" opacity="0.9" clipPath={`url(#cone-${v.id})`} />}
      {/* glycol jacket */}
      <g stroke={glycolOn ? C.glycol : "#3A4757"} strokeWidth="3.5" fill="none"
        style={glycolOn ? { filter: `drop-shadow(0 0 5px ${C.glycol})` } : undefined}>
        <path d={`M ${x + 8} ${top + 26} h -7 v ${Math.round(H * 0.35)} h 7`} />
        <path d={`M ${x + W - 8} ${top + 26} h 7 v ${Math.round(H * 0.35)} h -7`} />
      </g>
      {/* legs */}
      <line x1={x + 22} y1={bodyBot + 4} x2={x + 6} y2={FLOOR} stroke="#232C35" strokeWidth="4" />
      <line x1={x + W - 22} y1={bodyBot + 4} x2={x + W - 6} y2={FLOOR} stroke="#232C35" strokeWidth="4" />
      <text x={x + 16} y={top - 12} fill={C.dim} fontSize="15" fontWeight="700" style={legend}>{v.name}</text>
      <text x={cx} y={top + 52} textAnchor="middle" fill={tempR?.fault ? C.ember : C.text} fontSize="28" fontWeight="500" style={mono}
        stroke={C.panel} strokeWidth="0.5" paintOrder="stroke">
        {tempR?.fault || tempF == null ? "—" : tempF.toFixed(1) + "°"}
      </text>
      {targetF != null && <text x={cx} y={top + 71} textAnchor="middle" fill={C.dim} fontSize="12" style={mono}>▸ {targetF}°</text>}
      <text x={cx} y={top + 90} textAnchor="middle" fill={C.faint} fontSize="10" style={mono}>{levelGal ?? 0} gal</text>
      {/* pilots */}
      <circle cx={x + 18} cy={FLOOR + 14} r="4.5" fill={glycolOn ? C.glycol : C.dead} style={glycolOn ? { filter: `drop-shadow(0 0 5px ${C.glycol})` } : undefined} />
      <text x={x + 27} y={FLOOR + 17} fill={glycolOn ? C.glycol : C.faint} fontSize="11" style={legend}>GLYCOL</text>
      <circle cx={x + 18} cy={FLOOR + 30} r="4.5" fill={heatOn ? C.amber : C.dead} style={heatOn ? { filter: `drop-shadow(0 0 5px ${C.amber})` } : undefined} />
      <text x={x + 27} y={FLOOR + 33} fill={heatOn ? C.amber : C.faint} fontSize="11" style={legend}>HEAT</text>
    </g>
  );
}

/**
 * One flow path: from-vessel bottom → rail → pump → destination.
 * via="X" routes through vessel X (the HERMS coil) then up to `to`'s top.
 */
function FlowPath({ flow, rail, vessels, slot, running, pumpActor }) {
  const fi = slot(flow.from), ti = slot(flow.to), vi = flow.via ? slot(flow.via) : -1;
  if (fi < 0 || ti < 0) return null;
  const geom = (i) => {
    const v = vessels[i];
    return v.kind === "conical"
      ? { cx: i * VW + 30 + 70, top: FLOOR - Math.round(120 + (v.volumeGal || 10) * 5.4), W: 140, x: i * VW + 30 }
      : { ...kettleGeom(v, i * VW + 26) };
  };
  const F = geom(fi), T = geom(ti), V = vi >= 0 ? geom(vi) : null;
  const selfLoop = fi === ti && !V;
  // overhead return line clears every vessel's label
  const skyline = Math.min(...vessels.map((v, i) => geom(i).top)) - 26;

  const col = running ? (flow.kind === "water" ? C.glycol : C.live) : "#3A4757";
  const pipe = { fill: "none", stroke: col, strokeWidth: 3.5 };
  const dash = running ? { strokeDasharray: "8 6", style: { animation: "flow 0.9s linear infinite" } } : { strokeDasharray: "8 6", strokeOpacity: 0.5 };
  const pumpX = selfLoop ? F.cx + 44 : V ? (F.cx + V.cx) / 2 : (F.cx + T.cx) / 2;

  const seg = [];
  // out of `from`'s bottom drain, down to the rail, into the pump
  seg.push(`M ${F.cx - 20} ${FLOOR} V ${rail} H ${pumpX - 13}`);
  if (selfLoop) {
    // pump → up the right side → back in over the rim (circulation loop)
    const side = F.x + F.W + 26;
    seg.push(`M ${pumpX + 13} ${rail} H ${side} V ${F.top - 14} H ${F.cx + 24} V ${F.top - 4}`);
  } else if (V) {
    // pump → via (HERMS coil) bottom; coil out the top → overhead → down into `to`
    seg.push(`M ${pumpX + 13} ${rail} H ${V.cx + 20} V ${FLOOR}`);
    seg.push(`M ${V.cx} ${V.top - 4} V ${skyline} H ${T.cx + 26} V ${T.top - 4}`);
  } else {
    // pump → up the left side of `to` → over the rim
    const side = T.x - 13;
    seg.push(`M ${pumpX + 13} ${rail} H ${side} V ${T.top - 14} H ${T.cx} V ${T.top - 4}`);
  }

  const dir = selfLoop ? 1 : (V ? V.cx : T.cx) >= F.cx ? 1 : -1; // toward destination

  // read-only schematic — pump on/off + line routing live in the vessel
  // cards below; here the pump just shows state and flow direction
  return (
    <g>
      {seg.map((d, i) => <path key={i} d={d} {...pipe} {...dash} />)}
      <circle cx={pumpX} cy={rail} r="14" fill={C.bezel} stroke={running ? C.live : C.rule} strokeWidth="2" />
      <path d={`M ${pumpX - 6 * dir} ${rail - 7} L ${pumpX + 8 * dir} ${rail} L ${pumpX - 6 * dir} ${rail + 7} Z`}
        fill={running ? C.live : C.faint} style={running ? { filter: `drop-shadow(0 0 4px ${C.live})` } : undefined} />
      <text x={pumpX + 22} y={rail + 4} fill={running ? C.live : C.faint} fontSize="11" style={legend}
        stroke={C.card} strokeWidth="3" paintOrder="stroke">
        {(pumpActor?.name || "PUMP").toUpperCase()} {running ? "ON" : "OFF"} → {flow.name.toUpperCase()}
      </text>
    </g>
  );
}
