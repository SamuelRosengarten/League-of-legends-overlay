// Overlay controller: state, rendering, live game events and window fitting.
const $ = (id) => document.getElementById(id);

// The guide shown before a game (and when you play Gwen). Change this for other champions later.
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
const guide = () => (window.GUIDES || {})[champ()];
const viewKey = () => (S.settings ? "settings" : Prefs.value.mode === "compact" ? "compact" : `tab:${Prefs.value.tab}`);

function applyPrefs() {
  const p = Prefs.value, root = document.documentElement.style;
  root.setProperty("--bg-alpha", String(p.opacity / 100));
  root.setProperty("--font-scale", String(p.fontScale / 100));
  root.setProperty("--panel-w", `${p.mode === "compact" ? p.compactWidth : p.expandedWidth}px`);
  const screenCap = (window.screen && screen.availHeight ? screen.availHeight : 1000) - 40;
  root.setProperty("--panel-max-h", `${Math.min(p.mode === "expanded" ? p.expandedMaxHeight : 10000, screenCap)}px`);
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
  const c = champ(), g = guide(), dd = DD.champions.get(c);
  const hk = S.hotkeys || {};
  const expanded = Prefs.value.mode === "expanded";
  const controls = [
    controlButton(expanded ? "collapse" : "expand", `${expanded ? "Compact" : "Expanded"} view${hk.mode ? ` (${hk.mode})` : ""}`, () => setMode(expanded ? "compact" : "expanded")),
    controlButton("gear", "Settings", () => { S.settings = !S.settings; renderAll(); }, { "aria-pressed": String(S.settings) }),
  ];
  if (Bridge.isApp) {
    controls.push(
      controlButton(S.interactive ? "unlock" : "lock", S.interactive ? "Lock: clicks go to the game" : "Locked", () => setInteractive(!S.interactive), { "aria-pressed": String(!S.interactive) }),
      controlButton("hide", `Hide${hk.toggle ? ` (${hk.toggle})` : ""}`, () => Bridge.invoke("hide_overlay")));
  }
  const sub = g ? `${g.role} · Guide patch ${g.patch}` : "No guide";
  const header = el("header", { class: "hdr", "data-tauri-drag-region": true },
    iconTile(c, dd, { size: "lg", kind: "portrait", focusable: false }),
    el("div", { class: "id", "data-tauri-drag-region": true },
      el("div", { class: "name", "data-tauri-drag-region": true, text: dd ? dd.name : c }),
      el("div", { class: "sub", "data-tauri-drag-region": true, text: sub })),
    el("div", { class: "controls" }, controls));

  let live = null;
  if (S.game.inGame) {
    const items = (S.game.items || []).map((i) => iconTile(i.name, itemInfo(i.name), { size: "xs", badge: i.count > 1 ? String(i.count) : null }));
    live = el("div", { class: "live", "aria-label": "Live game" },
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { text: GAME_MODES[S.game.gameMode] || S.game.gameMode || "In game" }),
      el("span", { class: "clock", id: "clock", text: S.gameTime === null ? "" : fmtClock(S.gameTime) }),
      el("span", { text: `Lv ${S.game.level}` }),
      el("span", { class: "gold", text: `${S.game.gold.toLocaleString()} g` }),
      items.length ? el("span", { class: "live-items" }, items) : null);
  }
  $("hdr").replaceChildren(header, live || "");
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
      onMode: (m) => setMode(m),
      onPrefs: () => { applyPrefs(); fitSoon(); },
      onReset: resetAll,
      onClose: () => { S.settings = false; renderAll(); },
    });
  } else if (!g) {
    view = noGuideView(c);
  } else if (Prefs.value.mode === "compact") {
    view = compactView(g, c);
  } else if (S.query.trim()) {
    view = searchView(g, S.query, (tab) => { S.query = ""; $("search").value = ""; setTab(tab); });
  } else {
    view = TAB_VIEWS[Prefs.value.tab](g, c);
  }
  body.dataset.view = S.query.trim() && !S.settings ? "search" : viewKey();
  body.replaceChildren(view);
  body.scrollTop = S.scroll[body.dataset.view] || 0;
}

// ---- Footer -----------------------------------------------------------------
function renderFooter() {
  const hk = S.hotkeys || {};
  let status;
  if (!Bridge.isApp) status = "Browser preview · not connected to the game";
  else if (S.interactive) status = "Interactive · Esc to lock";
  else status = hk.interact ? `Click-through · ${hk.interact} to interact` : "Click-through";
  const keys = Bridge.isApp ? [
    hk.toggle ? el("span", {}, el("kbd", { text: hk.toggle }), " hide") : null,
    hk.mode ? el("span", {}, el("kbd", { text: hk.mode }), " mode") : null,
  ] : [];
  const icons = DD.status === "loading" ? "Loading icons" : DD.status === "offline" ? "Icons offline" : null;
  $("ftr").replaceChildren(...[
    el("span", { class: "status" }, status),
    icons ? el("span", { class: "pill", text: icons }) : null,
    el("span", { class: "keys" }, keys),
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

function setInteractive(on) {
  if (Bridge.isApp) Bridge.invoke("set_interactive", { interactive: on });
}

function resetAll() {
  Prefs.reset();
  applyPrefs();
  if (Bridge.isApp) Bridge.invoke("reset_position");
  renderAll();
}

// Size the native window to the panel so the transparent area never covers the game.
let fitPending = false, lastFit = "";
function fitSoon() {
  if (!Bridge.isApp || fitPending) return;
  fitPending = true;
  requestAnimationFrame(() => {
    fitPending = false;
    const r = $("app").getBoundingClientRect();
    const w = Math.ceil(r.width) + WINDOW_MARGIN * 2, h = Math.ceil(r.height) + WINDOW_MARGIN * 2;
    const key = `${w}x${h}`;
    if (key === lastFit) return;
    lastFit = key;
    Bridge.invoke("fit_window", { width: w, height: h });
  });
}

// ---- Live game --------------------------------------------------------------
function onGameState(g) {
  const before = `${S.game.inGame}:${S.game.champion}`;
  S.game = g;
  S.gameTime = g.inGame ? g.gameTime : null;
  if (`${g.inGame}:${g.champion}` !== before) renderAll();
  else { renderHeader(); fitSoon(); }
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
  } else if (e.key === "/" && Prefs.value.mode === "expanded" && document.activeElement !== $("search")) {
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
new ResizeObserver(fitSoon).observe($("app"));

if (Bridge.isApp) {
  Bridge.listen("game-state", onGameState);
  Bridge.listen("interactive", (on) => { S.interactive = on; if (!on) Tooltip.hide(); renderAll(); });
  Bridge.listen("toggle-mode", () => setMode(Prefs.value.mode === "compact" ? "expanded" : "compact"));
  Bridge.invoke("get_status").then((st) => { S.interactive = st.interactive; S.hotkeys = st.hotkeys; renderAll(); });
}
loadDataDragon(Object.keys(window.GUIDES || {}), renderAll);
