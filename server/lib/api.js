/**
 * api.js — REST + WebSocket surface.
 *
 * REST is for commands and config; the WebSocket at /ws streams the engine
 * snapshot at 1 Hz plus discrete events. The same server serves the built
 * React app, so the kiosk, a laptop, and a phone all hit the same origin.
 */
import express from "express";
import { WebSocketServer } from "ws";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { saveConfig, validateConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "../../dist");

export function buildApp({ engine, alerts, push, history, getConfig, setConfig }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const ok = (res, data = { ok: true }) => res.json(data);
  const guard = (fn) => async (req, res) => {
    try {
      await fn(req, res);
      if (!res.headersSent) ok(res);           // handlers that don't reply get a default ok
    } catch (e) { if (!res.headersSent) res.status(400).json({ error: e.message }); }
  };

  // ── state ──
  app.get("/api/state", (req, res) => res.json(engine.snapshot()));
  app.get("/api/events", (req, res) => res.json(alerts.events.slice(0, +req.query.n || 50)));
  app.get("/api/history", (req, res) => res.json(history.series(+req.query.range || 60)));
  app.get("/healthz", (req, res) => res.json({ ok: true, driver: engine.driver.name, uptime: engine.uptimeSec }));

  // ── config (extensibility: full document is editable) ──
  app.get("/api/config", (req, res) => res.json(getConfig()));
  app.put("/api/config", guard((req) => {
    const cfg = req.body;
    const errs = validateConfig(cfg);
    if (errs.length) throw new Error(errs.join("; "));
    setConfig(saveConfig(cfg));
    engine.applyConfig(cfg);
  }));

  // ── brew control ──
  app.post("/api/brew/start", guard(() => engine.steps.start()));
  app.post("/api/brew/hold", guard(() => engine.steps.hold()));
  app.post("/api/brew/next", guard(() => engine.steps.next()));
  app.post("/api/brew/select", guard((req) => engine.steps.select(+req.body.index)));
  app.post("/api/brew/end", guard(() => {
    const s = engine.steps.endSession();
    if (s) history.endSession({ endedBy: "user" });
    alerts.event("brew-ended", "Session ended", "info");
  }));
  app.put("/api/recipe", guard((req) => {
    const cfg = getConfig();
    cfg.recipe = req.body;
    setConfig(saveConfig(cfg));
    engine.steps.loadRecipe(cfg.recipe);
  }));
  app.post("/api/steps/update", guard((req) => {
    const { index, patch } = req.body;
    const s = engine.steps.steps[index];
    if (!s) throw new Error("no such step");
    Object.assign(s, patch);
    if (index === engine.steps.active && patch.mins !== undefined && !engine.steps.running)
      engine.steps.left = patch.mins * 60;
  }));

  // ── actors / controllers / interlock ──
  app.post("/api/actors/:id", guard((req) => engine.setManual(req.params.id, req.body.mode)));
  app.post("/api/controllers/:id", guard((req) => engine.setControllerParams(req.params.id, req.body)));
  app.post("/api/interlock", guard((req) => engine.setInterlock(req.body.position)));

  // ── sim conveniences (no-ops against real hardware) ──
  app.post("/api/sim/speed", guard((req) => engine.driver.setSpeed?.(req.body.speed)));
  app.post("/api/sim/pause", guard((req) => { engine.paused = !!req.body.paused; }));

  // ── timers ──
  app.post("/api/timers", guard((req, res) => ok(res, { id: alerts.addTimer(req.body.name || "Timer", +req.body.seconds) })));
  app.delete("/api/timers/:id", guard((req) => alerts.cancelTimer(req.params.id)));

  // ── push ──
  app.get("/api/push/key", (req, res) => res.json({ key: push.publicKey }));
  app.post("/api/push/subscribe", guard((req, res) => ok(res, { count: push.subscribe(req.body.subscription, req.body.label) })));
  app.post("/api/push/unsubscribe", guard((req) => push.unsubscribe(req.body.endpoint)));
  app.get("/api/push/subs", (req, res) => res.json(push.list()));
  app.post("/api/push/test", guard(async (req, res) => ok(res, await push.send({ title: "🍺 Brewery", body: "Test notification — phone link works." }))));

  // ── reports ──
  app.get("/api/sessions", (req, res) => res.json(history.listSessions()));
  app.get("/api/sessions/:id", (req, res) => {
    const rows = history.readSession(req.params.id);
    rows ? res.json(rows) : res.status(404).json({ error: "not found" });
  });
  app.get("/api/sessions/:id.csv", (req, res) => {
    const csv = history.sessionCsv(req.params.id.replace(/\.csv$/, ""));
    if (!csv) return res.status(404).json({ error: "not found" });
    res.type("text/csv").attachment(`${req.params.id}.csv`).send(csv);
  });

  // ── static app ──
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^\/(?!api|ws).*/, (req, res) => res.sendFile(path.join(DIST, "index.html")));
  }

  // simple default-command handler for generic REST mistakes
  app.use("/api", (req, res) => res.status(404).json({ error: "no such endpoint" }));
  return app;
}

export function attachWs(server, { engine, alerts }) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const broadcast = (msg) => {
    const s = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1) c.send(s);
  };
  engine.on("state", (snap) => broadcast({ kind: "state", state: snap }));
  engine.on("config", (cfg) => broadcast({ kind: "config", config: cfg }));
  wss.on("connection", (sock) => {
    sock.send(JSON.stringify({ kind: "state", state: engine.snapshot() }));
    sock.send(JSON.stringify({ kind: "events", events: alerts.events.slice(0, 30) }));
  });
  return broadcast;
}
