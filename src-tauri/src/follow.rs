//! Keeping the overlay attached to the game window (platform-independent decisions; the
//! Win32 queries live in gamewin.rs).
//!
//! While a game window exists the overlay is positioned relative to the game's client
//! area (see `geometry::Anchor`), so it follows the window when it moves, is resized or
//! changes resolution, and never ends up outside it. When the user drags the overlay, the
//! new spot becomes the anchor.

use crate::geometry::{anchor_for, contains, place, Anchor, Rect};

/// How the game is being displayed.
// Only the Windows build detects a game window, so other targets never build some modes.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    /// No game window.
    #[default]
    None,
    /// A normal window with a title bar.
    Windowed,
    /// Borderless window covering the monitor.
    Borderless,
    /// Exclusive fullscreen: a desktop overlay can't reliably draw over it.
    Fullscreen,
}

/// `exclusive` is Windows' own report that a Direct3D app is running exclusive fullscreen
/// (`SHQueryUserNotificationState` == `QUNS_RUNNING_D3D_FULL_SCREEN`); it is only
/// meaningful while the game is the foreground window.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn classify(
    has_caption: bool,
    client: Rect,
    monitor: Rect,
    foreground: bool,
    exclusive: bool,
) -> DisplayMode {
    let covers = client.x <= monitor.x
        && client.y <= monitor.y
        && client.x + client.w >= monitor.x + monitor.w
        && client.y + client.h >= monitor.y + monitor.h;
    if has_caption || !covers {
        DisplayMode::Windowed
    } else if foreground && exclusive {
        DisplayMode::Fullscreen
    } else {
        DisplayMode::Borderless
    }
}

/// What the tracker should do this tick.
#[derive(Debug, Default, PartialEq)]
pub struct Decision {
    /// Move the overlay here (physical top-left).
    pub move_to: Option<(i32, i32)>,
    /// The user moved the overlay: remember this anchor.
    pub new_anchor: Option<Anchor>,
}

/// Follow state carried between ticks.
#[derive(Default)]
pub struct Follow {
    game: Option<Rect>,
    /// Where we last put the overlay, and for how many ticks to wait for it to get there.
    last_set: Option<(i32, i32)>,
    settling: u8,
}

impl Follow {
    /// Forget the game window (it closed); the next one is treated as new.
    pub fn reset(&mut self) {
        *self = Follow::default();
    }

    /// One tick. `overlay` is the overlay's current outer rect, `dragging` whether the
    /// user is holding the mouse button on it (never fight a drag).
    pub fn step(&mut self, game: Rect, overlay: Rect, anchor: Anchor, dragging: bool) -> Decision {
        let mut d = Decision::default();
        if game.w <= 0 || game.h <= 0 {
            return d;
        }
        let pos = (overlay.x, overlay.y);
        let target = |a: Anchor| place(a, overlay.w, overlay.h, game);
        let game_changed = self.game != Some(game);
        self.game = Some(game);

        if dragging {
            self.last_set = Some(pos);
            self.settling = 0;
            return d;
        }
        if self.settling > 0 && self.last_set != Some(pos) {
            // Our last move has not been applied yet.
            self.settling -= 1;
            if !game_changed {
                return d;
            }
        }
        self.settling = 0;

        if game_changed {
            d.move_to = Some(target(anchor));
        } else if self.last_set.is_some() && self.last_set != Some(pos) {
            // Moved by the user (or by the OS): that spot is the new anchor.
            let a = anchor_for(overlay, game);
            d.new_anchor = Some(a);
            if !contains(game, overlay) {
                d.move_to = Some(target(a));
            }
        } else if !contains(game, overlay) {
            // The overlay grew past the game window's edge.
            d.move_to = Some(target(anchor));
        }

        match d.move_to {
            Some(p) if p != pos => {
                self.last_set = Some(p);
                self.settling = 5;
            }
            _ => {
                d.move_to = None;
                self.last_set = Some(pos);
            }
        }
        d
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
    };
    const GAME: Rect = Rect {
        x: 320,
        y: 180,
        w: 1280,
        h: 720,
    };

