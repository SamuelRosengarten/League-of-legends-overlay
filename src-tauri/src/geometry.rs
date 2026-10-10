//! Keeping the overlay fully on a screen or inside the game window (physical pixels, so
//! mixed DPI setups work).

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

fn overlap(a: Rect, b: Rect) -> i64 {
    let w = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
    let h = (a.y + a.h).min(b.y + b.h) - a.y.max(b.y);
    if w > 0 && h > 0 {
        w as i64 * h as i64
    } else {
        0
    }
}

/// Where to move `win` (keeping its size) so it sits inside the work area it overlaps most.
/// If it overlaps none (monitor unplugged, resolution lowered), it goes to `fallback`.
/// A window bigger than the area is pinned to the area's top-left corner.
pub fn clamp_into(win: Rect, areas: &[Rect], fallback: Option<Rect>) -> Option<(i32, i32)> {
    let best = areas
        .iter()
        .copied()
        .map(|a| (overlap(win, a), a))
        .max_by_key(|(o, _)| *o);
    let area = match best {
        Some((o, a)) if o > 0 => a,
        _ => fallback.or(areas.first().copied())?,
    };
    let x = win.x.min(area.x + area.w - win.w).max(area.x);
    let y = win.y.min(area.y + area.h - win.h).max(area.y);
    Some((x, y))
}

pub fn contains(outer: Rect, inner: Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.w <= outer.x + outer.w
        && inner.y + inner.h <= outer.y + outer.h
}

/// Where the overlay sits inside the game window: a gap from the nearest horizontal and
/// vertical edge. Anchoring to the nearest edges keeps an overlay placed in the top-right
/// corner in that corner when the game window is resized or changes resolution.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Anchor {
    pub right: bool,
    pub bottom: bool,
    pub dx: i32,
    pub dy: i32,
}

impl Default for Anchor {
    /// Top-left, clear of the game's own top-left HUD elements.
    fn default() -> Self {
        Anchor {
            right: false,
            bottom: false,
            dx: 20,
            dy: 60,
        }
    }
}

/// The anchor that reproduces `win`'s current place inside `area`.
pub fn anchor_for(win: Rect, area: Rect) -> Anchor {
    let left = win.x - area.x;
    let right_gap = area.x + area.w - (win.x + win.w);
    let top = win.y - area.y;
    let bottom_gap = area.y + area.h - (win.y + win.h);
    let right = right_gap < left;
    let bottom = bottom_gap < top;
    Anchor {
        right,
        bottom,
        dx: (if right { right_gap } else { left }).max(0),
        dy: (if bottom { bottom_gap } else { top }).max(0),
    }
}

/// Top-left position for a `w` x `h` window anchored in `area`, always fully inside it
/// (pinned to the top-left corner if it is bigger than the area).
pub fn place(a: Anchor, w: i32, h: i32, area: Rect) -> (i32, i32) {
    let x = if a.right {
        area.x + area.w - w - a.dx
    } else {
        area.x + a.dx
    };
    let y = if a.bottom {
        area.y + area.h - h - a.dy
    } else {
        area.y + a.dy
    };
    (
        x.min(area.x + area.w - w).max(area.x),
        y.min(area.y + area.h - h).max(area.y),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1040,
    };
    const RIGHT: Rect = Rect {
        x: 1920,
        y: 0,
        w: 2560,
        h: 1400,
    };

    fn win(x: i32, y: i32) -> Rect {
        Rect {
            x,
            y,
            w: 400,
            h: 600,
        }
    }

    #[test]
    fn inside_stays_put() {
        assert_eq!(clamp_into(win(20, 60), &[MAIN], None), Some((20, 60)));
    }

    #[test]
    fn growing_past_the_bottom_moves_up() {
        assert_eq!(clamp_into(win(20, 900), &[MAIN], None), Some((20, 440)));
    }

    #[test]
    fn partly_off_the_right_edge_moves_in() {
        assert_eq!(clamp_into(win(1800, 60), &[MAIN], None), Some((1520, 60)));
    }

    #[test]
    fn picks_the_monitor_it_overlaps_most() {
        assert_eq!(
            clamp_into(win(1800, 60), &[MAIN, RIGHT], None),
            Some((1920, 60))
        );
        assert_eq!(
            clamp_into(win(1600, 60), &[MAIN, RIGHT], None),
            Some((1520, 60))
        );
    }

    #[test]
    fn lost_monitor_falls_back_to_primary() {
        assert_eq!(
            clamp_into(win(3000, 60), &[MAIN], Some(MAIN)),
            Some((1520, 60))
        );
        assert_eq!(
            clamp_into(win(-5000, -5000), &[RIGHT, MAIN], Some(MAIN)),
            Some((0, 0))
        );
    }

    #[test]
    fn too_big_is_pinned_top_left() {
        let big = Rect {
            x: 100,
            y: 100,
            w: 3000,
            h: 3000,
        };
        assert_eq!(clamp_into(big, &[MAIN], None), Some((0, 0)));
    }

    #[test]
    fn no_monitors_means_no_move() {
        assert_eq!(clamp_into(win(0, 0), &[], None), None);
    }

    const GAME: Rect = Rect {
        x: 300,
        y: 200,
        w: 1280,
        h: 720,
    };

    #[test]
    fn anchor_round_trips_in_every_corner() {
        for (x, y) in [(320, 260), (1150, 260), (320, 280), (1150, 300)] {
            let w = win(x, y);
            let a = anchor_for(w, GAME);
            assert_eq!(place(a, w.w, w.h, GAME), (x, y), "{a:?}");
        }
        assert!(!anchor_for(win(320, 260), GAME).right);
        assert!(anchor_for(win(1150, 260), GAME).right);
    }

    #[test]
    fn right_anchor_follows_a_wider_game_window() {
        let a = anchor_for(win(1150, 260), GAME); // 30px from the right edge
        let wider = Rect {
            w: 1920,
            h: 1080,
            ..GAME
        };
        assert_eq!(place(a, 400, 600, wider), (300 + 1920 - 400 - 30, 260));
    }

    #[test]
    fn place_keeps_the_overlay_inside_a_small_window() {
        let tiny = Rect {
            x: 0,
            y: 0,
            w: 640,
            h: 480,
        };
        let far = Anchor {
            right: false,
            bottom: false,
            dx: 900,
            dy: 900,
        };
        assert_eq!(place(far, 400, 300, tiny), (240, 180));
        assert_eq!(place(far, 800, 600, tiny), (0, 0));
    }

    #[test]
    fn outside_positions_give_zero_gaps() {
        let a = anchor_for(win(100, 100), GAME); // above and left of the game window
        assert_eq!((a.dx, a.dy), (0, 0));
        assert!(contains(
            GAME,
            Rect {
                x: 300,
                y: 200,
                w: 400,
                h: 600
            }
        ));
        assert!(!contains(GAME, win(100, 100)));
    }
}
