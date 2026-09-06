use std::{fs, io::ErrorKind, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

mod codex;
mod credentials;
mod diagnostics;
mod loopback;
mod providers;
mod startup;
mod tray;

#[derive(Debug, Serialize)]
struct NativeCommandError {
    code: &'static str,
    message: String,
}

impl NativeCommandError {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "invalid-request",
            message: message.into(),
        }
    }

    fn native(message: impl Into<String>) -> Self {
        Self {
            code: "native-window-error",
            message: message.into(),
        }
    }

    fn persistence(message: impl Into<String>) -> Self {
        Self {
            code: "persistence-failed",
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: "window-not-found",
            message: message.into(),
        }
    }

    fn diagnostics(message: impl Into<String>) -> Self {
        Self {
            code: "diagnostics-failed",
            message: message.into(),
        }
    }

    fn loopback(message: impl Into<String>) -> Self {
        Self {
            code: "loopback-unavailable",
            message: message.into(),
        }
    }

    fn credential(error: credentials::CredentialError) -> Self {
        Self {
            code: error.code(),
            message: error.message(),
        }
    }
}

type CommandResult<T> = Result<T, NativeCommandError>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalWindowRequest {
    feature_id: String,
    label: String,
    title: String,
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalWindowOperationResult {
    created: bool,
}

#[tauri::command]
fn get_loopback_session(app: AppHandle) -> CommandResult<loopback::LoopbackSession> {
    diagnostics::record_native(&app, "INFO", "Loopback session requested.");
    loopback::get_session()
        .cloned()
        .ok_or_else(|| NativeCommandError::loopback("Loopback service is not running."))
}

#[tauri::command]
fn write_frontend_diagnostic(app: AppHandle, entry: diagnostics::FrontendDiagnostic) {
    diagnostics::record_frontend(&app, entry);
}

#[tauri::command]
async fn list_diagnostic_logs(app: AppHandle) -> CommandResult<diagnostics::DiagnosticLogList> {
    tauri::async_runtime::spawn_blocking(move || diagnostics::list_logs(&app))
        .await
        .map_err(|_| NativeCommandError::diagnostics("The diagnostic log list did not complete."))?
        .map_err(NativeCommandError::diagnostics)
}

#[tauri::command]
async fn read_diagnostic_log(
    app: AppHandle,
    filename: String,
) -> CommandResult<diagnostics::DiagnosticLogContent> {
    tauri::async_runtime::spawn_blocking(move || diagnostics::read_log(&app, &filename))
        .await
        .map_err(|_| NativeCommandError::diagnostics("The diagnostic log read did not complete."))?
        .map_err(NativeCommandError::diagnostics)
}

fn is_safe_feature_id(feature_id: &str) -> bool {
    !feature_id.is_empty()
        && feature_id.len() <= 80
        && feature_id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn is_safe_external_label(label: &str) -> bool {
    label
        .strip_prefix("ai-usage-meter-feature-")
        .is_some_and(is_safe_feature_id)
}

fn validate_external_request(request: &ExternalWindowRequest) -> CommandResult<()> {
    if !is_safe_feature_id(&request.feature_id)
        || request.label != format!("ai-usage-meter-feature-{}", request.feature_id)
    {
        return Err(NativeCommandError::invalid(
            "The external feature label is invalid.",
        ));
    }
    let dimensions = [
        request.width,
        request.height,
        request.min_width,
        request.min_height,
    ];
    if dimensions
        .iter()
        .any(|dimension| !dimension.is_finite() || *dimension <= 0.0)
    {
        return Err(NativeCommandError::invalid(
            "Window dimensions must be finite positive numbers.",
        ));
    }
    Ok(())
}

fn external_feature_url(feature_id: &str) -> PathBuf {
    // Include the feature ID as a query param so window.location.search
    // provides the same routing signal as the tray-panel config window.
    // The initialization script also sets window.__AI_USAGE_METER_EXTERNAL_FEATURE__
    // as belt-and-suspenders; selectExternalFeature uses whichever fires first.
    format!("index.html?window=external&feature={feature_id}").into()
}

fn external_feature_init_script(feature_id: &str) -> String {
    let encoded = serde_json::to_string(feature_id).expect("validated feature id serializes");
    format!("Object.defineProperty(window, '__AI_USAGE_METER_EXTERNAL_FEATURE__', {{ value: {encoded}, writable: false, configurable: false }});")
}

#[tauri::command]
fn open_external_feature_window(
    app: AppHandle,
    request: ExternalWindowRequest,
) -> CommandResult<ExternalWindowOperationResult> {
    validate_external_request(&request)?;
    if let Some(window) = app.get_webview_window(&request.label) {
        window
            .show()
            .map_err(|error| NativeCommandError::native(error.to_string()))?;
        window
            .set_focus()
            .map_err(|error| NativeCommandError::native(error.to_string()))?;
        return Ok(ExternalWindowOperationResult { created: false });
    }

    diagnostics::record_native(
        &app,
        "INFO",
        &format!("External window requested; feature={}", request.feature_id),
    );
    let url = external_feature_url(&request.feature_id);
    let initialization_script = external_feature_init_script(&request.feature_id);
    let closed_app = app.clone();
    let closed_label = request.label.clone();
    let window = WebviewWindowBuilder::new(&app, &request.label, WebviewUrl::App(url))
        .initialization_script(initialization_script)
        .title(&request.title)
        .decorations(false)
        .transparent(false)
        .resizable(true)
        .inner_size(request.width, request.height)
        .min_inner_size(request.min_width, request.min_height)
        .build()
        .map_err(|error| {
            diagnostics::record_native(
                &app,
                "ERROR",
                &format!(
                    "External window build failed; feature={}; error={error}",
                    request.feature_id
                ),
            );
            NativeCommandError::native(error.to_string())
        })?;
    diagnostics::record_native(
        &app,
        "INFO",
        &format!("External window created; feature={}", request.feature_id),
    );
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = closed_app.emit(
                "ai-usage-meter://external-window-closed",
                closed_label.clone(),
            );
        }
    });

    Ok(ExternalWindowOperationResult { created: true })
}

