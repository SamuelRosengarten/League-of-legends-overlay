#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod ddragon;
mod live;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const DEFAULT_POSITION: (f64, f64) = (20.0, 60.0);

#[derive(Clone, Copy)]
enum Action {
    /// Show or hide the overlay.
    Toggle,
    /// Switch between compact and expanded layouts (handled by the UI).
    Mode,
    /// Turn click-through off so the overlay can be clicked, or back on.
    Interact,
}

/// Hotkeys that actually registered; `None` if the key was invalid or taken by another app.
#[derive(Serialize, Clone, Default)]
struct ActiveHotkeys {
    toggle: Option<String>,
    mode: Option<String>,
    interact: Option<String>,
}

#[derive(Default)]
struct Overlay {
    interactive: AtomicBool,
    bindings: Mutex<Vec<(u32, Action)>>,
    hotkeys: Mutex<ActiveHotkeys>,
}

#[derive(Serialize)]
struct Status {
    interactive: bool,
    hotkeys: ActiveHotkeys,
}

#[derive(Serialize, Deserialize)]
struct SavedPosition {
    x: i32,
    y: i32,
}

fn overlay_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("overlay")
}

fn config_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(name))
}

fn save_position(app: &AppHandle, w: &WebviewWindow) {
    let (Some(file), Ok(p)) = (config_file(app, "window.json"), w.outer_position()) else {
        return;
    };
    if let Ok(json) = serde_json::to_string(&SavedPosition { x: p.x, y: p.y }) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(file, json);
    }
}

/// Restore the saved position, but only if it is still on a connected monitor.
fn restore_position(app: &AppHandle, w: &WebviewWindow) {
    let Some(saved) = config_file(app, "window.json")
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<SavedPosition>(&t).ok())
    else {
        return;
    };
    let on_screen = w.available_monitors().unwrap_or_default().iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        saved.x >= p.x
            && saved.y >= p.y
            && saved.x < p.x + s.width as i32
            && saved.y < p.y + s.height as i32
    });
    if on_screen {
        let _ = w.set_position(PhysicalPosition::new(saved.x, saved.y));
    }
}

fn set_interactive_inner(app: &AppHandle, on: bool) {
    app.state::<Overlay>()
        .interactive
        .store(on, Ordering::SeqCst);
    if let Some(w) = overlay_window(app) {
        let _ = w.set_ignore_cursor_events(!on);
        if on {
            // Only take focus when the user explicitly asks to interact.
            let _ = w.show();
            let _ = w.set_focus();
        } else {
            save_position(app, &w);
        }
    }
    let _ = app.emit("interactive", on);
}

fn hide_inner(app: &AppHandle) {
    if app.state::<Overlay>().interactive.load(Ordering::SeqCst) {
        set_interactive_inner(app, false);
    }
    if let Some(w) = overlay_window(app) {
        let _ = w.hide();
    }
}

fn toggle_visibility(app: &AppHandle) {
    if let Some(w) = overlay_window(app) {
        if w.is_visible().unwrap_or(true) {
            hide_inner(app);
        } else {
            let _ = w.show();
        }
    }
}

fn run_action(app: &AppHandle, action: Action) {
    match action {
        Action::Toggle => toggle_visibility(app),
        Action::Mode => {
            if let Some(w) = overlay_window(app) {
                let _ = w.show();
            }
            let _ = app.emit("toggle-mode", ());
        }
        Action::Interact => {
            let on = !app.state::<Overlay>().interactive.load(Ordering::SeqCst);
            set_interactive_inner(app, on);
        }
    }
}

/// Read config.json (created with defaults if missing) and register each hotkey.
/// A bad or taken hotkey is skipped; the tray menu still works.
fn register_hotkeys(app: &AppHandle) {
    let keys = match config_file(app, "config.json") {
        Some(path) => match std::fs::read_to_string(&path) {
            Ok(text) => config::hotkeys_from_json(&text),
            Err(_) => {
                if let Some(dir) = path.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let _ = std::fs::write(&path, config::default_file());
                config::Hotkeys::default()
            }
        },
        None => config::Hotkeys::default(),
    };
    let state = app.state::<Overlay>();
    let mut bindings = state.bindings.lock().unwrap();
    let mut register = |text: String, action: Action| -> Option<String> {
        let shortcut = text.parse::<Shortcut>().ok()?;
        app.global_shortcut().register(shortcut).ok()?;
        bindings.push((shortcut.id(), action));
        Some(text)
    };
    let active = ActiveHotkeys {
        toggle: register(keys.toggle, Action::Toggle),
        mode: register(keys.mode, Action::Mode),
        interact: register(keys.interact, Action::Interact),
    };
    *state.hotkeys.lock().unwrap() = active;
}

#[tauri::command]
fn get_status(state: tauri::State<Overlay>) -> Status {
    Status {
        interactive: state.interactive.load(Ordering::SeqCst),
        hotkeys: state.hotkeys.lock().unwrap().clone(),
    }
}

#[tauri::command]
fn set_interactive(app: AppHandle, interactive: bool) {
    set_interactive_inner(&app, interactive);
}

#[tauri::command]
fn hide_overlay(app: AppHandle) {
    hide_inner(&app);
}

/// The UI sizes the window to fit its content (logical pixels).
#[tauri::command]
fn fit_window(window: WebviewWindow, width: f64, height: f64) {
    let size = LogicalSize::new(width.clamp(200.0, 1200.0), height.clamp(80.0, 1600.0));
    let _ = window.set_size(size);
}

#[tauri::command]
fn reset_position(app: AppHandle, window: WebviewWindow) {
    if let Some(file) = config_file(&app, "window.json") {
        let _ = std::fs::remove_file(file);
    }
    let _ = window.set_position(LogicalPosition::new(DEFAULT_POSITION.0, DEFAULT_POSITION.1));
}

/// Data Dragon JSON with an on-disk cache (see ddragon.rs). Runs off the main thread.
#[tauri::command]
async fn ddragon_json(app: AppHandle, path: String) -> Result<String, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("ddragon");
    tauri::async_runtime::spawn_blocking(move || ddragon::get(&ddragon::agent(), &cache, &path))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .manage(Overlay::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let action = app
                        .state::<Overlay>()
                        .bindings
                        .lock()
                        .unwrap()
                        .iter()
                        .find(|(id, _)| *id == shortcut.id())
                        .map(|(_, a)| *a);
                    if let Some(action) = action {
                        run_action(app, action);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_status,
            set_interactive,
            hide_overlay,
            fit_window,
            reset_position,
            ddragon_json
        ])
        .setup(|app| {
            if let Some(w) = app.get_webview_window("overlay") {
                // Mouse clicks pass straight through to the game until the user unlocks.
                w.set_ignore_cursor_events(true)?;
                restore_position(app.handle(), &w);
            }

            register_hotkeys(app.handle());

            let toggle_item =
                MenuItem::with_id(app, "toggle", "Show / hide overlay", true, None::<&str>)?;
            let interact_item =
                MenuItem::with_id(app, "interact", "Interact / lock", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &interact_item, &quit_item])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("LoL Overlay")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => run_action(app, Action::Toggle),
                    "interact" => run_action(app, Action::Interact),
                    "quit" => {
                        if let Some(w) = overlay_window(app) {
                            save_position(app, &w);
                        }
                        app.exit(0)
                    }
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
