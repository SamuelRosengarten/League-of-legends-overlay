// Guide data checks that need no browser and no network: every hand-written guide is
// complete and internally consistent. Run: npm run test:guides
// (Names against Riot's live data are checked separately by npm run check:names.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "src/data/guides.js"), "utf8"), ctx);
// JSON round trip: arrays from the vm context have another realm's prototype.
const GUIDES = JSON.parse(JSON.stringify(ctx.window.GUIDES));

const REQUIRED = ["Gwen", "Vel'Koz", "Shyvana", "Sylas"];
const KEYS = ["Passive", "Q", "W", "E", "R"];
const TIERS = ["Beginner", "Trade", "Advanced", "All-in", "Escape"];
const COMBO_TOKEN = /^(P|Q|W|E|R|AA|Flash|Ignite|Exhaust|Smite)$/;
const text = (v) => typeof v === "string" && v.trim().length > 0;
const list = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(text);

test("all four champions have a hand-written guide", () => {
  for (const name of REQUIRED) assert.ok(GUIDES[name], `${name} guide`);
});

for (const name of REQUIRED) {
  const g = GUIDES[name];

  test(`${name}: overview is complete`, () => {
    for (const k of ["role", "patch", "summary", "identity", "difficulty", "verified"]) assert.ok(text(g[k]), `${name}.${k}`);
    for (const k of ["positions", "strengths", "weaknesses", "winConditions", "idealWhen"]) assert.ok(list(g[k]), `${name}.${k}`);
    assert.match(g.patch, /^\d+\.\d+$/);
    assert.match(g.verified, /^\d{4}-\d{2}-\d{2}$/);
  });

  test(`${name}: every ability has text, detail and mechanics`, () => {
    assert.deepEqual(g.abilities.map((a) => a.key), KEYS);
    for (const a of g.abilities) {
      for (const k of ["name", "text", "detail"]) assert.ok(text(a[k]), `${name} ${a.key}.${k}`);
      assert.ok(list(a.mechanics), `${name} ${a.key}.mechanics`);
    }
    assert.ok(g.mechanics.length >= 2 && g.mechanics.every((m) => text(m.name) && text(m.text)));
  });

  test(`${name}: skill order is a valid 18-level path matching the max order`, () => {
    const s = g.skillOrder, lv = s.levels;
    assert.equal(lv.length, 18);
    assert.deepEqual(lv.map((k, i) => (k === "R" ? i + 1 : null)).filter(Boolean), s.ultAt, "R at 6/11/16");
    for (const k of ["Q", "W", "E"]) assert.equal(lv.filter((x) => x === k).length, 5, `${name} ${k} gets 5 points`);
    // The ability maxed first reaches rank 5 before the second, and so on.
    const maxedAt = (k) => lv.lastIndexOf(k);
    const order = [...s.max].sort((a, b) => maxedAt(a) - maxedAt(b));
    assert.deepEqual(order, s.max, `${name} max order matches the level path`);
  });

  test(`${name}: builds, runes and spells are complete`, () => {
    const i = g.items;
    assert.ok(list(i.start) && list(i.core, 3) && list(i.later, 3));
    assert.ok([...i.core, ...i.later].includes(i.boots), "boots are in the build");
    assert.ok(g.builds.length >= 1 && g.builds.every((b) => text(b.name) && text(b.when) && list(b.core) && list(b.later)));
    assert.ok(g.boots.length >= 2 && g.boots.every((b) => text(b.item) && text(b.when)));
    assert.ok(g.situational.length >= 3 && g.situational.every((b) => text(b.item) && text(b.when)));
    const page = (r) => {
      assert.ok(text(r.primaryTree) && text(r.secondaryTree) && text(r.keystone));
      assert.equal(r.primary.length, 3);
      assert.equal(r.secondary.length, 2);
      assert.equal(r.shards.length, 3);
      assert.notEqual(r.primaryTree, r.secondaryTree);
    };
    page(g.runes);
    assert.ok(g.runeAlternatives.length >= 1);
    for (const alt of g.runeAlternatives) { assert.ok(text(alt.name) && text(alt.when)); page(alt.runes); }
    assert.equal(g.summoners.length, 2);
  });

  test(`${name}: combos cover every tier and explain when to use them`, () => {
    assert.deepEqual([...new Set(g.combos.map((c) => c.tier))].sort(), [...TIERS].sort());
    for (const c of g.combos) {
      assert.ok(text(c.name) && text(c.when), `${name} combo ${c.name}`);
      assert.ok(c.keys.length >= 2 && c.keys.every((k) => COMBO_TOKEN.test(k)), `${name} combo ${c.name} keys ${c.keys}`);
    }
    assert.ok(g.quick.combo.every((k) => COMBO_TOKEN.test(k)));
  });

  test(`${name}: laning, matchups, macro and quick reference`, () => {
    for (const phase of ["early", "mid", "late"]) assert.ok(list(g.plan[phase], 2), `${name} plan.${phase}`);
    assert.ok(list(g.trading) && list(g.waves) && list(g.mistakes, 3));
    assert.ok(text(g.matchups.note));
    assert.ok(g.matchups.hard.length >= 1 && g.matchups.easy.length >= 1);
    for (const m of [...g.matchups.hard, ...g.matchups.easy]) assert.ok(text(m.champ) && text(m.tip));
    assert.ok(g.macro.length >= 3 && g.macro.every((m) => text(m.topic) && text(m.text)));
    assert.ok(list(g.quick.spikes, 2) && list(g.quick.reminders, 2) && text(g.quick.comboNote));
    assert.equal(g.tips.filter((t) => t.priority).length, 3, "3 compact reminders");
  });

  test(`${name}: sources are recorded and no win rates are stored`, () => {
    assert.ok(g.sources.length >= 2 && g.sources.every((s) => text(s.name) && /^https:\/\//.test(s.url) && text(s.covers)));
    assert.ok(g.sources.some((s) => s.url.startsWith("https://wiki.leagueoflegends.com/")), "ability source");
    assert.doesNotMatch(JSON.stringify(g), /\d+(\.\d+)?\s?%\s*(win|wr)/i, "no win-rate figures");
  });
}

test("guides are not copies of each other", () => {
  const summaries = REQUIRED.map((n) => GUIDES[n].summary);
  assert.equal(new Set(summaries).size, summaries.length);
  const firstMistakes = REQUIRED.map((n) => GUIDES[n].mistakes[0]);
  assert.equal(new Set(firstMistakes).size, firstMistakes.length);
});

test("Shyvana's guide describes the reworked kit", () => {
  const g = GUIDES.Shyvana, names = g.abilities.map((a) => a.name);
  assert.deepEqual(names, ["Scalemail", "Emberstrike", "Inferno Aegis", "Molten Burst", "Dragon's Descent"]);
  assert.match(g.summary, /26\.6/);
});