    fn ov(x: i32, y: i32) -> Rect {
        Rect {
            x,
            y,
            w: 300,
            h: 400,
        }
    }

    #[test]
    fn classifies_display_modes() {
        assert_eq!(
            classify(true, GAME, MON, true, false),
            DisplayMode::Windowed
        );
        assert_eq!(
            classify(false, GAME, MON, true, false),
            DisplayMode::Windowed
        );
        // A maximised window with a title bar is still windowed.
        assert_eq!(classify(true, MON, MON, true, false), DisplayMode::Windowed);
        assert_eq!(
            classify(false, MON, MON, true, false),
            DisplayMode::Borderless
        );
        assert_eq!(
            classify(false, MON, MON, true, true),
            DisplayMode::Fullscreen
        );
        // The D3D report only counts while the game is in front.
        assert_eq!(
            classify(false, MON, MON, false, true),
            DisplayMode::Borderless
        );
    }

    #[test]
    fn a_new_game_window_pulls_the_overlay_inside() {
        let mut f = Follow::default();
        let d = f.step(GAME, ov(20, 60), Anchor::default(), false);
        assert_eq!(d.move_to, Some((340, 240)));
        assert_eq!(d.new_anchor, None);
    }

    #[test]
    fn follows_the_window_when_it_moves() {
        let mut f = Follow::default();
        let a = Anchor::default();
        f.step(GAME, ov(20, 60), a, false);
        assert_eq!(
            f.step(GAME, ov(340, 240), a, false),
            Decision::default(),
            "settled"
        );
        let moved = Rect {
            x: 100,
            y: 50,
            ..GAME
        };
        assert_eq!(
            f.step(moved, ov(340, 240), a, false).move_to,
            Some((120, 110))
        );
    }

    #[test]
    fn waits_for_its_own_move_instead_of_reading_it_as_a_drag() {
        let mut f = Follow::default();
        let a = Anchor::default();
        f.step(GAME, ov(20, 60), a, false);
        // The OS has not applied the move yet: no anchor change, no second move.
        assert_eq!(f.step(GAME, ov(20, 60), a, false), Decision::default());
    }

    #[test]
    fn a_drag_inside_the_game_becomes_the_new_anchor() {
        let mut f = Follow::default();
        let a = Anchor::default();
        f.step(GAME, ov(20, 60), a, false);
        f.step(GAME, ov(340, 240), a, false);
        // While the button is held nothing happens.
        assert_eq!(f.step(GAME, ov(1200, 300), a, true), Decision::default());
        let d = f.step(GAME, ov(1250, 300), a, false);
        assert_eq!(d.move_to, None);
        let na = d.new_anchor.expect("anchor");
        assert!(na.right);
        assert_eq!(na.dx, 320 + 1280 - 1250 - 300);
    }

    #[test]
    fn a_drag_outside_the_game_snaps_back_in() {
        let mut f = Follow::default();
        let a = Anchor::default();
        f.step(GAME, ov(20, 60), a, false);
        f.step(GAME, ov(340, 240), a, false);
        let d = f.step(GAME, ov(1500, 240), a, false); // right edge past the window
        assert_eq!(d.move_to, Some((1300, 240)));
        assert!(d.new_anchor.unwrap().right);
    }

    #[test]
    fn growing_past_the_edge_moves_back_in() {
        let mut f = Follow::default();
        let a = Anchor {
            right: false,
            bottom: false,
            dx: 20,
            dy: 300,
        };
        f.step(GAME, ov(0, 0), a, false);
        f.step(GAME, ov(340, 480), a, false);
        let taller = Rect {
            x: 340,
            y: 480,
            w: 300,
            h: 600,
        };
        assert_eq!(f.step(GAME, taller, a, false).move_to, Some((340, 300)));
    }
}
