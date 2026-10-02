// App-shell cache so the app opens with no signal (basement gyms, the
// firehouse). Only same-origin files are cached — GitHub API calls always go
// to the network (the plan's offline copy lives in localStorage).
const CACHE = "coach-v6";
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
