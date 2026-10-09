// Guides for champions without a hand-written entry in data/guides.js.
// Built from Data Dragon (abilities, class tags, cooldowns) plus one generic template per
// class, so every champion gets a sensible starting point. These are NOT champion-specific
// meta builds; hand-written guides in GUIDES always win.

const AUTO_SHARDS = {
  ad: ["Adaptive Force", "Adaptive Force", "Health (scaling)"],
  marksman: ["Attack Speed", "Adaptive Force", "Health (scaling)"],
  tank: ["Adaptive Force", "Health", "Health (scaling)"],
  support: ["Adaptive Force", "Move Speed", "Health (scaling)"],
};

const AUTO_PROFILES = {
  marksman: {
    role: "Marksman",
    summary: "Ranged damage dealer. Stay behind your team and keep attacking the closest safe target.",
    runes: { primaryTree: "Precision", keystone: "Lethal Tempo", primary: ["Presence of Mind", "Legend: Alacrity", "Coup de Grace"],
      secondaryTree: "Domination", secondary: ["Taste of Blood", "Treasure Hunter"], shards: AUTO_SHARDS.marksman },
    summoners: ["Flash", "Heal"],
    items: { start: ["Doran's Blade", "Health Potion"], core: ["Kraken Slayer", "Berserker's Greaves", "Infinity Edge"], boots: "Berserker's Greaves",
      later: ["Lord Dominik's Regards", "Bloodthirster", "Guardian Angel"] },
    tip: "Stay behind your tank and hit whatever is closest and safe to attack. Dying early loses your damage.",
  },
  adFighter: {
    role: "Fighter",
    summary: "Frontline damage dealer. Trade when healthy and fight near your minions.",
    runes: { primaryTree: "Precision", keystone: "Conqueror", primary: ["Triumph", "Legend: Alacrity", "Last Stand"],
      secondaryTree: "Resolve", secondary: ["Bone Plating", "Unflinching"], shards: AUTO_SHARDS.ad },
    summoners: ["Flash", "Ignite"],
    items: { start: ["Doran's Blade", "Health Potion"], core: ["Black Cleaver", "Plated Steelcaps", "Sterak's Gage"], boots: "Plated Steelcaps",
      later: ["Death's Dance", "Spirit Visage", "Guardian Angel"] },
    tip: "Fight when you are healthier than your opponent, and walk away when you are not.",
  },
  apFighter: {
    role: "Fighter",
    summary: "Ability-powered fighter. Use your abilities to trade, then stay in the fight when healthy.",
    runes: { primaryTree: "Sorcery", keystone: "Arcane Comet", primary: ["Manaflow Band", "Transcendence", "Gathering Storm"],
      secondaryTree: "Resolve", secondary: ["Bone Plating", "Unflinching"], shards: AUTO_SHARDS.ad },
    summoners: ["Flash", "Ignite"],
    items: { start: ["Doran's Ring", "Health Potion"], core: ["Liandry's Torment", "Sorcerer's Shoes", "Shadowflame"], boots: "Sorcerer's Shoes",
      later: ["Rabadon's Deathcap", "Zhonya's Hourglass", "Void Staff"] },
    tip: "Use your abilities whenever they are ready to trade; waiting wastes damage.",
  },
  tank: {
    role: "Tank",
    summary: "Frontline. Start fights, soak damage and protect your damage dealers.",
    runes: { primaryTree: "Resolve", keystone: "Grasp of the Undying", primary: ["Demolish", "Conditioning", "Overgrowth"],
      secondaryTree: "Inspiration", secondary: ["Magical Footwear", "Cosmic Insight"], shards: AUTO_SHARDS.tank },
    summoners: ["Flash", "Teleport"],
    items: { start: ["Doran's Shield", "Health Potion"], core: ["Sunfire Aegis", "Plated Steelcaps", "Thornmail"], boots: "Plated Steelcaps",
      later: ["Randuin's Omen", "Spirit Visage", "Warmog's Armor"] },
    tip: "You can take hits that would kill others. Be the first into a fight and keep enemies off your team.",
  },
  mage: {
    role: "Mage",
    summary: "Ability damage from range. Poke safely and keep your distance in fights.",
    runes: { primaryTree: "Sorcery", keystone: "Arcane Comet", primary: ["Manaflow Band", "Transcendence", "Scorch"],
      secondaryTree: "Inspiration", secondary: ["Magical Footwear", "Cosmic Insight"], shards: AUTO_SHARDS.ad },
    summoners: ["Flash", "Ignite"],
    items: { start: ["Doran's Ring", "Health Potion"], core: ["Luden's Echo", "Sorcerer's Shoes", "Shadowflame"], boots: "Sorcerer's Shoes",
      later: ["Rabadon's Deathcap", "Zhonya's Hourglass", "Void Staff"] },
    tip: "Fight from as far away as your abilities allow. Mana is limited, so do not spam early.",
  },
  adAssassin: {
    role: "Assassin",
    summary: "Burst damage. Pick off one target at a time and leave before you are caught.",
    runes: { primaryTree: "Domination", keystone: "Electrocute", primary: ["Sudden Impact", "Sixth Sense", "Ultimate Hunter"],
      secondaryTree: "Sorcery", secondary: ["Nimbus Cloak", "Waterwalking"], shards: AUTO_SHARDS.ad },
    summoners: ["Flash", "Ignite"],
    items: { start: ["Doran's Blade", "Health Potion"], core: ["Youmuu's Ghostblade", "Ionian Boots of Lucidity", "Edge of Night"], boots: "Ionian Boots of Lucidity",
      later: ["Serylda's Grudge", "Serpent's Fang", "Guardian Angel"] },
    tip: "Look for enemies who are alone or out of position. One kill then leave is better than staying in a lost fight.",
  },
  apAssassin: {
    role: "Assassin",
    summary: "Burst damage with abilities. Pick off one target at a time and leave before you are caught.",
    runes: { primaryTree: "Domination", keystone: "Electrocute", primary: ["Sudden Impact", "Sixth Sense", "Ultimate Hunter"],
      secondaryTree: "Sorcery", secondary: ["Absolute Focus", "Gathering Storm"], shards: AUTO_SHARDS.ad },
    summoners: ["Flash", "Ignite"],
    items: { start: ["Doran's Ring", "Health Potion"], core: ["Luden's Echo", "Sorcerer's Shoes", "Shadowflame"], boots: "Sorcerer's Shoes",
      later: ["Rabadon's Deathcap", "Zhonya's Hourglass", "Void Staff"] },
    tip: "Look for enemies who are alone or out of position. One kill then leave is better than staying in a lost fight.",
  },
  enchanter: {
    role: "Support",
    summary: "Help your team win: heal, shield and protect your damage dealer.",
    runes: { primaryTree: "Sorcery", keystone: "Summon Aery", primary: ["Manaflow Band", "Transcendence", "Scorch"],
      secondaryTree: "Resolve", secondary: ["Font of Life", "Revitalize"], shards: AUTO_SHARDS.support },
    summoners: ["Flash", "Ignite"],
    items: { start: ["World Atlas", "Health Potion"], core: ["Shurelya's Battlesong", "Ionian Boots of Lucidity", "Redemption"], boots: "Ionian Boots of Lucidity",
      later: ["Mikael's Blessing", "Knight's Vow", "Zeke's Convergence"] },
    tip: "Keep your damage dealer alive. Buy Control Wards often and keep vision on the map.",
  },
};

