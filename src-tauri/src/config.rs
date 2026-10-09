//! Tiny user config: `config.json` in the app config dir, e.g.
//! {"hotkey": "Ctrl+Shift+O", "modeHotkey": "Ctrl+Shift+M", "interactHotkey": "Ctrl+Shift+L"}.

use serde::{Deserialize, Serialize};

pub const DEFAULT_TOGGLE: &str = "Ctrl+Shift+O";
pub const DEFAULT_MODE: &str = "Ctrl+Shift+M";
pub const DEFAULT_INTERACT: &str = "Ctrl+Shift+L";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Raw {
    hotkey: Option<String>,
    mode_hotkey: Option<String>,
    interact_hotkey: Option<String>,
}

/// The three global hotkeys, as user-facing strings.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Hotkeys {
    pub toggle: String,
    pub mode: String,
    pub interact: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Hotkeys {
            toggle: DEFAULT_TOGGLE.into(),
            mode: DEFAULT_MODE.into(),
            interact: DEFAULT_INTERACT.into(),
        }
    }
}

fn pick(value: Option<String>, default: &str) -> String {
    value
        .map(|h| h.trim().to_string())
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| default.to_string())
}

/// Hotkeys from the config JSON. Missing, empty or unreadable entries fall back to defaults,
/// so an older config with only `hotkey` keeps working.
pub fn hotkeys_from_json(json: &str) -> Hotkeys {
    let raw: Raw = serde_json::from_str(json).unwrap_or_default();
    Hotkeys {
        toggle: pick(raw.hotkey, DEFAULT_TOGGLE),
        mode: pick(raw.mode_hotkey, DEFAULT_MODE),
        interact: pick(raw.interact_hotkey, DEFAULT_INTERACT),
    }
}

pub fn default_file() -> String {
    to_json(&Hotkeys::default())
}

/// The config file text for these hotkeys.
pub fn to_json(h: &Hotkeys) -> String {
    let value = serde_json::json!({
        "hotkey": h.toggle,
        "modeHotkey": h.mode,
        "interactHotkey": h.interact,
    });
    let mut text = serde_json::to_string_pretty(&value).unwrap_or_default();
    text.push('\n');
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_all_hotkeys() {
        let h = hotkeys_from_json(
            r#"{"hotkey":"Alt+Q","modeHotkey":"Alt+W","interactHotkey":"Alt+E"}"#,
        );
        assert_eq!(
            (h.toggle.as_str(), h.mode.as_str(), h.interact.as_str()),
            ("Alt+Q", "Alt+W", "Alt+E")
        );
    }

    #[test]
    fn old_config_keeps_toggle_and_defaults_the_rest() {
        let h = hotkeys_from_json(r#"{"hotkey":"Alt+Q"}"#);
        assert_eq!(h.toggle, "Alt+Q");
        assert_eq!(h.mode, DEFAULT_MODE);
        assert_eq!(h.interact, DEFAULT_INTERACT);
    }

    #[test]
    fn bad_or_empty_is_default() {
        assert_eq!(hotkeys_from_json("{}"), Hotkeys::default());
        assert_eq!(hotkeys_from_json(r#"{"hotkey":" "}"#), Hotkeys::default());
        assert_eq!(hotkeys_from_json("nope"), Hotkeys::default());
    }

    #[test]
    fn saved_hotkeys_round_trip() {
        let h = Hotkeys {
            toggle: "Alt+Q".into(),
            mode: "Ctrl+Alt+W".into(),
            interact: "Shift+F5".into(),
        };
        assert_eq!(hotkeys_from_json(&to_json(&h)), h);
    }

    #[test]
    fn default_file_round_trips() {
        assert_eq!(hotkeys_from_json(&default_file()), Hotkeys::default());
    }
}
