import React, { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

/* ── panel tokens ─────────────────────────────────────────── */
const C = {
  panel: "#12161C", bezel: "#1B222B", card: "#212A35", raised: "#2A3542",
  rule: "#333F4D", ruleSoft: "#28323E",
  text: "#E7ECF2", dim: "#8695A8", faint: "#5C6B7D",
  amber: "#F2A03D", ember: "#E2542C", glycol: "#4FB8D8", live: "#63D471", dead: "#2C3742",
};
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
input[type=range]{-webkit-appearance:none;height:34px;background:transparent}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:#2C3742}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:50%;background:#E7ECF2;margin-top:-12px;border:none}
button{-webkit-tap-highlight-color:transparent}
`;
const legend = { fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.09em" };
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
const body = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };

/* ── model ────────────────────────────────────────────────── */
const AMBIENT = 62;
const K = { hltGain: .055, boilGain: .05, hltLoss: .0013, boilLoss: .0016, mashLoss: .0006,
  coil: .0078, fermGlycol: .010, fermHeat: .006 };
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

const DEFAULT_STEPS = [
  { id:1, name:"Heat strike water", vessel:"HLT",  target:168, mins:0,  kind:"ramp" },
  { id:2, name:"Mash in",           vessel:"MASH", target:152, mins:0,  kind:"ramp" },
  { id:3, name:"Saccharification",  vessel:"MASH", target:152, mins:60, kind:"rest" },
  { id:4, name:"Mash out",          vessel:"MASH", target:168, mins:10, kind:"rest" },
  { id:5, name:"Boil",              vessel:"BOIL", target:212, mins:60, kind:"boil",
    hops:[{ at:60, name:"Magnum 1 oz" },{ at:15, name:"Cascade 1 oz" },{ at:5, name:"Citra 2 oz" },{ at:0, name:"Flameout 2 oz" }] },
];

export default function TouchPanel() {
  const [tab, setTab] = useState("brew");
  const [interlock, setInterlock] = useState("OFF");
  const [recirc, setRecirc] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [running, setRunning] = useState(true);

  const [steps, setSteps] = useState(DEFAULT_STEPS);
  const [active, setActive] = useState(0);
  const [stepRun, setStepRun] = useState(false);
  const [left, setLeft] = useState(DEFAULT_STEPS[0].mins * 60);
  const [atTemp, setAtTemp] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const firedHops = useRef(new Set());

  const [fermTarget, setFermTarget] = useState(66);
  const [deadband, setDeadband] = useState(0.8);
  const [hltCap, setHltCap] = useState(10);
  const [boilPower, setBoilPower] = useState(75);

  const [t, setT] = useState({ hlt:68, mash:66, boil:64, ferm:70 });
  const [duty, setDuty] = useState({ hlt:0, boil:0 });
  const [fermState, setFermState] = useState("idle");
  const [hist, setHist] = useState([]);
  const [range, setRange] = useState(15);
  const [series, setSeries] = useState({ hlt:true, mash:true, boil:true, ferm:false });
  const integral = useRef(0);
  const clock = useRef(0);

  const step = steps[active];
  const target = step?.target ?? 0;

  const push = (msg, tone="info") =>
    setAlerts((a) => [{ id: Date.now()+Math.random(), msg, tone }, ...a].slice(0,4));

  /* ── sim loop ── */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      clock.current += 1;
      setT((prev) => {
        const nx = { ...prev };
        const heating = step?.vessel;
        const wantBoil = heating === "BOIL";
        const wantHlt  = heating === "HLT" || heating === "MASH";

        /* HERMS: mash sensor → HLT element */
        let hd = 0;
        if (wantHlt && interlock === "HLT" && stepRun) {
          const sensed = heating === "MASH" ? prev.mash : prev.hlt;
          const err = target - sensed;
          integral.current = clamp(integral.current + err*0.02, -40, 40);
          hd = clamp(err*14 + integral.current, 0, 100);
          if (heating === "MASH" && prev.hlt >= target + hltCap) hd = 0;
          if (heating === "HLT" && prev.hlt >= target) hd = 0;
        }
        let bd = 0;
        if (wantBoil && interlock === "BOIL" && stepRun) bd = boilPower;
        setDuty({ hlt: Math.round(hd), boil: Math.round(bd) });

        nx.hlt += (hd/100)*K.hltGain - (prev.hlt-AMBIENT)*K.hltLoss;
        nx.boil += (bd/100)*K.boilGain - (prev.boil-AMBIENT)*K.boilLoss;
        if (nx.boil > 212) nx.boil = 212;
        if (recirc) { const dT = prev.hlt - prev.mash; nx.mash += dT*K.coil; nx.hlt -= dT*K.coil*0.55; }
        nx.mash -= (prev.mash-AMBIENT)*K.mashLoss;

        let fs = "idle";
        if (prev.ferm > fermTarget + deadband) fs = "cooling";
        else if (prev.ferm < fermTarget - deadband) fs = "heating";
        setFermState(fs);
        if (fs==="cooling") nx.ferm -= K.fermGlycol;
        if (fs==="heating") nx.ferm += K.fermHeat;

        setHist((h) => [...h, { s:clock.current, hlt:+nx.hlt.toFixed(1), mash:+nx.mash.toFixed(1),
          boil:+nx.boil.toFixed(1), ferm:+nx.ferm.toFixed(1) }].slice(-3600));

        /* timer gate: countdown only once at temp */
        const sensedNow = heating==="MASH" ? nx.mash : heating==="BOIL" ? nx.boil : nx.hlt;
        const reached = sensedNow >= target - 0.6;
        setAtTemp(reached);
        if (stepRun && reached) {
          if (step.kind === "ramp") { advance(); }
          else setLeft((l) => {
            const n = l - 1;
            if (step.hops) step.hops.forEach((h) => {
              const key = `${step.id}-${h.at}`;
              if (n <= h.at*60 && !firedHops.current.has(key)) { firedHops.current.add(key); push(`Hop addition — ${h.name}`, "hop"); }
            });
            if (n <= 0) { advance(); return 0; }
            return n;
          });
        }
        return nx;
      });
    }, 1000/speed);
    return () => clearInterval(id);
  }, [running, speed, step, interlock, stepRun, target, hltCap, boilPower, recirc, fermTarget, deadband]);

  function advance() {
    setActive((i) => {
      const n = i+1;
      if (n >= steps.length) { setStepRun(false); push("Brew complete", "ok"); return i; }
      setLeft(steps[n].mins*60); integral.current = 0;
      push(`Step ${n+1} — ${steps[n].name}`, "info");
      return n;
    });
  }
  function selectStep(i) { setActive(i); setLeft(steps[i].mins*60); integral.current=0; firedHops.current.clear(); }
  function setTarget(v) { setSteps((s) => s.map((x,i) => i===active ? { ...x, target: clamp(v,32,215) } : x)); }
  function setMins(v) { setSteps((s) => s.map((x,i) => i===active ? { ...x, mins: clamp(v,0,180) } : x)); if(!stepRun) setLeft(clamp(v,0,180)*60); }

  const view = useMemo(() => hist.filter((r) => r.s > clock.current - range*60), [hist, range, t]);
  const blocked = (step?.vessel==="BOIL" && interlock!=="BOIL") || (step?.vessel!=="BOIL" && interlock!=="HLT");
  const sensed = step?.vessel==="MASH" ? t.mash : step?.vessel==="BOIL" ? t.boil : t.hlt;
  const pct = step?.mins ? 1 - left/(step.mins*60) : 0;

  return (
    <div style={{ ...body, background:C.panel, minHeight:"100vh", color:C.text }}>
      <style>{FONTS}</style>

      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
        padding:"12px 16px", borderBottom:`1px solid ${C.ruleSoft}`, background:C.bezel, flexWrap:"wrap" }}>
        <div style={{ ...legend, fontSize:19, fontWeight:700 }}>HERMS Control</div>
        <div style={{ display:"flex", gap:6 }}>
          {[["brew","Brew"],["ferment","Ferment"],["setup","Setup"]].map(([k,l]) => (
            <Tap key={k} on={tab===k} onClick={()=>setTab(k)} color={C.amber} pad="10px 18px">{l}</Tap>
          ))}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {[1,10,60].map((s)=>(<Tap key={s} on={speed===s} onClick={()=>setSpeed(s)} color={C.dim} pad="8px 12px" size={12}>{s}×</Tap>))}
          <Tap on={running} onClick={()=>setRunning(r=>!r)} color={C.live} pad="8px 14px" size={12}>{running?"Live":"Paused"}</Tap>
        </div>
      </div>

      {/* alerts */}
      {alerts.length>0 && (
        <div style={{ padding:"8px 16px 0", display:"flex", flexDirection:"column", gap:6 }}>
          {alerts.map((a)=>(
            <div key={a.id} onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))}
              style={{ ...legend, fontSize:12.5, fontWeight:600, padding:"9px 12px", borderRadius:3, cursor:"pointer",
                border:`1px solid ${a.tone==="hop"?C.ember:a.tone==="ok"?C.live:C.rule}`,
                background: a.tone==="hop"?"rgba(226,84,44,.14)":a.tone==="ok"?"rgba(99,212,113,.12)":C.bezel,
                color: a.tone==="hop"?C.ember:a.tone==="ok"?C.live:C.dim }}>
              {a.msg} <span style={{ color:C.faint, marginLeft:6 }}>tap to dismiss</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding:16, maxWidth:1240, margin:"0 auto" }}>

        {/* ══ BREW ══ */}
        {tab==="brew" && (<>
          {/* readouts */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginBottom:12 }}>
            <Read label="HLT" v={t.hlt} on={duty.hlt>0} c={C.amber} sub={`GPIO 17 · ${duty.hlt}%`} bar={duty.hlt} />
            <Read label="Mash" v={t.mash} c={C.live} sub={recirc?"coil · recirculating":"coil · pump off"} warn={!recirc} />
            <Read label="Boil" v={t.boil} on={duty.boil>0} c={C.ember} sub={`GPIO 27 · ${duty.boil}%`} bar={duty.boil} />
            <Read label="Fermenter" v={t.ferm} on={fermState!=="idle"} c={C.glycol} sub={fermState} />
          </div>

          {/* step engine */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:12, marginBottom:12 }}>
            <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 }}>
                <span style={{ ...legend, fontSize:14, fontWeight:700 }}>Step {active+1} — {step.name}</span>
                <span style={{ ...legend, fontSize:11, color:C.faint }}>{step.vessel}</span>
              </div>

              {/* timer ring */}
              <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
                <Ring pct={pct} live={stepRun && atTemp} color={step.kind==="boil"?C.ember:C.amber}>
                  <div style={{ ...mono, fontSize:26, fontWeight:500 }}>{step.mins?fmt(left):"—"}</div>
                  <div style={{ ...legend, fontSize:9.5, color:C.faint }}>{step.kind==="ramp"?"ramp":"remaining"}</div>
                </Ring>
                <div style={{ flex:1, minWidth:150 }}>
                  <div style={{ ...mono, fontSize:30, color: atTemp?C.live:C.text }}>
                    {sensed.toFixed(1)}<span style={{ fontSize:14, color:C.faint }}>°F</span>
                  </div>
                  <div style={{ ...mono, fontSize:12, color:C.dim }}>target {target.toFixed(1)}°F</div>
                  <div style={{ ...legend, fontSize:11, marginTop:6,
                    color: blocked?C.ember:atTemp?C.live:C.amber }}>
                    {blocked ? "blocked by interlock" : atTemp ? "at temperature" : stepRun ? "heating" : "held"}
                  </div>
                </div>
              </div>

              {/* touch steppers */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:16 }}>
                <Stepper label="Target" v={target} set={setTarget} step={1} unit="°F" c={C.amber} />
                <Stepper label="Duration" v={step.mins} set={setMins} step={5} unit="min" c={C.dim} />
              </div>

              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <Big onClick={()=>setStepRun(s=>!s)} color={stepRun?C.ember:C.live}>{stepRun?"Hold":"Start step"}</Big>
                <Big onClick={advance} color={C.dim} ghost>Next</Big>
              </div>
            </div>

            {/* schedule */}
            <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16 }}>
              <div style={{ ...legend, fontSize:14, fontWeight:700, marginBottom:10 }}>Schedule</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {steps.map((s,i)=>(
                  <div key={s.id} onClick={()=>selectStep(i)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 12px", borderRadius:3, cursor:"pointer",
                      background: i===active?C.raised:C.bezel,
                      border:`1px solid ${i===active?C.amber:C.ruleSoft}`, opacity: i<active?0.5:1 }}>
                    <span style={{ ...mono, fontSize:11, color:C.faint, width:14 }}>{i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ ...legend, fontSize:12.5, fontWeight:600, color:i===active?C.text:C.dim }}>{s.name}</div>
                      <div style={{ ...mono, fontSize:10, color:C.faint }}>{s.vessel} · {s.target}°F{s.mins?` · ${s.mins}m`:""}</div>
                    </div>
                    {i<active && <span style={{ color:C.live, fontSize:14 }}>✓</span>}
                  </div>
                ))}
              </div>
              {step.hops && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.ruleSoft}` }}>
                  <div style={{ ...legend, fontSize:11, color:C.faint, marginBottom:6 }}>Hop additions</div>
                  {step.hops.map((h)=>(
                    <div key={h.at} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                      <span style={{ ...legend, fontSize:11.5, color: firedHops.current.has(`${step.id}-${h.at}`)?C.faint:C.dim }}>{h.name}</span>
                      <span style={{ ...mono, fontSize:11, color:C.faint }}>@ {h.at}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* interlock + recirc */}
          <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16, marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap" }}>
              <div>
                <div style={{ ...legend, fontSize:14, fontWeight:700 }}>Element interlock</div>
                <div style={{ fontSize:11.5, color:C.faint, marginTop:3 }}>Hardware selector — only one element can be energized</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {["HLT","OFF","BOIL"].map((p)=>(
                  <Tap key={p} on={interlock===p} onClick={()=>setInterlock(p)}
                    color={p==="OFF"?C.dim:p==="HLT"?C.amber:C.ember} pad="16px 26px" size={15}>{p}</Tap>
                ))}
              </div>
              <Tap on={recirc} onClick={()=>setRecirc(r=>!r)} color={C.live} pad="16px 22px" size={13}>
                Recirc pump {recirc?"on":"off"}
              </Tap>
            </div>
          </div>
        </>)}

        {/* ══ FERMENT ══ */}
        {tab==="ferment" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:12, marginBottom:12 }}>
            <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16 }}>
              <div style={{ ...legend, fontSize:14, fontWeight:700, marginBottom:14 }}>Conical</div>
              <div style={{ ...mono, fontSize:56, lineHeight:1, color: fermState==="cooling"?C.glycol:fermState==="heating"?C.amber:C.text }}>
                {t.ferm.toFixed(1)}<span style={{ fontSize:20, color:C.faint }}>°F</span>
              </div>
              <div style={{ ...legend, fontSize:12, color:C.dim, marginTop:8 }}>
                {fermState==="idle"?`in band ±${deadband}°F`:fermState}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:18 }}>
                <Stepper label="Target" v={fermTarget} set={(v)=>setFermTarget(clamp(v,34,80))} step={0.5} unit="°F" c={C.glycol} />
                <Stepper label="Deadband" v={deadband} set={(v)=>setDeadband(clamp(+v.toFixed(1),0.2,3))} step={0.1} unit="°F" c={C.glycol} />
              </div>
              <div style={{ fontSize:11, color:C.faint, marginTop:10, lineHeight:1.5 }}>
                Chiller self-regulates its bath — this output only moves glycol. A tight deadband makes the pump chatter.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:14 }}>
                <Pilot label="Glycol pump" gpio="22" on={fermState==="cooling"} c={C.glycol} />
                <Pilot label="Ferment heat" gpio="23" on={fermState==="heating"} c={C.amber} />
              </div>
            </div>
            <Graph view={view} series={{ ferm:true }} range={range} setRange={setRange} only="ferm"
              refLine={fermTarget} domain={[Math.min(34,fermTarget-10), Math.max(80,fermTarget+10)]} />
          </div>
        )}

        {/* ══ SETUP ══ */}
        {tab==="setup" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:12 }}>
            <Panel title="Sensors — PT100 via MAX31865">
              {[["HLT","8"],["Mash","7"],["Boil","25"],["Fermenter","24"]].map(([n,cs])=>(
                <Row key={n} k={n} v={`CS GPIO ${cs}`} sub="3-wire · 430Ω ref · SPI0" ok />
              ))}
              <Note>MISO 9 · MOSI 10 · CLK 11 shared. Only the CS pin differs per probe.</Note>
            </Panel>
            <Panel title="Actors">
              {[["HLT element","17","SSR 240 V"],["Boil element","27","SSR 240 V"],
                ["Glycol pump","22","relay 120 V"],["Ferment heat","23","relay 120 V"],
                ["Spare C","5","relay 120 V"],["Spare D","6","relay 120 V"]].map(([n,g,d])=>(
                <Row key={n} k={n} v={`GPIO ${g}`} sub={`${d} · inverted off`} ok />
              ))}
              <Note>Drive chain is non-inverting. If an output reads backwards, check Inverted first.</Note>
            </Panel>
            <Panel title="Kettles">
              <Row k="Mash" v="Mash sensor → HLT element" sub="HERMS — indirect via coil" ok />
              <Row k="Boil" v="Boil sensor → Boil element" sub="direct" ok />
              <Row k="HLT" v="HLT sensor → HLT element" sub="strike water only" ok />
              <div style={{ marginTop:12 }}>
                <Stepper label="HLT overshoot cap" v={hltCap} set={(v)=>setHltCap(clamp(v,2,20))} step={1} unit="°F over mash" c={C.amber} />
                <Stepper label="Boil power" v={boilPower} set={(v)=>setBoilPower(clamp(v,0,100))} step={5} unit="%" c={C.ember} />
              </div>
              <Note>The mash kettle drives the HLT actor — that mapping is the whole trick of HERMS.</Note>
            </Panel>
          </div>
        )}

        {/* ── graph (brew tab) ── */}
        {tab==="brew" && (
          <Graph view={view} series={series} setSeries={setSeries} range={range} setRange={setRange}
            refLine={target} domain={[50,220]} />
        )}

        <div style={{ fontSize:11, color:C.faint, marginTop:14, lineHeight:1.6 }}>
          Simulation — thermal constants are illustrative. All mains switching, the interlock and pilot lights live in the panel, never on the HAT.
        </div>
      </div>
    </div>
  );
}

