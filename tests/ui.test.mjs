// UI tests: load the real overlay page in Chromium with a mocked Tauri bridge and mocked
// Data Dragon, then check behaviour and layout. Run: npm run test:ui
// CHROME_PATH can point at a Chrome/Chromium binary; SHOT_DIR saves screenshots.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { ddJsonFor, png } from "./fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = pathToFileURL(path.join(root, "src", "index.html")).href;
const SHOT_DIR = process.env.SHOT_DIR;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
after(() => browser.close());

const MOCK_TAURI = `
  window.__calls = []; window.__handlers = {};
  window.__status = { interactive: true, hotkeys: { toggle: "Ctrl+Shift+O", mode: "Ctrl+Shift+M", interact: "Ctrl+Shift+L" } };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => {
      window.__calls.push({ cmd, args });
      if (cmd === "get_status") return window.__status;
      if (cmd === "ddragon_json") {
        const t = await window.__ddHost(args.path);
        if (t === null) throw new Error("offline");
        return t;
      }
      return null;
    } },
    event: { listen: async (ev, fn) => { (window.__handlers[ev] ||= []).push(fn); } },
  };
  window.__emit = (ev, payload) => (window.__handlers[ev] || []).forEach((f) => f({ payload }));
`;

// Open the overlay. app: mock the desktop app; dd: serve Data Dragon fixtures (else offline).
async function open({ app = true, dd = true, width = 640, height = 900, context } = {}) {
  const ctx = context || await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route("https://ddragon.leagueoflegends.com/**", (route) => {
    const url = new URL(route.request().url());
    if (!dd) return route.abort();
    if (url.pathname.endsWith(".png")) return route.fulfill({ contentType: "image/png", body: png(url.pathname) });
    const json = ddJsonFor(url.pathname.slice(1));
    return json ? route.fulfill({ contentType: "application/json", body: JSON.stringify(json) }) : route.fulfill({ status: 404 });
  });
  if (app) {
    await page.exposeFunction("__ddHost", (p) => {
      const json = dd ? ddJsonFor(p) : null;
      return json ? JSON.stringify(json) : null;
    });
    await page.addInitScript(MOCK_TAURI);
  }
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof DD !== "undefined" && DD.status !== "loading");
  return page;
}

const calls = (page, cmd) => page.evaluate((c) => window.__calls.filter((x) => x.cmd === c), cmd);
const emit = (page, ev, payload) => page.evaluate(([e, p]) => window.__emit(e, p), [ev, payload]);

// Elements sticking out of the panel horizontally (clipped or overlapping content).
const noJunkText = async (page) => assert.doesNotMatch(await page.textContent("body"), /\b(null|undefined|NaN)\b/);

const overflow = (page) => page.evaluate(() => {
  const p = document.getElementById("app").getBoundingClientRect();
  return [...document.querySelectorAll("#app *")].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width && (r.right > p.right + 0.5 || r.left < p.left - 0.5);
  }).map((e) => `${e.tagName}.${e.className}`);
});

async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator("#app").screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}

const IN_GAME = {
  inGame: true, champion: "Gwen", level: 7, gold: 1234, gameTime: 301, gameMode: "PRACTICETOOL",
  items: [{ name: "Doran's Blade", count: 1 }, { name: "Control Ward", count: 2 }],
};

test("compact mode shows the essentials with real icons", async () => {
  const page = await open();
  assert.equal(await page.getAttribute("body", "data-mode"), "compact");
  assert.equal(await page.isHidden("#toolbar"), true);
  assert.equal(await page.textContent(".name"), "Gwen");
  assert.match(await page.textContent(".sub"), /Top · Guide patch 26\.20/);
  // Build: 2 start items + 3 core items, as icons, in guide order.
  const build = await page.$$eval(".kv:nth-child(1) .ic", (n) => n.map((e) => e.getAttribute("aria-label")));
  assert.deepEqual(build, ["Doran's Blade", "Health Potion", "Dusk and Dawn", "Sorcerer's Shoes", "Shadowflame"]);
  assert.equal(await page.locator(".kv .ic img").count() >= 7, true);
  assert.equal(await page.locator(".ic-fallback").count(), 0, "every known name resolves to an icon");
  assert.equal(await page.locator(".tips .tip").count(), 3);
  assert.match(await page.textContent(".ult"), /6 · 11 · 16/);
  assert.deepEqual(await overflow(page), []);
  await noJunkText(page);
  assert.deepEqual(page.errors, []);
  await shot(page, "compact");
  await page.close();
});

