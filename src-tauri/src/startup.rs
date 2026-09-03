use std::fs;

use serde::Deserialize;
use tauri::{App, Manager};
use tauri_plugin_autostart::MacosLauncher;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageLaunchSettings {
    start_minimized: bool,
}

#[derive(Deserialize)]
struct StoredSettings {
    usage: UsageLaunchSettings,
}

pub fn install(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        None,
    ))?;

    let should_start_minimized = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|directory| fs::read_to_string(directory.join("settings.json")).ok())
        .and_then(|content| serde_json::from_str::<StoredSettings>(&content).ok())
        .is_some_and(|settings| settings.usage.start_minimized);

    if should_start_minimized {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }
    Ok(())
}
