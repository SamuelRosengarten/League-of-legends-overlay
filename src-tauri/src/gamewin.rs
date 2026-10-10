//! Finding the League of Legends game window and keeping the overlay above it.
//!
//! Only ordinary, read-only window queries (FindWindowEx, GetClientRect, ...) and
//! SetWindowPos on our *own* window are used. Nothing touches the game process.

use crate::follow::DisplayMode;
use crate::geometry::Rect;

/// Window class and title of the in-game window (not the League client / launcher).
#[cfg_attr(not(windows), allow(dead_code))]
pub const GAME_CLASS: &str = "RiotWindowClass";
#[cfg_attr(not(windows), allow(dead_code))]
pub const GAME_TITLE: &str = "League of Legends (TM) Client";

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GameWindow {
    pub hwnd: isize,
    /// Client area in screen coordinates (physical pixels).
    pub client: Rect,
    pub minimized: bool,
    pub foreground: bool,
    pub mode: DisplayMode,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::follow::classify;
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, GetClientRect, GetForegroundWindow, GetWindow, GetWindowLongW, IsIconic,
        IsWindowVisible, SetWindowPos, GWL_STYLE, GW_HWNDNEXT, HWND_TOPMOST, SWP_ASYNCWINDOWPOS,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, WS_CAPTION,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn rect(r: RECT) -> Rect {
        Rect {
            x: r.left,
            y: r.top,
            w: r.right - r.left,
            h: r.bottom - r.top,
        }
    }

    /// The visible game window, if a game is running.
    pub fn find() -> Option<GameWindow> {
        let class = wide(GAME_CLASS);
        let title = wide(GAME_TITLE);
        // SAFETY: plain Win32 queries with valid, NUL-terminated strings and out-pointers
        // to locals. A window closing mid-way only makes the calls fail.
        unsafe {
            let null = std::ptr::null_mut();
            let mut hwnd = FindWindowExW(null, null, class.as_ptr(), title.as_ptr());
            if hwnd.is_null() {
                // Fall back to the class alone in case the title is localised or changes.
                hwnd = FindWindowExW(null, null, class.as_ptr(), std::ptr::null());
            }
            if hwnd.is_null() || IsWindowVisible(hwnd) == 0 {
                return None;
            }
            let minimized = IsIconic(hwnd) != 0;
            let mut cr: RECT = zeroed();
            if GetClientRect(hwnd, &mut cr) == 0 {
                return None;
            }
            let mut origin = POINT { x: 0, y: 0 };
            ClientToScreen(hwnd, &mut origin);
            let client = Rect {
                x: origin.x,
                y: origin.y,
                w: cr.right - cr.left,
                h: cr.bottom - cr.top,
            };
            let mut mi: MONITORINFO = zeroed();
            mi.cbSize = size_of::<MONITORINFO>() as u32;
            let monitor =
                if GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut mi) != 0
                {
                    rect(mi.rcMonitor)
                } else {
                    client
                };
            let has_caption = (GetWindowLongW(hwnd, GWL_STYLE) as u32 & WS_CAPTION) == WS_CAPTION;
            let foreground = GetForegroundWindow() == hwnd;
            let mut quns = 0;
            let exclusive = foreground
                && SHQueryUserNotificationState(&mut quns) >= 0
                && quns == QUNS_RUNNING_D3D_FULL_SCREEN;
            Some(GameWindow {
                hwnd: hwnd as isize,
                client,
                minimized,
                foreground,
                mode: classify(has_caption, client, monitor, foreground, exclusive),
            })
        }
    }

    /// True if `top` is above `below` in the z-order.
    pub fn is_above(top: isize, below: isize) -> bool {
        // SAFETY: walking the z-order with GetWindow; stale handles end the walk.
        unsafe {
            let mut h = GetWindow(top as HWND, GW_HWNDNEXT);
            for _ in 0..10_000 {
                if h.is_null() {
                    return false;
                }
                if h as isize == below {
                    return true;
                }
                h = GetWindow(h, GW_HWNDNEXT);
            }
            false
        }
    }

    /// Put our own window back at the top of the topmost band without activating it.
    /// Asynchronous, so a busy UI thread never blocks the caller.
    pub fn raise_topmost(hwnd: isize) {
        // SAFETY: SetWindowPos on our own window handle.
        unsafe {
            SetWindowPos(
                hwnd as HWND,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS,
            );
        }
    }

    pub fn foreground() -> isize {
        // SAFETY: no arguments.
        unsafe { GetForegroundWindow() as isize }
    }

    /// Whether a key is physically down right now (read-only; nothing is consumed).
    pub fn key_down(vk: u16) -> bool {
        // SAFETY: read-only query.
        unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn find() -> Option<GameWindow> {
        None
    }
    pub fn is_above(_top: isize, _below: isize) -> bool {
        true
    }
    pub fn raise_topmost(_hwnd: isize) {}
    pub fn foreground() -> isize {
        0
    }
    pub fn key_down(_vk: u16) -> bool {
        false
    }
}

pub use imp::{find, foreground, is_above, key_down, raise_topmost};

/// Modifier bits (see keys.rs) currently held.
pub fn held_mods() -> u8 {
    use crate::keys::{ALT, CTRL, SHIFT, SUPER};
    let mut m = 0;
    if key_down(0x11) {
        m |= CTRL; // VK_CONTROL
    }
    if key_down(0x12) {
        m |= ALT; // VK_MENU
    }
    if key_down(0x10) {
        m |= SHIFT; // VK_SHIFT
    }
    if key_down(0x5B) || key_down(0x5C) {
        m |= SUPER; // VK_LWIN / VK_RWIN
    }
    m
}

/// Left mouse button held (the user may be dragging the overlay).
pub fn mouse_down() -> bool {
    key_down(0x01)
}
