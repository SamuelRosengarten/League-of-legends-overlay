#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod live;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn toggle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(true) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
}

/// Hotkey from config.json (created with defaults if missing); falls back to the default.
fn load_hotkey(app: &AppHandle) -> Shortcut {
    let default = || {
        config::DEFAULT_HOTKEY
            .parse::<Shortcut>()
            .expect("valid default hotkey")
    };
    let Ok(dir) = app.path().app_config_dir() else {
        return default();
    };
    let path = dir.join("config.json");
    match std::fs::read_to_string(&path) {
        Ok(text) => config::hotkey_from_json(&text)
            .and_then(|h| h.parse::<Shortcut>().ok())
            .unwrap_or_else(default),
        Err(_) => {
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(&path, config::default_file());
            default()
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Only one shortcut is ever registered: the toggle.
                    if event.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            if let Some(w) = app.get_webview_window("overlay") {
                // Mouse clicks pass straight through to the game.
                w.set_ignore_cursor_events(true)?;
            }

            // If the hotkey is already taken by another app, keep running; the tray still works.
            let _ = app.global_shortcut().register(load_hotkey(app.handle()));

            let toggle_item =
                MenuItem::with_id(app, "toggle", "Show / hide overlay", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("LoL Overlay")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Poll the local game API every 2s. The UI ticks the clock itself, so only
            // emit when something other than the clock changed, plus a resync every ~30s.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let agent = live::agent();
                let mut last = live::GameState::default();
                let mut since_emit = 0u32;
                loop {
                    let state = live::fetch(&agent).unwrap_or_default();
                    since_emit += 1;
                    let changed = live::GameState {
                        game_time: 0,
                        ..state.clone()
                    } != live::GameState {
                        game_time: 0,
                        ..last.clone()
                    };
                    if changed || (state.in_game && since_emit >= 15) {
                        let _ = handle.emit("game-state", &state);
                        since_emit = 0;
                    }
                    last = state;
                    std::thread::sleep(Duration::from_secs(2));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running overlay");
}
