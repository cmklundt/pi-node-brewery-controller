/**
 * api.js — WebSocket state hook + REST helpers for the panel and the phone.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export async function put(url, body) {
  const r = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

/** Live connection to the control server. Reconnects forever. */
export function useBrewery() {
  const [state, setState] = useState(null);
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    get("/api/config").then(setConfig).catch(() => {});
    let dead = false, retry = 0;

    function connect() {
      if (dead) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setConnected(true); };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.kind === "state") setState(msg.state);
        if (msg.kind === "config") setConfig(msg.config);
        if (msg.kind === "event") setEvents((e) => [msg.event, ...e].slice(0, 100));
        if (msg.kind === "events") setEvents(msg.events);
      };
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { dead = true; wsRef.current?.close(); };
  }, []);

  return { state, config, setConfig, events, setEvents, connected };
}

/** Register the service worker + subscribe this device to push alerts. */
export async function enablePush(label = "phone") {
  if (!("serviceWorker" in navigator)) throw new Error("No service worker support in this browser");
  if (!("Notification" in window)) throw new Error("No notification support in this browser");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications not allowed");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await get("/api/push/key");
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(key),
  });
  await post("/api/push/subscribe", { subscription, label });
  return true;
}

function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