function autoProfileKey(tags, info) {
  const first = tags[0], ap = (info.magic || 0) > (info.attack || 0);
  if (first === "Marksman") return "marksman";
  if (first === "Tank") return "tank";
  if (first === "Support") return tags.includes("Tank") ? "tank" : "enchanter";
  if (first === "Mage") return "mage";
  if (first === "Assassin") return ap ? "apAssassin" : "adAssassin";
  return ap ? "apFighter" : "adFighter";
}

// Level the cheapest-cooldown basic ability first: it is the one you can use most often.
function autoSkillOrder(spells) {
  const cd = (k) => {
    const n = parseFloat(String((spells[k] || {}).cd || ""));
    return Number.isFinite(n) && n > 0 ? n : 999;
  };
  const max = ["Q", "W", "E"].sort((a, b) => cd(a) - cd(b) || "QWE".indexOf(a) - "QWE".indexOf(b));
  return {
    max,
    ultAt: [6, 11, 16],
    note: "Level R at 6, 11 and 16. Order is picked from ability cooldowns, so check it against a build site.",
  };
}

function firstSentence(text, limit = 64) {
  const s = String(text || "").split(/(?<=[.!?])\s/)[0].trim();
  return s.length > limit ? `${s.slice(0, limit - 1).trimEnd()}…` : s;
}

function autoAbilities(spells) {
  const basic = (k) => {
    const sp = spells[k], cd = sp.cd ? ` Cooldown at rank 1: ${parseFloat(sp.cd)}s.` : "";
    return { key: k, name: sp.name, text: firstSentence(sp.desc) || "ability", detail: `Basic ability.${cd}` };
  };
  return ["Passive", "Q", "W", "E", "R"].filter((k) => spells[k]).map((k) => {
    if (k === "Passive") return { key: k, name: spells[k].name, text: firstSentence(spells[k].desc) || "passive", detail: "Always active. You do not spend points on it." };
    if (k === "R") return { key: k, name: spells[k].name, text: firstSentence(spells[k].desc) || "ultimate", detail: "Your ultimate. Take a point at levels 6, 11 and 16." };
    return basic(k);
  });
}

