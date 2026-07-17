/* sw.js — PWA service worker: offline shell + push notifications. */
const CACHE = "brewery-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for API + navigation, cache-fallback for the app shell.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api") || url.pathname === "/ws") return; // always live
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && e.request.method === "GET") {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("/")))
  );
});

// Push from the control server: hop alarms, step changes, timers, faults.
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: "Brewery", body: e.data?.text() || "" }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "🍺 Brewery", {
      body: data.body || "",
      tag: data.tag || "brewery",
      renotify: true,
      badge: "/icons/icon-192.png",
      icon: "/icons/icon-192.png",
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return clients.openWindow("/");
    })
  );
});
