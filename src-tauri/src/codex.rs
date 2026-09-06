//! Codex CLI connector — ChatGPT/Codex subscription allowance.
//!
//! This is the only source in the project that can legitimately report *allowance* rather
//! than spend. No provider offers a REST API for it; the Codex CLI ships a local
//! `app-server` whose JSON-RPC interface returns `usedPercent`, `windowDurationMins` and
//! `resetsAt`. Verified against a real account on codex-cli 0.148.0-alpha.9 (2026-09-05).
//!
//! Security: a local child process using the user's existing Codex login. No scraping, no
//! auth bypass, no stored password, nothing sent anywhere. Per constraint 3, allowance
//! values and reset timestamps are never written to the diagnostic log — callers log the
//! outcome state only.
//!
//! Two behaviours are load-bearing and were found by testing, not from the docs:
//!   1. The reply is asynchronous. Closing stdin after writing makes the process exit
//!      before replying, which is indistinguishable from "the method does not exist".
//!      stdin is therefore held open until the response arrives.
//!   2. `initialize` must be sent first, or the later call is ignored.
//!
//! The surface is alpha and experimental, so every field is treated as optional except
//! `usedPercent`, which the protocol schema marks required.

use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use serde_json::Value;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

/// Generous: the CLI may need to refresh an auth token on first call.
const CALL_TIMEOUT: Duration = Duration::from_secs(25);
const RATE_LIMITS_ID: i64 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexWindow {
    pub used_percent: f64,
    pub remaining_percent: f64,
    /// Absent when the CLI reports it as null.
    pub window_minutes: Option<u64>,
    /// RFC3339, converted from the unix seconds the CLI returns.
    pub resets_at: Option<String>,
    /// Human label derived from the window length, e.g. "5-hour window".
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUsageSnapshot {
    pub provider_id: String,
    pub observed_at: String,
    pub plan_type: Option<String>,
    pub primary: Option<CodexWindow>,
    pub secondary: Option<CodexWindow>,
    /// The window closest to exhaustion — the one that will actually block the user.
    pub binding_remaining_percent: Option<f64>,
    pub binding_label: Option<String>,
    pub binding_resets_at: Option<String>,
    pub credit_balance: Option<String>,
    pub has_credits: bool,
    pub unlimited: bool,
    pub rate_limit_reached: bool,
    /// Earned rate-limit resets the account can spend. Surfacing this is useful: the user
    /// may be blocked while holding an unused reset.
    pub reset_credits_available: u64,
    pub cli_version: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexError {
    /// A `ConnectorState` the frontend already models.
    pub state: &'static str,
    pub message: String,
}

impl CodexError {
    fn new(state: &'static str, message: impl Into<String>) -> Self {
        Self {
            state,
            message: message.into(),
        }
    }

    fn unavailable(message: impl Into<String>) -> Self {
        Self::new("no_data", message)
    }
}

/// Finds the Codex binary. It is **not** reliably on PATH — on the machine where this was
/// verified it lived under `~/.codex/.sandbox-bin/`, so PATH alone would have failed.
pub fn locate_codex() -> Option<PathBuf> {
    if let Some(path) = which_on_path() {
        return Some(path);
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let home = PathBuf::from(home);
    let candidates = [
        home.join(".codex/.sandbox-bin/codex.exe"),
        home.join(".codex/bin/codex.exe"),
        home.join(".codex/.sandbox-bin/codex"),
        home.join(".codex/bin/codex"),
    ];
    let mut all: Vec<PathBuf> = candidates.to_vec();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        all.push(PathBuf::from(&appdata).join("npm/codex.cmd"));
        all.push(PathBuf::from(&appdata).join("npm/codex"));
    }
    all.into_iter().find(|path| path.is_file())
}

fn which_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) {
        &["codex.exe", "codex.cmd"]
    } else {
        &["codex"]
    };
    std::env::split_paths(&path).find_map(|directory| {
        names
            .iter()
            .map(|name| directory.join(name))
            .find(|candidate| candidate.is_file())
    })
}

