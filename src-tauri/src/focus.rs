//! Returning keyboard focus to the game after the user is done interacting with the overlay.
//!
//! Only `SetForegroundWindow` is used. Tauri's `set_focus()` is deliberately avoided: when
//! Windows refuses the focus change (the normal case while a game is in front) it falls back
//! to injecting a synthetic Alt key press with `SendInput`, which the game would receive.

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, IsWindow, SetForegroundWindow,
    };

    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    /// Remember the foreground window (normally the game), unless it is `own`.
    pub fn remember(own: isize) {
        // SAFETY: plain Win32 call with no arguments.
        let hwnd = unsafe { GetForegroundWindow() } as isize;
        if hwnd != own {
            PREVIOUS.store(hwnd, Ordering::SeqCst);
        }
    }

    /// Give focus back to the remembered window, or to `fallback` (the game) if there is none.
    pub fn restore(fallback: Option<isize>) {
        let prev = PREVIOUS.swap(0, Ordering::SeqCst);
        // SAFETY: IsWindow/SetForegroundWindow tolerate stale handles; they just fail.
        unsafe {
            let target = if prev != 0 && IsWindow(prev as _) != 0 {
                Some(prev)
            } else {
                fallback
            };
            if let Some(h) = target {
                SetForegroundWindow(h as _);
            }
        }
    }

    /// Ask for focus without any input tricks. Windows may refuse (e.g. while another
    /// app is in front); the overlay then gets focus when the user clicks it.
    pub fn request(hwnd: isize) {
        // SAFETY: our own window handle.
        unsafe { SetForegroundWindow(hwnd as _) };
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn remember(_own: isize) {}
    pub fn restore(_fallback: Option<isize>) {}
    pub fn request(_hwnd: isize) {}
}

pub use imp::{remember, request, restore};
