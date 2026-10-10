# LoL Overlay

A very light (Tauri) in-game overlay for League of Legends, aimed at new players.
It ships hand-written guides for **Gwen, Nautilus, Shyvana and Sylas** (overview, abilities, builds, runes, combos, matchups and a quick reference). Every other champion gets an automatic guide built from Riot's Data Dragon (real abilities, plus a generic rune/item/spell template for their class and a skill order picked from cooldowns). Those are starting points, not meta builds. Add an entry to `src/data/guides.js` to write a full one.

## Using it
- Run League in **Borderless** (recommended) or **Windowed** mode. See [Display modes](#display-modes).
- The overlay is **click-through** (locked): your clicks go to the game and only a lock icon shows.
  Press `Ctrl+Shift+L` to unlock it (teal border): then you can click tabs and buttons, scroll guides, search, select and copy text, drag it by the header, resize it from the bottom-right corner, and open settings. Press `Ctrl+Shift+L` again (or `Esc` when it has focus) to lock it and give the keyboard back to the game.
- Unlocking during a match does **not** steal the game's keyboard: the overlay takes keyboard focus only when you click it (for example to type in a search box).
- **Compact** mode shows the essentials: main combo, build icons, skill priority, spells and keystone, 3 reminders.
  **Expanded** mode has tabs (Quick, Overview, Build, Runes, Skills, Combos, Matchups, Tips), search, and copy-build. Automatic guides only show the tabs they have content for.
- The **swap** icon opens the champion list: search any champion. Outside a game the picked guide is remembered. In a game the guide follows your champion, but you can read another one (an enemy's, say) and go back with "Follow my champion".
- Icons, names and tooltips come from Riot's **Data Dragon** (latest version, detected automatically).
  They are cached on disk, so they keep working offline after the first run. With no cache, the guide shows text instead.

| Hotkey | Action |
| --- | --- |
| `Ctrl+Shift+O` | Show / hide |
| `Ctrl+Shift+M` | Compact / expanded |
| `Ctrl+Shift+L` | Interact (click the overlay, drag it by the header) / lock again. `Esc` also locks. |

Hotkeys work in the client and **during a match**. Windows doesn't deliver normal global hotkeys while the game is the active window, so while it is, the overlay also checks the key state itself (`GetAsyncKeyState`). That is read-only: it doesn't hook, block or inject anything, and the Windows key and other system shortcuts keep working. League itself may disable the Windows key while you play; that comes from the game, not from this app. Hotkeys can't use the Windows key.

Hotkeys are best changed in Settings; they are stored in `%APPDATA%\com.samuelrosengarten.lol-overlay\config.json`, which you can also edit by hand (restart afterwards):
`{"hotkey": "Ctrl+Shift+O", "modeHotkey": "Ctrl+Shift+M", "interactHotkey": "Ctrl+Shift+L"}`

## Display modes
| League window mode | Overlay |
| --- | --- |
| Borderless | Supported. Stays on top of the game and inside its window. |
| Windowed | Supported. Placed inside the game window and follows it when you move or resize it; it hides while the game is minimised. |
| Fullscreen (exclusive) | **Not supported.** An exclusive-fullscreen game owns the screen, and Windows can't draw a normal desktop window over it. The overlay detects this mode, shows a warning, and stays out of the game's way instead of fighting it (which would make the game flicker or minimise). When you Alt+Tab out, the overlay is usable on the desktop. Switch to Borderless in League: Settings > Video > Window Mode. |

The overlay remembers where you put it inside the game window (relative to the nearest corner), so it stays in place when the resolution or window size changes. It stays within the game window, moves back to your desktop position when the game closes, and picks the game up again after a reconnect.

The **settings** panel (gear icon, when unlocked) adjusts mode, opacity, size (it also scales automatically to your screen, e.g. 1.2x at 1440p, 1.6x at 4K with 100% Windows scaling), width and max height, and can reset everything.
Settings and the window position are remembered; the overlay is always kept fully on a connected screen. The tray icon has **Show / hide**, **Interact / lock** and **Quit**.

**Only show during a game** (Settings, In game) hides the overlay when no game is running and shows it when one starts; the show / hide hotkey still works. Starting the app a second time just shows the running one.

In **ARAM, URF and Arena** the Summoner's Rift tips (CS, recall, Control Wards) are replaced by tips for that mode. **Hotkeys** can be changed in Settings (hold Ctrl, Alt or Shift with a letter, number, F-key or arrow); they are saved to `config.json`.

## Development
- `npm run test:guides` checks that every hand-written guide is complete and consistent (no browser needed).
- `npm run test:ui` runs the UI tests in Chromium (mocked game and Data Dragon). If you have no Chrome, run `npx playwright-core install chromium` once, or set `CHROME_PATH`.
- `npm run check:names` (needs internet) checks that every item, rune, shard and spell named in the guides exists in the current Data Dragon and that rune pages are valid. A weekly GitHub Action runs it (and you can run it by hand from the Actions tab), so a patch that renames something fails loudly instead of silently dropping an icon.
- `cargo test` / `cargo clippy` in `src-tauri` for the Rust side.

## Guides
Each hand-written guide keeps **stable mechanics** (abilities and how they interact, combos) apart from **patch-dependent recommendations** (runes, items, skill order, matchups). Abilities were checked against the League of Legends Wiki (V26.20); builds, runes and matchups come from Mobalytics, Blitz.gg, Skill-Capped and U.GG for patch 26.20 (see `sources` in each guide and the guide's Overview tab). Anything the sources didn't confirm, such as stat shards, is listed under "Needs review" in the guide. No win rates are stored. Shyvana's guide covers her patch 26.6 rework.

## Riot policy
Only Riot's official local Live Client Data API (your own champion, level, gold and items) and Riot's public Data Dragon are used. No injection, memory reading or automation. This app is not endorsed or approved by Riot.

Riot's third-party rules prohibit apps that "draw conclusions for the player during gameplay". The optional **live build progress** (ticks owned items and shows the next one to buy) is **off by default** because it is unclear whether it counts; turn it on in Settings at your own discretion. Note that showing a static guide during a game may also fall under that rule.

## Development
- Windows builds come from GitHub Actions (Actions tab, latest run, Artifacts).
- Dev (Windows): `npm install && npm run dev`
- Preview without the game: open `src/index.html` in a browser.
- Tests: `cargo test` / `cargo clippy` in `src-tauri`, and `npm run test:ui` for the UI.
  The UI tests use `playwright-core`; set `CHROME_PATH` to a Chrome/Chromium binary.