#[tauri::command]
fn focus_external_feature_window(app: AppHandle, label: String) -> CommandResult<()> {
    if !is_safe_external_label(&label) {
        return Err(NativeCommandError::invalid(
            "The requested external window label is invalid.",
        ));
    }
    let window = app.get_webview_window(&label).ok_or_else(|| {
        NativeCommandError::not_found("The requested external window does not exist.")
    })?;
    window
        .show()
        .map_err(|error| NativeCommandError::native(error.to_string()))?;
    window
        .set_focus()
        .map_err(|error| NativeCommandError::native(error.to_string()))
}

#[tauri::command]
fn close_external_feature_window(app: AppHandle, label: String) -> CommandResult<()> {
    if !is_safe_external_label(&label) {
        return Err(NativeCommandError::invalid(
            "The requested external window label is invalid.",
        ));
    }
    let window = app.get_webview_window(&label).ok_or_else(|| {
        NativeCommandError::not_found("The requested external window does not exist.")
    })?;
    window
        .close()
        .map_err(|error| NativeCommandError::native(error.to_string()))
}

/// Reads ChatGPT/Codex subscription allowance from the local Codex CLI app-server.
/// Unlike the API connectors this reports allowance, not spend.
#[tauri::command]
async fn fetch_codex_usage(app: AppHandle) -> Result<codex::CodexUsageSnapshot, codex::CodexError> {
    diagnostics::record_native(&app, "INFO", "Codex allowance refresh started.");
    let result = tauri::async_runtime::spawn_blocking(codex::fetch)
        .await
        .unwrap_or_else(|_| {
            Err(codex::CodexError {
                state: "error",
                message: "The Codex refresh did not complete.".to_string(),
            })
        });
    // Outcome state only. Constraint 3 forbids logging allowance values or reset times.
    diagnostics::record_native(
        &app,
        if result.is_ok() { "INFO" } else { "WARN" },
        &match &result {
            Ok(_) => "Codex allowance refresh completed.".to_string(),
            Err(error) => format!("Codex allowance refresh failed; state={}", error.state),
        },
    );
    result
}

