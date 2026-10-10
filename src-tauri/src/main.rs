#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod ddragon;
mod focus;
mod follow;
mod gamewin;
mod geometry;
mod keys;
mod live;

use follow::DisplayMode;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition,
    WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const DEFAULT_POSITION: (f64, f64) = (20.0, 60.0);

/// Debug-build diagnostics on stderr (release builds have no console).
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[overlay] {}", format!($($arg)*));
        }
    };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

impl Action {
    fn index(self) -> usize {
        self as usize
    }
}

#[derive(Default)]
struct Overlay {
    interactive: AtomicBool,
    /// Hidden with the show / hide hotkey, tray or "only show during a game".
    user_hidden: AtomicBool,
    /// Hidden automatically while the game window is minimised.
    auto_hidden: AtomicBool,
    /// Set when the window moved; the tracker saves the position.
    moved: AtomicBool,
    bindings: Mutex<Vec<(u32, Action)>>,
    /// The same hotkeys as virtual keys, for the fallback poller while the game is in front.
    combos: Mutex<Vec<(keys::Combo, Action)>>,
    /// When each action last ran, so a press seen by both RegisterHotKey and the poller
    /// only acts once.
    last_fired: Mutex<[Option<Instant>; 3]>,
    hotkeys: Mutex<ActiveHotkeys>,
    /// The game window (0 when there is none) and how it is displayed.
    game_hwnd: AtomicIsize,
    display: Mutex<DisplayMode>,
    /// Where the overlay sits inside the game window, and on the desktop without a game.
    anchor: Mutex<geometry::Anchor>,
    desktop_pos: Mutex<Option<(i32, i32)>>,
    /// Ask the tracker to re-place the overlay at its anchor (after a reset).
    reanchor: AtomicBool,
    /// Latest game state from the poller. The page asks for it on load, because the first
    /// event can be emitted before the page is listening.
    game: Mutex<live::GameState>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    interactive: bool,
    hotkeys: ActiveHotkeys,
    game: live::GameState,
    display_mode: DisplayMode,
}

/// window.json: the desktop position, plus the spot inside the game window.
#[derive(Serialize, Deserialize)]
struct SavedPosition {
    x: i32,
    y: i32,
    #[serde(default)]
    game: Option<geometry::Anchor>,
}

fn overlay_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("overlay")
}

fn config_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(name))
}

#[cfg(windows)]
fn overlay_hwnd(w: &WebviewWindow) -> isize {
    w.hwnd().map(|h| h.0 as isize).unwrap_or(0)
}

#[cfg(not(windows))]
fn overlay_hwnd(_w: &WebviewWindow) -> isize {
    0
}

fn game_running(app: &AppHandle) -> bool {
    app.state::<Overlay>().game_hwnd.load(Ordering::SeqCst) != 0
}

/// Remember the overlay's position. With no game it is the desktop position; while a
/// game window exists the tracker keeps the in-game anchor up to date instead.
fn save_position(app: &AppHandle, w: &WebviewWindow) {
    let state = app.state::<Overlay>();
    if !game_running(app) {
        if let Ok(p) = w.outer_position() {
            *state.desktop_pos.lock().unwrap() = Some((p.x, p.y));
        }
    }
    persist_position(app);
}

fn persist_position(app: &AppHandle) {
    let state = app.state::<Overlay>();
    let (Some(file), Some((x, y))) = (
        config_file(app, "window.json"),
        *state.desktop_pos.lock().unwrap(),
    ) else {
        return;
    };
    let saved = SavedPosition {
        x,
        y,
        game: Some(*state.anchor.lock().unwrap()),
    };
    if let Ok(json) = serde_json::to_string(&saved) {
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
        if let Some(a) = saved.game {
            *app.state::<Overlay>().anchor.lock().unwrap() = a;
        }
    }
    keep_on_screen(w, None);
    if let Ok(p) = w.outer_position() {
        *app.state::<Overlay>().desktop_pos.lock().unwrap() = Some((p.x, p.y));
    }
}

