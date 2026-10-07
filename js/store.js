// localStorage with every access guarded — private windows and cleared site
// data must never break the page. Keys are namespaced "coach.".

const NS = "coach.";

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    if (value == null) localStorage.removeItem(NS + key);
    else localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS = {
  token: "",
  repo: "zolson1/unified-coach",
  branch: "main",
  barbell: 45,
  trapBar: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  sound: true,
  vibrate: true,
  background: true,
};

export function settings() {
  return { ...DEFAULT_SETTINGS, ...(get("settings") || {}) };
}

export function saveSettings(s) {
  set("settings", s);
}
