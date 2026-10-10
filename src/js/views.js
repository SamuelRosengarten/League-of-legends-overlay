// Guide views: compact mode, the expanded tabs, search results and empty states.
// Every function returns DOM built from the guide data; icons come from DD when available.

const GAME_MODES = { CLASSIC: "Summoner's Rift", ARAM: "ARAM", PRACTICETOOL: "Practice Tool", URF: "URF", CHERRY: "Arena" };
const TAB_LABELS = { quick: "Quick", overview: "Overview", build: "Build", runes: "Runes", skills: "Skills", combos: "Combos", matchups: "Matchups", tips: "Tips" };

// Tabs a guide has content for. Automatic guides have no combos, matchups or quick page.
function guideTabs(g) {
  return TABS.filter((t) => (t === "quick" ? Boolean(g.quick) : t === "combos" ? Boolean(g.combos && g.combos.length)
    : t === "matchups" ? Boolean(g.matchups || g.plan) : true));
}

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

// Live build progress: which guide items you already own and the next one to buy.
// `items` are the names reported by the game for your own inventory.
function buildProgress(g, items) {
  const owned = new Set((items || []).map((i) => i.name));
  const order = [...g.items.core, ...g.items.later];
  return { live: Boolean(items), owned, next: order.find((n) => !owned.has(n)) || null };
}
const NO_PROGRESS = { live: false, owned: new Set(), next: null };

// Classes/labels marking an item tile as owned or next.
function progressOpts(name, p) {
  if (!p.live) return {};
  if (p.owned.has(name)) return { cls: "owned", extraAttrs: { "aria-label": `${name} (owned)` } };
  if (name === p.next) return { cls: "next", extraAttrs: { "aria-label": `${name} (next to buy)` } };
  return {};
}

// The one actionable line during a game: next item to buy and whether you can afford it.
function nowRow(g, p, gold) {
  if (!p.live) return null;
  if (!p.next) return el("div", { class: "now" }, el("span", { class: "now-label", text: "Build" }), el("span", { class: "now-name", text: "Complete" }));
  const info = itemInfo(p.next), cost = info && info.gold;
  const ready = cost && gold >= cost;
  return el("div", { class: `now${ready ? " now-ready" : ""}`, "aria-label": "Next item to buy" },
    el("span", { class: "now-label", text: "Next" }),
    iconTile(p.next, info, { size: "sm" }),
    el("span", { class: "now-name", text: p.next }),
    cost ? el("span", { class: "now-cost", "data-tip-title": `${cost.toLocaleString()} gold`, "data-tip": "Full item cost from Riot's data. Components can be bought earlier.",
      text: ready ? "Can buy" : `${Math.floor(gold).toLocaleString()} / ${cost.toLocaleString()} g` }) : null);
}

