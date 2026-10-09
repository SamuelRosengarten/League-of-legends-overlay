// User display preferences, kept in the webview's localStorage (persists across restarts).
const PREF_LIMITS = {
  opacity: [40, 100],        // background opacity %, text always stays opaque
  fontScale: [80, 150],      // overall size %, on top of the automatic screen scale
  compactWidth: [240, 380],  // px
  expandedWidth: [320, 560], // px
  expandedMaxHeight: [300, 900],
};
const PREF_DEFAULTS = {
  mode: "compact", tab: "overview", opacity: 88, fontScale: 100, autoScale: true,
  // Off by default: Riot prohibits apps that draw conclusions for the player during
  // gameplay, and it is unclear whether a live "next item" hint counts.
  liveProgress: false,
  // Hide the overlay while no game is running and show it when one starts.
  onlyInGame: false,
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
    if (typeof v.autoScale !== "boolean") v.autoScale = PREF_DEFAULTS.autoScale;
    if (typeof v.liveProgress !== "boolean") v.liveProgress = PREF_DEFAULTS.liveProgress;
    if (typeof v.onlyInGame !== "boolean") v.onlyInGame = PREF_DEFAULTS.onlyInGame;
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
