// Settings panel. Sliders apply live without rebuilding the panel, so dragging stays smooth.
const CONFIG_PATH = "%APPDATA%\\com.samuelrosengarten.lol-overlay\\config.json";

function slider(label, key, unit, onInput) {
  const [min, max] = PREF_LIMITS[key];
  const out = el("output", { class: "slider-value", text: `${Prefs.value[key]}${unit}` });
  const input = el("input", { type: "range", min, max, step: key === "opacity" || key === "fontScale" ? 5 : 10, value: Prefs.value[key], "aria-label": label });
  input.addEventListener("keydown", (e) => e.stopPropagation()); // arrows adjust the slider only
  input.addEventListener("input", () => {
    Prefs.set({ [key]: Number(input.value) });
    out.textContent = `${input.value}${unit}`;
    onInput();
  });
  return el("label", { class: "setting" }, el("span", { class: "setting-label", text: label }), input, out);
}

function segmented(label, options, current, onPick) {
  return el("div", { class: "setting" },
    el("span", { class: "setting-label", text: label }),
    el("div", { class: "segmented", role: "group", "aria-label": label }, options.map(([value, text]) =>
      el("button", { type: "button", class: "seg", "aria-pressed": String(value === current), onclick: () => onPick(value) }, text))));
}

const DISPLAY_TEXT = {
  none: "No game window found. During a match the overlay follows the game window.",
  windowed: "Windowed: the overlay stays inside the game window and follows it.",
  borderless: "Borderless: supported. The overlay stays on top of the game.",
  fullscreen: "Exclusive fullscreen: Windows can't show the overlay over the game. Switch League to Borderless (Settings › Video › Window Mode). Alt+Tab shows the overlay on the desktop.",
};

// Hotkey rebinding: which row is waiting for a key press, and the last error.
const HK = { capturing: null, error: "" };
const HOTKEY_ROWS = [["toggle", "Show / hide"], ["mode", "Compact / expanded"], ["interact", "Interact / lock"]];

// Turn a key press into a Tauri shortcut string, e.g. "Ctrl+Shift+K".
// Returns { combo }, { error }, or {} while only modifier keys are held.
function comboFromEvent(e) {
  if (/^(Control|Shift|Alt|Meta|OS)(Left|Right)$/.test(e.code)) return {};
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
  else if (/^Arrow(Up|Down|Left|Right)$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === "Space") key = "Space";
  if (!key) return { error: "Use a letter, number, F-key, arrow or space." };
  // The Windows key belongs to Windows shortcuts (Start, Win+D...); never take it over.
  if (e.metaKey) return { error: "The Windows key is reserved for Windows shortcuts. Use Ctrl, Alt or Shift." };
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
  if (!mods.length && !/^F\d+$/.test(key)) return { error: "Hold Ctrl, Alt or Shift too, so it does not clash with typing in the game." };
  return { combo: [...mods, key].join("+") };
}

// `ctx`: { hotkeys, onMode(mode), onPrefs(), onReset(), onClose() }
function settingsView(ctx) {
  const p = Prefs.value;
  const widthKey = p.mode === "compact" ? "compactWidth" : "expandedWidth";
  const hk = ctx.hotkeys;
  const hotkeyRow = ([name, label]) => {
    const value = hk[name], waiting = HK.capturing === name;
    const change = el("button", { type: "button", class: "btn btn-small", "aria-label": `Change ${label} hotkey`, text: waiting ? "Press keys… (Esc to cancel)" : "Change" });
    change.addEventListener("click", () => { HK.capturing = waiting ? null : name; HK.error = ""; ctx.onRerender(); });
    change.addEventListener("keydown", (e) => {
      if (!waiting) return;
      e.preventDefault();
      e.stopPropagation(); // Esc cancels the capture, it must not also lock the overlay
      if (e.key === "Escape") { HK.capturing = null; ctx.onRerender(); return; }
      const r = comboFromEvent(e);
      if (r.error) { HK.error = r.error; ctx.onRerender(); return; }
      if (r.combo) ctx.onHotkey({ ...hk, [name]: r.combo });
    });
    if (waiting) queueMicrotask(() => change.focus());
    return el("div", { class: "kv" }, el("span", { class: "kv-label", text: label }),
      el("span", { class: "hk" }, value ? el("kbd", { text: value }) : el("span", { class: "muted", text: "unavailable" }), change));
  };
  const icons = DD.status === "ready" ? `Loaded (Data Dragon ${DD.version})`
    : DD.status === "loading" ? "Loading..." : "Offline: showing text instead of icons";

  return el("div", { class: "stack settings" },
    card("Display",
      segmented("Mode", [["compact", "Compact"], ["expanded", "Expanded"]], p.mode, ctx.onMode),
      slider("Background opacity", "opacity", "%", ctx.onPrefs),
      el("label", { class: "setting setting-check" },
        el("input", { type: "checkbox", checked: Prefs.value.autoScale, "aria-label": "Scale to screen",
          onchange: (e) => { Prefs.set({ autoScale: e.target.checked }); ctx.onPrefs(); } }),
        el("span", { class: "setting-label", text: `Scale to screen size (auto: ${Math.round(ctx.autoScale * 100)}%)` })),
      slider("Size", "fontScale", "%", ctx.onPrefs),
      slider(`Width (${p.mode})`, widthKey, "px", ctx.onPrefs),
      p.mode === "expanded" ? slider("Max height", "expandedMaxHeight", "px", ctx.onPrefs) : null),
    card("In game",
      el("label", { class: "setting setting-check" },
        el("input", { type: "checkbox", checked: Prefs.value.onlyInGame, "aria-label": "Only show during a game",
          onchange: (e) => ctx.onOnlyInGame(e.target.checked) }),
        el("span", { class: "setting-label", text: "Only show during a game (the show / hide hotkey still works)" })),
      el("label", { class: "setting setting-check" },
        el("input", { type: "checkbox", checked: Prefs.value.liveProgress, "aria-label": "Live build progress",
          onchange: (e) => ctx.onLiveProgress(e.target.checked) }),
        el("span", { class: "setting-label", text: "Live build progress: tick owned items and show the next one to buy" })),
      el("p", { class: "note", text: "Off by default. Riot's third-party rules prohibit apps that draw conclusions for you during a game, and it is not clear whether this hint counts. Turn it on at your own discretion." })),
    card("Hotkeys",
      Bridge.isApp && hk ? [
        ...HOTKEY_ROWS.map(hotkeyRow),
        HK.error ? el("p", { class: "note error", role: "alert", text: HK.error }) : null,
        el("p", { class: "note", text: `Saved to ${CONFIG_PATH}. Hold Ctrl, Alt or Shift with a letter, number, F-key or arrow.` }),
        el("p", { class: "note", text: "They also work while the game is in front: the overlay only reads the key state, so nothing is blocked and the Windows key and other shortcuts keep working. League itself may disable the Windows key during a match." }),
      ] : el("p", { class: "note", text: "Hotkeys work in the desktop app." })),
    card("Game window", el("p", { class: "note", text: DISPLAY_TEXT[ctx.displayMode] || DISPLAY_TEXT.none })),
    card("Icons & data", el("p", { class: "note", text: icons })),
    el("div", { class: "actions" },
      el("button", { type: "button", class: "btn", onclick: ctx.onReset }, "Reset to defaults"),
      el("button", { type: "button", class: "btn btn-primary", onclick: ctx.onClose }, "Done")));
}
