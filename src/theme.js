/** Panel design tokens — unchanged from the prototype Christopher approved. */
export const C = {
  panel: "#12161C", bezel: "#1B222B", card: "#212A35", raised: "#2A3542",
  rule: "#333F4D", ruleSoft: "#28323E",
  text: "#E7ECF2", dim: "#93A2B5", faint: "#6C7C90",
  amber: "#F2A03D", ember: "#E2542C", glycol: "#4FB8D8", live: "#63D471", dead: "#2C3742",
};

export const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
input[type=range]{-webkit-appearance:none;height:34px;background:transparent}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:#2C3742}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:50%;background:#E7ECF2;margin-top:-12px;border:none}
button{-webkit-tap-highlight-color:transparent}
input,select{font:inherit}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
input[type=number]{-moz-appearance:textfield}
@media (pointer: coarse) and (max-width: 1440px) { body { zoom: 1.08 } }
@keyframes flow { to { stroke-dashoffset: -14; } }
@keyframes pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
`;

export const legend = { fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.09em" };
export const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
export const body = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtLong = (s) => s >= 3600 ? `${Math.floor(s / 3600)}:${fmt(s % 3600)}` : fmt(s);
