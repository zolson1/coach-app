// App-shell cache so the app opens with no signal (basement gyms, the
// firehouse). Only same-origin files are cached — GitHub API calls always go
// to the network (the plan's offline copy lives in localStorage).
const CACHE = "coach-v10";
const SHELL = ["./", "index.html", "app.css", "js/app.js", "js/core.js", "js/ops.js", "js/ui.js", "js/train.js", "js/fuel.js",
  "js/kitchen.js", "js/progress.js", "js/today.js", "js/charts.js", "js/mat.js", "js/fix.js", "js/ask.js", "js/day.js", "js/timeline.js", "js/logic.js", "js/store.js", "js/gh.js",
  "js/timer.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so a deploy shows up on the next open), cache as the fallback.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))),
  );
});

// ---------------------------------------------------------------- the rest timer
// A page in the background stops running, so its beep never comes. The page hands
// each rest to this worker; when it ends, a notification rings (sound + vibration,
// over whatever app is open). A message event stays alive while its waitUntil is
// pending, which Chrome allows for up to ~5 minutes — a longer rest (the Breacher
// primer's 5–7 min) rings at the 5-minute mark, inside its own range.
const MAX_WAIT = 295 * 1000;
let pending = null;                       // the one rest in flight: { id, cancel }

self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "rest-cancel") { if (pending && (!m.id || pending.id === m.id)) pending.cancel(); return; }
  if (m.type !== "rest") return;
  if (pending) pending.cancel();
  const due = Math.max(0, (m.endAt || 0) - Date.now());
  const wait = Math.min(due, MAX_WAIT);
  e.waitUntil(new Promise((resolve) => {
    const h = setTimeout(async () => {
      pending = null;
      try { await ring(m, due > MAX_WAIT); } finally { resolve(); }
    }, wait);
    pending = { id: m.id, cancel: () => { clearTimeout(h); pending = null; resolve(); } };
  }));
});

async function ring(m, early) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (wins.some((c) => c.visibilityState === "visible")) return;      // the page is open: it beeps itself
  await self.registration.showNotification(early ? "5 min — go when you're ready" : "Rest's up", {
    body: m.next ? `Next: ${m.next}` : "Next set.",
    tag: "rest", renotify: true, silent: false, requireInteraction: true,
    vibrate: [400, 150, 400, 150, 400], icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    timestamp: Date.now(),
  });
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => "focus" in c);
    return w ? w.focus() : self.clients.openWindow("./");
  }));
});
