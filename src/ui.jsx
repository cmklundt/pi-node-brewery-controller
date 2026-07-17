/** ui.jsx — shared touch components (from the prototype, unchanged API). */
import React from "react";
import { C, legend, mono, clamp } from "./theme.js";

export function Read({ label, v, on, c, sub, bar, warn, fault }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${fault ? C.ember : on ? c : C.rule}`, borderRadius: 4, padding: 12, position: "relative", overflow: "hidden" }}>
      {on && <div style={{ position: "absolute", inset: 0, background: c, opacity: .055 }} />}
      <div style={{ position: "relative" }}>
        <div style={{ ...legend, fontSize: 12, fontWeight: 700, color: on ? c : C.dim }}>{label}</div>
        <div style={{ ...mono, fontSize: 32, lineHeight: 1.1, marginTop: 4, color: fault ? C.ember : on ? c : C.text }}>
          {fault || v == null ? "—" : v.toFixed(1)}<span style={{ fontSize: 13, color: C.faint }}>°F</span>
        </div>
        {bar !== undefined && (
          <div style={{ marginTop: 7, height: 3, background: C.dead, borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${bar}%`, background: c, transition: "width .3s" }} />
          </div>
        )}
        <div style={{ ...legend, fontSize: 10, color: fault ? C.ember : warn ? C.ember : C.faint, marginTop: 7 }}>{fault ? "RTD FAULT — check probe" : sub}</div>
      </div>
    </div>
  );
}

export function Ring({ pct, live, color, children, size = 112 }) {
  const R = size * 0.393, CIRC = 2 * Math.PI * R, c2 = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c2} cy={c2} r={R} fill="none" stroke={C.dead} strokeWidth="6" />
        <circle cx={c2} cy={c2} r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - clamp(pct, 0, 1))}
          style={{ transition: "stroke-dashoffset .4s", opacity: live ? 1 : .4 }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

export function Stepper({ label, v, set, step, unit, c }) {
  const btn = { ...legend, fontSize: 22, fontWeight: 600, width: 46, height: 46, borderRadius: 3, cursor: "pointer", border: `1px solid ${C.rule}`, background: C.bezel, color: C.text, flexShrink: 0 };
  return (
    <div>
      <div style={{ ...legend, fontSize: 10.5, color: C.faint, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button style={btn} onClick={() => set(+(v - step).toFixed(1))}>−</button>
        <div style={{ ...mono, flex: 1, textAlign: "center", fontSize: 19, color: c, fontWeight: 500 }}>
          {v}<span style={{ fontSize: 9.5, color: C.faint }}> {unit}</span>
        </div>
        <button style={btn} onClick={() => set(+(v + step).toFixed(1))}>+</button>
      </div>
    </div>
  );
}

export function Tap({ on, onClick, color, children, pad = "10px 16px", size = 13, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...legend, fontSize: size, fontWeight: 600, padding: pad, borderRadius: 3, cursor: "pointer", opacity: disabled ? .4 : 1, border: `1.5px solid ${on ? color : C.rule}`, background: on ? `${color}22` : "transparent", color: on ? color : C.faint, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

export function Big({ onClick, color, children, ghost, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...legend, flex: 1, fontSize: 14, fontWeight: 700, padding: "15px 10px", borderRadius: 3, cursor: "pointer", opacity: disabled ? .4 : 1, border: `1.5px solid ${color}`, background: ghost ? "transparent" : `${color}26`, color }}>
      {children}
    </button>
  );
}

export function Pilot({ label, gpio, on, c }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", background: C.bezel, border: `1px solid ${on ? c : C.ruleSoft}`, borderRadius: 3 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: on ? c : C.dead, boxShadow: on ? `0 0 8px ${c}` : "none", flexShrink: 0 }} />
      <div>
        <div style={{ ...legend, fontSize: 11, fontWeight: 600, color: on ? C.text : C.dim }}>{label}</div>
        <div style={{ ...mono, fontSize: 9, color: C.faint }}>GPIO {gpio}</div>
      </div>
    </div>
  );
}

export function Panel({ title, children, right }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ ...legend, fontSize: 14, fontWeight: 700 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Row({ k, v, sub, ok, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", marginBottom: 6, background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderRadius: 3, cursor: onClick ? "pointer" : "default" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? C.live : C.dead, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...legend, fontSize: 12, fontWeight: 600 }}>{k}</div>
        <div style={{ ...mono, fontSize: 9.5, color: C.faint }}>{sub}</div>
      </div>
      <span style={{ ...mono, fontSize: 10.5, color: C.dim, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

export function Note({ children }) {
  return <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.5, paddingTop: 10, borderTop: `1px solid ${C.ruleSoft}` }}>{children}</div>;
}

export function Field({ label, value, onChange, width = "100%", type = "text" }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ ...legend, fontSize: 10, color: C.faint, marginBottom: 3 }}>{label}</div>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(type === "number" ? +e.target.value : e.target.value)}
        style={{ ...mono, width, boxSizing: "border-box", fontSize: 14, padding: "10px 10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }} />
    </label>
  );
}