/// Show or hide the window to match the user's choice and the game state.
fn apply_visibility(app: &AppHandle) {
    let state = app.state::<Overlay>();
    let visible =
        !state.user_hidden.load(Ordering::SeqCst) && !state.auto_hidden.load(Ordering::SeqCst);
    if let Some(w) = overlay_window(app) {
        if visible {
            // The window is non-activating while locked (see set_interactive_inner), so
            // showing it never takes keyboard focus away from the game.
            let _ = w.show();
            raise_over_game(app, &w);
        } else {
            let _ = w.hide();
        }
    }
}

/// Make the overlay visible on request (hotkey, tray, second launch).
fn show_overlay(app: &AppHandle) {
    let state = app.state::<Overlay>();
    state.user_hidden.store(false, Ordering::SeqCst);
    state.auto_hidden.store(false, Ordering::SeqCst);
    apply_visibility(app);
}

/// Put the overlay back above the game window if something covered it. Skipped in
/// exclusive fullscreen, where fighting the game for the top spot makes it flicker or
/// minimise.
fn raise_over_game(app: &AppHandle, w: &WebviewWindow) {
    let state = app.state::<Overlay>();
    let own = overlay_hwnd(w);
    let game = state.game_hwnd.load(Ordering::SeqCst);
    if own == 0 || *state.display.lock().unwrap() == DisplayMode::Fullscreen {
        return;
    }
    if game == 0 || !gamewin::is_above(own, game) {
        if game != 0 {
            debug_log!("overlay was below the game window; raising it");
        }
        gamewin::raise_topmost(own);
    }
}

fn set_interactive_inner(app: &AppHandle, on: bool) {
    let state = app.state::<Overlay>();
    state.interactive.store(on, Ordering::SeqCst);
    if let Some(w) = overlay_window(app) {
        let own = overlay_hwnd(&w);
        let _ = w.set_ignore_cursor_events(!on);
        if on {
            // Interacting always shows the overlay. It is shown before it becomes
            // focusable, so showing it never activates it.
            focus::remember(own);
            show_overlay(app);
            let _ = w.set_focusable(true);
            // With the game in front, don't take its keyboard: the overlay gets focus when
            // the user clicks it. Elsewhere (client, desktop) focus it so Esc and typing work.
            if !game_running(app) || gamewin::foreground() != state.game_hwnd.load(Ordering::SeqCst)
            {
                focus::request(own);
            }
        } else {
            save_position(app, &w);
            // Give keyboard focus back to the game so the next keypress isn't lost.
            let had_focus = own != 0 && gamewin::foreground() == own;
            let _ = w.set_focusable(false);
            if had_focus || w.is_focused().unwrap_or(false) {
                let game = state.game_hwnd.load(Ordering::SeqCst);
                focus::restore((game != 0).then_some(game));
            }
        }
        // Style changes must not drop the window below the game.
        raise_over_game(app, &w);
    }
    let _ = app.emit("interactive", on);
}

fn hide_inner(app: &AppHandle) {
    if app.state::<Overlay>().interactive.load(Ordering::SeqCst) {
        set_interactive_inner(app, false);
    }
    app.state::<Overlay>()
        .user_hidden
        .store(true, Ordering::SeqCst);
    apply_visibility(app);
}

