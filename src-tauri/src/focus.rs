//! Returning keyboard focus to the game after the user is done interacting with the overlay.

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    pub fn remember() {
        // SAFETY: plain Win32 call with no arguments.
        let hwnd = unsafe { GetForegroundWindow() };
        PREVIOUS.store(hwnd as isize, Ordering::SeqCst);
    }

    pub fn restore() {
        let hwnd = PREVIOUS.swap(0, Ordering::SeqCst);
        if hwnd != 0 {
            // SAFETY: a stale handle is harmless; the call just fails.
            unsafe { SetForegroundWindow(hwnd as _) };
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn remember() {}
    pub fn restore() {}
}

pub use imp::{remember, restore};