test("the window is fitted to the panel", async () => {
  const page = await open();
  await page.waitForTimeout(100);
  const fits = await calls(page, "fit_window");
  const box = await page.locator("#app").boundingBox();
  const last = fits.at(-1).args;
  assert.equal(last.width, Math.ceil(box.width) + 12);
  assert.equal(last.height, Math.ceil(box.height) + 12);
  await page.close();
});

test("hotkey toggles expanded mode; tab and mode persist across restarts", async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 900 } });
  let page = await open({ context: ctx });
  await emit(page, "toggle-mode", null);
  assert.equal(await page.getAttribute("body", "data-mode"), "expanded");
  assert.equal(await page.isVisible("#toolbar"), true);
  await page.click('[data-tab="skills"]');
  assert.equal(await page.getAttribute('[data-tab="skills"]', "aria-selected"), "true");
  await page.close();
  page = await open({ context: ctx });
  assert.equal(await page.getAttribute("body", "data-mode"), "expanded");
  assert.equal(await page.getAttribute('[data-tab="skills"]', "aria-selected"), "true");
  await ctx.close();
});

test("every expanded tab renders without overflow at min, default and max widths", async () => {
  for (const [w, scale] of [[320, 100], [400, 100], [560, 130], [320, 130]]) {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 } });
    await ctx.addInitScript(([w, s]) => localStorage.setItem("lol-overlay.prefs.v1",
      JSON.stringify({ mode: "expanded", expandedWidth: w, fontScale: s })), [w, scale]);
    const page = await open({ context: ctx });
    for (const tab of ["overview", "runes", "build", "skills", "tips"]) {
      await page.click(`[data-tab="${tab}"]`);
      assert.deepEqual(await overflow(page), [], `${tab} at ${w}px/${scale}%`);
      await noJunkText(page);
      const h = (await page.locator("#app").boundingBox()).height;
      assert.ok(h <= 560 + 1, `${tab} panel height ${h} within max height`);
      if (w === 400 && scale === 100) await shot(page, `expanded-${tab}`);
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
});

test("runes tab groups trees, keystone, runes and shards with descriptions", async () => {
  const page = await open();
  await emit(page, "toggle-mode", null);
  await page.click('[data-tab="runes"]');
  const titles = await page.$$eval(".card-title", (n) => n.map((e) => e.textContent));
  assert.deepEqual(titles, ["PrecisionPrimary", "ResolveSecondary", "Stat shards"]);
  assert.equal(await page.textContent(".rune-key .rune-name"), "Conqueror");
  assert.equal(await page.textContent(".rune-key .rune-desc"), "Conqueror short description.");
  assert.equal(await page.locator(".shards .ic img").count(), 3);
  await page.close();
});

test("tooltips show Riot names and descriptions on hover", async () => {
  const page = await open();
  await page.hover('.ic[aria-label="Dusk and Dawn"]');
  assert.equal(await page.isVisible(".tooltip"), true);
  assert.equal(await page.textContent(".tooltip strong"), "Dusk and Dawn");
  assert.match(await page.textContent(".tooltip"), /Dusk and Dawn plaintext/);
  await page.close();
});

test("skills tab: priority is labelled as such and abilities expand with Riot text", async () => {
  const page = await open();
  await emit(page, "toggle-mode", null);
  await page.click('[data-tab="skills"]');
  assert.match(await page.textContent(".card .note"), /priority order, not a level-by-level list/);
  const keys = await page.$$eval(".skill-chips .ic-badge", (n) => n.map((e) => e.textContent));
  assert.deepEqual(keys, ["Q", "E", "W"]);
  await page.click(".abilities details:nth-child(3) summary");
  assert.match(await page.textContent(".abilities details:nth-child(3)"), /turrets still can/);
  assert.match(await page.textContent(".abilities details:nth-child(3)"), /Hallowed Mist official description/);
  await page.close();
});

test("search finds tips and jumps to their tab", async () => {
  const page = await open();
  await emit(page, "toggle-mode", null);
  await page.fill("#search", "ward");
  const results = await page.$$eval(".result-text", (n) => n.map((e) => e.textContent));
  assert.deepEqual(results, ["Buy a Control Ward (pink) every trip to base."]);
  await page.click(".result");
  assert.equal(await page.getAttribute('[data-tab="tips"]', "aria-selected"), "true");
  assert.equal(await page.inputValue("#search"), "");
  await page.fill("#search", "zzzz");
  assert.match(await page.textContent(".empty"), /Nothing matches/);
  await page.close();
});

