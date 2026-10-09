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
      if (cmd === "set_hotkeys") {
        if (window.__hotkeyError) throw new Error(window.__hotkeyError);
        return { toggle: args.toggle, mode: args.mode, interact: args.interact };
      }
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

// A context whose screen is 1080p unless told otherwise (the UI scales to the screen).
const newCtx = (opts = {}) => browser.newContext({ viewport: { width: 640, height: 900 }, screen: { width: 1920, height: 1080 }, ...opts });

// Open the overlay. app: mock the desktop app; dd: serve Data Dragon fixtures (else offline);
// brokenImages: every icon URL returns 404 from the first load.
async function open({ app = true, dd = true, brokenImages = false, context } = {}) {
  const ctx = context || await newCtx();
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route("https://ddragon.leagueoflegends.com/**", (route) => {
    const url = new URL(route.request().url());
    if (!dd) return route.abort();
    if (url.pathname.endsWith(".png")) {
      return brokenImages ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: "image/png", body: png(url.pathname) });
    }
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
  assert.match(await page.textContent(".sub"), /Top · Patch 26\.20/);
  // Build: 2 start items + 3 core items, as icons, in guide order.
  const build = await page.locator(".kv", { hasText: "Build" }).locator(".ic").evaluateAll((n) => n.map((e) => e.getAttribute("aria-label")));
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
  const ctx = await newCtx();
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
    const ctx = await newCtx({ viewport: { width: 700, height: 1000 } });
    await ctx.addInitScript(([w, s]) => localStorage.setItem("lol-overlay.prefs.v1",
      JSON.stringify({ mode: "expanded", expandedWidth: w, fontScale: s })), [w, scale]);
    const page = await open({ context: ctx });
    for (const tab of ["overview", "runes", "build", "skills", "tips"]) {
      await page.click(`[data-tab="${tab}"]`);
      assert.deepEqual(await overflow(page), [], `${tab} at ${w}px/${scale}%`);
      await noJunkText(page);
      const h = (await page.locator("#app").boundingBox()).height;
      const maxH = 560 * scale / 100; // max height scales with the Size setting
      assert.ok(h <= maxH + 1, `${tab} panel height ${h} within max height ${maxH}`);
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
  await page.waitForSelector(".tooltip:not([hidden])"); // shown after a short hover delay
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
  const ctx = await newCtx({ permissions: ["clipboard-read", "clipboard-write"] });
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
  const ctx = await newCtx();
  let page = await open({ context: ctx });
  await page.click('[aria-label="Settings"]');
  await page.locator('input[aria-label="Background opacity"]').fill("50");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-alpha").trim()), "0.5");
  await page.locator('input[aria-label="Size"]').fill("120");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()), "1.2");
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
  await shot(page, "compact-in-game");
  await emit(page, "game-state", { ...IN_GAME, champion: "Nobody" });
  assert.match(await page.textContent(".empty"), /No guide for Nobody yet/);
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
  await page.evaluate(() => { Prefs.set({ liveProgress: true }); });
  await emit(page, "game-state", IN_GAME);
  await shot(page, "compact-locked-in-game");
  assert.match(await page.textContent(".ftr"), /Ctrl\+Shift\+L to interact/);
  // Locked = click-through, so no clickable-looking controls; a lock indicator instead.
  assert.equal(await page.locator(".ctl").count(), 0);
  assert.equal(await page.locator('.lock-state[aria-label^="Locked"]').count(), 1);
  assert.equal(await page.isVisible("#search"), false);
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
  await page.waitForSelector(".tooltip:not([hidden])");
  assert.equal(await page.textContent(".tooltip strong"), "Shadowflame");
  await noJunkText(page);
  assert.deepEqual(await overflow(page), []);
  assert.deepEqual(page.errors, []);
  await shot(page, "compact-offline");
  await page.close();
});

