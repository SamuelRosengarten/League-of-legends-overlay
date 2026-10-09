// Overlay controller: state, rendering, live game events and window fitting.
const $ = (id) => document.getElementById(id);

// The guide shown before a game starts. In a game it follows the champion you play.
const DEFAULT_CHAMPION = "Gwen";
const WINDOW_MARGIN = 6; // must match body padding in style.css

const S = {
  game: { inGame: false },
  gameTime: null,
  interactive: !Bridge.isApp, // in a browser preview everything is clickable
  hotkeys: null,
  settings: false,
  query: "",
  scroll: {},
};

const champ = () => (S.game.inGame ? S.game.champion : DEFAULT_CHAMPION);
// Hand-written guides win; every other champion gets one generated from Data Dragon.
// In other game modes the Summoner's Rift tips are swapped for ones that fit the mode.
const guide = () => withMode((window.GUIDES || {})[champ()] || autoGuide(champ()), S.game.inGame ? modeKind(S.game.gameMode) : "rift");
const viewKey = () => (S.settings ? "settings" : Prefs.value.mode === "compact" ? "compact" : `tab:${Prefs.value.tab}`);
// Build progress only makes sense when the guide is for the champion you are playing.
const progress = () => (Prefs.value.liveProgress && S.game.inGame && guide() ? buildProgress(guide(), S.game.items) : NO_PROGRESS);

// Size the whole UI to the screen: 1080p (logical) is 1.0, 1440p ~1.2, 4K at 100% ~1.6.
// Windows display scaling is already in the logical height, so 4K at 200% stays 1.0.
function autoScale() {
  const h = (window.screen && screen.height) || 1080;
  const s = 1 + 0.6 * (h / 1080 - 1);
  return Math.round(Math.min(1.75, Math.max(0.9, s)) * 20) / 20;
}

function uiScale() {
  const p = Prefs.value;
  return (p.autoScale ? autoScale() : 1) * (p.fontScale / 100);
}

function applyPrefs() {
  const p = Prefs.value, root = document.documentElement.style, scale = uiScale();
  root.setProperty("--bg-alpha", String(p.opacity / 100));
  root.setProperty("--scale", String(scale));
  const width = (p.mode === "compact" ? p.compactWidth : p.expandedWidth) * scale;
  const screenW = ((window.screen && screen.availWidth) || 1920) - 40;
  const screenH = ((window.screen && screen.availHeight) || 1000) - 40;
  root.setProperty("--panel-w", `${Math.round(Math.min(width, screenW))}px`);
  const maxH = p.mode === "expanded" ? p.expandedMaxHeight * scale : screenH;
  root.setProperty("--panel-max-h", `${Math.round(Math.min(maxH, screenH))}px`);
  document.body.dataset.mode = p.mode;
}

// ---- Header -----------------------------------------------------------------
function controlButton(icon, label, onclick, extra = {}) {
  return el("button", { type: "button", class: "ctl", "aria-label": label, "data-tip-title": label, onclick, ...extra }, svgIcon(icon));
}

function fmtClock(t) {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function renderHeader() {
  const c = champ(), g = guide(), dd = DD.champion(c);
  const hk = S.hotkeys || {};
  const expanded = Prefs.value.mode === "expanded";
  // Controls only appear when they can actually be clicked. Locked, the overlay is
  // click-through, so it shows a lock indicator instead (hotkeys still work).
  let controls;
  if (S.interactive) {
    controls = [
      controlButton(expanded ? "collapse" : "expand", `${expanded ? "Compact" : "Expanded"} view${hk.mode ? ` (${hk.mode})` : ""}`, () => setMode(expanded ? "compact" : "expanded")),
      controlButton("gear", "Settings", () => { S.settings = !S.settings; HK.capturing = null; renderAll(); }, { "aria-pressed": String(S.settings) }),
    ];
    if (Bridge.isApp) {
      controls.push(
        controlButton("lock", `Lock${hk.interact ? ` (${hk.interact} or Esc)` : " (Esc)"}`, () => setInteractive(false)),
        controlButton("hide", `Hide${hk.toggle ? ` (${hk.toggle})` : ""}`, () => Bridge.send("hide_overlay")));
    }
  } else {
    controls = [el("span", { class: "lock-state", role: "img", "aria-label": "Locked: clicks go to the game" }, svgIcon("lock"))];
  }
  const sub = g ? `${g.role} · ${g.auto ? "Auto guide" : `Patch ${g.patch}`}` : S.game.inGame ? "No guide yet" : "";
  const drag = { "data-tauri-drag-region": true };
  const header = el("header", { class: "hdr", ...drag },
    iconTile(dd ? dd.name : c, dd, { size: "lg", kind: "portrait", focusable: false, extraAttrs: drag }),
    el("div", { class: "id", ...drag },
      el("div", { class: "name", ...drag, text: dd ? dd.name : c }),
      sub ? el("div", { class: "sub", ...drag, text: sub }) : null),
    el("div", { class: "controls" }, controls));

  let live = null;
  if (S.game.inGame) {
    live = el("div", { class: "live", "aria-label": "Live game" },
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { text: GAME_MODES[S.game.gameMode] || S.game.gameMode || "In game" }),
      el("span", { class: "clock", id: "clock", text: S.gameTime === null ? "" : fmtClock(S.gameTime) }),
      el("span", { text: `Lv ${S.game.level}` }),
      el("span", { class: "gold", text: `${Math.floor(S.game.gold).toLocaleString()} g` }));
  }
  $("hdr").replaceChildren(...[header, live].filter(Boolean));
}

