// One timer at a time, driven by wall-clock end times so it stays right when
// the phone throttles or backgrounds the page. Beeps (WebAudio, unlocked by
// the first tap), vibration, and a screen wake lock while a session runs.

let ctx = null;
let wakeLock = null;
let wantWake = false;
let prefs = { sound: true, vibrate: true };

export function setPrefs(p) { prefs = { ...prefs, ...p }; }

// ------------------------------------------------- ringing from the background
// The service worker rings when a rest ends and the app isn't on screen (sw.js).
function toWorker(msg) {
  try { navigator.serviceWorker?.controller?.postMessage(msg); } catch { /* no worker (dev, http) */ }
}
export function notifyState() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
export async function askToNotify() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return notifyState();
  try { return await Notification.requestPermission(); } catch { return notifyState(); }
}
function handOff(t) {
  if (!t || t.mode !== "down" || t.kind !== "rest" || prefs.background === false) return;
  if (notifyState() === "default") askToNotify();          // the set-logging tap is the gesture it needs
  toWorker({ type: "rest", id: String(t.startAt), endAt: t.endAt, next: t.next || null });
}

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { ctx = null; }
}

export function beep(freq = 880, ms = 120, gain = 0.25) {
  if (!prefs.sound || !ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch { /* audio unavailable */ }
}

export function buzz(pattern = [200, 100, 200]) {
  if (prefs.vibrate && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }
}

export function done() {
  beep(660, 180); setTimeout(() => beep(990, 350), 200);
  buzz([300, 120, 300]);
}

export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wantWake) keepAwake(true);
});

// ---------------------------------------------------------------- the timer
// t = { kind, label, mode: "down"|"up", secs (down: length; up: target), max?, onDone?, onStop? }
let current = null;
let tick = null;
const listeners = new Set();

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(current); }

export function state() {
  if (!current) return null;
  const now = Date.now();
  const elapsed = (now - current.startAt) / 1000;
  const remaining = current.mode === "down" ? (current.endAt - now) / 1000 : null;
  return { ...current, elapsed, remaining };
}

export function start(t) {
  stop(false);
  const now = Date.now();
  current = { ...t, startAt: now, endAt: t.mode === "down" ? now + t.secs * 1000 : null, beeped: new Set() };
  handOff(current);
  tick = setInterval(step, 200);
  emit();
  step();
}

export function adjust(deltaS) {
  if (!current || current.mode !== "down") return;
  current.endAt += deltaS * 1000;
  current.secs = Math.max(1, current.secs + deltaS);
  current.beeped = new Set([...current.beeped].filter((k) => k !== "end"));
  handOff(current);
  emit();
}

// Stop: for count-up timers returns the seconds held.
export function stop(fire = true) {
  if (!current) return null;
  const st = state();
  clearInterval(tick);
  const c = current;
  current = null;
  if (c.kind === "rest") toWorker({ type: "rest-cancel", id: String(c.startAt) });
  emit();
  if (fire && c.onStop) c.onStop(st.elapsed);
  return st.elapsed;
}

function step() {
  if (!current) return;
  const st = state();
  const b = current.beeped;
  if (current.mode === "down") {
    const r = Math.ceil(st.remaining);
    if (r <= 3 && r >= 1 && !b.has(r)) { b.add(r); beep(880, 90); }
    if (st.remaining <= 0 && !b.has("end")) {
      b.add("end");
      done();
      const c = current;
      clearInterval(tick);
      current = null;
      emit();
      if (c.onDone) c.onDone();
      return;
    }
  } else {
    const e = Math.floor(st.elapsed);
    if (current.secs && e >= current.secs && !b.has("target")) { b.add("target"); beep(990, 200); buzz([150]); }
    if (current.max && e >= current.max && !b.has("max")) { b.add("max"); done(); }
  }
  for (const fn of listeners) fn(current, st);
}