// Purchase order: Start, then core items in order, optionally the later items.
function buildFlow(g, { labels = false, later = false, progress = NO_PROGRESS } = {}) {
  const i = g.items;
  const tile = (name, extra = {}) => {
    const t = iconTile(name, itemInfo(name), { size: labels ? "md" : "sm", ...extra, ...progressOpts(name, progress) });
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
    const info = abilityInfo(champ, key), a = g.abilities.find((x) => x.key === key);
    // Offline the tile itself shows the key, so the key badge would just repeat it.
    chips.push(el("span", { class: "skill" },
      iconTile(`${key} · ${(a && a.name) || (info && info.name) || key}`, info,
        { size, badge: info ? key : null, fallbackText: key, fallbackDesc: abilityText(g, key) })));
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

function bullets(items, cls = "") {
  return el("ul", { class: `bullets ${cls}`.trim() }, (items || []).map((t) => el("li", { text: t })));
}

// One step of a combo: an ability key, an auto-attack, or another action (Flash, Ignite).
const KEY_NAMES = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };
function keyChip(token, g, champ) {
  if (token === "AA") return el("span", { class: "kc kc-aa", "data-tip-title": "Auto-attack", "data-tip": "A basic attack.", tabindex: "0", text: "AA" });
  if (KEY_NAMES[token]) {
    const a = g.abilities.find((x) => x.key === (token === "P" ? "Passive" : token));
    const info = abilityInfo(champ, token === "P" ? "Passive" : token);
    const name = (a && a.name) || (info && info.name) || token;
    return el("span", { class: "kc kc-key", "data-tip-title": `${token} · ${name}`, "data-tip": (a && (a.detail || a.text)) || "", tabindex: "0", text: token });
  }
  const spell = spellInfo(token);
  return el("span", { class: "kc kc-other", "data-tip-title": token, "data-tip": (spell && spell.desc) || "", tabindex: "0", text: token });
}

function comboRow(keys, g, champ) {
  const parts = [];
  keys.forEach((k, i) => {
    if (i) parts.push(el("span", { class: "kc-sep", "aria-hidden": "true", text: "›" }));
    parts.push(keyChip(k, g, champ));
  });
  return el("div", { class: "combo-keys", "aria-label": `Combo: ${keys.join(", then ")}` }, parts);
}

function levelPath(levels) {
  return el("div", { class: "levels", role: "table", "aria-label": "Skill per level" }, levels.map((k, i) =>
    el("span", { class: `lv lv-${k}`, role: "cell", "data-tip-title": `Level ${i + 1}: ${k}`, tabindex: "0" },
      el("span", { class: "lv-n", text: String(i + 1) }), el("span", { class: "lv-k", text: k }))));
}

// A row of item icons with names, e.g. an alternative build.
function itemStrip(names, size = "sm") {
  return el("div", { class: "icon-row wrap" }, names.map((n) => iconTile(n, itemInfo(n), { size })));
}

function namedRow(name, info, text, kind) {
  return el("div", { class: "named" },
    iconTile(name, info, { size: "sm", kind, focusable: false }),
    el("div", { class: "named-text" }, el("span", { class: "named-name", text: name }), text ? el("span", { class: "named-when", text }) : null));
}

// ---- Compact mode ----------------------------------------------------------
function compactView(g, champ, progress = NO_PROGRESS) {
  return el("div", { class: "stack" },
    el("div", { id: "now" }),
    g.quick ? labelled("Combo", comboRow(g.quick.combo, g, champ)) : null,
    labelled("Build", buildFlow(g, { progress })),
    labelled("Skills", skillPriority(g, champ)),
    labelled("Spells", spellsRow(g)),
    reminders(g, true));
}

// ---- Expanded tabs ---------------------------------------------------------
function overviewTab(g, champ, progress = NO_PROGRESS) {
  return el("div", { class: "stack" },
    el("div", { id: "now" }),
    el("p", { class: "summary", text: g.summary }),
    card("Build path", buildFlow(g, { later: true, progress })),
    el("div", { class: "grid2" },
      card("Skill priority", skillPriority(g, champ)),
      card("Spells & keystone", spellsRow(g))),
    card("Reminders", reminders(g, false)),
    g.identity ? championCard(g) : null,
    g.strengths ? el("div", { class: "grid2" }, card("Strengths", bullets(g.strengths, "good")), card("Weaknesses", bullets(g.weaknesses, "bad"))) : null,
    g.winConditions ? card("How you win", bullets(g.winConditions), g.idealWhen ? el("p", { class: "note", text: `Pick when: ${g.idealWhen.join(" ")}` }) : null) : null,
    aboutCard(g));
}

function championCard(g) {
  return card("Champion",
    el("div", { class: "chips" },
      ...(g.positions || []).map((p) => el("span", { class: "tag", text: p })),
      g.difficulty ? el("span", { class: "tag tag-quiet", text: `Difficulty: ${g.difficulty}` }) : null),
    el("p", { class: "para", text: g.identity }));
}

// Where the guide's information comes from and what still needs checking.
function aboutCard(g) {
  if (g.auto) {
    return card("About this guide", el("p", { class: "note", text: "Automatic guide: abilities come from Riot's Data Dragon; runes, items and spells are a generic template for this class. Check a build site for this champion." }));
  }
  return card("About this guide",
    el("p", { class: "note", text: `Abilities and combos are stable mechanics. Runes, items, skill order and matchups are patch-dependent: checked for patch ${g.patch}${g.verified ? ` on ${g.verified}` : ""}.` }),
    g.sources ? collapsible("about:sources", el("span", { text: "Sources" }),
      el("ul", { class: "bullets sources" }, g.sources.map((x) => el("li", {}, el("span", { text: `${x.name}: ${x.covers}. ` }), el("span", { class: "url", text: x.url }))))) : null,
    g.review && g.review.length ? collapsible("about:review", el("span", { class: "review-head", text: `Needs review (${g.review.length})` }), bullets(g.review), true) : null);
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
      el("span", { class: "item" }, iconTile(n, runeInfo(n), { size: "sm", kind: "round" }), el("span", { class: "item-name", text: n }))))),
    g.runeAlternatives ? card("Alternative pages", el("div", { class: "folds" }, g.runeAlternatives.map((alt) =>
      collapsible(`runes:${alt.name}`, el("span", { class: "fold-head" }, iconTile(alt.runes.keystone, runeInfo(alt.runes.keystone), { size: "xs", kind: "round", focusable: false }), el("span", { class: "named-name", text: alt.name })),
        el("div", { class: "fold-body" }, el("p", { text: alt.when }),
          el("div", { class: "icon-row wrap" }, [alt.runes.keystone, ...alt.runes.primary, ...alt.runes.secondary].map((n) => iconTile(n, runeInfo(n), { size: "sm", kind: "round" })))))))) : null,
    g.summonerAlternatives ? card("Summoner spells",
      namedRow(g.summoners.join(" + "), spellInfo(g.summoners[1]), "Default", null),
      g.summonerAlternatives.map((alt) => namedRow(alt.spells.join(" + "), spellInfo(alt.spells[1]), alt.when, null))) : null);
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