test("copy build puts a readable summary on the clipboard", async () => {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await open({ context: ctx });
  await emit(page, "toggle-mode", null);
  await page.click('[data-tab="build"]');
  await page.click("text=Copy build");
  await page.waitForSelector("text=Copied");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /^Gwen Top \(guide patch 26\.20\)/);
  assert.match(text, /Build: Dusk and Dawn > Sorcerer's Shoes > Shadowflame > Rabadon's Deathcap/);
  await ctx.close();
});

test("settings change live, persist, and reset to defaults", async () => {
  const ctx = await browser.newContext();
  let page = await open({ context: ctx });
  await page.click('[aria-label="Settings"]');
  await page.locator('input[aria-label="Background opacity"]').fill("50");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-alpha").trim()), "0.5");
  await page.locator('input[aria-label="Text size"]').fill("120");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim()), "1.2");
  assert.match(await page.textContent(".settings"), /Ctrl\+Shift\+L/);
  assert.match(await page.textContent(".settings"), /Data Dragon 99\.1\.1/);
  await page.close();
  page = await open({ context: ctx });
  assert.equal(await page.evaluate(() => Prefs.value.opacity), 50);
  await page.click('[aria-label="Settings"]');
  await page.click("text=Reset to defaults");
  assert.equal(await page.evaluate(() => Prefs.value.opacity), 88);
  assert.equal((await calls(page, "reset_position")).length, 1);
  await page.click("text=Done");
  assert.equal(await page.isVisible(".settings"), false);
  await ctx.close();
});

test("live game state shows in the header; other champions get an empty state", async () => {
  const page = await open();
  await emit(page, "game-state", IN_GAME);
  assert.match(await page.textContent(".live"), /Practice Tool.*5:01.*Lv 7.*1,234 g/);
  assert.equal(await page.locator('.live-items .ic[aria-label="Control Ward"] .ic-badge').textContent(), "2");
  await shot(page, "compact-in-game");
  await emit(page, "game-state", { ...IN_GAME, champion: "Ahri" });
  assert.match(await page.textContent(".empty"), /No guide for Ahri yet/);
  assert.match(await page.textContent(".empty"), /Guides available: Gwen/);
  await emit(page, "game-state", { inGame: false });
  assert.equal(await page.locator(".live").count(), 0);
  await page.close();
});

test("lock state: click-through styling, Esc locks, controls call the backend", async () => {
  const page = await open();
  await page.keyboard.press("Escape");
  assert.deepEqual((await calls(page, "set_interactive")).at(-1).args, { interactive: false });
  await emit(page, "interactive", false);
  assert.equal(await page.evaluate(() => document.body.classList.contains("locked")), true);
  assert.match(await page.textContent(".ftr"), /Click-through · Ctrl\+Shift\+L to interact/);
  await emit(page, "interactive", true);
  await page.click('[aria-label^="Hide"]');
  assert.equal((await calls(page, "hide_overlay")).length, 1);
  await page.close();
});

test("offline: text fallbacks, no errors, guide still complete", async () => {
  const page = await open({ dd: false });
  assert.equal(await page.evaluate(() => DD.status), "offline");
  assert.match(await page.textContent(".ftr"), /Icons offline/);
  assert.equal(await page.locator(".ic img").count(), 0);
  assert.ok(await page.locator(".ic-fallback").count() >= 8);
  await page.hover('.ic[aria-label="Shadowflame"]');
  assert.equal(await page.textContent(".tooltip strong"), "Shadowflame");
  await noJunkText(page);
  assert.deepEqual(await overflow(page), []);
  assert.deepEqual(page.errors, []);
  await shot(page, "compact-offline");
  await page.close();
});

test("broken image URLs fall back to text tiles", async () => {
  const page = await open();
  await page.route("https://ddragon.leagueoflegends.com/**/*.png", (r) => r.fulfill({ status: 404 }));
  await page.evaluate(() => renderAll());
  await page.waitForFunction(() => document.querySelectorAll(".ic img").length === 0);
  assert.ok(await page.locator(".ic-fallback").count() >= 8);
  await page.close();
});

test("browser preview: no fake match, clear label, no app-only controls", async () => {
  const page = await open({ app: false });
  assert.match(await page.textContent(".ftr"), /Browser preview · not connected to the game/);
  assert.equal(await page.locator(".live").count(), 0);
  assert.equal(await page.locator('[aria-label^="Hide"]').count(), 0);
  assert.equal(await page.evaluate(() => DD.status), "ready");
  assert.deepEqual(page.errors, []);
  await page.close();
});