fn toggle_visibility(app: &AppHandle) {
    let visible = overlay_window(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(true);
    if visible {
        hide_inner(app);
    } else {
        show_overlay(app);
    }
}

/// Run a hotkey action at most once per press, whichever path (RegisterHotKey or the
/// in-game poller) reported it first.
fn fire(app: &AppHandle, action: Action) {
    {
        let state = app.state::<Overlay>();
        let mut last = state.last_fired.lock().unwrap();
        let now = Instant::now();
        let slot = &mut last[action.index()];
        if slot.is_some_and(|t| now.duration_since(t) < Duration::from_millis(350)) {
            return;
        }
        *slot = Some(now);
    }
    debug_log!("hotkey {action:?}");
    run_action(app, action);
}

fn run_action(app: &AppHandle, action: Action) {
    match action {
        Action::Toggle => toggle_visibility(app),
        Action::Mode => {
            show_overlay(app);
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
    let mut combos = Vec::new();
    let mut register = |text: String, action: Action| -> Option<String> {
        let shortcut = text.parse::<Shortcut>().ok()?;
        if let Err(e) = app.global_shortcut().register(shortcut) {
            debug_log!("hotkey {text} not registered: {e}");
            return None;
        }
        bindings.push((shortcut.id(), action));
        if let Some(c) = keys::parse(&text) {
            combos.push((c, action));
        }
        Some(text)
    };
    let active = ActiveHotkeys {
        toggle: register(keys.toggle, Action::Toggle),
        mode: register(keys.mode, Action::Mode),
        interact: register(keys.interact, Action::Interact),
    };
    *state.combos.lock().unwrap() = combos;
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
            .ok()
            .filter(|_| keys::parse(text).is_some())
            .ok_or_else(|| format!("{label}: \"{text}\" is not a valid hotkey."))?;
        if keys::parse(text).is_some_and(|c| c.mods & keys::SUPER != 0) {
            return Err(format!(
                "{label}: the Windows key is reserved for Windows shortcuts. Use Ctrl, Alt or Shift."
            ));
        }
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
        display_mode: *state.display.lock().unwrap(),
    }
}

/// Show or hide the overlay without taking focus (used by "only show during a game").
#[tauri::command]
fn set_visible(app: AppHandle, visible: bool) {
    if visible {
        show_overlay(&app);
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
    let state = app.state::<Overlay>();
    *state.anchor.lock().unwrap() = geometry::Anchor::default();
    if game_running(&app) {
        // The tracker re-places the overlay inside the game window.
        state.reanchor.store(true, Ordering::SeqCst);
    } else {
        let _ = window.set_position(LogicalPosition::new(DEFAULT_POSITION.0, DEFAULT_POSITION.1));
        keep_on_screen(&window, None);
        if let Ok(p) = window.outer_position() {
            *state.desktop_pos.lock().unwrap() = Some((p.x, p.y));
        }
    }
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

const TRAY_ID: &str = "main";
const TRAY_TIP: &str = "LoL Overlay";

fn set_display(app: &AppHandle, mode: DisplayMode) {
    let state = app.state::<Overlay>();
    {
        let mut current = state.display.lock().unwrap();
        if *current == mode {
            return;
        }
        *current = mode;
    }
    debug_log!("game display mode: {mode:?}");
    let _ = app.emit("display-mode", mode);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tip = if mode == DisplayMode::Fullscreen {
            "LoL Overlay: League is in exclusive fullscreen, so the overlay can't show over it. Use Borderless."
        } else {
            TRAY_TIP
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

/// State of the tracker thread.
#[derive(Default)]
struct Tracker {
    follow: follow::Follow,
    game: Option<gamewin::GameWindow>,
    edges: Vec<keys::Edge>,
    polling: bool,
}

/// Background loop: follows the game window (~5x per second while a game window exists,
/// every 0.5s otherwise) and, only while the game is the foreground window, reads the
/// hotkeys' key state every 30ms. Each pass is a handful of cheap window queries.
fn track_loop(app: AppHandle) {
    let mut t = Tracker::default();
    let mut last_track: Option<Instant> = None;
    loop {
        let game = app.state::<Overlay>().game_hwnd.load(Ordering::SeqCst);
        let in_front = game != 0 && gamewin::foreground() == game;
        if in_front {
            poll_hotkeys(&app, &mut t);
        } else {
            t.polling = false;
        }
        let interval = if game != 0 { 200 } else { 500 };
        if last_track.is_none_or(|l| l.elapsed() >= Duration::from_millis(interval)) {
            last_track = Some(Instant::now());
            track(&app, &mut t);
        }
        std::thread::sleep(Duration::from_millis(if in_front {
            30
        } else if game != 0 {
            100
        } else {
            250
        }));
    }
}

fn poll_hotkeys(app: &AppHandle, t: &mut Tracker) {
    let combos = app.state::<Overlay>().combos.lock().unwrap().clone();
    let start = !t.polling || t.edges.len() != combos.len();
    if start {
        t.edges = combos.iter().map(|_| keys::Edge::default()).collect();
    }
    t.polling = true;
    let mods = gamewin::held_mods();
    for ((combo, action), edge) in combos.iter().zip(t.edges.iter_mut()) {
        let down = gamewin::key_down(combo.vk);
        if start {
            edge.sync(down);
        } else if edge.step(*combo, down, mods) {
            fire(app, *action);
        }
    }
}

fn track(app: &AppHandle, t: &mut Tracker) {
    let Some(w) = overlay_window(app) else {
        return;
    };
    let state = app.state::<Overlay>();
    let found = gamewin::find();
    let Some(g) = found else {
        if t.game.take().is_some() {
            // The game closed (or is reconnecting): back to the desktop position.
            debug_log!("game window closed");
            t.follow.reset();
            state.game_hwnd.store(0, Ordering::SeqCst);
            state.auto_hidden.store(false, Ordering::SeqCst);
            set_display(app, DisplayMode::None);
            if let Some((x, y)) = *state.desktop_pos.lock().unwrap() {
                let _ = w.set_position(PhysicalPosition::new(x, y));
            }
            keep_on_screen(&w, None);
            apply_visibility(app);
        } else if state.moved.swap(false, Ordering::SeqCst) {
            // Dragged on the desktop: persist (at most once per pass, not per move event).
            save_position(app, &w);
        }
        return;
    };
    if state.reanchor.swap(false, Ordering::SeqCst) {
        t.follow.reset();
    }
    let previous = t.game.replace(g);
    if previous.is_none() {
        debug_log!("game window found: {:?}", g.client);
    }
    state.game_hwnd.store(g.hwnd, Ordering::SeqCst);
    state.moved.store(false, Ordering::SeqCst);

    // Exclusive fullscreen is only reported while the game is in front; keep the last
    // answer while it is in the background or minimised so the mode doesn't flap.
    let current = *state.display.lock().unwrap();
    let mode = if g.minimized || (!g.foreground && current == DisplayMode::Fullscreen) {
        if current == DisplayMode::None {
            g.mode
        } else {
            current
        }
    } else {
        g.mode
    };
    set_display(app, mode);

    let was_minimized = previous.is_some_and(|p| p.minimized);
    if g.minimized != was_minimized {
        // Hide with the minimised game, except in exclusive fullscreen: Alt+Tab minimises
        // the game there and the desktop is the only place the overlay can be read.
        let hide = g.minimized
            && mode != DisplayMode::Fullscreen
            && !state.interactive.load(Ordering::SeqCst);
        state.auto_hidden.store(hide, Ordering::SeqCst);
        apply_visibility(app);
    }
    if g.minimized {
        return;
    }

    if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
        let overlay = geometry::Rect {
            x: p.x,
            y: p.y,
            w: s.width as i32,
            h: s.height as i32,
        };
        let own = overlay_hwnd(&w);
        let dragging = state.interactive.load(Ordering::SeqCst)
            && gamewin::mouse_down()
            && own != 0
            && gamewin::foreground() == own;
        let anchor = *state.anchor.lock().unwrap();
        let d = t.follow.step(g.client, overlay, anchor, dragging);
        if let Some(a) = d.new_anchor {
            *state.anchor.lock().unwrap() = a;
            persist_position(app);
        }
        if let Some((x, y)) = d.move_to {
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    }
    if w.is_visible().unwrap_or(false) && (g.foreground || previous.is_none()) {
        raise_over_game(app, &w);
    }
}

fn main() {
    tauri::Builder::default()
        // A second launch (e.g. double-clicking the shortcut) shows the running overlay
        // instead of starting another one. Must be the first plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_overlay(app);
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
                        fire(app, action);
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
                // Mouse clicks pass straight through to the game until the user unlocks,
                // and the locked overlay can never be activated (it can't steal focus).
                w.set_ignore_cursor_events(true)?;
                w.set_focusable(false)?;
                restore_position(app.handle(), &w);
            }

            register_hotkeys(app.handle());

            let toggle_item =
                MenuItem::with_id(app, "toggle", "Show / hide overlay", true, None::<&str>)?;
            let interact_item =
                MenuItem::with_id(app, "interact", "Interact / lock", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &interact_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .tooltip(TRAY_TIP)
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

            // Follow the game window and watch the hotkeys while it is in front.
            let handle = app.handle().clone();
            std::thread::spawn(move || track_loop(handle));

            // Poll the local game API every 2s. The UI ticks the clock itself, so only
            // emit when something other than the clock changed, plus a resync every ~30s.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let agent = live::agent();
                let mut last = live::GameState::default();
                let mut since_emit = 0u32;
                loop {
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