function buildTab(g, champ, progress = NO_PROGRESS) {
  const i = g.items;
  const step = (label, names, numbered) => el("div", { class: "step" },
    el("span", { class: "step-label", text: label }),
    el("div", { class: "step-items" }, names.map((n, idx) => el("span", { class: "item" },
      iconTile(n, itemInfo(n), { size: "md", badge: numbered ? String(idx + 1) : null, ...progressOpts(n, progress) }),
      el("span", { class: "item-name", text: n === i.boots ? `${n} (boots)` : n })))));
  return el("div", { class: "stack" },
    card("Purchase order",
      step("Start", i.start, false),
      step("Core", i.core, true),
      step("Later", i.later, true),
      el("p", { class: "note", text: "Buy in this order. Later items finish the build." })),
    g.builds ? card("Other builds", g.builds.map((b) => el("div", { class: "alt-build" },
      el("div", { class: "named-name", text: b.name }),
      el("p", { class: "named-when", text: b.when }),
      el("div", { class: "flow" }, itemStrip(b.core), arrow(), itemStrip(b.later))))) : null,
    g.boots ? card("Boots", g.boots.map((b) => namedRow(b.item, itemInfo(b.item), b.when))) : null,
    g.situational ? card("Situational", g.situational.map((b) => namedRow(b.item, itemInfo(b.item), b.when))) : null,
    card("Summoner spells", el("div", { class: "step-items" }, g.summoners.map((n) =>
      el("span", { class: "item" }, iconTile(n, spellInfo(n), { size: "md" }), el("span", { class: "item-name", text: n }))))),
    el("div", { class: "actions" }, copyButton(g, champ)));
}

function skillsTab(g, champ) {
  const s = g.skillOrder;
  const abilities = g.abilities.map((a) => {
    const info = abilityInfo(champ, a.key);
    const letter = a.key === "Passive" ? "P" : a.key;
    const summary = el("span", { class: "ability-head" },
      iconTile(a.name, info, { size: "sm", badge: info ? letter : null, fallbackText: letter, focusable: false }),
      el("span", { class: "ability-name", text: a.name }),
      el("span", { class: "muted", text: a.text }));
    const body = el("div", { class: "ability-body" },
      a.detail ? el("p", { text: a.detail }) : null,
      a.mechanics ? bullets(a.mechanics) : null,
      info && info.desc ? el("p", { class: "riot-desc" }, el("span", { class: "tag", text: "Riot" }), info.desc) : null);
    return collapsible(`ability:${a.key}`, summary, body);
  });
  return el("div", { class: "stack" },
    card("Leveling priority", skillPriority(g, champ, "md"),
      el("p", { class: "note", text: `Max ${s.max.join(", then ")}. ${s.note} This is a priority order, not a level-by-level list.` })),
    s.levels ? card("Level by level", levelPath(s.levels)) : null,
    card("Abilities", el("div", { class: "abilities" }, abilities)),
    g.mechanics ? card("Key mechanics", el("div", { class: "folds" }, g.mechanics.map((m) =>
      collapsible(`mech:${m.name}`, el("span", { class: "named-name", text: m.name }), el("p", { class: "fold-body", text: m.text }))))) : null);
}

function tipsTab(g) {
  const groups = new Map();
  for (const t of g.tips) groups.set(t.category, [...(groups.get(t.category) || []), t]);
  return el("div", { class: "stack" }, [...groups].map(([cat, tips]) =>
    card(cat, el("div", { class: "tips" }, tips.map((t) => tipCallout(t, false, false))))));
}

// ---- Quick reference: one screen to glance at mid-game -----------------------
function quickTab(g, champ, progress = NO_PROGRESS) {
  const q = g.quick;
  return el("div", { class: "stack" },
    el("div", { id: "now" }),
    card("Main combo", comboRow(q.combo, g, champ), q.comboNote ? el("p", { class: "note", text: q.comboNote }) : null),
    card("Skill order", skillPriority(g, champ)),
    card("Core build", buildFlow(g, { progress })),
    el("div", { class: "grid2" },
      card("Power spikes", bullets(q.spikes)),
      card("Spells & keystone", spellsRow(g))),
    card("Remember", bullets(q.reminders)));
}

