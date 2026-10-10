// Riot Data Dragon index: names -> icon URL + short description. Loads in the background;
// until it is ready (or if offline with no cache) the UI shows text fallbacks.
const DD_BASE = "https://ddragon.leagueoflegends.com/";

// Stat shards are not in Data Dragon's JSON, only their icons are.
const SHARD_ICONS = {
  "Attack Speed": "StatModsAttackSpeedIcon.png",
  "Adaptive Force": "StatModsAdaptiveForceIcon.png",
  "Health (scaling)": "StatModsHealthScalingIcon.png",
  "Health": "StatModsHealthPlusIcon.png",
  "Move Speed": "StatModsMovementSpeedIcon.png",
  "Ability Haste": "StatModsCDRScalingIcon.png",
  "Tenacity and Slow Resist": "StatModsTenacityIcon.png",
};

const DD = {
  status: "loading", // "loading" | "ready" | "offline"
  version: null,
  items: new Map(), runes: new Map(), trees: new Map(), summoners: new Map(), champions: new Map(),
  // Every champion's portrait, by display name ("Kai'Sa") and by id ("Kaisa").
  portraits: new Map(),
  // Champion detail files that are loading, or failed to load (by id).
  pending: new Set(), failed: new Set(),

  champion(name) {
    const detail = this.champions.get(name);
    if (detail) return detail;
    const p = this.portraits.get(name);
    return p ? { name: p.name, img: p.img, spells: {} } : null;
  },

  shard(name) {
    const file = SHARD_ICONS[name];
    return file ? { img: `${DD_BASE}cdn/img/perk-images/StatMods/${file}`, desc: "" } : null;
  },
};

function ddText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

async function ddJson(path) {
  if (Bridge.isApp) return JSON.parse(await Bridge.invoke("ddragon_json", { path }));
  const r = await fetch(DD_BASE + path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

function indexItems(json, v) {
  const best = new Map();
  for (const [id, it] of Object.entries(json.data || {})) {
    // Summoner's Rift (map 11) items you can buy; prefer the lowest id when names repeat.
    if (!it.maps || !it.maps["11"] || (it.gold && it.gold.purchasable === false)) continue;
    const prev = best.get(it.name);
    if (prev && Number(prev.id) < Number(id)) continue;
    best.set(it.name, {
      id, img: `${DD_BASE}cdn/${v}/img/item/${it.image.full}`,
      desc: ddText(it.plaintext) || ddText(it.description), gold: it.gold ? it.gold.total : null,
    });
  }
  return best;
}

function indexRunes(json) {
  for (const tree of json || []) {
    DD.trees.set(tree.name, { img: `${DD_BASE}cdn/img/${tree.icon}`, desc: "" });
    for (const slot of tree.slots || []) {
      for (const r of slot.runes || []) {
        DD.runes.set(r.name, { img: `${DD_BASE}cdn/img/${r.icon}`, desc: ddText(r.shortDesc), tree: tree.name });
      }
    }
  }
}

function indexChampion(json, v) {
  for (const c of Object.values(json.data || {})) {
    const spells = {};
    (c.spells || []).forEach((s, i) => {
      spells["QWER"[i]] = { name: s.name, img: `${DD_BASE}cdn/${v}/img/spell/${s.image.full}`, desc: ddText(s.description), cd: s.cooldownBurn };
    });
    if (c.passive) {
      spells.Passive = { name: c.passive.name, img: `${DD_BASE}cdn/${v}/img/passive/${c.passive.image.full}`, desc: ddText(c.passive.description) };
    }
    // Keyed by id ("Kaisa") and by the display name the game reports ("Kai'Sa").
    const detail = { name: c.name, title: c.title, tags: c.tags || [], info: c.info || {}, img: `${DD_BASE}cdn/${v}/img/champion/${c.image.full}`, spells };
    DD.champions.set(c.id, detail);
    DD.champions.set(c.name, detail);
  }
}

// Load everything the given champions need. Each file is independent: one failing
// (e.g. offline with no cache) leaves the rest usable.
async function loadDataDragon(champions, onChange) {
  try {
    const versions = await ddJson("api/versions.json");
    DD.version = versions[0];
  } catch {
    DD.status = "offline";
    onChange();
    return;
  }
  const v = DD.version, base = `cdn/${v}/data/en_US/`;
  const list = ddJson(base + "champion.json").then((j) => {
    for (const c of Object.values(j.data || {})) {
      const p = { id: c.id, name: c.name, img: `${DD_BASE}cdn/${v}/img/champion/${c.image.full}` };
      DD.portraits.set(c.name, p);
      DD.portraits.set(c.id, p);
    }
  });
  const jobs = [
    ddJson(base + "item.json").then((j) => { DD.items = indexItems(j, v); }),
    ddJson(base + "runesReforged.json").then(indexRunes),
    ddJson(base + "summoner.json").then((j) => {
      for (const s of Object.values(j.data || {})) {
        DD.summoners.set(s.name, { img: `${DD_BASE}cdn/${v}/img/spell/${s.image.full}`, desc: ddText(s.description) });
      }
    }),
    list,
    // Guides are keyed by display name ("Vel'Koz"), detail files by id ("Velkoz"), so
    // each detail file waits for the champion list to map one to the other.
    ...champions.map((c) => list.catch(() => null)
      .then(() => ddJson(`${base}champion/${(DD.portraits.get(c) || { id: c }).id}.json`))
      .then((j) => indexChampion(j, v))),
  ];
  const results = await Promise.allSettled(jobs);
  DD.status = results.some((r) => r.status === "fulfilled") ? "ready" : "offline";
  onChange();
}

// Load one champion's abilities (needed for an automatic guide). Safe to call repeatedly.
async function loadChampion(name, onChange) {
  const p = DD.portraits.get(name);
  if (!p || !DD.version || DD.champions.has(p.id) || DD.pending.has(p.id)) return;
  DD.pending.add(p.id);
  DD.failed.delete(p.id);
  try {
    indexChampion(await ddJson(`cdn/${DD.version}/data/en_US/champion/${p.id}.json`), DD.version);
  } catch {
    DD.failed.add(p.id);
  }
  DD.pending.delete(p.id);
  onChange();
}
