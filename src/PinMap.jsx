/**
 * PinMap.jsx — interactive Raspberry Pi 40-pin header, live from config.
 * Every assignment (sensor CS, output, sense input, buzzer, 1-Wire, flow,
 * I²C, interlock sense) is drawn on its physical pin; double-booked pins
 * show red. This is the "what's actually wired where" ground truth view.
 */
import React from "react";
import { C, legend, mono } from "./theme.js";

// physical pin -> {bcm} or {pwr}
const PINS = [
  { p: 1, pwr: "3V3" }, { p: 2, pwr: "5V" },
  { p: 3, bcm: 2 }, { p: 4, pwr: "5V" },
  { p: 5, bcm: 3 }, { p: 6, pwr: "GND" },
  { p: 7, bcm: 4 }, { p: 8, bcm: 14 },
  { p: 9, pwr: "GND" }, { p: 10, bcm: 15 },
  { p: 11, bcm: 17 }, { p: 12, bcm: 18 },
  { p: 13, bcm: 27 }, { p: 14, pwr: "GND" },
  { p: 15, bcm: 22 }, { p: 16, bcm: 23 },
  { p: 17, pwr: "3V3" }, { p: 18, bcm: 24 },
  { p: 19, bcm: 10 }, { p: 20, pwr: "GND" },
  { p: 21, bcm: 9 }, { p: 22, bcm: 25 },
  { p: 23, bcm: 11 }, { p: 24, bcm: 8 },
  { p: 25, pwr: "GND" }, { p: 26, bcm: 7 },
  { p: 27, bcm: 0 }, { p: 28, bcm: 1 },
  { p: 29, bcm: 5 }, { p: 30, pwr: "GND" },
  { p: 31, bcm: 6 }, { p: 32, bcm: 12 },
  { p: 33, bcm: 13 }, { p: 34, pwr: "GND" },
  { p: 35, bcm: 19 }, { p: 36, bcm: 16 },
  { p: 37, bcm: 26 }, { p: 38, bcm: 20 },
  { p: 39, pwr: "GND" }, { p: 40, bcm: 21 },
];

const KIND_COLOR = {
  spi: "#B48EDE", sensor: C.glycol, output: C.ember, input: C.live,
  aux: C.amber, i2c: "#E0C34E", reserved: C.faint,
};

/** build {bcm: [{label, kind}]} from the live config */
export function pinAssignments(config) {
  const m = {};
  const add = (bcm, label, kind) => {
    if (bcm == null || bcm === "" || isNaN(+bcm)) return;
    (m[+bcm] ??= []).push({ label, kind });
  };
  add(9, "SPI MISO", "spi"); add(10, "SPI MOSI", "spi"); add(11, "SPI CLK", "spi");
  for (const s of config.sensors || []) if (s.type === "max31865") add(s.cs, `CS · ${s.name}`, "sensor");
  for (const a of config.actors || []) if (a.control !== "manual") add(a.gpio, a.name, "output");
  for (const a of config.actors || []) add(a.senseGpio, `sense · ${a.name}`, "input");
  for (const i of config.inputs || []) add(i.gpio, i.name, "input");
  if (config.interlock?.senseGpio != null) add(config.interlock.senseGpio, "Interlock sense", "input");
  if (config.aux?.buzzer != null) add(config.aux.buzzer, "Buzzer", "aux");
  if (config.aux?.oneWire != null) add(config.aux.oneWire, "1-Wire (DS18B20)", "aux");
  for (const f of config.aux?.flow || []) add(f, "Flow pulse", "aux");
  add(2, "I²C SDA (OLED)", "i2c"); add(3, "I²C SCL (OLED)", "i2c");
  add(0, "HAT EEPROM", "reserved"); add(1, "HAT EEPROM", "reserved");
  return m;
}

export default function PinMap({ config }) {
  const asg = pinAssignments(config);
  const cell = (pin, side) => {
    const uses = pin.bcm != null ? asg[pin.bcm] || [] : [];
    const conflict = uses.length > 1;
    const color = pin.pwr
      ? (pin.pwr === "GND" ? "#252E38" : pin.pwr === "5V" ? "#5A2B2B" : "#5A452B")
      : conflict ? C.ember
      : uses.length ? KIND_COLOR[uses[0].kind] : C.dead;
    const label = pin.pwr || (uses.length ? uses.map((u) => u.label).join(" ⚠ ") : `GPIO ${pin.bcm}`);
    const free = !pin.pwr && !uses.length;
    return (
      <div key={pin.p} title={`pin ${pin.p}${pin.bcm != null ? ` · BCM ${pin.bcm}` : ""} — ${label}`}
        style={{ display: "flex", alignItems: "center", gap: 7, flexDirection: side === "L" ? "row-reverse" : "row", minWidth: 0 }}>
        <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, background: color,
          border: `1.5px solid ${conflict ? C.ember : free ? C.rule : color}`,
          boxShadow: !free && !pin.pwr ? `0 0 5px ${color}55` : "none" }} />
        <span style={{ ...mono, fontSize: 9, color: C.faint, width: 15, textAlign: "center", flexShrink: 0 }}>{pin.p}</span>
        <span style={{ ...legend, fontSize: 9.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: conflict ? C.ember : pin.pwr ? C.faint : uses.length ? C.text : C.faint, opacity: free ? 0.55 : 1 }}>
          {conflict ? `⚠ ${label}` : label}
        </span>
      </div>
    );
  };

  const conflicts = Object.entries(asg).filter(([, u]) => u.length > 1);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 1fr", gap: "4px 8px", alignItems: "center" }}>
        {PINS.filter((_, i) => i % 2 === 0).map((pin, row) => {
          const right = PINS[row * 2 + 1];
          return (
            <React.Fragment key={pin.p}>
              {cell(pin, "L")}
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E3742", border: `1px solid ${C.rule}` }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E3742", border: `1px solid ${C.rule}` }} />
              {cell(right, "R")}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.ruleSoft}` }}>
        {Object.entries({ sensor: "sensor CS", output: "output", input: "sense input", aux: "aux", spi: "SPI bus", i2c: "I²C" }).map(([k, label]) => (
          <span key={k} style={{ ...legend, fontSize: 9.5, color: C.dim, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: KIND_COLOR[k] }} />{label}
          </span>
        ))}
      </div>
      {conflicts.length > 0 && (
        <div style={{ ...legend, fontSize: 11, color: C.ember, marginTop: 8 }}>
          ⚠ GPIO conflict{conflicts.length > 1 ? "s" : ""}: {conflicts.map(([bcm, u]) => `BCM ${bcm} (${u.map((x) => x.label).join(" + ")})`).join(", ")}
        </div>
      )}
    </div>
  );
}