// ---- Combos -------------------------------------------------------------------
const TIER_ORDER = ["Beginner", "Trade", "Advanced", "All-in", "Escape"];
function combosTab(g, champ) {
  const combos = [...g.combos].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  return el("div", { class: "stack" },
    combos.map((c) => el("section", { class: "card combo" },
      el("h3", { class: "card-title" }, el("span", { text: c.name }), el("span", { class: `tag tier tier-${c.tier.toLowerCase().replace(/\W/g, "")}`, text: c.tier })),
      comboRow(c.keys, g, champ),
      el("p", { class: "combo-when", text: c.when }),
      c.notes ? el("p", { class: "note", text: c.notes }) : null)),
    el("p", { class: "note", text: "Hover or focus a key for the ability. AA = auto-attack." }));
}

// ---- Matchups and game plan ---------------------------------------------------
function matchupList(key, list) {
  return el("div", { class: "folds" }, list.map((m) => {
    const dd = DD.champion(m.champ);
    return collapsible(`mu:${key}:${m.champ}`, el("span", { class: "fold-head" },
      iconTile(m.champ, dd, { size: "xs", kind: "portrait", focusable: false }), el("span", { class: "named-name", text: m.champ })),
      el("p", { class: "fold-body", text: m.tip }));
  }));
}

function matchupsTab(g) {
  const p = g.plan || {}, m = g.matchups;
  const phase = (k, label) => (p[k] ? collapsible(`plan:${k}`, el("span", { class: "named-name", text: label }), bullets(p[k]), k === "early") : null);
  return el("div", { class: "stack" },
    g.plan ? card("Game plan", el("div", { class: "folds" }, phase("early", "Early game"), phase("mid", "Mid game"), phase("late", "Late game"))) : null,
    g.trading || g.waves ? el("div", { class: "grid2" },
      g.trading ? card("Trading", bullets(g.trading)) : null,
      g.waves ? card("Waves", bullets(g.waves)) : null) : null,
    m && m.hard ? card("Hard matchups", matchupList("hard", m.hard)) : null,
    m && m.easy ? card("Favorable", matchupList("easy", m.easy)) : null,
    m && m.note ? el("p", { class: "note", text: m.note }) : null,
    g.macro ? card("Map & teamfights", g.macro.map((x) => el("div", { class: "kv kv-top" }, el("span", { class: "kv-label", text: x.topic }), el("span", { class: "para", text: x.text })))) : null,
    g.mistakes ? card("Mistakes to avoid", bullets(g.mistakes, "bad")) : null);
}

const TAB_VIEWS = { quick: quickTab, overview: overviewTab, build: buildTab, runes: runesTab, skills: skillsTab, combos: combosTab, matchups: matchupsTab, tips: tipsTab };

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
    ...(g.combos || []).map((c) => ({ tab: "combos", label: c.tier, text: `${c.name}: ${c.keys.join(" ")}`, extra: `${c.when} ${c.notes || ""}` })),
    ...(g.mechanics || []).map((x) => ({ tab: "skills", label: "Mechanic", text: x.name, extra: x.text })),
    ...(g.builds || []).map((b) => ({ tab: "build", label: "Build", text: b.name, extra: `${b.when} ${[...b.core, ...b.later].join(" ")}` })),
    ...[...(g.boots || []), ...(g.situational || [])].map((b) => ({ tab: "build", label: "Item", text: b.item, extra: b.when })),
    ...(g.runeAlternatives || []).map((r) => ({ tab: "runes", label: "Runes", text: r.name, extra: r.when })),
    ...(g.matchups ? [...(g.matchups.hard || []), ...(g.matchups.easy || [])] : []).map((x) => ({ tab: "matchups", label: "Matchup", text: x.champ, extra: x.tip })),
    ...(g.macro || []).map((x) => ({ tab: "matchups", label: x.topic, text: x.text })),
    ...(g.mistakes || []).map((x) => ({ tab: "matchups", label: "Mistake", text: x })),
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
  const known = DD.portraits.get(champ);
  const name = DD.champion(champ) ? DD.champion(champ).name : champ;
  if (DD.status === "loading" || (known && DD.pending.has(known.id))) {
    return el("div", { class: "empty" }, el("p", { class: "empty-title", text: `Loading ${name}…` }));
  }
  if (DD.status === "offline" || (known && DD.failed.has(known.id))) {
    return el("div", { class: "empty" },
      el("p", { class: "empty-title", text: `Can't load ${name}` }),
      el("p", { class: "muted", text: "Guides for most champions come from Riot's Data Dragon. Connect to the internet once and they are cached for offline use." }));
  }
  return el("div", { class: "empty" },
    el("p", { class: "empty-title", text: `No guide for ${name} yet` }),
    el("p", { class: "muted", text: "Riot's data has no champion with this name." }));
}