/* ── components ───────────────────────────────────────────── */
function Graph({ view, series, setSeries, range, setRange, refLine, domain, only }) {
  const lines = only ? [[only, C.glycol]] : [["hlt",C.amber],["mash",C.live],["boil",C.ember],["ferm",C.glycol]];
  return (
    <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <span style={{ ...legend, fontSize:14, fontWeight:700 }}>Measurements over time</span>
        <div style={{ display:"flex", gap:6 }}>
          {[5,15,60,240].map((r)=>(
            <Tap key={r} on={range===r} onClick={()=>setRange(r)} color={C.dim} pad="8px 13px" size={12}>
              {r<60?`${r}m`:`${r/60}h`}
            </Tap>
          ))}
        </div>
      </div>
      <div style={{ height:260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={view} margin={{ top:4, right:8, bottom:0, left:-16 }}>
            <CartesianGrid stroke={C.ruleSoft} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="s" tickFormatter={(v)=>fmt(v)} tick={{ fill:C.faint, fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }}
              stroke={C.ruleSoft} tickLine={false} minTickGap={40} />
            <YAxis domain={domain} tick={{ fill:C.faint, fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }}
              stroke={C.ruleSoft} tickLine={false} width={44} />
            {refLine!==undefined && <ReferenceLine y={refLine} stroke={C.text} strokeDasharray="4 4" strokeOpacity={0.35} />}
            {lines.filter(([k])=>only||series[k]).map(([k,c])=>(
              <Line key={k} type="monotone" dataKey={k} stroke={c} dot={false} strokeWidth={k==="mash"?2.4:1.7} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!only && (
        <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
          {lines.map(([k,c])=>(
            <div key={k} onClick={()=>setSeries(s=>({ ...s, [k]:!s[k] }))}
              style={{ ...legend, fontSize:11.5, fontWeight:600, cursor:"pointer", padding:"8px 12px", borderRadius:3,
                border:`1px solid ${series[k]?c:C.ruleSoft}`, color:series[k]?c:C.faint,
                display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ width:12, height:2, background:series[k]?c:C.dead }} />{k}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Read({ label, v, on, c, sub, bar, warn }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${on?c:C.rule}`, borderRadius:4, padding:12, position:"relative", overflow:"hidden" }}>
      {on && <div style={{ position:"absolute", inset:0, background:c, opacity:.055 }} />}
      <div style={{ position:"relative" }}>
        <div style={{ ...legend, fontSize:12, fontWeight:700, color:on?c:C.dim }}>{label}</div>
        <div style={{ ...mono, fontSize:32, lineHeight:1.1, marginTop:4, color:on?c:C.text }}>
          {v.toFixed(1)}<span style={{ fontSize:13, color:C.faint }}>°F</span>
        </div>
        {bar!==undefined && (
          <div style={{ marginTop:7, height:3, background:C.dead, borderRadius:2 }}>
            <div style={{ height:"100%", width:`${bar}%`, background:c, transition:"width .3s" }} />
          </div>
        )}
        <div style={{ ...legend, fontSize:10, color:warn?C.ember:C.faint, marginTop:7 }}>{sub}</div>
      </div>
    </div>
  );
}

function Ring({ pct, live, color, children }) {
  const R=44, CIRC=2*Math.PI*R;
  return (
    <div style={{ position:"relative", width:112, height:112, flexShrink:0 }}>
      <svg width="112" height="112" style={{ transform:"rotate(-90deg)" }}>
        <circle cx="56" cy="56" r={R} fill="none" stroke={C.dead} strokeWidth="6" />
        <circle cx="56" cy="56" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-clamp(pct,0,1))}
          style={{ transition:"stroke-dashoffset .4s", opacity: live?1:.4 }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        {children}
      </div>
    </div>
  );
}

function Stepper({ label, v, set, step, unit, c }) {
  const btn = { ...legend, fontSize:22, fontWeight:600, width:46, height:46, borderRadius:3, cursor:"pointer",
    border:`1px solid ${C.rule}`, background:C.bezel, color:C.text, flexShrink:0 };
  return (
    <div>
      <div style={{ ...legend, fontSize:10.5, color:C.faint, marginBottom:5 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <button style={btn} onClick={()=>set(+(v-step).toFixed(1))}>−</button>
        <div style={{ ...mono, flex:1, textAlign:"center", fontSize:19, color:c, fontWeight:500 }}>
          {v}<span style={{ fontSize:9.5, color:C.faint }}> {unit}</span>
        </div>
        <button style={btn} onClick={()=>set(+(v+step).toFixed(1))}>+</button>
      </div>
    </div>
  );
}

function Tap({ on, onClick, color, children, pad="10px 16px", size=13 }) {
  return (
    <button onClick={onClick} style={{ ...legend, fontSize:size, fontWeight:600, padding:pad, borderRadius:3, cursor:"pointer",
      border:`1.5px solid ${on?color:C.rule}`, background:on?`${color}22`:"transparent", color:on?color:C.faint, whiteSpace:"nowrap" }}>
      {children}
    </button>
  );
}

function Big({ onClick, color, children, ghost }) {
  return (
    <button onClick={onClick} style={{ ...legend, flex:1, fontSize:14, fontWeight:700, padding:"15px 10px", borderRadius:3,
      cursor:"pointer", border:`1.5px solid ${color}`, background: ghost?"transparent":`${color}26`, color }}>
      {children}
    </button>
  );
}

function Pilot({ label, gpio, on, c }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 11px", background:C.bezel,
      border:`1px solid ${on?c:C.ruleSoft}`, borderRadius:3 }}>
      <span style={{ width:11, height:11, borderRadius:"50%", background:on?c:C.dead,
        boxShadow:on?`0 0 8px ${c}`:"none", flexShrink:0 }} />
      <div>
        <div style={{ ...legend, fontSize:11, fontWeight:600, color:on?C.text:C.dim }}>{label}</div>
        <div style={{ ...mono, fontSize:9, color:C.faint }}>GPIO {gpio}</div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.rule}`, borderRadius:4, padding:16 }}>
      <div style={{ ...legend, fontSize:14, fontWeight:700, marginBottom:12 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ k, v, sub, ok }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 11px", marginBottom:6,
      background:C.bezel, border:`1px solid ${C.ruleSoft}`, borderRadius:3 }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:ok?C.live:C.dead, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ ...legend, fontSize:12, fontWeight:600 }}>{k}</div>
        <div style={{ ...mono, fontSize:9.5, color:C.faint }}>{sub}</div>
      </div>
      <span style={{ ...mono, fontSize:10.5, color:C.dim, whiteSpace:"nowrap" }}>{v}</span>
    </div>
  );
}
function Note({ children }) {
  return <div style={{ fontSize:11, color:C.faint, marginTop:10, lineHeight:1.5, paddingTop:10, borderTop:`1px solid ${C.ruleSoft}` }}>{children}</div>;
}
