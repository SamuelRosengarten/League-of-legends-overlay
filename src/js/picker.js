// Champion picker: search hand-written guides and every champion Data Dragon knows.
// Typing only re-renders the result list, so the search box keeps focus.

// Unique champions from Data Dragon (portraits are keyed by both id and display name).
function allChampions() {
  const byId = new Map();
  for (const p of DD.portraits.values()) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Match from the start of a word, ignoring case and punctuation ("kai" finds "Kai'Sa").
function champMatches(name, query) {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!q) return true;
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(q) || words.some((w) => w.startsWith(q));
}

// `ctx`: { current, playing (champion in game or null), onPick(name | null), onClose() }
function pickerView(ctx) {
  const guides = Object.keys(window.GUIDES || {});
  const choice = (name, sub) => {
    const dd = DD.champion(name);
    const label = dd ? dd.name : name;
    return el("li", {}, el("button", {
      type: "button", class: `pick${name === ctx.current || label === ctx.current ? " pick-current" : ""}`,
      "aria-current": name === ctx.current ? "true" : null, onclick: () => ctx.onPick(name),
    }, iconTile(label, dd, { size: "sm", kind: "portrait", focusable: false }),
    el("span", { class: "pick-name", text: label }), sub ? el("span", { class: "pick-sub", text: sub }) : null));
  };
  const list = el("div", { class: "pick-results" });
  const render = (query) => {
    const full = guides.filter((n) => champMatches(n, query));
    const others = allChampions().filter((c) => !guides.includes(c.name) && !guides.includes(c.id) && champMatches(c.name, query));
    const sections = [];
    if (full.length) sections.push(el("h3", { class: "card-title", text: "Full guides" }), el("ul", { class: "picks", role: "list" }, full.map((n) => choice(n, (window.GUIDES[n] || {}).role))));
    if (others.length) sections.push(el("h3", { class: "card-title", text: "Automatic guides" }), el("ul", { class: "picks", role: "list" }, others.map((c) => choice(c.name, null))));
    if (!sections.length) {
      sections.push(el("p", { class: "empty", text: DD.status === "offline" ? `No full guide matches "${query.trim()}". Other champions need Data Dragon (offline).` : `No champion matches "${query.trim()}".` }));
    }
    list.replaceChildren(...sections);
  };
  const input = el("input", { id: "champ-search", type: "search", placeholder: "Search champions", autocomplete: "off", spellcheck: "false", "aria-label": "Search champions" });
  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = list.querySelector(".pick");
      if (first) first.click();
    }
  });
  render("");
  queueMicrotask(() => input.focus());
  return el("div", { class: "stack picker" },
    el("label", { class: "search" }, input),
    ctx.playing ? el("button", { type: "button", class: "btn", onclick: () => ctx.onPick(null) }, `Follow my champion (${ctx.playing})`) : null,
    list,
    el("div", { class: "actions" }, el("button", { type: "button", class: "btn btn-primary", onclick: ctx.onClose }, "Done")));
}