function autoTips(profile) {
  return [
    { category: "Laning", priority: true, text: "Last-hit minions (CS): gold makes you stronger.",
      detail: "Only the final hit on a minion gives gold. Missed last hits are the biggest gold loss for new players." },
    { category: "Survival", priority: true, text: "Low health? Back off toward your tower.",
      detail: "Dying gives the enemy gold and loses you farm. Walk back early rather than late." },
    { category: "Recall timing", priority: true, text: "Recall at about 1300 gold.",
      detail: "That is enough to buy a real item part. Recall after pushing your wave so you lose fewer minions." },
    { category: "Role", text: profile.tip },
    { category: "Vision", text: "Buy a Control Ward (pink) every trip to base.",
      detail: "It reveals and disables enemy wards near it. Place it in a bush near your lane." },
  ];
}

const autoCache = new WeakMap();

// Returns a guide for `name` (display name or id) or null while its data is not loaded.
function autoGuide(name) {
  const d = DD.champions.get(name);
  if (!d || !d.spells.R) return null;
  let g = autoCache.get(d);
  if (g) return g;
  const profile = AUTO_PROFILES[autoProfileKey(d.tags || [], d.info || {})];
  g = {
    auto: true,
    role: profile.role,
    patch: String(DD.version || "").split(".").slice(0, 2).join("."),
    summary: `${d.title ? d.title.replace(/^./, (c) => c.toUpperCase()) + ". " : ""}${profile.summary}`,
    runes: profile.runes,
    summoners: profile.summoners,
    items: profile.items,
    skillOrder: autoSkillOrder(d.spells),
    abilities: autoAbilities(d.spells),
    tips: autoTips(profile),
  };
  autoCache.set(d, g);
  return g;
}

// ---- Game modes -------------------------------------------------------------
// Tips and spells written for Summoner's Rift (laning, recall, Control Wards) are wrong in
// other modes, so those modes replace the tips. Items and runes stay the guide's own.
const MODE_OVERRIDES = {
  aram: {
    summoners: ["Flash", "Mark"],
    tips: [
      { category: "Teamfights", priority: true, text: "Stay with your team: ARAM is one long fight.",
        detail: "There is a single lane. Fighting alone at the front gets you killed." },
      { category: "Shopping", priority: true, text: "Spend your gold every time you die.",
        detail: "You can only shop at the fountain. Buy when you respawn instead of saving gold." },
      { category: "Healing", priority: true, text: "Grab health relics on the lane to heal for free.",
        detail: "They sit on the lane between fights. Use them before you walk back into a fight." },
    ],
  },
  urf: {
    tips: [
      { category: "Abilities", priority: true, text: "Cooldowns are tiny: use your abilities constantly.",
        detail: "Holding an ability back wastes it. Use everything as soon as it is ready." },
      { category: "Survival", priority: true, text: "You die fast: do not walk up alone.",
        detail: "Everything hits hard in this mode. Stay near your team and keep your health up." },
      { category: "Gold", priority: true, text: "Recall often and spend your gold.",
        detail: "Gold comes in quickly, so go back and buy whenever you can afford a part." },
    ],
  },
  arena: {
    tips: [
      { category: "Augments", priority: true, text: "Pick augments that match your champion's strengths.",
        detail: "Augments change your play more than any item. Prefer ones that boost what you already do well." },
      { category: "Teamwork", priority: true, text: "Stay close to your teammate.",
        detail: "Arena is played in teams of two. A fight you win together beats two separate fights." },
      { category: "Shopping", priority: true, text: "Spend your gold between rounds.",
        detail: "Shop every time a round ends. Items here are not the Summoner's Rift build, so treat the build as a rough guide." },
    ],
  },
};

// Raw gameMode from the client -> "rift" (default) or a key of MODE_OVERRIDES.
function modeKind(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === "ARAM" || m === "KIWI") return "aram";
  if (m === "URF" || m === "ARURF") return "urf";
  if (m === "CHERRY") return "arena";
  return "rift";
}

const modeCache = new WeakMap();

// The guide as it should look in this mode. Rift returns the guide untouched.
function withMode(g, kind) {
  const o = MODE_OVERRIDES[kind];
  if (!g || !o) return g;
  let byKind = modeCache.get(g);
  if (!byKind) modeCache.set(g, (byKind = {}));
  return byKind[kind] || (byKind[kind] = { ...g, tips: o.tips, ...(g.auto && o.summoners ? { summoners: o.summoners } : {}) });
}
