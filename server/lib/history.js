/**
 * history.js — time series + brew session logs + reports.
 *
 * Live ring: one sample per 5 s, 24 h deep, served to the charts.
 * Sessions: while a brew is running every sample and event is appended to
 * data/sessions/<start-iso>.jsonl — cheap, append-only, power-cut safe.
 * Reports: list/read/CSV endpoints read straight off those files.
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";

const SESS_DIR = path.join(DATA_DIR, "sessions");
const SAMPLE_SEC = 5;
const RING_MAX = (24 * 3600) / SAMPLE_SEC;

export class History {
  constructor() {
    fs.mkdirSync(SESS_DIR, { recursive: true });
    this.ring = [];
    this.sessionFile = null;
    this._lastSample = 0;
  }

  startSession(meta) {
    const stamp = meta.startedAt.replace(/[:.]/g, "-");
    this.sessionFile = path.join(SESS_DIR, `${stamp}.jsonl`);
    this.append({ kind: "meta", ...meta });
  }

  endSession(summary = {}) {
    if (this.sessionFile) this.append({ kind: "end", ts: new Date().toISOString(), ...summary });
    this.sessionFile = null;
  }

  append(obj) {
    if (this.sessionFile) fs.appendFile(this.sessionFile, JSON.stringify(obj) + "\n", () => {});
  }

  /** engine calls this every tick; we downsample to SAMPLE_SEC */
  sample(now, temps, duties, targets) {
    if (now - this._lastSample < SAMPLE_SEC) return;
    this._lastSample = now;
    const row = { t: Date.now(), temps, duties, targets };
    this.ring.push(row);
    if (this.ring.length > RING_MAX) this.ring.shift();
    this.append({ kind: "sample", ...row });
  }

  logEvent(e) { this.append({ kind: "event", ...e }); }

  /** @param rangeMin minutes of history to return */
  series(rangeMin = 60) {
    const cutoff = Date.now() - rangeMin * 60000;
    return this.ring.filter((r) => r.t >= cutoff);
  }

  listSessions() {
    return fs.readdirSync(SESS_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .sort().reverse()
      .map((f) => {
        const p = path.join(SESS_DIR, f);
        const st = fs.statSync(p);
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(p, "utf8").split("\n")[0] || "{}"); } catch {}
        return { id: f.replace(".jsonl", ""), recipe: meta.recipeName || "?", startedAt: meta.startedAt, bytes: st.size };
      });
  }

  readSession(id) {
    const p = path.join(SESS_DIR, safe(id) + ".jsonl");
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  sessionCsv(id) {
    const rows = this.readSession(id);
    if (!rows) return null;
    const samples = rows.filter((r) => r.kind === "sample");
    const sensorIds = [...new Set(samples.flatMap((s) => Object.keys(s.temps || {})))];
    const head = ["time", ...sensorIds.map((s) => `${s}_F`), ...sensorIds.map((s) => `${s}_target`), "hlt_duty", "boil_duty"];
    const lines = samples.map((s) => [
      new Date(s.t).toISOString(),
      ...sensorIds.map((id) => s.temps[id]?.tempF ?? ""),
      ...sensorIds.map((id) => s.targets?.[id] ?? ""),
      s.duties?.hltElement ?? "", s.duties?.boilElement ?? "",
    ].join(","));
    return [head.join(","), ...lines].join("\n");
  }
}

const safe = (s) => String(s).replace(/[^A-Za-z0-9T\-]/g, "");
