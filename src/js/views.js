// Guide views: compact mode, the expanded tabs, search results and empty states.
// Every function returns DOM built from the guide data; icons come from DD when available.

const GAME_MODES = { CLASSIC: "Summoner's Rift", ARAM: "ARAM", PRACTICETOOL: "Practice Tool", URF: "URF", CHERRY: "Arena" };
const TAB_LABELS = { overview: "Overview", runes: "Runes", build: "Build", skills: "Skills", tips: "Tips" };

const itemInfo = (n) => DD.items.get(n) || null;
const runeInfo = (n) => DD.runes.get(n) || DD.shard(n);
const spellInfo = (n) => DD.summoners.get(n) || null;
const abilityInfo = (champ, key) => {
  const c = DD.champions.get(champ);
  return (c && c.spells[key]) || null;
};

function card(title, ...body) {
  return el("section", { class: "card" }, title ? el("h3", { class: "card-title", text: title }) : null, ...body);
}

// <details> whose open/closed state is remembered in prefs under `key`.
function collapsible(key, summary, body, defaultOpen = false) {
  const open = key in Prefs.value.open ? Prefs.value.open[key] : defaultOpen;
  const d = el("details", { class: "fold", open }, el("summary", {}, summary), body);
  d.addEventListener("toggle", () => Prefs.set({ open: { ...Prefs.value.open, [key]: d.open } }));
  return d;
}

const arrow = () => el("span", { class: "arrow", "aria-hidden": "true", text: "›" });

// Purchase order: Start, then core items in order, optionally the later items.
function buildFlow(g, { labels = false, later = false } = {}) {
  const i = g.items;
  const tile = (name, extra = {}) => {
    const t = iconTile(name, itemInfo(name), { size: labels ? "md" : "sm", ...extra });
    return labels ? el("span", { class: "item" }, t, el("span", { class: "item-name", text: name })) : t;
  };
  const group = (label, names, kind) => el("div", { class: `flow-group flow-${kind}` },
    el("span", { class: "flow-label", text: label }),
    el("div", { class: "flow-icons" }, names.map((n, idx) =>
      tile(n, { badge: kind === "core" ? String(idx + 1) : n === i.boots ? "B" : null }))));
  const parts = [group("Start", i.start, "start"), arrow(), group("Core", i.core, "core")];
  if (later && i.later.length) parts.push(arrow(), group("Later", i.later, "later"));
  return el("div", { class: `flow${labels ? " flow-labelled" : ""}` }, parts);
}

function skillPriority(g, champ, size = "sm") {
  const s = g.skillOrder;
  const chips = [];
  s.max.forEach((key, idx) => {
    if (idx) chips.push(el("span", { class: "gt", "aria-hidden": "true", text: ">" }));
    const info = abilityInfo(champ, key);
    chips.push(el("span", { class: "skill" },
      iconTile(info ? info.name : key, info, { size, badge: key, fallbackDesc: abilityText(g, key) })));
  });
  return el("div", { class: "skills-line" },
    el("div", { class: "skill-chips", "aria-label": `Max ${s.max.join(" then ")}` }, chips),
    el("div", { class: "ult", "data-tip-title": "Ultimate (R)", "data-tip": s.note, tabindex: "0" },
      el("span", { class: "key", text: "R" }), el("span", { text: s.ultAt.join(" · ") })));
}

function abilityText(g, key) {
  const a = g.abilities.find((x) => x.key === key);
  return a ? `${a.name}: ${a.detail || a.text}` : "";
}

function spellsRow(g, withKeystone = true) {
  const tiles = g.summoners.map((n) => iconTile(n, spellInfo(n), { size: "sm" }));
  if (withKeystone) {
    tiles.push(el("span", { class: "sep", "aria-hidden": "true" }),
      iconTile(g.runes.keystone, runeInfo(g.runes.keystone), { size: "sm", kind: "round" }));
  }
  return el("div", { class: "icon-row" }, tiles);
}