/// Reads the CLI version. Best-effort: a connector that works must still record which
/// version produced the data, because this protocol is alpha and will drift.
fn cli_version(binary: &PathBuf) -> Option<String> {
    let output = new_command(binary).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn new_command(binary: &PathBuf) -> Command {
    let mut command = Command::new(binary);
    // Without this a console window flashes on every refresh in a GUI app.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn initialize_message() -> String {
    // `jsonrpc` is deliberately omitted: this protocol omits it on the wire.
    serde_json::json!({
        "method": "initialize",
        "id": 0,
        "params": {
            "clientInfo": {
                "name": "ai_usage_meter",
                "title": "AI Usage Meter",
                "version": env!("CARGO_PKG_VERSION")
            }
        }
    })
    .to_string()
}

fn rate_limits_message() -> String {
    serde_json::json!({ "method": "account/rateLimits/read", "id": RATE_LIMITS_ID }).to_string()
}

/// Runs the handshake and one `account/rateLimits/read`, returning the raw `result`.
fn read_rate_limits(binary: &PathBuf) -> Result<Value, CodexError> {
    let mut child = new_command(binary)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| CodexError::unavailable("The Codex CLI could not be started."))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| CodexError::new("error", "The Codex CLI did not accept input."))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CodexError::new("error", "The Codex CLI produced no output stream."))?;

    let (sender, receiver) = mpsc::channel::<String>();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(text) => {
                    if sender.send(text).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let write = (|| -> std::io::Result<()> {
        writeln!(stdin, "{}", initialize_message())?;
        stdin.flush()?;
        writeln!(stdin, "{}", rate_limits_message())?;
        stdin.flush()
    })();
    if write.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err(CodexError::new(
            "error",
            "The Codex CLI closed before the request was sent.",
        ));
    }

    // stdin stays open here on purpose. Dropping it now makes the process exit before the
    // asynchronous reply arrives, which looks exactly like an unsupported method.
    let deadline = Instant::now() + CALL_TIMEOUT;
    let mut outcome: Option<Result<Value, CodexError>> = None;

    while outcome.is_none() {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        match receiver.recv_timeout(remaining) {
            Ok(line) => {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if message.get("id").and_then(Value::as_i64) != Some(RATE_LIMITS_ID) {
                    continue;
                }
                if let Some(error) = message.get("error") {
                    let text = error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("The Codex CLI rejected the request.");
                    // Signed-out accounts surface here; treat as needing attention, not a crash.
                    outcome = Some(Err(CodexError::new(
                        "authentication_required",
                        format!("Codex reported: {text}"),
                    )));
                } else if let Some(result) = message.get("result") {
                    outcome = Some(Ok(result.clone()));
                }
            }
            Err(_) => break,
        }
    }

    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();

    outcome.unwrap_or_else(|| {
        Err(CodexError::new(
            "timed_out",
            "The Codex CLI did not return usage limits in time.",
        ))
    })
}

fn unix_to_rfc3339(seconds: i64) -> Option<String> {
    OffsetDateTime::from_unix_timestamp(seconds)
        .ok()
        .and_then(|moment| moment.format(&Rfc3339).ok())
}

/// "5-hour window", "weekly window", "45-minute window".
fn window_label(minutes: u64) -> String {
    match minutes {
        0 => "window".to_string(),
        m if m % 10_080 == 0 => {
            let weeks = m / 10_080;
            if weeks == 1 {
                "weekly window".to_string()
            } else {
                format!("{weeks}-week window")
            }
        }
        m if m % 1_440 == 0 => {
            let days = m / 1_440;
            if days == 1 {
                "daily window".to_string()
            } else {
                format!("{days}-day window")
            }
        }
        m if m % 60 == 0 => format!("{}-hour window", m / 60),
        m => format!("{m}-minute window"),
    }
}

fn parse_window(value: Option<&Value>) -> Option<CodexWindow> {
    let window = value?;
    if window.is_null() {
        return None;
    }
    // `usedPercent` is the only field the protocol schema marks required.
    let used = window.get("usedPercent").and_then(Value::as_f64)?;
    let used = used.clamp(0.0, 100.0);
    let minutes = window.get("windowDurationMins").and_then(Value::as_u64);
    Some(CodexWindow {
        used_percent: used,
        remaining_percent: 100.0 - used,
        window_minutes: minutes,
        resets_at: window
            .get("resetsAt")
            .and_then(Value::as_i64)
            .and_then(unix_to_rfc3339),
        label: minutes.map(window_label),
    })
}