// ---- Toolbar (expanded mode) ------------------------------------------------
function renderToolbar() {
  const show = Prefs.value.mode === "expanded" && !S.settings && Boolean(guide());
  $("toolbar").hidden = !show;
  for (const b of document.querySelectorAll("#tabs [role=tab]")) {
    const active = b.dataset.tab === Prefs.value.tab && !S.query;
    b.setAttribute("aria-selected", String(active));
    b.tabIndex = active ? 0 : -1;
  }
}

function buildToolbar() {
  $("tabs").replaceChildren(...TABS.map((t) => el("button", {
    type: "button", role: "tab", class: "tab", "data-tab": t, text: TAB_LABELS[t], onclick: () => setTab(t),
  })));
  $("tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.indexOf(Prefs.value.tab) + (e.key === "ArrowRight" ? 1 : -1);
    setTab(TABS[(i + TABS.length) % TABS.length]);
    document.querySelector(`#tabs [data-tab="${Prefs.value.tab}"]`).focus();
  });
  $("search").addEventListener("input", (e) => { S.query = e.target.value; renderToolbar(); renderBody(); });
}

// ---- Body -------------------------------------------------------------------
function renderBody() {
  const body = $("body");
  S.scroll[body.dataset.view] = body.scrollTop;
  const g = guide(), c = champ();
  let view;
  if (S.settings) {
    view = settingsView({
      hotkeys: S.hotkeys,
      autoScale: autoScale(),
      onMode: (m) => setMode(m),
      onPrefs: () => { applyPrefs(); fitSoon(); },
      onLiveProgress: (on) => { Prefs.set({ liveProgress: on }); },
      onOnlyInGame: (on) => { Prefs.set({ onlyInGame: on }); syncVisibility(true); },
      onRerender: () => renderBody(),
      onHotkey: setHotkeys,
      onReset: resetAll,
      onClose: () => { S.settings = false; HK.capturing = null; renderAll(); },
    });
  } else if (!g) {
    view = noGuideView(c);
  } else if (Prefs.value.mode === "compact") {
    view = compactView(g, c, progress());
  } else if (S.query.trim()) {
    view = searchView(g, S.query, (tab) => { S.query = ""; $("search").value = ""; setTab(tab); });
  } else {
    view = TAB_VIEWS[Prefs.value.tab](g, c, progress());
  }
  body.dataset.view = S.query.trim() && !S.settings ? "search" : viewKey();
  body.replaceChildren(view);
  body.scrollTop = S.scroll[body.dataset.view] || 0;
  renderNow();
}

// The "Next buy" line changes with every gold update; refresh just that line.
function renderNow() {
  const slot = $("now");
  if (!slot) return;
  const g = guide(), row = g ? nowRow(g, progress(), S.game.gold || 0) : null;
  slot.replaceChildren(...(row ? [row] : []));
  slot.hidden = !row;
}

// ---- Footer -----------------------------------------------------------------
function renderFooter() {
  const hk = S.hotkeys || {};
  let status;
  if (!Bridge.isApp) status = "Browser preview · not connected to the game";
  else if (S.interactive) status = "Unlocked · drag the header · Esc to lock";
  else status = hk.interact ? [el("kbd", { text: hk.interact }), " to interact"] : "Click-through";
  const icons = DD.status === "loading" ? "Loading icons" : DD.status === "offline" ? "Icons offline" : null;
  $("ftr").replaceChildren(...[
    el("span", { class: "status" }, status),
    icons ? el("span", { class: "pill", "data-tip-title": icons, "data-tip": DD.status === "offline" ? "Data Dragon is unreachable and nothing is cached yet. Names are shown instead." : "" , text: icons }) : null,
  ].filter(Boolean));
}

function renderAll() {
  document.body.classList.toggle("locked", !S.interactive);
  renderHeader();
  renderToolbar();
  renderBody();
  renderFooter();
  fitSoon();
}

// ---- Actions ----------------------------------------------------------------
function setMode(mode) {
  Prefs.set({ mode });
  applyPrefs();
  renderAll();
}

function setTab(tab) {
  Prefs.set({ tab });
  S.settings = false;
  renderAll();
}

