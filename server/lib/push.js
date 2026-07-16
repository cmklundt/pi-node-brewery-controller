/**
 * push.js — Web Push to phones over the local network.
 *
 * VAPID keys are generated on first boot and persisted in data/. Phones
 * subscribe from the PWA (Setup tab → "Enable phone alerts"); subscriptions
 * are persisted and pruned when a phone unsubscribes (HTTP 404/410).
 *
 * Note for the docs: browsers only allow service workers + push on secure
 * origins, so remote phones need the HTTPS listener (self-signed CA, see
 * docs/pi-setup.md). On the Pi's own kiosk screen http://localhost is
 * already a secure context.
 */
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { DATA_DIR } from "./config.js";

const KEYS_PATH = path.join(DATA_DIR, "push-keys.json");
const SUBS_PATH = path.join(DATA_DIR, "push-subs.json");

export class PushCenter {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.keys = fs.existsSync(KEYS_PATH)
      ? JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"))
      : (() => {
          const k = webpush.generateVAPIDKeys();
          fs.writeFileSync(KEYS_PATH, JSON.stringify(k, null, 2));
          return k;
        })();
    webpush.setVapidDetails("mailto:brewery@localhost", this.keys.publicKey, this.keys.privateKey);
    this.subs = fs.existsSync(SUBS_PATH) ? JSON.parse(fs.readFileSync(SUBS_PATH, "utf8")) : [];
  }

  get publicKey() { return this.keys.publicKey; }

  #save() { fs.writeFileSync(SUBS_PATH, JSON.stringify(this.subs, null, 2)); }

  subscribe(sub, label = "phone") {
    if (!sub?.endpoint) throw new Error("bad subscription");
    this.subs = this.subs.filter((s) => s.sub.endpoint !== sub.endpoint);
    this.subs.push({ sub, label, addedAt: new Date().toISOString() });
    this.#save();
    return this.subs.length;
  }

  unsubscribe(endpoint) {
    this.subs = this.subs.filter((s) => s.sub.endpoint !== endpoint);
    this.#save();
  }

  /** Fire-and-forget to every registered phone. */
  async send({ title, body, tag = "brewery", urgent = false }) {
    const payload = JSON.stringify({ title, body, tag, ts: Date.now() });
    const results = await Promise.allSettled(
      this.subs.map((s) =>
        webpush.sendNotification(s.sub, payload, {
          TTL: urgent ? 120 : 3600,
          urgency: urgent ? "high" : "normal",
        })
      )
    );
    // prune dead endpoints
    const dead = [];
    results.forEach((r, i) => {
      if (r.status === "rejected" && [404, 410].includes(r.reason?.statusCode)) dead.push(i);
    });
    if (dead.length) {
      this.subs = this.subs.filter((_, i) => !dead.includes(i));
      this.#save();
    }
    return { sent: results.filter((r) => r.status === "fulfilled").length, total: results.length };
  }

  list() { return this.subs.map((s) => ({ label: s.label, addedAt: s.addedAt, endpoint: s.sub.endpoint.slice(0, 48) + "…" })); }
}
