/** SystemTab — phone alerts, manual output overrides, simulation controls. */
import React, { useState } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Tap, Note } from "../ui.jsx";
import { post, get, enablePush } from "../api.js";

export default function SystemTab({ state, config }) {
  const [msg, setMsg] = useState("");
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  return (<>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      {msg && <span style={{ ...legend, fontSize: 12, color: msg.startsWith("✗") ? C.ember : C.live }}>{msg}</span>}
      <span style={{ flex: 1 }} />
      <span style={{ ...legend, fontSize: 11, color: C.faint }}>
        driver: {state.driver} · uptime {Math.floor(state.uptimeSec / 60)}m
      </span>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>

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
          <Tap color={C.dim} pad="12px 18px" size={13} onClick={() => post("/api/push/test").then(() => flash("Test sent")).catch((e) => flash("✗ " + e.message))}>Send test</Tap>
        </div>
        <PushSubs />
        {location.protocol === "http:" && location.hostname !== "localhost" && (
          <Note>⚠ You're on plain HTTP — browsers only allow push on HTTPS. Use the https:// address (port 8443) after running the cert step in the setup guide.</Note>
        )}
      </Panel>

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
          <Note>No hardware attached — the server is running its thermal model. Step timers accelerate with the multiplier too, so a full brew day can run in a few minutes. On the Pi, start with <span style={mono}>--hardware</span> and this panel disappears.</Note>
        </Panel>
      )}
    </div>
  </>);
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
