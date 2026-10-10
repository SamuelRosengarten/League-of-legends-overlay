// Checks that every item, rune, shard and summoner spell named in the guides exists in
// Riot's current Data Dragon, so a patch that renames something is caught here instead of
// silently turning an icon into a text tile. Needs internet. Run: npm run check:names
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://ddragon.leagueoflegends.com/";
const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  return r.json();
};

// Load the guide sources the same way the page does: plain scripts sharing globals.
const ctx = { window: {}, DD: { version: "", champions: new Map() }, console };
vm.createContext(ctx);
for (const f of ["src/data/guides.js", "src/js/autoguide.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
vm.runInContext("globalThis.PROFILES = AUTO_PROFILES; globalThis.MODES = MODE_OVERRIDES;", ctx);

const ddragonSrc = fs.readFileSync(path.join(root, "src/js/ddragon.js"), "utf8");
const shardNames = new Set([...ddragonSrc.matchAll(/^\s+"([^"]+)": "StatMods\w+\.png"/gm)].map((m) => m[1]));

const version = (await get("api/versions.json"))[0];
const base = `cdn/${version}/data/en_US/`;
const [items, runes, summoners] = await Promise.all([get(base + "item.json"), get(base + "runesReforged.json"), get(base + "summoner.json")]);

// Same rule as the app: Summoner's Rift (map 11), purchasable items.
const itemNames = new Set(Object.values(items.data).filter((i) => i.maps && i.maps["11"] && !(i.gold && i.gold.purchasable === false)).map((i) => i.name));
const runeNames = new Set(runes.flatMap((t) => [t.name, ...t.slots.flatMap((s) => s.runes.map((r) => r.name))]));
const spellNames = new Set(Object.values(summoners.data).map((s) => s.name));

const guides = [
  ...Object.entries(ctx.window.GUIDES).map(([name, g]) => [`guide ${name}`, g]),
  ...Object.entries(ctx.PROFILES).map(([name, g]) => [`auto ${name}`, g]),
];
const problems = [];
for (const [mode, o] of Object.entries(ctx.MODES)) {
  for (const n of o.summoners || []) if (!spellNames.has(n)) problems.push(`mode ${mode}: summoner spell "${n}" not found`);
}
const check = (who, kind, names, known) => {
  for (const n of names) if (!known.has(n)) problems.push(`${who}: ${kind} "${n}" not found`);
};
// Rune page rules: a keystone, one rune from each lower row of the primary tree, and
// two runes from different rows of the secondary tree.
const tree = (n) => runes.find((t) => t.name === n);
const row = (t, n) => (t ? t.slots.findIndex((sl) => sl.runes.some((x) => x.name === n)) : -1);
const checkPage = (who, r) => {
  check(who, "rune", [r.keystone, ...r.primary, ...r.secondary, r.primaryTree, r.secondaryTree], runeNames);
  const p1 = tree(r.primaryTree), p2 = tree(r.secondaryTree);
  if (row(p1, r.keystone) !== 0) problems.push(`${who}: keystone "${r.keystone}" is not a ${r.primaryTree} keystone`);
  r.primary.forEach((n, k) => { if (row(p1, n) !== k + 1) problems.push(`${who}: "${n}" is not in row ${k + 2} of ${r.primaryTree}`); });
  const rows = r.secondary.map((n) => row(p2, n));
  if (rows.some((x) => x < 1) || new Set(rows).size !== rows.length) problems.push(`${who}: secondary runes must be from two different rows of ${r.secondaryTree}`);
  check(who, "shard", r.shards, shardNames);
};
for (const [who, g] of guides) {
  const i = g.items;
  check(who, "item", [...i.start, ...i.core, ...i.later], itemNames);
  if (!i.core.concat(i.later).includes(i.boots)) problems.push(`${who}: boots "${i.boots}" is not in the build`);
  checkPage(who, g.runes);
  check(who, "summoner spell", g.summoners, spellNames);
  // Optional sections of hand-written guides.
  for (const b of g.builds || []) check(`${who} build "${b.name}"`, "item", [...b.core, ...b.later], itemNames);
  check(who, "boots option", (g.boots || []).map((b) => b.item), itemNames);
  check(who, "situational item", (g.situational || []).map((s) => s.item), itemNames);
  for (const alt of g.runeAlternatives || []) checkPage(`${who} runes "${alt.name}"`, alt.runes);
  for (const alt of g.summonerAlternatives || []) check(who, "summoner spell", alt.spells, spellNames);
}

console.log(`Data Dragon ${version}: checked ${guides.length} guides/templates.`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("All names found.");
