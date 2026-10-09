//! Tiny user config: `config.json` in the app config dir, e.g. {"hotkey": "Ctrl+Shift+O"}.

use serde::Deserialize;

pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+O";

#[derive(Deserialize)]
struct Config {
    hotkey: Option<String>,
}

/// Hotkey string from the config JSON, if present and non-empty.
pub fn hotkey_from_json(json: &str) -> Option<String> {
    let c: Config = serde_json::from_str(json).ok()?;
    c.hotkey.filter(|h| !h.trim().is_empty())
}

pub fn default_file() -> String {
    format!("{{\n  \"hotkey\": \"{DEFAULT_HOTKEY}\"\n}}\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_hotkey() {
        assert_eq!(
            hotkey_from_json(r#"{"hotkey":"Alt+Q"}"#).as_deref(),
            Some("Alt+Q")
        );
    }

    #[test]
    fn bad_or_empty_is_none() {
        assert!(hotkey_from_json("{}").is_none());
        assert!(hotkey_from_json(r#"{"hotkey":" "}"#).is_none());
        assert!(hotkey_from_json("nope").is_none());
    }

    #[test]
    fn default_file_round_trips() {
        assert_eq!(
            hotkey_from_json(&default_file()).as_deref(),
            Some(DEFAULT_HOTKEY)
        );
    }
}
