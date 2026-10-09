# LoL Overlay

A very light (Tauri) in-game overlay for League of Legends, aimed at brand-new players.
Planned: Gwen runes / items / skill order, matchup tips, objective timers, reminders, enemy threat info, glossary.

- Transparent, click-through, always-on-top. **Ctrl+Shift+O** toggles it (F1-F5 are League's own keys). Change it in `%APPDATA%\com.samuelrosengarten.lol-overlay\config.json`: `{"hotkey": "Alt+Q"}`.
- A tray icon (bottom-right of the taskbar) has **Show / hide** and **Quit**.
- Uses only Riot's official Live Client Data API (no injection). Run League in **Borderless/Windowed**.
- Windows builds come from GitHub Actions (Actions tab -> latest run -> Artifacts).

Dev (Windows): `npm install && npm run dev`
