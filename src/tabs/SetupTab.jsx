/**
 * SetupTab — the extensibility surface (requirement #5).
 *
 * Everything the server controls is data: sensors, actors, vessels,
 * controllers. This tab edits a draft of the whole config and PUTs it
 * back; the engine hot-reloads. Add a kettle, a pump, a probe — no code.
 * Also home to phone alerts (push), manual actor overrides, and sim controls.
 */
import React, { useState } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Row, Tap, Note, Field, Big } from "../ui.jsx";
import { put, post, get, enablePush } from "../api.js";

export default function SetupTab({ state, config, setConfig }) {
  const [draft, setDraft] = useState(null);           // null = viewing, object = editing
  const [editing, setEditing] = useState(null);       // {kind, index}
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

  const upd = (kind, i, patch) => {
    const d = { ...draft, [kind]: draft[kind].map((e, j) => j === i ? { ...e, ...patch } : e) };
    setDraft(d);
  };
  const add = (kind, tpl) => {
    setDraft({ ...draft, [kind]: [...draft[kind], tpl] });
    setEditing({ kind, index: draft[kind].length });
  };
  const remove = (kind, i) => {
    setDraft({ ...draft, [kind]: draft[kind].filter((_, j) => j !== i) });
    setEditing(null);
  };

  return (<>
    {/* edit bar */}
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
      {!draft
        ? <Tap onClick={startEdit} color={C.amber} pad="12px 20px" size={13}>Edit configuration</Tap>
        : <>
          <Tap onClick={save} on color={C.live} pad="12px 20px" size={13}>Save & reload engine</Tap>
          <Tap onClick={() => { setDraft(null); setEditing(null); }} color={C.faint} pad="12px 20px" size={13}>Discard</Tap>
        </>}
      {msg && <span style={{ ...legend, fontSize: 12, color: msg.startsWith("✗") ? C.ember : C.live }}>{msg}</span>}
      <span style={{ flex: 1 }} />
      <span style={{ ...legend, fontSize: 11, color: C.faint }}>
        driver: {state.driver} · uptime {Math.floor(state.uptimeSec / 60)}m
      </span>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>

      {/* ── phone alerts ── */}
      <Panel title="Phone alerts & remote view">
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
          Open <b style={{ ...mono, color: C.text }}>{location.origin}</b> on your phone (same Wi-Fi), add it to
          your home screen, then enable alerts below on that device. Hop additions, step changes, timers and
          faults will push even with the screen off.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tap color={C.live} pad="12px 18px" size={13} onClick={async () => {
            try { await enablePush(navigator.userAgent.includes("Mobile") ? "phone" : "computer"); flash("This device will get alerts"); }
            catch (e) { flash("✗ " + e.message); }
          }}>Enable alerts on this device</Tap>
          <Tap color={C.dim} pad="12px 18px" size={13} onClick={() => post("/api/push/test").then((r) => flash(`Test sent`)).catch((e) => flash("✗ " + e.message))}>Send test</Tap>
        </div>
        <PushSubs />
        {location.protocol === "http:" && location.hostname !== "localhost" && (
          <Note>⚠ You're on plain HTTP — browsers only allow push on HTTPS. Use the https:// address (port 8443) after running the cert step in the setup guide.</Note>
        )}
      </Panel>

      {/* ── manual overrides ── */}
      <Panel title="Manual output control">
        {config.actors.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "8px 10px", background: C.bezel, border: `1px solid ${state.actorOn[a.id] ? C.amber : C.ruleSoft}`, borderRadius: 3, flexWrap: "wrap" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: state.actorOn[a.id] ? C.amber : C.dead, boxShadow: state.actorOn[a.id] ? `0 0 7px ${C.amber}` : "none" }} />
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ ...legend, fontSize: 11.5, fontWeight: 600 }}>{a.name}</div>
              <div style={{ ...mono, fontSize: 9, color: C.faint }}>
                {a.control === "manual" ? `manual 120V outlet · ${a.role || a.kind}` : `GPIO ${a.gpio} · ${a.kind} ${a.volts}V`}
              </div>
            </div>
            {(a.control === "manual" ? ["on", "off"] : ["auto", "on", "off"]).map((m) => (
              <Tap key={m} on={state.manual[a.id] === m} color={m === "on" ? C.amber : m === "off" ? C.ember : C.dim}
                pad="8px 12px" size={10.5} onClick={() => post(`/api/actors/${a.id}`, { mode: m })}>{m}</Tap>
            ))}
          </div>
        ))}
        <Note>“on/off” pins an output regardless of controllers. Elements still obey the hardware interlock — software can’t override it.</Note>
      </Panel>

      {/* ── sensors ── */}
      <Panel title={`Sensors (${cfg.sensors.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("sensors", { id: `sensor${cfg.sensors.length + 1}`, name: "New probe", type: "max31865", cs: 0, calibrationOffset: 0 })}>+ Add</Tap>}>
        {cfg.sensors.map((s, i) => editing?.kind === "sensors" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("sensors", i)}>
            <Field label="ID" value={s.id} onChange={(v) => upd("sensors", i, { id: v })} />
            <Field label="Name" value={s.name} onChange={(v) => upd("sensors", i, { name: v })} />
            <Field label="CS GPIO" type="number" value={s.cs} onChange={(v) => upd("sensors", i, { cs: v })} />
            <Field label="Calibration offset °F" type="number" value={s.calibrationOffset} onChange={(v) => upd("sensors", i, { calibrationOffset: v })} />
          </Editor>
        ) : (
          <Row key={i} k={s.name} v={`CS GPIO ${s.cs}`} ok={!state.temps[s.id]?.fault}
            sub={`${s.type} · ${cfg.rtd.wires}-wire · ${cfg.rtd.refResistor}Ω ref${s.calibrationOffset ? ` · ${s.calibrationOffset > 0 ? "+" : ""}${s.calibrationOffset}°F` : ""}`}
            onClick={draft ? () => setEditing({ kind: "sensors", index: i }) : undefined} />
        ))}
        <Note>MISO 9 · MOSI 10 · CLK 11 shared. Only the CS pin differs per probe. {draft && "Tap a row to edit."}</Note>
      </Panel>

      {/* ── actors ── */}
      <Panel title={`Outputs (${cfg.actors.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("actors", { id: `actor${cfg.actors.length + 1}`, name: "New output", gpio: 0, kind: "relay", volts: 120, modulated: false })}>+ Add</Tap>}>
        {cfg.actors.map((a, i) => editing?.kind === "actors" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("actors", i)}>
            <Field label="ID" value={a.id} onChange={(v) => upd("actors", i, { id: v })} />
            <Field label="Name" value={a.name} onChange={(v) => upd("actors", i, { name: v })} />
            <Field label="GPIO" type="number" value={a.gpio} onChange={(v) => upd("actors", i, { gpio: v })} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {["ssr", "relay"].map((k) => <Tap key={k} on={a.kind === k} color={C.amber} pad="9px 14px" size={11} onClick={() => upd("actors", i, { kind: k, modulated: k === "ssr" })}>{k}</Tap>)}
              <Tap on={a.modulated} color={C.glycol} pad="9px 14px" size={11} onClick={() => upd("actors", i, { modulated: !a.modulated })}>modulated</Tap>
            </div>
          </Editor>
        ) : (
          <Row key={i} k={a.name} v={`GPIO ${a.gpio}`} ok
            sub={`${a.kind} ${a.volts}V${a.modulated ? " · time-proportioned" : ""} · inverted off`}
            onClick={draft ? () => setEditing({ kind: "actors", index: i }) : undefined} />
        ))}
        <Note>Drive chain is non-inverting. If an output reads backwards, check wiring before flipping anything here.</Note>
      </Panel>

      {/* ── sense inputs: monitor any pin ── */}
      <Panel title={`Sense inputs (${(cfg.inputs || []).length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => {
          setDraft({ ...draft, inputs: [...(draft.inputs || []), { id: `input${(draft.inputs || []).length + 1}`, name: "New sense input", gpio: null, linkedActor: null, invert: false }] });
          setEditing({ kind: "inputs", index: (draft.inputs || []).length });
        }}>+ Add</Tap>}>
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
            <Field label="GPIO" type="number" value={inp.gpio} onChange={(v) => upd("inputs", i, { gpio: v })} />
            <Select label="Linked output (optional)" value={inp.linkedActor || ""} opts={["", ...cfg.actors.map((a) => a.id)]}
              onChange={(v) => upd("inputs", i, { linkedActor: v || null })} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <Tap on={!!inp.invert} color={C.glycol} pad="9px 14px" size={11}
                onClick={() => upd("inputs", i, { invert: !inp.invert })}>inverted</Tap>
            </div>
          </Editor>
        ) : (
          <Row key={i} k={inp.name} v={state.inputs?.[inp.id] === undefined ? "—" : state.inputs[inp.id] ? "ON" : "off"}
            ok={!!state.inputs?.[inp.id]}
            sub={`GPIO ${inp.gpio ?? "?"}${inp.linkedActor ? ` → ${inp.linkedActor}` : " · monitor only"}${inp.invert ? " · inverted" : ""}`}
            onClick={draft ? () => setEditing({ kind: "inputs", index: i }) : undefined} />
        ))}
        <Note>Sensed state beats the soft switch for linked outputs. See docs/outlet-sensing.md for wiring options.</Note>
      </Panel>

      {/* ── vessels ── */}
      <Panel title={`Vessels (${cfg.vessels.length})`} right={draft &&
        <Tap color={C.live} pad="8px 12px" size={11} onClick={() => add("vessels", { id: `vessel${cfg.vessels.length + 1}`, name: "New vessel", kind: "kettle", sensor: cfg.sensors[0]?.id, element: null, graphic: "kettle", volumeGal: 10 })}>+ Add</Tap>}>
        {cfg.vessels.map((v, i) => editing?.kind === "vessels" && editing.index === i ? (
          <Editor key={i} onDone={() => setEditing(null)} onRemove={() => remove("vessels", i)}>
            <Field label="Name" value={v.name} onChange={(x) => upd("vessels", i, { name: x })} />
            <Select label="Kind" value={v.kind} opts={["kettle", "mashtun", "conical"]} onChange={(x) => upd("vessels", i, { kind: x, graphic: x === "conical" ? "conical" : x === "mashtun" ? "mashtun" : v.graphic })} />
            <Select label="Sensor" value={v.sensor} opts={cfg.sensors.map((s) => s.id)} onChange={(x) => upd("vessels", i, { sensor: x })} />
            <Select label="Element" value={v.element || ""} opts={["", ...cfg.actors.filter((a) => a.kind === "ssr").map((a) => a.id)]} onChange={(x) => upd("vessels", i, { element: x || null })} />
            <Select label="Graphic" value={v.graphic} opts={["kettle", "kettle-coil", "mashtun", "conical"]} onChange={(x) => upd("vessels", i, { graphic: x })} />
          </Editor>
        ) : (
          <Row key={i} k={v.name} v={v.element ? `element: ${v.element}` : "no element"} ok
            sub={`${v.kind} · sensor ${v.sensor} · ${v.volumeGal || "?"} gal`}
            onClick={draft ? () => setEditing({ kind: "vessels", index: i }) : undefined} />
        ))}
      </Panel>

      {/* ── controllers ── */}
      <Panel title={`Controllers (${cfg.controllers.length})`}>
        {cfg.controllers.map((c, i) => (
          <Row key={i} k={c.name} ok
            v={c.type === "pid" ? `kp ${c.params.kp} · ki ${c.params.ki}` : c.type === "power" ? `${c.params.power}%` : `±${c.params.deadband}°F`}
            sub={c.type === "hysteresis" ? `${c.sensor} → ${c.coolActor}/${c.heatActor}` : `${c.sensor} → ${c.actor} · ${c.type}${c.note ? " · " + c.note : ""}`}
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
        <Note>The mash controller drives the HLT element — that mapping is the whole trick of HERMS. Don't "fix" it.</Note>
      </Panel>

      {/* ── simulation ── */}
      {state.driver === "sim" && (
        <Panel title="Simulation">
          <div style={{ ...legend, fontSize: 11, color: C.faint, marginBottom: 8 }}>Time multiplier</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 10, 60].map((s) => (
              <Tap key={s} on={state.simSpeed === s} color={C.dim} pad="10px 16px" size={13}
                onClick={() => post("/api/sim/speed", { speed: s })}>{s}×</Tap>
            ))}
            <Tap on={!state.paused} color={C.live} pad="10px 16px" size={13}
              onClick={() => post("/api/sim/pause", { paused: !state.paused })}>{state.paused ? "Paused" : "Live"}</Tap>
          </div>
          <Note>No hardware attached — the server is running its thermal model. On the Pi, start with <span style={mono}>--hardware</span> and this panel disappears.</Note>
        </Panel>
      )}
    </div>
  </>);
}

function Editor({ children, onDone, onRemove }) {
  return (
    <div style={{ background: C.raised, border: `1px solid ${C.amber}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
      {children}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
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

function PushSubs() {
  const [subs, setSubs] = useState(null);
  React.useEffect(() => { get("/api/push/subs").then(setSubs).catch(() => {}); }, []);
  if (!subs?.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {subs.map((s, i) => (
        <div key={i} style={{ ...mono, fontSize: 10, color: C.faint, padding: "4px 0" }}>
          ✓ {s.label} — since {new Date(s.addedAt).toLocaleDateString()}
        </div>
      ))}
    </div>
  );
}