function tipCallout(t, compact, showTag = true) {
  const head = [showTag ? el("span", { class: "tag", text: t.category }) : null, el("span", { class: "tip-text", text: t.text })];
  if (compact || !t.detail) return el("div", { class: "tip" }, head);
  return el("div", { class: "tip" },
    collapsible(`tip:${t.text}`, head, el("p", { class: "tip-detail", text: t.detail })));
}

function reminders(g, compact) {
  const list = g.tips.filter((t) => t.priority).slice(0, 3);
  return el("div", { class: "tips" }, list.map((t) => tipCallout(t, compact)));
}

function labelled(label, content) {
  return el("div", { class: "kv" }, el("span", { class: "kv-label", text: label }), content);
}

// ---- Compact mode ----------------------------------------------------------
function compactView(g, champ) {
  return el("div", { class: "stack" },
    labelled("Build", buildFlow(g)),
    labelled("Skills", skillPriority(g, champ)),
    labelled("Spells", spellsRow(g)),
    reminders(g, true));
}

// ---- Expanded tabs ---------------------------------------------------------
function overviewTab(g, champ) {
  return el("div", { class: "stack" },
    el("p", { class: "summary", text: g.summary }),
    card("Build path", buildFlow(g, { later: true })),
    el("div", { class: "grid2" },
      card("Skill priority", skillPriority(g, champ)),
      card("Spells & keystone", spellsRow(g))),
    card("Reminders", reminders(g, false)));
}

function runeRow(name, big) {
  const info = runeInfo(name);
  return el("div", { class: `rune${big ? " rune-key" : ""}` },
    iconTile(name, info, { size: big ? "lg" : "md", kind: "round", focusable: false }),
    el("div", { class: "rune-text" },
      el("span", { class: "rune-name", text: name }),
      info && info.desc ? el("span", { class: "rune-desc", text: info.desc }) : null));
}

function treeTitle(name) {
  return el("span", { class: "tree" }, iconTile(name, DD.trees.get(name), { size: "xs", kind: "round", focusable: false }), name);
}

function runesTab(g) {
  const r = g.runes;
  return el("div", { class: "stack" },
    card(null, el("h3", { class: "card-title" }, treeTitle(r.primaryTree), el("span", { class: "muted", text: "Primary" })),
      runeRow(r.keystone, true), r.primary.map((n) => runeRow(n))),
    card(null, el("h3", { class: "card-title" }, treeTitle(r.secondaryTree), el("span", { class: "muted", text: "Secondary" })),
      r.secondary.map((n) => runeRow(n))),
    card("Stat shards", el("div", { class: "shards" }, r.shards.map((n) =>
      el("span", { class: "item" }, iconTile(n, runeInfo(n), { size: "sm", kind: "round" }), el("span", { class: "item-name", text: n }))))));
}

function buildText(g, champ) {
  const r = g.runes, i = g.items, s = g.skillOrder;
  return [
    `${champ} ${g.role} (guide patch ${g.patch})`,
    `Runes: ${r.keystone}, ${r.primary.join(", ")} | ${r.secondary.join(", ")} | ${r.shards.join(", ")}`,
    `Spells: ${g.summoners.join(" + ")}`,
    `Start: ${i.start.join(" + ")}`,
    `Build: ${[...i.core, ...i.later].join(" > ")}`,
    `Skills: max ${s.max.join(" > ")}, R at ${s.ultAt.join("/")}`,
  ].join("\n");
}

function copyButton(g, champ) {
  const label = el("span", { text: "Copy build" });
  const b = el("button", { class: "btn", type: "button" }, svgIcon("copy"), label);
  b.addEventListener("click", async () => {
    const ok = await copyText(buildText(g, champ));
    label.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { label.textContent = "Copy build"; }, 1500);
  });
  return b;
}