/// Whether the Codex CLI is present, so the UI can offer the source without probing it.
#[tauri::command]
async fn codex_cli_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| codex::locate_codex().is_some())
        .await
        .unwrap_or(false)
}

fn parse_provider(provider_id: &str) -> CommandResult<credentials::ProviderId> {
    credentials::ProviderId::parse(provider_id)
        .ok_or_else(|| NativeCommandError::invalid("The requested provider is not supported."))
}

/// Stores an API key in the Windows Credential Manager.
/// The `secret` argument is never logged and never returned.
#[tauri::command]
async fn store_provider_credential(
    app: AppHandle,
    provider_id: String,
    secret: String,
) -> CommandResult<credentials::CredentialStatus> {
    let provider = parse_provider(&provider_id)?;
    let status =
        tauri::async_runtime::spawn_blocking(move || credentials::store(provider, &secret))
            .await
            .map_err(|_| {
                NativeCommandError::persistence("The credential operation did not complete.")
            })?
            .map_err(NativeCommandError::credential)?;
    // Logs the provider only. Never the key, never the masked hint.
    diagnostics::record_native(
        &app,
        "INFO",
        &format!("Provider credential stored; provider={provider_id}"),
    );
    Ok(status)
}

#[tauri::command]
async fn delete_provider_credential(
    app: AppHandle,
    provider_id: String,
) -> CommandResult<credentials::CredentialStatus> {
    let provider = parse_provider(&provider_id)?;
    let status = tauri::async_runtime::spawn_blocking(move || credentials::delete(provider))
        .await
        .map_err(|_| NativeCommandError::persistence("The credential operation did not complete."))?
        .map_err(NativeCommandError::credential)?;
    diagnostics::record_native(
        &app,
        "INFO",
        &format!("Provider credential removed; provider={provider_id}"),
    );
    Ok(status)
}

#[tauri::command]
async fn provider_credential_status(
    provider_id: String,
) -> CommandResult<credentials::CredentialStatus> {
    let provider = parse_provider(&provider_id)?;
    tauri::async_runtime::spawn_blocking(move || credentials::status(provider))
        .await
        .map_err(|_| NativeCommandError::persistence("The credential operation did not complete."))?
        .map_err(NativeCommandError::credential)
}

/// Calls the provider's usage and cost endpoints and returns aggregate numbers only.
#[tauri::command]
async fn fetch_provider_usage(
    app: AppHandle,
    provider_id: String,
) -> Result<providers::ProviderUsageSnapshot, providers::ProviderFetchError> {
    let provider = credentials::ProviderId::parse(&provider_id).ok_or_else(|| {
        providers::ProviderFetchError {
            state: "error",
            message: "The requested provider is not supported.".to_string(),
            detail: None,
        }
    })?;
    diagnostics::record_native(
        &app,
        "INFO",
        &format!("Provider usage refresh started; provider={provider_id}"),
    );
    let result = providers::fetch(provider).await;
    // Records the outcome state only. No response body, no totals, no key material.
    diagnostics::record_native(
        &app,
        if result.is_ok() { "INFO" } else { "WARN" },
        &match &result {
            Ok(_) => format!("Provider usage refresh completed; provider={provider_id}"),
            Err(error) => format!(
                "Provider usage refresh failed; provider={provider_id}; state={}",
                error.state
            ),
        },
    );
    result
}

fn app_settings_path(app: &AppHandle) -> CommandResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("settings.json"))
        .map_err(|error| NativeCommandError::persistence(error.to_string()))
}

#[tauri::command]
async fn load_settings(app: AppHandle) -> CommandResult<Option<String>> {
    let path = app_settings_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    })
    .await
    .map_err(|_| NativeCommandError::persistence("The settings operation did not complete."))?
    .map_err(|error| NativeCommandError::persistence(error.to_string()))
}

#[tauri::command]
async fn save_settings(app: AppHandle, content: String) -> CommandResult<()> {
    let path = app_settings_path(&app)?;
    diagnostics::record_native(&app, "INFO", "Settings save started.");
    let result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(directory) = path.parent() {
            fs::create_dir_all(directory)?;
        }
        fs::write(path, content)
    })
    .await
    .map_err(|_| NativeCommandError::persistence("The settings operation did not complete."))?
    .map_err(|error| NativeCommandError::persistence(error.to_string()));
    diagnostics::record_native(
        &app,
        if result.is_ok() { "INFO" } else { "ERROR" },
        if result.is_ok() {
            "Settings save completed."
        } else {
            "Settings save failed."
        },
    );
    result
}