// Rebind hotkeys: the backend validates, registers and saves them, or explains why not.
async function setHotkeys(keys) {
  try {
    S.hotkeys = await Bridge.invoke("set_hotkeys", keys);
    HK.error = "";
  } catch (e) {
    HK.error = String(e);
  }
  HK.capturing = null;
  renderAll();
}

function setInteractive(on) {
  if (Bridge.isApp) Bridge.send("set_interactive", { interactive: on });
}

function resetAll() {
  Prefs.reset();
  applyPrefs();
  if (Bridge.isApp) Bridge.send("reset_position");
  renderAll();
}

// Size the native window to the panel so no transparent area covers the game.
// If the OS ignores or changes a resize, the next resize event re-requests it.
let fitPending = false, wanted = null;
function fitSoon(force = false) {
  if (!Bridge.isApp || fitPending) return;
  fitPending = true;
  requestAnimationFrame(() => {
    fitPending = false;
    const r = $("app").getBoundingClientRect();
    const w = Math.ceil(r.width) + WINDOW_MARGIN * 2, h = Math.ceil(r.height) + WINDOW_MARGIN * 2;
    if (!force && wanted && wanted.w === w && wanted.h === h) return;
    wanted = { w, h };
    Bridge.send("fit_window", { width: w, height: h });
  });
}
window.addEventListener("resize", () => {
  if (wanted && (Math.abs(window.innerWidth - wanted.w) > 1 || Math.abs(window.innerHeight - wanted.h) > 1)) fitSoon(true);
  // Moving to a monitor with another resolution can change the automatic scale.
  if (Prefs.value.autoScale && document.documentElement.style.getPropertyValue("--scale") !== String(uiScale())) {
    applyPrefs();
    fitSoon();
  }
});

// ---- Live game --------------------------------------------------------------
function onGameState(g) {
  const prev = S.game;
  S.game = g;
  S.gameTime = g.inGame ? g.gameTime : null;
  const itemsKey = (x) => (x.items || []).map((i) => `${i.name}x${i.count}`).join(",");
  if (g.inGame !== prev.inGame) syncVisibility();
  if (g.inGame !== prev.inGame || g.champion !== prev.champion || g.gameMode !== prev.gameMode) { ensureChampion(); renderAll(); }
  else if (itemsKey(g) !== itemsKey(prev)) { renderHeader(); renderBody(); fitSoon(); }
  else { renderHeader(); renderNow(); fitSoon(); }
}

// "Only show during a game": hide with no game, show when one starts. `force` also shows the
// overlay when the option was just turned off, so it never stays hidden by mistake.
function syncVisibility(force = false) {
  if (!Bridge.isApp) return;
  if (Prefs.value.onlyInGame) Bridge.send("set_visible", { visible: S.game.inGame });
  else if (force) Bridge.send("set_visible", { visible: true });
}

// Fetch the played champion's abilities if its guide is generated.
function ensureChampion() {
  if (S.game.inGame && !(window.GUIDES || {})[champ()]) loadChampion(champ(), renderAll);
}

// The backend only sends updates on change, so the clock ticks locally between them.
setInterval(() => {
  if (S.gameTime === null) return;
  S.gameTime += 1;
  const c = $("clock");
  if (c) c.textContent = fmtClock(S.gameTime);
}, 1000);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (S.query) { S.query = ""; $("search").value = ""; renderToolbar(); renderBody(); }
    else if (S.settings) { S.settings = false; renderAll(); }
    else if (Bridge.isApp && S.interactive) setInteractive(false);
  } else if (e.key === "/" && Prefs.value.mode === "expanded" && S.interactive && document.activeElement !== $("search")) {
    e.preventDefault();
    $("search").focus();
  }
});

// ---- Start ------------------------------------------------------------------
Prefs.load();
applyPrefs();
Tooltip.init();
buildToolbar();
renderAll();
new ResizeObserver(() => fitSoon()).observe($("app"));

if (Bridge.isApp) {
  Bridge.listen("game-state", onGameState);
  Bridge.listen("interactive", (on) => {
    S.interactive = on;
    if (!on) { Tooltip.hide(); if (document.activeElement) document.activeElement.blur(); }
    renderAll();
  });
  Bridge.listen("toggle-mode", () => setMode(Prefs.value.mode === "compact" ? "expanded" : "compact"));
  Bridge.invoke("get_status")
    .then((st) => {
      S.interactive = st.interactive;
      S.hotkeys = st.hotkeys;
      // The game may already be running (the first event can fire before this page listens).
      if (st.game && st.game.inGame) onGameState(st.game);
      else renderAll();
      syncVisibility();
    })
    .catch(() => { /* keep defaults: locked, hotkeys unknown */ });
}
loadDataDragon(Object.keys(window.GUIDES || {}), () => { ensureChampion(); renderAll(); });
