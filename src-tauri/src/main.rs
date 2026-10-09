#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod ddragon;
mod focus;
mod geometry;
mod live;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition,
    WebviewWindow, WindowEvent,
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
    /// Set when the window moved; the background loop saves the position.
    moved: AtomicBool,
    bindings: Mutex<Vec<(u32, Action)>>,
    hotkeys: Mutex<ActiveHotkeys>,
    /// Latest game state from the poller. The page asks for it on load, because the first
    /// event can be emitted before the page is listening.
    game: Mutex<live::GameState>,
}

#[derive(Serialize)]
struct Status {
    interactive: bool,
    hotkeys: ActiveHotkeys,
    game: live::GameState,
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

fn work_area(m: &Monitor) -> geometry::Rect {
    let a = m.work_area();
    geometry::Rect {
        x: a.position.x,
        y: a.position.y,
        w: a.size.width as i32,
        h: a.size.height as i32,
    }
}

/// Move the window back inside a screen's work area if any part of it is off-screen.
/// `size` is the physical size to check (pass the size just requested, since the OS may
/// apply a resize asynchronously).
fn keep_on_screen(w: &WebviewWindow, size: Option<(i32, i32)>) {
    let Ok(pos) = w.outer_position() else {
        return;
    };
    let (width, height) = match size {
        Some(s) => s,
        None => match w.outer_size() {
            Ok(s) => (s.width as i32, s.height as i32),
            Err(_) => return,
        },
    };
    let areas: Vec<_> = w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(work_area)
        .collect();
    let primary = w.primary_monitor().ok().flatten().map(|m| work_area(&m));
    let win = geometry::Rect {
        x: pos.x,
        y: pos.y,
        w: width,
        h: height,
    };
    if let Some((x, y)) = geometry::clamp_into(win, &areas, primary) {
        if (x, y) != (pos.x, pos.y) {
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    }
}

/// Restore the saved position, then make sure the window is fully on a connected screen.
fn restore_position(app: &AppHandle, w: &WebviewWindow) {
    let saved = config_file(app, "window.json")
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<SavedPosition>(&t).ok());
    if let Some(saved) = saved {
        let _ = w.set_position(PhysicalPosition::new(saved.x, saved.y));
    }
    keep_on_screen(w, None);
}

fn set_interactive_inner(app: &AppHandle, on: bool) {
    app.state::<Overlay>()
        .interactive
        .store(on, Ordering::SeqCst);
    if let Some(w) = overlay_window(app) {
        let _ = w.set_ignore_cursor_events(!on);
        if on {
            // Only take focus when the user explicitly asks to interact, and remember
            // which window (normally the game) had it.
            focus::remember();
            let _ = w.show();
            let _ = w.set_focus();
        } else {
            save_position(app, &w);
            // Give keyboard focus back to the game so the next keypress isn't lost.
            if w.is_focused().unwrap_or(false) {
                focus::restore();
            }
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

/// Read config.json (created with defaults if missing).
fn load_keys(app: &AppHandle) -> config::Hotkeys {
    match config_file(app, "config.json") {
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
    }
}

/// Replace all registered hotkeys with `keys`. A bad or taken hotkey is skipped (it shows
/// as unavailable); the tray menu still works.
fn register_all(app: &AppHandle, keys: config::Hotkeys) -> ActiveHotkeys {
    let state = app.state::<Overlay>();
    let mut bindings = state.bindings.lock().unwrap();
    bindings.clear();
    let _ = app.global_shortcut().unregister_all();
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
    *state.hotkeys.lock().unwrap() = active.clone();
    active
}

fn register_hotkeys(app: &AppHandle) {
    register_all(app, load_keys(app));
}

/// Change the hotkeys from the settings panel. All three are validated first; if one is
/// taken by another app nothing changes. On success they are saved to config.json.
#[tauri::command]
fn set_hotkeys(
    app: AppHandle,
    toggle: String,
    mode: String,
    interact: String,
) -> Result<ActiveHotkeys, String> {
    let keys = config::Hotkeys {
        toggle: toggle.trim().to_string(),
        mode: mode.trim().to_string(),
        interact: interact.trim().to_string(),
    };
    let named = [
        ("Show / hide", &keys.toggle),
        ("Compact / expanded", &keys.mode),
        ("Interact / lock", &keys.interact),
    ];
    let mut ids = Vec::new();
    for (label, text) in named {
        let shortcut = text
            .parse::<Shortcut>()
            .map_err(|_| format!("{label}: \"{text}\" is not a valid hotkey."))?;
        if ids.contains(&shortcut.id()) {
            return Err("Each action needs a different hotkey.".into());
        }
        ids.push(shortcut.id());
    }
    let previous = load_keys(&app);
    let active = register_all(&app, keys.clone());
    if active.toggle.is_none() || active.mode.is_none() || active.interact.is_none() {
        register_all(&app, previous);
        return Err("One of those hotkeys is used by another app. Nothing was changed.".into());
    }
    if let Some(path) = config_file(&app, "config.json") {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        std::fs::write(path, config::to_json(&keys)).map_err(|e| e.to_string())?;
    }
    Ok(active)
}

#[tauri::command]
fn get_status(state: tauri::State<Overlay>) -> Status {
    Status {
        interactive: state.interactive.load(Ordering::SeqCst),
        hotkeys: state.hotkeys.lock().unwrap().clone(),
        game: state.game.lock().unwrap().clone(),
    }
}

/// Show or hide the overlay without taking focus (used by "only show during a game").
#[tauri::command]
fn set_visible(app: AppHandle, visible: bool) {
    if visible {
        if let Some(w) = overlay_window(&app) {
            let _ = w.show();
        }
    } else {
        hide_inner(&app);
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

/// The UI sizes the window to fit its content (logical pixels), keeping it on screen.
#[tauri::command]
fn fit_window(window: WebviewWindow, width: f64, height: f64) {
    if !width.is_finite() || !height.is_finite() {
        return;
    }
    let size = LogicalSize::new(width.clamp(200.0, 1200.0), height.clamp(80.0, 1600.0));
    // The window must stay "resizable" for the OS: GTK refuses to shrink a non-resizable
    // window even programmatically. Pinning min = max = the fitted size stops users from
    // resizing it by its edges, so it always matches the panel.
    let _ = window.set_min_size(None::<LogicalSize<f64>>);
    let _ = window.set_max_size(None::<LogicalSize<f64>>);
    let _ = window.set_size(size);
    let _ = window.set_min_size(Some(size));
    let _ = window.set_max_size(Some(size));
    let physical = size.to_physical::<f64>(window.scale_factor().unwrap_or(1.0));
    keep_on_screen(
        &window,
        Some((physical.width as i32, physical.height as i32)),
    );
}

#[tauri::command]
fn reset_position(app: AppHandle, window: WebviewWindow) {
    if let Some(file) = config_file(&app, "window.json") {
        let _ = std::fs::remove_file(file);
    }
    let _ = window.set_position(LogicalPosition::new(DEFAULT_POSITION.0, DEFAULT_POSITION.1));
    keep_on_screen(&window, None);
}

/// Data Dragon JSON with an on-disk cache (see ddragon.rs). Runs off the main thread.
#[tauri::command]
async fn ddragon_json(app: AppHandle, path: String) -> Result<String, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("ddragon");
    tauri::async_runtime::spawn_blocking(move || {
        let text = ddragon::get(&ddragon::agent(), &cache, &path)?;
        if path == "api/versions.json" {
            if let Some(latest) = ddragon::latest_version(&text) {
                ddragon::prune(&cache, &latest);
            }
        }
        Ok::<String, String>(text)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        // A second launch (e.g. double-clicking the shortcut) shows the running overlay
        // instead of starting another one. Must be the first plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = overlay_window(app) {
                let _ = w.show();
            }
        }))
        .manage(Overlay::default())
        .on_window_event(|window, event| {
            if let WindowEvent::Moved(_) = event {
                window
                    .state::<Overlay>()
                    .moved
                    .store(true, Ordering::SeqCst);
            }
        })
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
            set_visible,
            set_hotkeys,
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
                    // Persist a dragged position (at most every 2s, not on every move event).
                    if handle
                        .state::<Overlay>()
                        .moved
                        .swap(false, Ordering::SeqCst)
                    {
                        if let Some(w) = overlay_window(&handle) {
                            save_position(&handle, &w);
                        }
                    }
                    let state = live::fetch(&agent).unwrap_or_default();
                    *handle.state::<Overlay>().game.lock().unwrap() = state.clone();
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
