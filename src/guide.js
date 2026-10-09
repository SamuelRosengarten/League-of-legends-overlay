// Renders the bundled guide for a champion into #guide. Pure DOM, no dependencies.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(label, value) {
  const r = el("div", "row");
  r.append(el("span", "label", label), el("span", "value", value));
  return r;
}

function section(title, ...kids) {
  const s = el("section", "block");
  s.append(el("h2", "", title), ...kids);
  return s;
}

function renderGuide(champion) {
  const root = document.getElementById("guide");
  const g = (window.GUIDES || {})[champion];
  if (!g) {
    root.replaceChildren(el("p", "muted", `No guide for ${champion} yet.`));
    return;
  }
  const r = g.runes, i = g.items, s = g.skillOrder;
  root.replaceChildren(
    el("p", "summary", g.summary),
    section("Runes",
      row("Keystone", r.keystone),
      row("Precision", r.primary.join(", ")),
      row("Resolve", r.secondary.join(", ")),
      row("Shards", r.shards.join(", "))),
    section("Build",
      row("Start", i.start.join(" + ")),
      row("Boots", i.boots),
      row("Core", i.core.join(" > ")),
      row("Later", i.later.join(" > ")),
      row("Spells", g.summoners.join(" + "))),
    section("Skills",
      row("Max order", s.max.join(" > ")),
      row("Ultimate", `levels ${s.ultAt.join(", ")}`),
      ...g.abilities.map((a) => row(a.key, `${a.name} - ${a.text}`))),
    section("Tips", ...g.tips.map((t) => el("p", "tip", t))),
    el("p", "muted", `${champion} ${g.role} guide, patch ${g.patch}`),
  );
}
