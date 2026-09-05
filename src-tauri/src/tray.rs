use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize,
};

/// Fallback panel size, matching `tauri.conf.json`, used only if the real size is unreadable.
const FALLBACK_PANEL: PhysicalSize<u32> = PhysicalSize {
    width: 380,
    height: 440,
};
const EDGE_MARGIN: i32 = 12;

/// Grace period between the pointer leaving the tray icon and the panel hiding, so the
/// pointer can travel from the icon into the panel without it vanishing on the way.
const HIDE_GRACE: Duration = Duration::from_millis(450);

/// Every scheduled hide captures this counter; bumping it cancels any hide still pending.
static HIDE_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn show_main(app: &AppHandle, route: Option<&str>) {
    cancel_scheduled_hide();
    if let Some(panel) = app.get_webview_window("tray-panel") {
        let _ = panel.hide();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(route) = route {
            let _ = app.emit_to("main", "usage://navigate", route);
        }
    }
}

/// Places the panel just above the tray icon, kept inside the monitor.
fn show_panel_near(app: &AppHandle, anchor: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window("tray-panel") else {
        return;
    };
    let panel = window.outer_size().unwrap_or(FALLBACK_PANEL);
    let (monitor_x, monitor_y, monitor_width, monitor_height) = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            (
                position.x,
                position.y,
                size.width as i32,
                size.height as i32,
            )
        })
        .unwrap_or((0, 0, 1920, 1080));

    let panel_width = panel.width as i32;
    let panel_height = panel.height as i32;

    // Centre on the icon horizontally, sit above it vertically.
    let mut x = anchor.x as i32 - panel_width / 2;
    let mut y = anchor.y as i32 - panel_height - EDGE_MARGIN;

    let max_x =
        (monitor_x + monitor_width - panel_width - EDGE_MARGIN).max(monitor_x + EDGE_MARGIN);
    x = x.clamp(monitor_x + EDGE_MARGIN, max_x);

    // A tray at the top of the screen leaves no room above; drop below the icon instead.
    if y < monitor_y + EDGE_MARGIN {
        y = anchor.y as i32 + EDGE_MARGIN;
    }
    let max_y =
        (monitor_y + monitor_height - panel_height - EDGE_MARGIN).max(monitor_y + EDGE_MARGIN);
    y = y.clamp(monitor_y + EDGE_MARGIN, max_y);

    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.show();
}

/// Cancels a pending hide. Called when the pointer re-enters the icon or enters the panel.
pub fn cancel_scheduled_hide() {
    HIDE_GENERATION.fetch_add(1, Ordering::SeqCst);
}

/// Hides the panel after the grace period unless something cancels it first.
pub fn schedule_hide(app: &AppHandle) {
    let generation = HIDE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(HIDE_GRACE);
        // Only the most recently scheduled hide may act.
        if HIDE_GENERATION.load(Ordering::SeqCst) == generation {
            if let Some(window) = app.get_webview_window("tray-panel") {
                let _ = window.hide();
            }
        }
    });
}

pub fn toggle_panel(app: &AppHandle) {
    cancel_scheduled_hide();
    if let Some(window) = app.get_webview_window("tray-panel") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn install(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &refresh, &settings, &exit])?;

    TrayIconBuilder::with_id("ai-usage-meter")
        .tooltip("AI Usage Meter")
        .icon(
            app.default_window_icon()
                .expect("bundle icon is required")
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app, None),
            "refresh" => {
                let _ = app.emit("usage://refresh-all", ());
            }
            "settings" => show_main(app, Some("settings")),
            "exit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // Hovering the icon reveals the condensed panel. `position` is the pointer in
            // physical pixels; `rect.position` is a Position enum and needs unwrapping, so
            // the pointer is the simpler anchor and sits on the icon anyway.
            TrayIconEvent::Enter { position, .. } => {
                cancel_scheduled_hide();
                show_panel_near(tray.app_handle(), position);
            }
            // The pointer may be travelling towards the panel, so hide on a delay.
            TrayIconEvent::Leave { .. } => schedule_hide(tray.app_handle()),
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => toggle_panel(tray.app_handle()),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
