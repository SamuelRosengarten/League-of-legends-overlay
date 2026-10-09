// User display preferences, kept in the webview's localStorage (persists across restarts).
const PREF_LIMITS = {
  opacity: [40, 100],        // background opacity %, text always stays opaque
  fontScale: [85, 130],      // text size %
  compactWidth: [240, 380],  // px
  expandedWidth: [320, 560], // px
  expandedMaxHeight: [300, 900],
};
const PREF_DEFAULTS = {
  mode: "compact", tab: "overview", opacity: 88, fontScale: 100,
  compactWidth: 300, expandedWidth: 400, expandedMaxHeight: 560, open: {},
};
const PREF_KEY = "lol-overlay.prefs.v1";
const TABS = ["overview", "runes", "build", "skills", "tips"];

const Prefs = {
  value: { ...PREF_DEFAULTS },
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { saved = {}; }
    const v = { ...PREF_DEFAULTS, ...saved };
    for (const [k, [lo, hi]] of Object.entries(PREF_LIMITS)) {
      const n = Number(v[k]);
      v[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : PREF_DEFAULTS[k];
    }
    if (!["compact", "expanded"].includes(v.mode)) v.mode = PREF_DEFAULTS.mode;
    if (!TABS.includes(v.tab)) v.tab = PREF_DEFAULTS.tab;
    if (typeof v.open !== "object" || v.open === null) v.open = {};
    this.value = v;
    return v;
  },
  set(patch) {
    Object.assign(this.value, patch);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(this.value)); } catch { /* storage unavailable */ }
  },
  reset() {
    this.value = { ...PREF_DEFAULTS, open: {} };
    try { localStorage.removeItem(PREF_KEY); } catch { /* storage unavailable */ }
  },
};