function buildTab(g, champ) {
  const i = g.items;
  const step = (label, names, numbered) => el("div", { class: "step" },
    el("span", { class: "step-label", text: label }),
    el("div", { class: "step-items" }, names.map((n, idx) => el("span", { class: "item" },
      iconTile(n, itemInfo(n), { size: "md", badge: numbered ? String(idx + 1) : null }),
      el("span", { class: "item-name", text: n === i.boots ? `${n} (boots)` : n })))));
  return el("div", { class: "stack" },
    card("Purchase order",
      step("Start", i.start, false),
      step("Core", i.core, true),
      step("Later", i.later, true),
      el("p", { class: "note", text: "Buy in this order. Later items finish the build." })),
    card("Summoner spells", el("div", { class: "step-items" }, g.summoners.map((n) =>
      el("span", { class: "item" }, iconTile(n, spellInfo(n), { size: "md" }), el("span", { class: "item-name", text: n }))))),
    el("div", { class: "actions" }, copyButton(g, champ)));
}

function skillsTab(g, champ) {
  const s = g.skillOrder;
  const abilities = g.abilities.map((a) => {
    const info = abilityInfo(champ, a.key);
    const summary = el("span", { class: "ability-head" },
      iconTile(a.name, info, { size: "sm", badge: a.key === "Passive" ? "P" : a.key, focusable: false }),
      el("span", { class: "ability-name", text: a.name }),
      el("span", { class: "muted", text: a.text }));
    const body = el("div", { class: "ability-body" },
      a.detail ? el("p", { text: a.detail }) : null,
      info && info.desc ? el("p", { class: "riot-desc" }, el("span", { class: "tag", text: "Riot" }), info.desc) : null);
    return collapsible(`ability:${a.key}`, summary, body);
  });
  return el("div", { class: "stack" },
    card("Leveling priority", skillPriority(g, champ, "md"),
      el("p", { class: "note", text: `Max ${s.max.join(", then ")}. ${s.note} This is a priority order, not a level-by-level list.` })),
    card("Abilities", el("div", { class: "abilities" }, abilities)));
}

function tipsTab(g) {
  const groups = new Map();
  for (const t of g.tips) groups.set(t.category, [...(groups.get(t.category) || []), t]);
  return el("div", { class: "stack" }, [...groups].map(([cat, tips]) =>
    card(cat, el("div", { class: "tips" }, tips.map((t) => tipCallout(t, false, false))))));
}

const TAB_VIEWS = { overview: overviewTab, runes: runesTab, build: buildTab, skills: skillsTab, tips: tipsTab };

// ---- Search ----------------------------------------------------------------
function searchIndex(g) {
  const r = g.runes, i = g.items;
  return [
    { tab: "overview", label: "Summary", text: g.summary },
    ...[r.keystone, ...r.primary, ...r.secondary, ...r.shards].map((n) => ({ tab: "runes", label: "Rune", text: n, extra: (runeInfo(n) || {}).desc })),
    ...[...i.start, ...i.core, ...i.later].map((n) => ({ tab: "build", label: "Item", text: n, extra: (itemInfo(n) || {}).desc })),
    ...g.summoners.map((n) => ({ tab: "build", label: "Spell", text: n })),
    ...g.abilities.map((a) => ({ tab: "skills", label: a.key, text: `${a.name}: ${a.text}`, extra: a.detail })),
    ...g.tips.map((t) => ({ tab: "tips", label: t.category, text: t.text, extra: t.detail })),
  ];
}

function searchView(g, query, onPick) {
  // Match from the start of a word, so "ward" finds "Control Ward" but not "toward".
  const re = new RegExp(`(^|[^a-z0-9])${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const hits = searchIndex(g).filter((e) => re.test(`${e.label} ${e.text} ${e.extra || ""}`));
  if (!hits.length) return el("div", { class: "empty" }, el("p", { text: `Nothing matches "${query.trim()}".` }));
  return el("ul", { class: "results", role: "list" }, hits.map((h) => el("li", {},
    el("button", { class: "result", type: "button", onclick: () => onPick(h.tab) },
      el("span", { class: "tag", text: h.label }),
      el("span", { class: "result-text", text: h.text }),
      el("span", { class: "result-tab", text: TAB_LABELS[h.tab] })))));
}

function noGuideView(champ) {
  return el("div", { class: "empty" },
    el("p", { class: "empty-title", text: `No guide for ${champ} yet` }),
    el("p", { class: "muted", text: `Guides available: ${Object.keys(window.GUIDES || {}).join(", ") || "none"}.` }));
}
