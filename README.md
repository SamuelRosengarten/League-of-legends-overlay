# LoL Overlay

A very light (Tauri) in-game overlay for League of Legends, aimed at brand-new players.
It ships a hand-written beginner guide for Gwen (shown before a game starts). In a game it follows your champion: every other champion gets an automatic guide built from Riot's Data Dragon (real abilities, plus a generic rune/item/spell template for their class and a skill order picked from cooldowns). Those are starting points, not meta builds. Add an entry to `src/data/guides.js` to override one.

## Using it
- Run League in **Borderless** or **Windowed** mode so the overlay can draw on top.
- The overlay is **click-through** (locked): your clicks go to the game and only a lock icon shows.
  Press `Ctrl+Shift+L` to unlock it (teal border): then you can click, hover icons for details, drag it by the header, and open settings. `Esc` locks it and gives focus back to the game.
- **Compact** mode shows the essentials: build icons, skill priority, spells and keystone, 3 reminders.
  **Expanded** mode has tabs (Overview, Runes, Build, Skills, Tips), search, and copy-build.
- Icons, names and tooltips come from Riot's **Data Dragon** (latest version, detected automatically).
  They are cached on disk, so they keep working offline after the first run. With no cache, the guide shows text instead.

| Hotkey | Action |
| --- | --- |
| `Ctrl+Shift+O` | Show / hide |
| `Ctrl+Shift+M` | Compact / expanded |
| `Ctrl+Shift+L` | Interact (click the overlay, drag it by the header) / lock again. `Esc` also locks. |

Change hotkeys in `%APPDATA%\com.samuelrosengarten.lol-overlay\config.json` and restart:
`{"hotkey": "Ctrl+Shift+O", "modeHotkey": "Ctrl+Shift+M", "interactHotkey": "Ctrl+Shift+L"}`

The **settings** panel (gear icon, when unlocked) adjusts mode, opacity, size (it also scales automatically to your screen, e.g. 1.2x at 1440p, 1.6x at 4K with 100% Windows scaling), width and max height, and can reset everything.
Settings and the window position are remembered; the overlay is always kept fully on a connected screen. The tray icon has **Show / hide**, **Interact / lock** and **Quit**.

## Riot policy
Only Riot's official local Live Client Data API (your own champion, level, gold and items) and Riot's public Data Dragon are used. No injection, memory reading or automation. This app is not endorsed or approved by Riot.

Riot's third-party rules prohibit apps that "draw conclusions for the player during gameplay". The optional **live build progress** (ticks owned items and shows the next one to buy) is **off by default** because it is unclear whether it counts; turn it on in Settings at your own discretion. Note that showing a static guide during a game may also fall under that rule.

## Development
- Windows builds come from GitHub Actions (Actions tab, latest run, Artifacts).
- Dev (Windows): `npm install && npm run dev`
- Preview without the game: open `src/index.html` in a browser.
- Tests: `cargo test` / `cargo clippy` in `src-tauri`, and `npm run test:ui` for the UI.
  The UI tests use `playwright-core`; set `CHROME_PATH` to a Chrome/Chromium binary.
