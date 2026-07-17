#!/usr/bin/env node
/**
 * Brewery controller server.
 *
 *   node server/index.js --sim          development / demo (default off-Pi)
 *   node server/index.js --hardware     on the Pi with the shield
 *
 * Ports: HTTP on 8080 (kiosk + LAN), HTTPS on 8443 when data/certs/
 * contains server.key + server.crt (needed for phone push — see docs).
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig, DATA_DIR } from "./lib/config.js";
import { Engine } from "./lib/engine.js";
import { AlertCenter } from "./lib/alerts.js";
import { PushCenter } from "./lib/push.js";
import { History } from "./lib/history.js";
import { buildApp, attachWs } from "./lib/api.js";
import { SimDriver } from "./hardware/sim.js";

const args = process.argv.slice(2);
const useHardware = args.includes("--hardware") || process.env.BREWERY_MODE === "hardware";
const PORT = +(process.env.PORT || 8080);
const TLS_PORT = +(process.env.TLS_PORT || 8443);

let config = loadConfig();

const driver = useHardware
  ? new (await import("./hardware/real.js")).RealDriver()
  : new SimDriver();

await driver.init(config);
console.log(`[brewery] driver: ${driver.name}`);

const push = new PushCenter();
const history = new History();

// broadcast is wired after the WS server exists; buffer until then
let broadcast = () => {};
const alerts = new AlertCenter({
  push,
  config,
  buzzer: async (pattern) => {
    if (!driver.setBuzzer) return;
    const beeps = pattern === "long" ? [[600]] : pattern === "double" ? [[120], [120]] : [[120]];
    for (const [ms] of beeps) {
      await driver.setBuzzer(true); await sleep(ms); await driver.setBuzzer(false); await sleep(90);
    }
  },
  broadcast: (m) => broadcast(m),
});

const engine = new Engine({ config, driver, alerts, history });
// persist learned duty-cycle coefficients so the next brew starts warm
engine.on("learned", () => { try { saveConfig(config); } catch {} });

const app = buildApp({
  engine, alerts, push, history,
  getConfig: () => config,
  setConfig: (c) => { config = c; alerts.config = c; },
});

const httpServer = http.createServer(app);
broadcast = attachWs(httpServer, { engine, alerts });
httpServer.listen(PORT, "0.0.0.0", () => console.log(`[brewery] http://0.0.0.0:${PORT}`));

// HTTPS listener (phones need a secure origin for service worker + push)
const keyPath = path.join(DATA_DIR, "certs/server.key");
const crtPath = path.join(DATA_DIR, "certs/server.crt");
if (fs.existsSync(keyPath) && fs.existsSync(crtPath)) {
  const tls = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) }, app);
  const b2 = attachWs(tls, { engine, alerts });
  const b1 = broadcast;
  broadcast = (m) => { b1(m); b2(m); };
  tls.listen(TLS_PORT, "0.0.0.0", () => console.log(`[brewery] https://0.0.0.0:${TLS_PORT}`));
} else {
  console.log("[brewery] no TLS certs in data/certs — phone push disabled (see docs/pi-setup.md §7)");
}

engine.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`\n[brewery] ${sig} — de-energizing outputs`);
    await engine.stop();          // drops every actor before exit
    process.exit(0);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
