/**
 * HardwareTab — the "what is wired where" page.
 * Nothing here is predetermined: every sensor CS pin, output GPIO, sense
 * input, the buzzer, and the interlock sense are editable, with a live
 * 40-pin header map showing assignments and flagging conflicts.
 */
import React, { useState } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Row, Tap, Note, Field, Big } from "../ui.jsx";
import { put } from "../api.js";
import PinMap from "../PinMap.jsx";

export default function HardwareTab({ state, config, setConfig }) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const cfg = draft || config;

  const startEdit = () => setDraft(JSON.parse(JSON.stringify(config)));
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function save() {
    try {
      await put("/api/config", draft);
      setConfig(draft); setDraft(null); setEditing(null);
      flash("Saved — engine reloaded");
    } catch (e) { flash("✗ " + e.message); }
  }

  const upd = (kind, i, patch) => setDraft({ ...draft, [kind]: draft[kind].map((e, j) => j === i ? { ...e, ...patch } : e) });
  const add = (kind, tpl) => {
    setDraft({ ...draft, [kind]: [...(draft[kind] || []), tpl] });
    setEditing({ kind, index: (draft[kind] || []).length });
  };
  const remove = (kind, i) => {
    setDraft({ ...draft, [kind]: draft[kind].filter((_, j) => j !== i) });
    setEditing(null);
  };

  return (<>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
      {!draft
        ? <Tap onClick={startEdit} color={C.amber} pad="12px 20px" size={13}>Edit hardware config</Tap>
        : <>
          <Tap onClick={save} on color={C.live} pad="12px 20px" size={13}>Save & reload engine</Tap>
          <Tap onClick={() => { setDraft(null); setEditing(null); }} color={C.faint} pad="12px 20px" size={13}>Discard</Tap>
        </>}
      {msg && <span style={{ ...legend, fontSize: 12, color: msg.startsWith("✗") ? C.ember : C.live }}>{msg}</span>}
      <span style={{ flex: 1 }} />
      <span style={{ ...legend, fontSize: 11, color: C.faint }}>driver: {state.driver}</span>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>

      {/* ── the 40-pin header ── */}
      <Panel title="Raspberry Pi 40-pin header" right={<span style={{ ...legend, fontSize: 10, color: C.faint }}>live from config</span>}>
        <PinMap config={cfg} />
        <Note>Tap "Edit hardware config", then tap any entry in the panels here to change its pin. Conflicts light up red on the header before you save.</Note>
      </Panel>

      {/* ── sensors ── */}
      <Panel title={`Temperature probes (${cfg.sensors.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("sensors", { id: `sensor${cfg.sensors.length + 1}`, name: "New probe", type: "max31865", cs: 0, calibrationOffset: 0, simKey: "hlt" })}>+ Add</Tap>}>
        {cfg.sensors.map((s, i) => editing?.kind === "sensors" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("sensors", i)}>
            <Field label="ID" value={s.id} onChange={(v) => upd("sensors", i, { id: v })} />
            <Field label="Name" value={s.name} onChange={(v) => upd("sensors", i, { name: v })} />
            <Field label="CS GPIO (BCM)" type="number" value={s.cs} onChange={(v) => upd("sensors", i, { cs: v })} />
            <Field label="Calibration offset °F" type="number" value={s.calibrationOffset} onChange={(v) => upd("sensors", i, { calibrationOffset: v })} />
          </Editor>
        ) : (
          <Row key={i} k={s.name} v={`CS GPIO ${s.cs}`} ok={!state.temps[s.id]?.fault}
            sub={`${s.type} · ${cfg.rtd.wires}-wire · ${cfg.rtd.refResistor}Ω ref${s.calibrationOffset ? ` · ${s.calibrationOffset > 0 ? "+" : ""}${s.calibrationOffset}°F` : ""}${state.temps[s.id]?.fault ? " · FAULT" : ""}`}
            onClick={draft ? () => setEditing({ kind: "sensors", index: i }) : undefined} />
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          {draft ? <>
            <Field label="RTD ref resistor (Ω)" type="number" value={cfg.rtd.refResistor} onChange={(v) => setDraft({ ...draft, rtd: { ...draft.rtd, refResistor: v } })} />
            <Field label="RTD wires (2/3/4)" type="number" value={cfg.rtd.wires} onChange={(v) => setDraft({ ...draft, rtd: { ...draft.rtd, wires: v } })} />
          </> : null}
        </div>
        <Note>All probes share SPI0 (MISO 9 · MOSI 10 · CLK 11) — only the CS pin differs per probe.</Note>
      </Panel>

      {/* ── outputs ── */}
      <Panel title={`Outputs (${cfg.actors.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("actors", { id: `actor${cfg.actors.length + 1}`, name: "New output", gpio: 0, kind: "relay", volts: 120, modulated: false, control: "gpio" })}>+ Add</Tap>}>
        {cfg.actors.map((a, i) => editing?.kind === "actors" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("actors", i)}>
            <Field label="ID" value={a.id} onChange={(v) => upd("actors", i, { id: v })} />
            <Field label="Name" value={a.name} onChange={(v) => upd("actors", i, { name: v })} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <Tap on={a.control !== "manual"} color={C.amber} pad="9px 14px" size={11}
                onClick={() => upd("actors", i, { control: "gpio" })}>GPIO-switched</Tap>
              <Tap on={a.control === "manual"} color={C.live} pad="9px 14px" size={11}
                onClick={() => upd("actors", i, { control: "manual", gpio: null })}>manual 120V outlet</Tap>
            </div>
            {a.control !== "manual" && <>
              <Field label="GPIO (BCM)" type="number" value={a.gpio} onChange={(v) => upd("actors", i, { gpio: v })} />
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["ssr", "relay"].map((k) => <Tap key={k} on={a.kind === k} color={C.amber} pad="9px 14px" size={11} onClick={() => upd("actors", i, { kind: k, modulated: k === "ssr" })}>{k}</Tap>)}
                <Tap on={a.modulated} color={C.glycol} pad="9px 14px" size={11} onClick={() => upd("actors", i, { modulated: !a.modulated })}>modulated</Tap>
              </div>
            </>}
            <Field label="Sense GPIO (optional — pilot relay / opto)" type="number" value={a.senseGpio ?? ""} onChange={(v) => upd("actors", i, { senseGpio: v === "" || isNaN(v) ? null : v })} />
          </Editor>
        ) : (
          <Row key={i} k={a.name}
            v={a.control === "manual" ? (a.senseGpio != null ? `sense GPIO ${a.senseGpio}` : "soft switch") : `GPIO ${a.gpio}`} ok
            sub={a.control === "manual" ? `manual 120V outlet · ${a.role || "load"}` : `${a.kind} ${a.volts}V${a.modulated ? " · time-proportioned" : ""}`}
            onClick={draft ? () => setEditing({ kind: "actors", index: i }) : undefined} />
        ))}
        <Note>Drive chain is non-inverting: GPIO high → load on. If an output reads backwards, check wiring before changing anything here.</Note>
      </Panel>

      {/* ── sense inputs ── */}
      <Panel title={`Sense inputs (${(cfg.inputs || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("inputs", { id: `input${(cfg.inputs || []).length + 1}`, name: "New sense input", gpio: null, linkedActor: null, invert: false })}>+ Add</Tap>}>
        {(cfg.inputs || []).length === 0 && (
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
            Wire anything manually-switched back to a free GPIO (pilot relay across a 120 V outlet,
            float switch, door contact) and add it here — it shows live, and linking it to an output
            makes the rig diagram follow hardware truth instead of the soft switch.
          </div>
        )}
        {(cfg.inputs || []).map((inp, i) => editing?.kind === "inputs" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("inputs", i)}>
            <Field label="ID" value={inp.id} onChange={(v) => upd("inputs", i, { id: v })} />
            <Field label="Name" value={inp.name} onChange={(v) => upd("inputs", i, { name: v })} />
            <Field label="GPIO (BCM)" type="number" value={inp.gpio} onChange={(v) => upd("inputs", i, { gpio: v })} />
            <Select label="Linked output (optional)" value={inp.linkedActor || ""} opts={["", ...cfg.actors.map((a) => a.id)]}
              onChange={(v) => upd("inputs", i, { linkedActor: v || null })} />
            <Tap on={!!inp.invert} color={C.glycol} pad="9px 14px" size={11}
              onClick={() => upd("inputs", i, { invert: !inp.invert })}>inverted</Tap>
          </Editor>
        ) : (
          <Row key={i} k={inp.name} v={state.inputs?.[inp.id] === undefined ? "—" : state.inputs[inp.id] ? "ON" : "off"}
            ok={!!state.inputs?.[inp.id]}
            sub={`GPIO ${inp.gpio ?? "?"}${inp.linkedActor ? ` → ${inp.linkedActor}` : " · monitor only"}${inp.invert ? " · inverted" : ""}`}
            onClick={draft ? () => setEditing({ kind: "inputs", index: i }) : undefined} />
        ))}
        <Note>Sensed state beats the soft switch for linked outputs — docs/outlet-sensing.md covers the wiring options.</Note>
      </Panel>

      {/* ── vessels ── */}
      <Panel title={`Vessels (${cfg.vessels.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("vessels", { id: `vessel${cfg.vessels.length + 1}`, name: "New vessel", kind: "kettle", sensor: cfg.sensors[0]?.id, element: null, graphic: "kettle", volumeGal: 10, levelGal: 0 })}>+ Add</Tap>}>
        {cfg.vessels.map((v, i) => editing?.kind === "vessels" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("vessels", i)}>
            <Field label="Name" value={v.name} onChange={(x) => upd("vessels", i, { name: x })} />
            <Select label="Kind" value={v.kind} opts={["kettle", "mashtun", "conical"]} onChange={(x) => upd("vessels", i, { kind: x, graphic: x === "conical" ? "conical" : x === "mashtun" ? "mashtun" : v.graphic })} />
            <Select label="Sensor" value={v.sensor} opts={cfg.sensors.map((s) => s.id)} onChange={(x) => upd("vessels", i, { sensor: x })} />
            <Select label="Element" value={v.element || ""} opts={["", ...cfg.actors.filter((a) => a.kind === "ssr").map((a) => a.id)]} onChange={(x) => upd("vessels", i, { element: x || null })} />
            <Select label="Graphic" value={v.graphic} opts={["kettle", "kettle-coil", "mashtun", "conical"]} onChange={(x) => upd("vessels", i, { graphic: x })} />
            <Field label="Volume (gal)" type="number" value={v.volumeGal} onChange={(x) => upd("vessels", i, { volumeGal: x })} />
          </Editor>
        ) : (
          <Row key={i} k={v.name} v={v.element ? `element: ${v.element}` : "no element"} ok
            sub={`${v.kind} · sensor ${v.sensor} · ${v.volumeGal || "?"} gal`}
            onClick={draft ? () => setEditing({ kind: "vessels", index: i }) : undefined} />
        ))}
      </Panel>

      {/* ── controllers + interlock + aux ── */}
      <Panel title="Controllers, interlock & aux">
        {cfg.controllers.map((c, i) => (
          <Row key={i} k={c.name} ok
            v={c.type === "pid" ? `kp ${c.params.kp} · ki ${c.params.ki}` : c.type === "power" ? `${c.params.power}%` : `±${c.params.deadband}°F`}
            sub={c.type === "hysteresis" ? `${c.sensor} → ${c.coolActor}/${c.heatActor}` : `${c.sensor} → ${c.actor} · ${c.type}`}
            onClick={draft ? () => setEditing({ kind: "controllers", index: i }) : undefined} />
        ))}
        {editing?.kind === "controllers" && (() => {
          const i = editing.index, c = cfg.controllers[i];
          return (
            <Editor onDone={() => setEditing(null)} onRemove={() => remove("controllers", i)}>
              <Field label="Name" value={c.name} onChange={(v) => upd("controllers", i, { name: v })} />
              {c.type === "pid" && <>
                <Field label="kp" type="number" value={c.params.kp} onChange={(v) => upd("controllers", i, { params: { ...c.params, kp: v } })} />
                <Field label="ki" type="number" value={c.params.ki} onChange={(v) => upd("controllers", i, { params: { ...c.params, ki: v } })} />
              </>}
              {c.type === "power" && <Field label="Boil power %" type="number" value={c.params.power} onChange={(v) => upd("controllers", i, { params: { ...c.params, power: v } })} />}
              {c.constraints?.hltOvershootCapF != null &&
                <Field label="HLT overshoot cap °F" type="number" value={c.constraints.hltOvershootCapF} onChange={(v) => upd("controllers", i, { constraints: { ...c.constraints, hltOvershootCapF: v } })} />}
            </Editor>
          );
        })()}
        {draft && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <Field label="Interlock sense GPIO" type="number" value={cfg.interlock?.senseGpio ?? ""}
              onChange={(v) => setDraft({ ...draft, interlock: { ...draft.interlock, senseGpio: v === "" || isNaN(v) ? null : v } })} />
            <Field label="Buzzer GPIO" type="number" value={cfg.aux?.buzzer ?? ""}
              onChange={(v) => setDraft({ ...draft, aux: { ...draft.aux, buzzer: v === "" || isNaN(v) ? null : v } })} />
            <Field label="Altitude (ft)" type="number" value={cfg.altitudeFt ?? 0}
              onChange={(v) => setDraft({ ...draft, altitudeFt: +v || 0 })} />
            <div style={{ background: C.bezel, border: `1px solid ${C.ruleSoft}`, borderLeft: `3px solid ${C.glycol}88`, borderRadius: 3, padding: "8px 10px", alignSelf: "end" }}>
              <div style={{ ...legend, fontSize: 9.5, fontWeight: 600, color: C.dim }}>ƒ Water boils at</div>
              <div style={{ ...mono, fontSize: 15, color: C.glycol, marginTop: 2 }}>
                {(212 - 1.9 * ((+cfg.altitudeFt || 0) / 1000)).toFixed(1)}°F
              </div>
            </div>
          </div>
        )}
        {!draft && (cfg.altitudeFt || 0) > 0 && (
          <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 8 }}>
            Altitude {cfg.altitudeFt} ft → water boils at {(212 - 1.9 * (cfg.altitudeFt / 1000)).toFixed(1)}°F.
            Boil steps gate on this, not 212°F.
          </div>
        )}
        <Note>The mash controller drives the HLT element — that mapping is the whole trick of HERMS. Don't "fix" it.</Note>
      </Panel>
    </div>
  </>);
}

function Editor({ children, onDone, onRemove }) {
  return (
    <div style={{ background: C.raised, border: `1px solid ${C.amber}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
      {children}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Big onClick={onDone} color={C.live}>Done</Big>
        <Big onClick={() => confirm("Remove this entry?") && onRemove()} color={C.ember} ghost>Remove</Big>
      </div>
    </div>
  );
}

function Select({ label, value, opts, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ ...legend, fontSize: 10, color: C.faint, marginBottom: 3 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...mono, width: "100%", fontSize: 14, padding: "10px", background: C.bezel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: 3 }}>
        {opts.map((o) => <option key={o} value={o}>{o === "" ? "(none)" : o}</option>)}
      </select>
    </label>
  );
}
