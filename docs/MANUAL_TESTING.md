# Manual test checklist (Windows, in League of Legends)

These need the real game; automated tests can't cover them. Use a Practice Tool game.
Run the debug build (`npm run dev`) to see `[overlay]` log lines in the terminal.

## Borderless (Settings > Video > Window Mode > Borderless)
- [ ] Overlay is visible over the game during loading screen and in game.
- [ ] Click into the game: the overlay stays on top (no flicker, never behind the game).
- [ ] `Ctrl+Shift+O` hides and shows it while the game is the active window.
- [ ] `Ctrl+Shift+L` unlocks: teal border. Game still gets your keyboard (QWER work) until you click the overlay.
- [ ] Unlocked: tabs, champion picker, search, collapsibles, copy build, settings, drag by the header and the resize corner all work. Mouse wheel scrolls the guide, not the game camera.
- [ ] `Ctrl+Shift+L` (or `Esc` after clicking the overlay) locks: clicks and wheel go to the game again, and the game has keyboard focus.
- [ ] `Ctrl+Shift+M` switches compact / expanded in game.
- [ ] Windows key: with the overlay running and locked, the Windows key behaves exactly as it does without the overlay (League may block it itself during a match; compare with the overlay closed).

## Windowed
- [ ] Overlay appears inside the game window, not on the desktop beside it.
- [ ] Move the game window: the overlay follows it.
- [ ] Resize it or change resolution: the overlay stays in the same corner and inside the window.
- [ ] Drag the overlay to the top-right of the game window, then move the game: it stays top-right.
- [ ] Minimise the game: the overlay hides. Restore it: the overlay comes back.
- [ ] All hotkeys work while the game window is active.

## Fullscreen (exclusive)
- [ ] Expected limitation: the overlay may not be visible over the game.
- [ ] The tray tooltip says the game is in exclusive fullscreen. Alt+Tab: the overlay shows a warning banner and is usable on the desktop.
- [ ] The game does not flicker or minimise because of the overlay.
- [ ] Switching to Borderless in game: the banner goes away and the overlay shows over the game.

## Lifecycle
- [ ] Champion select: overlay shows your saved desktop position; hotkeys work.
- [ ] Game start: guide switches to your champion. Pick another champion, then "Follow my champion" returns.
- [ ] Disconnect and reconnect: overlay returns inside the game window.
- [ ] Game end: overlay returns to its desktop position; "Only show during a game" hides it.
- [ ] Task Manager: CPU use of the overlay stays low (well under 1%) in game.
