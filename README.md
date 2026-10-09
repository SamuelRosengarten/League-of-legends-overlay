# LoL Overlay

A very light (Tauri) in-game overlay for League of Legends, aimed at brand-new players.
It ships a bundled beginner guide for Gwen: runes, item build, skill order, abilities and tips.

## Using it
- Run League in **Borderless** or **Windowed** mode so the overlay can draw on top.
- The overlay is **click-through**: your clicks go to the game.
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

The **settings** panel (gear icon, in interact mode) adjusts mode, opacity, text size, width and max height, and can reset everything.
Settings and the window position are remembered. The tray icon has **Show / hide**, **Interact / lock** and **Quit**.

Only Riot's official local Live Client Data API is read during games (no injection, no automation).

## Development
- Windows builds come from GitHub Actions (Actions tab, latest run, Artifacts).
- Dev (Windows): `npm install && npm run dev`
- Preview without the game: open `src/index.html` in a browser.
- Tests: `cargo test` / `cargo clippy` in `src-tauri`, and `npm run test:ui` for the UI.
  The UI tests use `playwright-core`; set `CHROME_PATH` to a Chrome/Chromium binary.
