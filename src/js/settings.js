// Settings panel. Sliders apply live without rebuilding the panel, so dragging stays smooth.
const CONFIG_PATH = "%APPDATA%\\com.samuelrosengarten.lol-overlay\\config.json";

function slider(label, key, unit, onInput) {
  const [min, max] = PREF_LIMITS[key];
  const out = el("output", { class: "slider-value", text: `${Prefs.value[key]}${unit}` });
  const input = el("input", { type: "range", min, max, step: key === "opacity" || key === "fontScale" ? 5 : 10, value: Prefs.value[key], "aria-label": label });
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

// `ctx`: { hotkeys, onMode(mode), onPrefs(), onReset(), onClose() }
function settingsView(ctx) {
  const p = Prefs.value;
  const widthKey = p.mode === "compact" ? "compactWidth" : "expandedWidth";
  const hk = ctx.hotkeys;
  const hotkeyRow = (label, value) => el("div", { class: "kv" }, el("span", { class: "kv-label", text: label }),
    value ? el("kbd", { text: value }) : el("span", { class: "muted", text: "unavailable (invalid or used by another app)" }));
  const icons = DD.status === "ready" ? `Loaded (Data Dragon ${DD.version})`
    : DD.status === "loading" ? "Loading..." : "Offline: showing text instead of icons";

  return el("div", { class: "stack settings" },
    card("Display",
      segmented("Mode", [["compact", "Compact"], ["expanded", "Expanded"]], p.mode, ctx.onMode),
      slider("Background opacity", "opacity", "%", ctx.onPrefs),
      slider("Text size", "fontScale", "%", ctx.onPrefs),
      slider(`Width (${p.mode})`, widthKey, "px", ctx.onPrefs),
      p.mode === "expanded" ? slider("Max height", "expandedMaxHeight", "px", ctx.onPrefs) : null),
    card("Hotkeys",
      Bridge.isApp && hk ? [
        hotkeyRow("Show / hide", hk.toggle),
        hotkeyRow("Compact / expanded", hk.mode),
        hotkeyRow("Interact / lock", hk.interact),
        el("p", { class: "note", text: `To change them, edit ${CONFIG_PATH} and restart the app.` }),
      ] : el("p", { class: "note", text: "Hotkeys work in the desktop app." })),
    card("Icons & data", el("p", { class: "note", text: icons })),
    el("div", { class: "actions" },
      el("button", { type: "button", class: "btn", onclick: ctx.onReset }, "Reset to defaults"),
      el("button", { type: "button", class: "btn btn-primary", onclick: ctx.onClose }, "Done")));
}
