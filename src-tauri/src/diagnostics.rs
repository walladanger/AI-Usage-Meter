use std::{fs::{self, OpenOptions}, io::Write, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

use serde::Deserialize;
use tauri::{App, AppHandle, Manager};

#[derive(Debug, Deserialize)]
pub struct FrontendDiagnostic {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

pub struct NativeDiagnostics {
    path: PathBuf,
}

impl NativeDiagnostics {
    pub fn install(app: &mut App) {
        let path = app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("ai-usage-meter"))
            .join("logs")
            .join("startup-diagnostics.log");
        let diagnostics = Self { path };
        diagnostics.record("INFO", "native", "Native bootstrap started.");
        app.manage(diagnostics);
    }

    pub fn record(&self, level: &str, component: &str, message: &str) {
        if let Some(directory) = self.path.parent() {
            let _ = fs::create_dir_all(directory);
        }
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&self.path) {
            let _ = writeln!(file, "{timestamp} [{level}] [{component}] {message}");
        }
    }
}

pub fn record_native(app: &AppHandle, level: &str, message: &str) {
    if let Some(diagnostics) = app.try_state::<NativeDiagnostics>() {
        diagnostics.record(level, "native", message);
    }
}

pub fn record_frontend(app: &AppHandle, entry: FrontendDiagnostic) {
    if let Some(diagnostics) = app.try_state::<NativeDiagnostics>() {
        diagnostics.record(&entry.level, "frontend", &format!("{} | {}", entry.timestamp, entry.message));
    }
}