test("broken image URLs fall back to text tiles", async () => {
  const page = await open({ brokenImages: true });
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

test("live build progress is off by default and explained in settings", async () => {
  const page = await open();
  await emit(page, "game-state", IN_GAME);
  assert.equal(await page.locator(".now").count(), 0);
  assert.equal(await page.locator(".ic.owned, .ic.next").count(), 0);
  await page.click('[aria-label="Settings"]');
  assert.match(await page.textContent(".settings"), /Riot's third-party rules prohibit apps that draw conclusions/);
  await page.check('input[aria-label="Live build progress"]');
  await page.click("text=Done");
  assert.equal(await page.locator(".now").count(), 1);
  await page.close();
});

test("in game: owned items are ticked and the next buy is shown with its cost", async () => {
  const ctx = await newCtx();
  await ctx.addInitScript(() => localStorage.setItem("lol-overlay.prefs.v1", JSON.stringify({ liveProgress: true })));
  const page = await open({ context: ctx });
  await emit(page, "game-state", IN_GAME);
  assert.match(await page.textContent(".now"), /Next.*Dusk and Dawn.*Can buy/);
  assert.equal(await page.locator(".kv .ic.next").getAttribute("aria-label"), "Dusk and Dawn (next to buy)");
  await emit(page, "game-state", { ...IN_GAME, gold: 500, items: [...IN_GAME.items, { name: "Dusk and Dawn", count: 1 }] });
  assert.deepEqual(await page.locator(".kv .ic.owned").evaluateAll((n) => n.map((e) => e.getAttribute("aria-label"))),
    ["Doran's Blade (owned)", "Dusk and Dawn (owned)"]);
  assert.equal(await page.locator(".kv .ic.next").getAttribute("aria-label"), "Sorcerer's Shoes (next to buy)");
  assert.match(await page.textContent(".now"), /Sorcerer's Shoes.*500 \/ 1,000 g/);
  // Gold changes update the line in place.
  await emit(page, "game-state", { ...IN_GAME, gold: 1500, items: [...IN_GAME.items, { name: "Dusk and Dawn", count: 1 }] });
  assert.match(await page.textContent(".now"), /Can buy/);
  await shot(page, "compact-in-game-next");
  await emit(page, "game-state", { inGame: false });
  assert.equal(await page.locator(".now").count(), 0);
  await ctx.close();
});

test("a champion whose data cannot load still gets its portrait, name and a clear message", async () => {
  const page = await open();
  await emit(page, "game-state", { ...IN_GAME, champion: "Ahri" });
  assert.equal(await page.textContent(".name"), "Ahri");
  assert.equal(await page.locator(".hdr .ic-portrait img").count(), 1);
  await page.waitForSelector(".empty-title");
  assert.match(await page.textContent(".empty"), /Can't load Ahri/);
  await page.close();
});

test("offline ability tiles show the key once, not twice", async () => {
  const page = await open({ dd: false });
  const chips = await page.$$eval(".skill-chips .ic", (n) => n.map((e) => e.textContent));
  assert.deepEqual(chips, ["Q", "E", "W"]);
  await page.close();
});

// Logical screen sizes: what the webview reports after Windows display scaling.
const SCREENS = [
  ["1280x720 @100%", 1280, 720, 1, 0.9],
  ["1366x768 @100%", 1366, 768, 1, 0.9],
  ["1920x1080 @100%", 1920, 1080, 1, 1],
  ["1920x1080 @125%", 1536, 864, 1.25, 0.9],
  ["1920x1080 @150%", 1280, 720, 1.5, 0.9],
  ["2560x1440 @100%", 2560, 1440, 1, 1.2],
  ["3840x2160 @100%", 3840, 2160, 1, 1.6],
  ["3840x2160 @150%", 2560, 1440, 1.5, 1.2],
  ["3840x2160 @200%", 1920, 1080, 2, 1],
];

test("scales to the screen: no overflow, fits on screen, readable text", async () => {
  for (const [name, w, h, dpr, scale] of SCREENS) {
    for (const mode of ["compact", "expanded"]) {
      const ctx = await newCtx({ viewport: { width: Math.min(w, 1000), height: Math.min(h, 1300) }, screen: { width: w, height: h }, deviceScaleFactor: dpr });
      await ctx.addInitScript((m) => localStorage.setItem("lol-overlay.prefs.v1", JSON.stringify({ mode: m, liveProgress: true })), mode);
      const page = await open({ context: ctx });
      await emit(page, "game-state", IN_GAME);
      assert.equal(await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--scale"))), scale, name);
      assert.deepEqual(await overflow(page), [], `${name} ${mode}`);
      const box = await page.locator("#app").boundingBox();
      assert.ok(box.height + 12 <= h - 40 && box.width + 12 <= w, `${name} ${mode} fits on screen (${box.width}x${box.height})`);
      // Smallest text, in physical pixels on the monitor.
      const minPx = await page.evaluate(() => Math.min(...[...document.querySelectorAll("#app *")]
        .filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
        .map((e) => parseFloat(getComputedStyle(e).fontSize))));
      assert.ok(minPx * dpr >= 9, `${name} ${mode}: smallest text ${minPx}px x${dpr}`);
      await noJunkText(page);
      if (["1280x720 @100%", "1920x1080 @100%", "3840x2160 @100%"].includes(name)) await shot(page, `screen-${name.split(" ")[0]}-${mode}`);
      await ctx.close();
    }
  }
});

test("champions without a hand-written guide get one built from Data Dragon", async () => {
  const page = await open();
  await emit(page, "game-state", { ...IN_GAME, champion: "Kai'Sa", items: [] });
  await page.waitForSelector(".kv");
  assert.equal(await page.textContent(".name"), "Kai'Sa");
  assert.match(await page.textContent(".sub"), /Marksman · Auto guide/);
  const build = await page.locator(".kv", { hasText: "Build" }).locator(".ic").evaluateAll((n) => n.map((e) => e.getAttribute("aria-label")));
  assert.deepEqual(build.slice(0, 2), ["Doran's Blade", "Health Potion"]);
  // Lowest cooldown first: Q (9s), then E (16s), then W (22s).
  assert.match(await page.getAttribute(".skill-chips", "aria-label"), /Max Q then E then W/);
  assert.equal(await page.locator(".tips .tip").count(), 3);
  await noJunkText(page);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("a game already running when the page loads is picked up from get_status", async () => {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.addInitScript(MOCK_TAURI);
  await page.addInitScript(() => { window.__status = { ...window.__status, game: { inGame: true, champion: "Gwen", level: 3, gold: 500, gameTime: 90, gameMode: "CLASSIC", items: [] } }; });
  await page.exposeFunction("__ddHost", (p) => { const j = ddJsonFor(p); return j ? JSON.stringify(j) : null; });
  await page.goto(PAGE);
  await page.waitForSelector(".live");
  assert.match(await page.textContent(".live"), /Lv 3/);
  await ctx.close();
});

test("only show during a game hides and shows the overlay", async () => {
  const page = await open();
  await page.evaluate(() => { Prefs.set({ onlyInGame: true }); });
  await emit(page, "game-state", IN_GAME);
  await emit(page, "game-state", { inGame: false });
  const vis = (await calls(page, "set_visible")).map((c) => c.args.visible);
  assert.deepEqual(vis, [true, false]);
  await page.close();
});

test("only show during a game: turning it off shows the overlay again", async () => {
  const page = await open();
  await page.evaluate(() => { Prefs.set({ onlyInGame: true }); });
  await page.click('[aria-label="Settings"]');
  await page.uncheck('input[aria-label="Only show during a game"]');
  assert.deepEqual((await calls(page, "set_visible")).at(-1).args, { visible: true });
  await page.close();
});

test("hotkeys can be rebound from settings; errors are shown and Esc cancels", async () => {
  const page = await open();
  await page.click('[aria-label="Settings"]');
  await page.click('[aria-label="Change Show / hide hotkey"]');
  await page.waitForFunction(() => document.activeElement.textContent.startsWith("Press"));
  await page.keyboard.press("Control+Alt+K");
  assert.deepEqual((await calls(page, "set_hotkeys")).at(-1).args,
    { toggle: "Ctrl+Alt+K", mode: "Ctrl+Shift+M", interact: "Ctrl+Shift+L" });
  assert.ok((await page.textContent(".settings")).includes("Ctrl+Alt+K"));

  // A key without a modifier is refused and nothing is sent.
  const before = (await calls(page, "set_hotkeys")).length;
  await page.click('[aria-label="Change Compact / expanded hotkey"]');
  await page.waitForFunction(() => document.activeElement.textContent.startsWith("Press"));
  await page.keyboard.press("k");
  assert.match(await page.textContent(".settings"), /Hold Ctrl, Alt or Shift too/);
  assert.equal((await calls(page, "set_hotkeys")).length, before);

  // The backend refusing (key taken by another app) shows its message.
  await page.evaluate(() => { window.__hotkeyError = "One of those hotkeys is used by another app."; });
  await page.click('[aria-label="Change Interact / lock hotkey"]');
  await page.waitForFunction(() => document.activeElement.textContent.startsWith("Press"));
  await page.keyboard.press("Control+Shift+P");
  assert.match(await page.textContent(".settings"), /used by another app/);

  // Esc cancels capturing without locking the overlay.
  await page.click('[aria-label="Change Show / hide hotkey"]');
  await page.waitForFunction(() => document.activeElement.textContent.startsWith("Press"));
  await page.keyboard.press("Escape");
  assert.equal((await calls(page, "set_interactive")).length, 0);
  assert.equal(await page.isVisible(".settings"), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("other game modes replace the Summoner's Rift tips; auto guides also swap spells", async () => {
  const page = await open();
  await emit(page, "game-state", { ...IN_GAME, champion: "Kai'Sa", gameMode: "ARAM", items: [] });
  await page.waitForSelector(".tips .tip");
  const tips = await page.locator(".tips .tip-text").allTextContents();
  assert.equal(tips.length, 3);
  assert.match(tips[0], /Stay with your team/);
  assert.doesNotMatch(tips.join(" "), /CS|Recall|Control Ward/);
  const spells = await page.locator(".kv", { hasText: "Spells" }).locator(".ic").evaluateAll((n) => n.map((e) => e.getAttribute("aria-label")));
  assert.deepEqual(spells.slice(0, 2), ["Flash", "Mark"]);
  // A hand-written guide keeps its own spells but still gets the mode's tips.
  await emit(page, "game-state", { ...IN_GAME, champion: "Gwen", gameMode: "ARAM" });
  assert.match(await page.textContent(".tips"), /Spend your gold every time you die/);
  assert.equal(await page.locator(".kv", { hasText: "Spells" }).locator('.ic[aria-label="Ignite"]').count(), 1);
  // Back on the Rift the original tips return.
  await emit(page, "game-state", { ...IN_GAME, champion: "Gwen", gameMode: "CLASSIC" });
  assert.match(await page.textContent(".tips"), /Last-hit minions/);
  assert.deepEqual(page.errors, []);
  await page.close();
});
