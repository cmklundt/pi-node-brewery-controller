/**
 * App.jsx — the panel shell. All control logic lives on the server now;
 * this is a live view + command surface. The same app serves as the Pi's
 * kiosk screen, a laptop dashboard, and the phone PWA (requirement #7).
 */
import React, { useState, useMemo } from "react";
import { C, FONTS, legend, body } from "./theme.js";
import { useBrewery } from "./api.js";
import { Tap } from "./ui.jsx";
import BrewTab from "./tabs/BrewTab.jsx";
import FermentTab from "./tabs/FermentTab.jsx";
import RecipeTab from "./tabs/RecipeTab.jsx";
import HardwareTab from "./tabs/HardwareTab.jsx";
import ReportsTab from "./tabs/ReportsTab.jsx";
import SystemTab from "./tabs/SystemTab.jsx";

export default function App() {
  const { state, config, setConfig, events, connected } = useBrewery();
  const [tab, setTab] = useState("brew");
  const [dismissed, setDismissed] = useState(new Set());

  const banners = useMemo(
    () => events.filter((e) => (e.severity === "alert" || e.severity === "fault") && !dismissed.has(e.id)).slice(0, 3),
    [events, dismissed]
  );

  if (!state || !config) {
    return (
      <div style={{ ...body, background: C.panel, minHeight: "100vh", color: C.dim, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <style>{FONTS}</style>
        <div style={{ ...legend, fontSize: 18, fontWeight: 700 }}>HERMS CONTROL</div>
        <div style={{ fontSize: 13 }}>{connected ? "loading…" : "connecting to control server…"}</div>
      </div>
    );
  }

  return (
    <div style={{ ...body, background: C.panel, minHeight: "100vh", color: C.text }}>
      <style>{FONTS}</style>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.ruleSoft}`, background: C.bezel, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: connected ? C.live : C.ember, boxShadow: `0 0 7px ${connected ? C.live : C.ember}` }} />
          <div style={{ ...legend, fontSize: 19, fontWeight: 700 }}>{config.name || "HERMS Control"}</div>
          {state.driver === "sim" && <span style={{ ...legend, fontSize: 10, color: C.glycol, border: `1px solid ${C.glycol}`, borderRadius: 3, padding: "3px 7px" }}>SIM</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["brew", "Brew"], ["ferment", "Ferment"], ["recipe", "Recipe"], ["hardware", "Hardware"], ["reports", "Reports"], ["system", "System"]].map(([k, l]) => (
            <Tap key={k} on={tab === k} onClick={() => setTab(k)} color={C.amber} pad="10px 16px">{l}</Tap>
          ))}
        </div>
      </div>

      {/* alert banners */}
      {banners.length > 0 && (
        <div style={{ padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: 6, maxWidth: 1240, margin: "0 auto" }}>
          {banners.map((a) => (
            <div key={a.id} onClick={() => setDismissed((d) => new Set([...d, a.id]))}
              style={{ ...legend, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 3, cursor: "pointer",
                border: `1px solid ${a.severity === "fault" ? C.ember : a.type === "hop" ? C.ember : C.live}`,
                background: a.severity === "fault" || a.type === "hop" ? "rgba(226,84,44,.14)" : "rgba(99,212,113,.12)",
                color: a.severity === "fault" || a.type === "hop" ? C.ember : C.live }}>
              {a.msg} <span style={{ color: C.faint, marginLeft: 6 }}>tap to dismiss</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 1240, margin: "0 auto" }}>
        {tab === "brew" && <BrewTab state={state} config={config} />}
        {tab === "ferment" && <FermentTab state={state} config={config} />}
        {tab === "recipe" && <RecipeTab state={state} config={config} setConfig={setConfig} />}
        {tab === "hardware" && <HardwareTab state={state} config={config} setConfig={setConfig} />}
        {tab === "reports" && <ReportsTab config={config} />}
        {tab === "system" && <SystemTab state={state} config={config} />}

        <div style={{ fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
          {state.driver === "sim"
            ? "Simulation — the server is modeling the rig; no hardware attached."
            : "Live — all mains switching, the interlock and pilot lights live in the panel, never on the HAT."}
        </div>
      </div>
    </div>
  );
}
