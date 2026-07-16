import React, { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from "recharts";

/* ── panel tokens ─────────────────────────────────────────── */
const C = {
  panel: "#12161C",
  bezel: "#1B222B",
  card: "#212A35",
  rule: "#333F4D",
  ruleSoft: "#28323E",
  text: "#E7ECF2",
  dim: "#8695A8",
  faint: "#5C6B7D",
  amber: "#F2A03D",   // element heat
  ember: "#E2542C",   // boil / high power
  glycol: "#4FB8D8",  // cooling
  live: "#63D471",    // energized pilot
  dead: "#2C3742",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
`;
const legend = { fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.09em" };
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
const body = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };

/* ── thermal model ────────────────────────────────────────── */
const AMBIENT = 62;
const K = {
  hltGain: 0.052,     // °F per sec at 100% duty (5500W in ~7gal)
  boilGain: 0.048,
  hltLoss: 0.0013,
  boilLoss: 0.0016,
  mashLoss: 0.0006,
  coil: 0.0075,       // HERMS coil transfer coefficient (needs recirc)
  fermGlycol: 0.010,
  fermHeat: 0.006,
  fermLoss: 0.0008,
};

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export default function BreweryPanel() {
  /* hardware state */
  const [interlock, setInterlock] = useState("OFF");   // HLT | OFF | BOIL
  const [recirc, setRecirc] = useState(false);         // manual pump
  const [spareC, setSpareC] = useState(false);
  const [spareD, setSpareD] = useState(false);

  /* setpoints */
  const [mashTarget, setMashTarget] = useState(152);
  const [hltCap, setHltCap] = useState(10);            // HLT may exceed mash by this
  const [boilPower, setBoilPower] = useState(70);
  const [fermTarget, setFermTarget] = useState(66);
  const [deadband, setDeadband] = useState(0.8);

  /* mode */
  const [mode, setMode] = useState("MASH");            // MASH | BOIL
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(10);

  /* process */
  const [t, setT] = useState({ hlt: 68, mash: 66, boil: 64, ferm: 70 });
  const [duty, setDuty] = useState({ hlt: 0, boil: 0 });
  const [fermState, setFermState] = useState("idle");  // idle | cooling | heating
  const [hist, setHist] = useState([]);
  const integral = useRef(0);
  const clock = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setT((prev) => {
        clock.current += 1;
        const nx = { ...prev };

        /* --- HERMS: mash sensor drives the HLT element --- */
        let hltDuty = 0;
        if (mode === "MASH" && interlock === "HLT") {
          const err = mashTarget - prev.mash;
          integral.current = clamp(integral.current + err * 0.02, -40, 40);
          let d = clamp(err * 14 + integral.current, 0, 100);
          // don't let HLT run away past mash target + cap
          if (prev.hlt >= mashTarget + hltCap) d = 0;
          hltDuty = d;
        }

        /* --- Boil: direct power --- */
        let boilDuty = 0;
        if (mode === "BOIL" && interlock === "BOIL") boilDuty = boilPower;

        setDuty({ hlt: Math.round(hltDuty), boil: Math.round(boilDuty) });

        /* --- physics --- */
        nx.hlt += (hltDuty / 100) * K.hltGain - (prev.hlt - AMBIENT) * K.hltLoss;
        nx.boil += (boilDuty / 100) * K.boilGain - (prev.boil - AMBIENT) * K.boilLoss;
        if (nx.boil > 212) nx.boil = 212;

        // HERMS coil: heat moves HLT → mash only while recirculating
        if (recirc) {
          const dT = prev.hlt - prev.mash;
          nx.mash += dT * K.coil;
          nx.hlt -= dT * K.coil * 0.55;
        }
        nx.mash -= (prev.mash - AMBIENT) * K.mashLoss;

        /* --- fermenter: deadband hysteresis --- */
        let fs = "idle";
        if (prev.ferm > fermTarget + deadband) fs = "cooling";
        else if (prev.ferm < fermTarget - deadband) fs = "heating";
        setFermState(fs);
        if (fs === "cooling") nx.ferm -= K.fermGlycol;
        if (fs === "heating") nx.ferm += K.fermHeat;
        nx.ferm += (AMBIENT - prev.ferm) * K.fermLoss * -1 * -1;

        setHist((h) => {
          const row = { s: clock.current, hlt: +nx.hlt.toFixed(1), mash: +nx.mash.toFixed(1), boil: +nx.boil.toFixed(1) };
          const next = [...h, row];
          return next.length > 160 ? next.slice(-160) : next;
        });
        return nx;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [running, speed, mode, interlock, mashTarget, boilPower, hltCap, recirc, fermTarget, deadband]);

  /* derived */
  const hltLive = duty.hlt > 0 && interlock === "HLT";
  const boilLive = duty.boil > 0 && interlock === "BOIL";
  const mashBlocked = mode === "MASH" && interlock !== "HLT";
  const boilBlocked = mode === "BOIL" && interlock !== "BOIL";

  return (
    <div style={{ ...body, background: C.panel, minHeight: "100vh", color: C.text, padding: 16 }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* ── header ───────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ ...legend, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>HERMS Control</div>
            <div style={{ ...legend, fontSize: 12, color: C.faint, marginTop: 4 }}>
              4× PT100 · 2× SSR 240 V · 4× relay 120 V · simulation
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {["MASH", "BOIL"].map((m) => (
              <button key={m} onClick={() => { setMode(m); integral.current = 0; }}
                style={{ ...legend, fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 3, cursor: "pointer",
                  border: `1px solid ${mode === m ? C.amber : C.rule}`,
                  background: mode === m ? "rgba(242,160,61,0.14)" : "transparent",
                  color: mode === m ? C.amber : C.dim }}>{m}</button>
            ))}
            <button onClick={() => setRunning((r) => !r)}
              style={{ ...legend, fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 3, cursor: "pointer",
                border: `1px solid ${C.rule}`, background: "transparent", color: C.dim }}>
              {running ? "Pause" : "Run"}
            </button>
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)}
              style={{ ...mono, fontSize: 12, padding: "8px 10px", borderRadius: 3, border: `1px solid ${C.rule}`, background: C.bezel, color: C.dim }}>
              <option value={1}>1×</option><option value={10}>10×</option><option value={60}>60×</option>
            </select>
          </div>
        </div>

        {/* ── vessels ──────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 12 }}>
          <Vessel label="HLT" gpio="CS 8" temp={t.hlt} sub={`SSR · GPIO 17`} duty={duty.hlt} live={hltLive} accent={C.amber}
            note={mode === "MASH" ? `cap ${mashTarget + hltCap}°F` : "idle"} />
          <Vessel label="Mash" gpio="CS 7" temp={t.mash} sub="no element — coil fed" target={mashTarget} accent={C.amber}
            note={recirc ? "recirculating" : "pump off — no transfer"} warn={!recirc} />
          <Vessel label="Boil" gpio="CS 25" temp={t.boil} sub="SSR · GPIO 27" duty={duty.boil} live={boilLive} accent={C.ember}
            note={t.boil >= 211.5 ? "boiling" : mode === "BOIL" ? `${boilPower}% power` : "idle"} />
          <Vessel label="Fermenter" gpio="CS 24" temp={t.ferm} sub="glycol · GPIO 22" accent={C.glycol}
            target={fermTarget} note={fermState === "idle" ? `in band ±${deadband}` : fermState} />
        </div>

        {/* ── HERMS path callout ───────────────────── */}
        <div style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderRadius: 4, padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...legend, fontSize: 11, color: C.faint }}>Control path</span>
          <span style={{ ...mono, fontSize: 12.5, color: mashBlocked ? C.faint : C.text }}>
            Mash sensor → PID → <span style={{ color: mashBlocked ? C.faint : C.amber }}>HLT element</span> → coil → mash
          </span>
          {mashBlocked && mode === "MASH" && (
            <span style={{ ...legend, fontSize: 11, fontWeight: 600, color: C.ember, border: `1px solid ${C.ember}`, padding: "2px 8px", borderRadius: 2 }}>
              blocked by interlock
            </span>
          )}
        </div>

        {/* ── interlock: the signature control ─────── */}
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 18, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ ...legend, fontSize: 14, fontWeight: 700 }}>Element interlock</div>
              <div style={{ ...body, fontSize: 12, color: C.faint, marginTop: 4, maxWidth: 460, lineHeight: 1.5 }}>
                Hardware selector in the panel. It routes the 240 V hot leg to one element only —
                software cannot energize both, even on a fault. Two 5500 W elements would draw ~46 A.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["HLT", "OFF", "BOIL"].map((p) => {
                const on = interlock === p;
                const col = p === "OFF" ? C.dim : p === "HLT" ? C.amber : C.ember;
                return (
                  <button key={p} onClick={() => setInterlock(p)}
                    style={{ ...legend, fontSize: 14, fontWeight: 700, padding: "14px 22px", borderRadius: 3, cursor: "pointer",
                      border: `1.5px solid ${on ? col : C.rule}`,
                      background: on ? (p === "OFF" ? "rgba(134,149,168,0.12)" : p === "HLT" ? "rgba(242,160,61,0.16)" : "rgba(226,84,44,0.16)") : "transparent",
                      color: on ? col : C.faint, minWidth: 76 }}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── outputs: load-side pilot lights ──────── */}
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ ...legend, fontSize: 14, fontWeight: 700 }}>Outputs</span>
            <span style={{ ...body, fontSize: 11.5, color: C.faint }}>pilot lights read the plug, not the GPIO — true state even on a fault</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <Pilot label="HLT element" gpio="17" on={hltLive} color={C.amber} detail={`${duty.hlt}%`} />
            <Pilot label="Boil element" gpio="27" on={boilLive} color={C.ember} detail={`${duty.boil}%`} />
            <Pilot label="Glycol pump" gpio="22" on={fermState === "cooling"} color={C.glycol} detail="120 V" />
            <Pilot label="Ferment heat" gpio="23" on={fermState === "heating"} color={C.amber} detail="120 V" />
            <Pilot label="Spare C" gpio="5" on={spareC} color={C.live} detail="120 V" onClick={() => setSpareC((v) => !v)} />
            <Pilot label="Spare D" gpio="6" on={spareD} color={C.live} detail="120 V" onClick={() => setSpareD((v) => !v)} />
          </div>
        </div>

        {/* ── controls + trend ─────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>

          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
            <div style={{ ...legend, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Setpoints</div>
            <Slider label="Mash target" value={mashTarget} set={setMashTarget} min={140} max={162} step={0.5} unit="°F" color={C.amber} />
            <Slider label="HLT overshoot cap" value={hltCap} set={setHltCap} min={2} max={20} step={1} unit="°F over mash" color={C.amber}
              hint="Keeps the coil from denaturing enzymes" />
            <Slider label="Boil power" value={boilPower} set={setBoilPower} min={0} max={100} step={5} unit="%" color={C.ember} />
            <div style={{ height: 1, background: C.ruleSoft, margin: "16px 0" }} />
            <Slider label="Fermenter target" value={fermTarget} set={setFermTarget} min={34} max={78} step={0.5} unit="°F" color={C.glycol} />
            <Slider label="Deadband" value={deadband} set={setDeadband} min={0.2} max={3} step={0.1} unit="°F" color={C.glycol}
              hint="Too tight and the glycol pump chatters" />
            <Toggle label="Recirculation pump" sub="Manual — HERMS transfer needs flow" on={recirc} set={setRecirc} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ ...legend, fontSize: 14, fontWeight: 700 }}>Trend</span>
              <span style={{ ...mono, fontSize: 11, color: C.faint }}>{clock.current}s</span>
            </div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hist} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                  <XAxis dataKey="s" tick={{ fill: C.faint, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}
                    stroke={C.ruleSoft} tickLine={false} />
                  <YAxis domain={[50, 220]} tick={{ fill: C.faint, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}
                    stroke={C.ruleSoft} tickLine={false} />
                  {mode === "MASH" && <ReferenceLine y={mashTarget} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} />}
                  <Line type="monotone" dataKey="hlt" stroke={C.amber} dot={false} strokeWidth={1.6} isAnimationActive={false} />
                  <Line type="monotone" dataKey="mash" stroke={C.live} dot={false} strokeWidth={2.2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="boil" stroke={C.ember} dot={false} strokeWidth={1.6} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {[["HLT", C.amber], ["Mash", C.live], ["Boil", C.ember]].map(([n, c]) => (
                <span key={n} style={{ ...legend, fontSize: 11, color: C.dim, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 2, background: c, display: "inline-block" }} />{n}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...body, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
          Simulation only — thermal model is illustrative, not a substitute for bench testing.
          Interlock, pilot lights, GFCI feed and all mains switching live in the panel, never on the HAT.
        </div>
      </div>
    </div>
  );
}

/* ── components ───────────────────────────────────────────── */
function Vessel({ label, gpio, temp, sub, duty, live, accent, note, target, warn }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${live ? accent : C.rule}`, borderRadius: 4, padding: 14, position: "relative", overflow: "hidden" }}>
      {live && <div style={{ position: "absolute", inset: 0, background: accent, opacity: 0.05 }} />}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...legend, fontSize: 13, fontWeight: 700, color: live ? accent : C.text }}>{label}</span>
          <span style={{ ...mono, fontSize: 10, color: C.faint }}>{gpio}</span>
        </div>
        <div style={{ ...mono, fontSize: 40, fontWeight: 500, lineHeight: 1.05, marginTop: 8, color: live ? accent : C.text }}>
          {temp.toFixed(1)}<span style={{ fontSize: 17, color: C.faint }}>°F</span>
        </div>
        {target !== undefined && (
          <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 2 }}>target {target.toFixed(1)}°F</div>
        )}
        <div style={{ ...legend, fontSize: 10.5, color: C.faint, marginTop: 8 }}>{sub}</div>
        {duty !== undefined && (
          <div style={{ marginTop: 8, height: 3, background: C.dead, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${duty}%`, background: accent, transition: "width .3s" }} />
          </div>
        )}
        <div style={{ ...legend, fontSize: 10.5, marginTop: 8, color: warn ? C.ember : C.dim }}>{note}</div>
      </div>
    </div>
  );
}

function Pilot({ label, gpio, on, color, detail, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      background: C.bezel, border: `1px solid ${on ? color : C.ruleSoft}`, borderRadius: 3,
      cursor: onClick ? "pointer" : "default",
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
        background: on ? color : C.dead,
        boxShadow: on ? `0 0 9px ${color}` : "none",
        border: `1px solid ${on ? color : C.rule}`,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...legend, fontSize: 11.5, fontWeight: 600, color: on ? C.text : C.dim, whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ ...mono, fontSize: 9.5, color: C.faint }}>GPIO {gpio} · {detail}</div>
      </div>
    </div>
  );
}

function Slider({ label, value, set, min, max, step, unit, color, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ ...legend, fontSize: 11.5, color: C.dim }}>{label}</span>
        <span style={{ ...mono, fontSize: 13, color, fontWeight: 500 }}>{value}<span style={{ fontSize: 10, color: C.faint }}> {unit}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)}
        style={{ width: "100%", marginTop: 6, accentColor: color }} />
      {hint && <div style={{ ...body, fontSize: 10.5, color: C.faint, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, sub, on, set }) {
  return (
    <div onClick={() => set(!on)} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      padding: "10px 12px", marginTop: 14, borderRadius: 3, cursor: "pointer",
      background: C.bezel, border: `1px solid ${on ? C.live : C.ruleSoft}`,
    }}>
      <div>
        <div style={{ ...legend, fontSize: 11.5, fontWeight: 600, color: on ? C.text : C.dim }}>{label}</div>
        <div style={{ ...body, fontSize: 10.5, color: C.faint }}>{sub}</div>
      </div>
      <div style={{ width: 38, height: 20, borderRadius: 10, background: on ? C.live : C.dead, position: "relative", flexShrink: 0, transition: "background .2s" }}>
        <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: C.panel, transition: "left .2s" }} />
      </div>
    </div>
  );
}
