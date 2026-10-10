//! Hotkey fallback while the game is in front.
//!
//! The global hotkeys are registered with `RegisterHotKey` (tauri-plugin-global-shortcut).
//! Windows does not deliver those while the foreground app registered its raw keyboard
//! input with `RIDEV_NOHOTKEYS`, which is how games keep hotkeys from firing mid-match:
//! the shortcut works in champ select, then stops once the game window is in front.
//!
//! While the game window is in front we therefore also read the key state with
//! `GetAsyncKeyState` (a plain, read-only Win32 query: no hook, no injected input, nothing
//! is swallowed, so the game and Windows still see every key, including the Windows key).
//! This module holds the platform-independent part: parsing the hotkey text into virtual
//! key codes and detecting a fresh press.

/// Modifier bits.
pub const CTRL: u8 = 1;
pub const ALT: u8 = 2;
pub const SHIFT: u8 = 4;
pub const SUPER: u8 = 8;

/// A hotkey as Windows virtual-key codes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Combo {
    pub mods: u8,
    pub vk: u16,
}

/// Parse the same text the settings panel saves ("Ctrl+Shift+O", "Alt+F5", "Shift+Up").
/// Also accepts the longer spellings people type into config.json ("Control", "KeyO",
/// "Digit1", "ArrowUp", "CommandOrControl"). Returns `None` for anything else.
pub fn parse(text: &str) -> Option<Combo> {
    let mut mods = 0u8;
    let mut vk = None;
    for part in text.split('+').map(str::trim) {
        if part.is_empty() {
            return None;
        }
        let p = part.to_ascii_lowercase();
        let m = match p.as_str() {
            "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" => CTRL,
            "alt" | "option" => ALT,
            "shift" => SHIFT,
            "super" | "win" | "meta" | "cmd" | "command" => SUPER,
            _ => 0,
        };
        if m != 0 {
            mods |= m;
            continue;
        }
        if vk.is_some() {
            return None; // two non-modifier keys
        }
        vk = Some(key_code(&p)?);
    }
    Some(Combo { mods, vk: vk? })
}

fn key_code(p: &str) -> Option<u16> {
    let p = p
        .strip_prefix("key")
        .filter(|r| r.len() == 1)
        .or_else(|| p.strip_prefix("digit").filter(|r| r.len() == 1))
        .or_else(|| p.strip_prefix("arrow"))
        .unwrap_or(p);
    let b = p.as_bytes();
    if b.len() == 1 && b[0].is_ascii_alphabetic() {
        return Some(b[0].to_ascii_uppercase() as u16); // VK_A..VK_Z == 'A'..'Z'
    }
    if b.len() == 1 && b[0].is_ascii_digit() {
        return Some(b[0] as u16); // VK_0..VK_9 == '0'..'9'
    }
    if let Some(n) = p.strip_prefix('f').and_then(|n| n.parse::<u16>().ok()) {
        if (1..=24).contains(&n) {
            return Some(0x70 + n - 1); // VK_F1 = 0x70
        }
    }
    match p {
        "space" => Some(0x20),
        "left" => Some(0x25),
        "up" => Some(0x26),
        "right" => Some(0x27),
        "down" => Some(0x28),
        _ => None,
    }
}

/// Fires once per physical press: when the main key goes down while exactly the wanted
/// modifiers are held. Holding the keys does not repeat.
#[derive(Default)]
pub struct Edge {
    down: bool,
}

impl Edge {
    /// Start tracking from the current state without firing (e.g. the keys were already
    /// held when the game came to the front).
    pub fn sync(&mut self, main_down: bool) {
        self.down = main_down;
    }

    pub fn step(&mut self, combo: Combo, main_down: bool, held_mods: u8) -> bool {
        let fresh = main_down && !self.down;
        self.down = main_down;
        fresh && held_mods == combo.mods
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_settings_strings() {
        assert_eq!(
            parse("Ctrl+Shift+O"),
            Some(Combo {
                mods: CTRL | SHIFT,
                vk: 0x4F
            })
        );
        assert_eq!(
            parse("Alt+F5"),
            Some(Combo {
                mods: ALT,
                vk: 0x74
            })
        );
        assert_eq!(parse("F24"), Some(Combo { mods: 0, vk: 0x87 }));
        assert_eq!(
            parse("Shift+Up"),
            Some(Combo {
                mods: SHIFT,
                vk: 0x26
            })
        );
        assert_eq!(
            parse("Ctrl+Alt+7"),
            Some(Combo {
                mods: CTRL | ALT,
                vk: 0x37
            })
        );
        assert_eq!(
            parse("Ctrl+Space"),
            Some(Combo {
                mods: CTRL,
                vk: 0x20
            })
        );
    }

    #[test]
    fn parses_long_spellings() {
        assert_eq!(parse("Control+Shift+KeyO"), parse("Ctrl+Shift+O"));
        assert_eq!(parse("CommandOrControl+Digit1"), parse("Ctrl+1"));
        assert_eq!(parse("shift+arrowleft"), parse("Shift+Left"));
    }

    #[test]
    fn rejects_bad_text() {
        for bad in [
            "",
            "Ctrl+",
            "Ctrl+Shift",
            "Ctrl+O+P",
            "Ctrl+F25",
            "Ctrl+Tab?",
            "++",
        ] {
            assert_eq!(parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn fires_once_per_press_with_exact_modifiers() {
        let c = parse("Ctrl+Shift+O").unwrap();
        let mut e = Edge::default();
        assert!(!e.step(c, false, CTRL | SHIFT));
        assert!(e.step(c, true, CTRL | SHIFT), "press fires");
        assert!(!e.step(c, true, CTRL | SHIFT), "holding does not repeat");
        assert!(!e.step(c, false, CTRL | SHIFT));
        assert!(!e.step(c, true, CTRL), "missing Shift does not fire");
        assert!(!e.step(c, false, 0));
        assert!(
            !e.step(c, true, CTRL | SHIFT | ALT),
            "extra modifier does not fire"
        );
    }

    #[test]
    fn already_held_keys_do_not_fire_after_sync() {
        let c = parse("F8").unwrap();
        let mut e = Edge::default();
        e.sync(true);
        assert!(!e.step(c, true, 0));
        assert!(!e.step(c, false, 0));
        assert!(e.step(c, true, 0));
    }
}
