#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

fn toggle(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(true) {
        let _ = window.hide();
    } else {
        let _ = window.show();
    }
}

fn main() {
    let toggle_key = Shortcut::new(None, Code::F1);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_key && event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("overlay") {
                            toggle(&w);
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            if let Some(w) = app.get_webview_window("overlay") {
                // Mouse clicks pass straight through to the game.
                w.set_ignore_cursor_events(true)?;
            }
            app.global_shortcut().register(toggle_key)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running overlay");
}