#[tauri::command]
async fn clear_settings(app: AppHandle) -> CommandResult<()> {
    let path = app_settings_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    })
    .await
    .map_err(|_| NativeCommandError::persistence("The settings operation did not complete."))?
    .map_err(|error| NativeCommandError::persistence(error.to_string()))
}

#[tauri::command]
fn show_main_window(app: AppHandle, route: Option<String>) -> CommandResult<()> {
    if route.as_deref().is_some_and(|route| {
        !matches!(
            route,
            "overview" | "refresh" | "alerts" | "history" | "sources" | "settings" | "help"
        )
    }) {
        return Err(NativeCommandError::invalid(
            "The requested application route is invalid.",
        ));
    }
    tray::show_main(&app, route.as_deref());
    diagnostics::record_native(&app, "INFO", "Main window requested from native command.");
    Ok(())
}

/// Cancels a pending hide so the panel survives the pointer travelling from the tray icon
/// into the panel itself.
#[tauri::command]
fn keep_tray_panel_open() {
    tray::cancel_scheduled_hide();
}

#[tauri::command]
fn hide_tray_panel(app: AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window("tray-panel") {
        window
            .hide()
            .map_err(|error| NativeCommandError::native(error.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
fn request_usage_refresh(app: AppHandle) -> CommandResult<()> {
    app.emit("usage://refresh-all", ())
        .map_err(|error| NativeCommandError::native(error.to_string()))
}

#[tauri::command]
fn exit_application(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_initial_usage_schema",
        sql: include_str!("../migrations/0001_usage.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:usage.db", migrations)
                .build(),
        )
        .setup(|app| {
            diagnostics::NativeDiagnostics::install(app);
            diagnostics::record_native(
                &app.handle(),
                "INFO",
                "Native setup started before webview display.",
            );
            startup::install(app)?;
            diagnostics::record_native(&app.handle(), "INFO", "Startup integration installed.");
            tray::install(app)?;
            diagnostics::record_native(
                &app.handle(),
                "INFO",
                "System tray installed; native setup complete.",
            );
            match loopback::install(&app.handle()) {
                Ok(()) => diagnostics::record_native(
                    &app.handle(),
                    "INFO",
                    "Loopback ingestion service started.",
                ),
                Err(e) => diagnostics::record_native(
                    &app.handle(),
                    "WARN",
                    &format!("Loopback ingestion service failed to start: {e}"),
                ),
            };
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    diagnostics::record_native(
                        &window.app_handle(),
                        "INFO",
                        "Main window close intercepted; hiding to tray.",
                    );
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_loopback_session,
            open_external_feature_window,
            focus_external_feature_window,
            close_external_feature_window,
            load_settings,
            save_settings,
            clear_settings,
            write_frontend_diagnostic,
            list_diagnostic_logs,
            read_diagnostic_log,
            show_main_window,
            hide_tray_panel,
            keep_tray_panel_open,
            request_usage_refresh,
            exit_application,
            store_provider_credential,
            delete_provider_credential,
            provider_credential_status,
            fetch_provider_usage,
            fetch_codex_usage,
            codex_cli_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Usage Meter");
}

#[cfg(test)]
mod tests {
    use super::{external_feature_init_script, external_feature_url};

    #[test]
    fn external_feature_windows_use_the_packaged_app_entry_document() {
        let url = external_feature_url("usage-trend");
        let url_str = url.to_string_lossy();
        assert!(
            url_str.starts_with("index.html"),
            "must load bundled index.html; got {url_str}"
        );
        assert!(
            url_str.contains("window=external"),
            "must include routing query param; got {url_str}"
        );
        assert!(
            url_str.contains("feature=usage-trend"),
            "must include feature ID; got {url_str}"
        );
        let script = external_feature_init_script("usage-trend");
        assert!(script.contains("usage-trend"));
        assert!(script.contains("writable: false"));
    }
}