pub fn snapshot_from_result(result: &Value, cli_version: Option<String>) -> CodexUsageSnapshot {
    let limits = result.get("rateLimits").unwrap_or(&Value::Null);
    let primary = parse_window(limits.get("primary"));
    let secondary = parse_window(limits.get("secondary"));

    // The binding window is whichever has least remaining: that is what actually stops work.
    let binding = [primary.as_ref(), secondary.as_ref()]
        .into_iter()
        .flatten()
        .min_by(|a, b| {
            a.remaining_percent
                .partial_cmp(&b.remaining_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

    let credits = limits.get("credits");
    CodexUsageSnapshot {
        provider_id: "openai".to_string(),
        observed_at: OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_default(),
        plan_type: limits
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_string),
        binding_remaining_percent: binding.map(|window| window.remaining_percent),
        binding_label: binding.and_then(|window| window.label.clone()),
        binding_resets_at: binding.and_then(|window| window.resets_at.clone()),
        credit_balance: credits
            .and_then(|c| c.get("balance"))
            .and_then(Value::as_str)
            .map(str::to_string),
        has_credits: credits
            .and_then(|c| c.get("hasCredits"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        unlimited: credits
            .and_then(|c| c.get("unlimited"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        rate_limit_reached: limits
            .get("rateLimitReachedType")
            .map(|value| !value.is_null())
            .unwrap_or(false),
        reset_credits_available: result
            .get("rateLimitResetCredits")
            .and_then(|c| c.get("availableCount"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        primary,
        secondary,
        cli_version,
        source: "codex_cli".to_string(),
    }
}

pub fn fetch() -> Result<CodexUsageSnapshot, CodexError> {
    let binary = locate_codex().ok_or_else(|| {
        CodexError::unavailable(
            "The Codex CLI was not found. Install it, or use manual entry for this provider.",
        )
    })?;
    let result = read_rate_limits(&binary)?;
    Ok(snapshot_from_result(&result, cli_version(&binary)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Shaped exactly like the payload observed on codex-cli 0.148.0-alpha.9.
    fn live_shape() -> Value {
        json!({
            "rateLimits": {
                "limitId": "codex",
                "limitName": null,
                "primary": { "usedPercent": 100, "windowDurationMins": 300, "resetsAt": 1788647930 },
                "secondary": { "usedPercent": 34, "windowDurationMins": 10080, "resetsAt": 1789155964 },
                "credits": { "hasCredits": false, "unlimited": false, "balance": "0" },
                "individualLimit": null,
                "spendControlReached": false,
                "planType": "plus",
                "rateLimitReachedType": "rate_limit_reached"
            },
            "rateLimitResetCredits": { "availableCount": 1, "credits": [] }
        })
    }

    #[test]
    fn parses_the_shape_returned_by_a_real_account() {
        let snapshot =
            snapshot_from_result(&live_shape(), Some("codex-cli 0.148.0-alpha.9".into()));

        assert_eq!(snapshot.provider_id, "openai");
        assert_eq!(snapshot.source, "codex_cli");
        assert_eq!(snapshot.plan_type.as_deref(), Some("plus"));
        assert!(snapshot.rate_limit_reached);
        assert_eq!(snapshot.reset_credits_available, 1);
        assert_eq!(snapshot.credit_balance.as_deref(), Some("0"));

        let primary = snapshot.primary.expect("primary window");
        assert_eq!(primary.used_percent, 100.0);
        assert_eq!(primary.remaining_percent, 0.0);
        assert_eq!(primary.window_minutes, Some(300));
        assert_eq!(primary.label.as_deref(), Some("5-hour window"));
        assert!(primary.resets_at.is_some());

        let secondary = snapshot.secondary.expect("secondary window");
        assert_eq!(secondary.remaining_percent, 66.0);
        assert_eq!(secondary.label.as_deref(), Some("weekly window"));
    }

    #[test]
    fn the_binding_window_is_the_one_closest_to_exhaustion() {
        // Primary exhausted, weekly mostly free: the 5-hour window is what blocks work.
        let snapshot = snapshot_from_result(&live_shape(), None);
        assert_eq!(snapshot.binding_remaining_percent, Some(0.0));
        assert_eq!(snapshot.binding_label.as_deref(), Some("5-hour window"));

        // Invert it: the weekly window becomes binding.
        let inverted = json!({ "rateLimits": {
            "primary":   { "usedPercent": 10, "windowDurationMins": 300,   "resetsAt": 1788647930 },
            "secondary": { "usedPercent": 90, "windowDurationMins": 10080, "resetsAt": 1789155964 }
        }});
        let snapshot = snapshot_from_result(&inverted, None);
        assert_eq!(snapshot.binding_remaining_percent, Some(10.0));
        assert_eq!(snapshot.binding_label.as_deref(), Some("weekly window"));
    }

    #[test]
    fn nullable_fields_are_tolerated() {
        // The protocol schema marks only usedPercent required.
        let sparse = json!({ "rateLimits": {
            "primary": { "usedPercent": 42, "windowDurationMins": null, "resetsAt": null },
            "secondary": null
        }});
        let snapshot = snapshot_from_result(&sparse, None);
        let primary = snapshot.primary.expect("primary window");

        assert_eq!(primary.remaining_percent, 58.0);
        assert_eq!(primary.window_minutes, None);
        assert_eq!(primary.resets_at, None);
        assert_eq!(primary.label, None);
        assert!(snapshot.secondary.is_none());
        assert_eq!(snapshot.binding_remaining_percent, Some(58.0));
    }

    #[test]
    fn an_empty_or_unexpected_payload_does_not_panic() {
        let snapshot = snapshot_from_result(&json!({}), None);
        assert!(snapshot.primary.is_none());
        assert!(snapshot.secondary.is_none());
        assert_eq!(snapshot.binding_remaining_percent, None);
        assert!(!snapshot.rate_limit_reached);
        assert_eq!(snapshot.reset_credits_available, 0);
    }

    #[test]
    fn window_labels_read_naturally() {
        assert_eq!(window_label(300), "5-hour window");
        assert_eq!(window_label(10_080), "weekly window");
        assert_eq!(window_label(1_440), "daily window");
        assert_eq!(window_label(45), "45-minute window");
        assert_eq!(window_label(20_160), "2-week window");
    }

    #[test]
    fn used_percent_is_clamped_so_a_bad_value_cannot_invert_remaining() {
        let odd = json!({ "rateLimits": { "primary": { "usedPercent": 140 } } });
        let snapshot = snapshot_from_result(&odd, None);
        let primary = snapshot.primary.expect("primary window");
        assert_eq!(primary.used_percent, 100.0);
        assert_eq!(primary.remaining_percent, 0.0);
    }

    /// End-to-end against the real CLI. Ignored by default because it needs Codex installed
    /// and signed in. Run with:
    ///   cargo test --manifest-path src-tauri/Cargo.toml -- --ignored --nocapture live_
    #[test]
    #[ignore]
    fn live_fetch_returns_a_usable_snapshot() {
        let binary = locate_codex().expect("Codex CLI not found on this machine");
        println!("binary: {}", binary.display());

        let snapshot = fetch().expect("fetch failed");
        println!("cli: {:?}", snapshot.cli_version);
        println!("plan: {:?}", snapshot.plan_type);
        println!("source: {}", snapshot.source);
        println!("binding label: {:?}", snapshot.binding_label);
        println!(
            "reset credits available: {}",
            snapshot.reset_credits_available
        );
        println!("has primary: {}", snapshot.primary.is_some());
        println!("has secondary: {}", snapshot.secondary.is_some());

        assert_eq!(snapshot.provider_id, "openai");
        assert_eq!(snapshot.source, "codex_cli");
        assert!(snapshot.primary.is_some(), "expected a primary window");
        let remaining = snapshot
            .binding_remaining_percent
            .expect("expected a binding remaining percentage");
        assert!(
            (0.0..=100.0).contains(&remaining),
            "remaining out of range: {remaining}"
        );
    }

    #[test]
    fn the_initialize_message_omits_the_jsonrpc_field() {
        let message: Value = serde_json::from_str(&initialize_message()).unwrap();
        assert!(message.get("jsonrpc").is_none());
        assert_eq!(message["method"], "initialize");
        assert_eq!(message["params"]["clientInfo"]["name"], "ai_usage_meter");
    }
}
