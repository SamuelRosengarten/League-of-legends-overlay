//! Keeping the overlay fully on a screen (physical pixels, so mixed DPI setups work).

#[derive(Clone, Copy, Debug, PartialEq)]
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
}
