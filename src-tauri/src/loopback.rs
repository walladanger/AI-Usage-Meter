//! Loopback ingestion service.
//!
//! Binds strictly to `127.0.0.1` and accepts provider usage updates from a
//! browser companion running on the same machine. Only local processes can
//! reach this port; the session token provides an additional authentication
//! layer.
//!
//! ## Protocol
//!
//! Every request must supply `Authorization: Bearer <token>` where `<token>`
//! is the hex-encoded session token returned by `get_loopback_session`.
//!
//! ### `POST /usage/update`
//!
//! Body: JSON `ConnectorPayload`, UTF-8, at most 16 KiB.
//!
//! ```json
//! {
//!   "provider":    "openai" | "anthropic" | "google",
//!   "percentage":  0.0–100.0,
//!   "label":       "75%",
//!   "timestamp":   "2026-09-04T10:00:00Z",
//!   "resetAt":     "2026-09-05T00:00:00Z"   // optional
//! }
//! ```
//!
//! Success → `200 {"ok":true}` + emits `usage://connector-update` to the
//! Tauri frontend.
//!
//! All other paths → `404`. Bad auth → `401`. Oversized body → `413`.
//! Validation failure → `422`.

use std::io::Read;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server};

use crate::diagnostics;

/// Preferred loopback port. Falls back to OS-chosen if already in use.
const PREFERRED_PORT: u16 = 52411;

/// Maximum accepted request body: 16 KiB.
const MAX_BODY_BYTES: usize = 16 * 1024;

/// Canonical provider IDs accepted in update payloads.
const KNOWN_PROVIDERS: &[&str] = &["openai", "anthropic", "google"];

// ─── Session ─────────────────────────────────────────────────────────────────

/// Session token and bound port, available for the lifetime of the process.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackSession {
    pub port: u16,
    /// Hex-encoded 16-byte OS-random token. Fresh per launch; never written to disk.
    pub token: String,
}

static SESSION: OnceLock<LoopbackSession> = OnceLock::new();

fn generate_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("OS random source unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ─── Payload ─────────────────────────────────────────────────────────────────

/// A validated provider usage update emitted to the Tauri frontend.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorPayload {
    pub provider: String,
    /// Remaining usage as a percentage in [0, 100].
    pub percentage: f64,
    /// Human-readable label from the provider page (e.g. "75%").
    pub label: String,
    /// ISO 8601 timestamp of when the data was observed.
    pub timestamp: String,
    /// ISO 8601 reset timestamp, if the provider exposes one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_at: Option<String>,
}

fn is_safe_timestamp(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value.is_ascii()
        && !value.chars().any(|c| c.is_control())
}

/// Returns `Ok(())` when the payload is structurally valid.
pub fn validate_payload(payload: &ConnectorPayload) -> Result<(), &'static str> {
    if !KNOWN_PROVIDERS.contains(&payload.provider.as_str()) {
        return Err("unknown provider");
    }
    if !payload.percentage.is_finite() || !(0.0..=100.0).contains(&payload.percentage) {
        return Err("percentage out of range");
    }
    if payload.label.is_empty()
        || payload.label.len() > 64
        || payload.label.chars().any(|c| c.is_control())
    {
        return Err("label invalid");
    }
    if !is_safe_timestamp(&payload.timestamp) {
        return Err("timestamp invalid");
    }
    if let Some(reset_at) = &payload.reset_at {
        if !is_safe_timestamp(reset_at) {
            return Err("reset_at invalid");
        }
    }
    Ok(())
}

// ─── Server ──────────────────────────────────────────────────────────────────

/// Start the loopback service. Safe to call only once per process.
///
/// Attempts to bind to `127.0.0.1:52411`; falls back to an OS-chosen port if
/// that port is already occupied. Spawns a background thread that owns the
/// server loop. Returns `Ok(())` when the server thread has started.
pub fn install(app: &AppHandle) -> Result<(), String> {
    let token = generate_token();

    let server = Server::http(format!("127.0.0.1:{PREFERRED_PORT}"))
        .or_else(|_| Server::http("127.0.0.1:0"))
        .map_err(|e| format!("loopback bind failed: {e}"))?;

    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "loopback address unavailable".to_owned())?
        .port();

    SESSION
        .set(LoopbackSession {
            port,
            token: token.clone(),
        })
        .map_err(|_| "loopback already installed")?;

    diagnostics::record_native(
        app,
        "INFO",
        &format!("Loopback service listening on 127.0.0.1:{port}"),
    );

    let app_clone = app.clone();
    std::thread::Builder::new()
        .name("loopback-server".to_owned())
        .spawn(move || serve(server, token, app_clone))
        .map_err(|e| format!("loopback thread spawn failed: {e}"))?;

    Ok(())
}

/// Return the session for this process, if the server started successfully.
pub fn get_session() -> Option<&'static LoopbackSession> {
    SESSION.get()
}

// ─── Request handling ─────────────────────────────────────────────────────────

fn json_response(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(tiny_http::StatusCode(status))
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn error_json(status: u16, message: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let escaped = serde_json::to_string(message).unwrap_or_else(|_| r#""error""#.to_owned());
    json_response(status, &format!(r#"{{"error":{escaped}}}"#))
}

fn extract_bearer(request: &tiny_http::Request) -> Option<&str> {
    request
        .headers()
        .iter()
        .find(|h| {
            h.field
                .as_str()
                .as_str()
                .eq_ignore_ascii_case("authorization")
        })
        .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
}

fn handle_request(
    request: &mut tiny_http::Request,
    token: &str,
    app: &AppHandle,
) -> Response<std::io::Cursor<Vec<u8>>> {
    // Only POST /usage/update is supported.
    if request.method() != &Method::Post || request.url().trim_end_matches('/') != "/usage/update" {
        return error_json(404, "not found");
    }

    // Verify the session token.
    let Some(bearer) = extract_bearer(request) else {
        return error_json(401, "missing authorization");
    };
    if bearer != token {
        return error_json(401, "invalid authorization");
    }

    // Cap body size.
    if request.body_length().unwrap_or(0) > MAX_BODY_BYTES {
        return error_json(413, "payload too large");
    }

    let mut body = Vec::new();
    if let Err(e) = request
        .as_reader()
        .take(MAX_BODY_BYTES as u64 + 1)
        .read_to_end(&mut body)
    {
        diagnostics::record_native(app, "ERROR", &format!("Loopback body read error: {e}"));
        return error_json(400, "body read error");
    }
    if body.len() > MAX_BODY_BYTES {
        return error_json(413, "payload too large");
    }

    // Parse and validate.
    let payload: ConnectorPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            diagnostics::record_native(app, "WARN", &format!("Loopback parse error: {e}"));
            return error_json(400, "invalid json");
        }
    };

    if let Err(reason) = validate_payload(&payload) {
        diagnostics::record_native(
            app,
            "WARN",
            &format!("Loopback validation failed: {reason}"),
        );
        return error_json(422, reason);
    }

    // Emit to the Tauri frontend.
    diagnostics::record_native(
        app,
        "INFO",
        &format!("Loopback received update; provider={}", payload.provider),
    );
    if let Err(e) = app.emit("usage://connector-update", &payload) {
        diagnostics::record_native(app, "ERROR", &format!("Loopback emit failed: {e}"));
        return error_json(500, "emit failed");
    }

    json_response(200, r#"{"ok":true}"#)
}

fn serve(server: Server, token: String, app: AppHandle) {
    for mut request in server.incoming_requests() {
        let response = handle_request(&mut request, &token, &app);
        let _ = request.respond(response);
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payload() -> ConnectorPayload {
        ConnectorPayload {
            provider: "openai".to_owned(),
            percentage: 75.0,
            label: "75%".to_owned(),
            timestamp: "2026-09-04T10:00:00Z".to_owned(),
            reset_at: None,
        }
    }

    #[test]
    fn accepts_all_known_providers() {
        for provider in KNOWN_PROVIDERS {
            let payload = ConnectorPayload {
                provider: provider.to_string(),
                ..valid_payload()
            };
            assert!(
                validate_payload(&payload).is_ok(),
                "expected ok for {provider}"
            );
        }
    }

    #[test]
    fn rejects_unknown_provider() {
        let payload = ConnectorPayload {
            provider: "chatgpt".to_owned(),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("unknown provider"));
    }

    #[test]
    fn rejects_out_of_range_percentage() {
        let over = ConnectorPayload {
            percentage: 100.1,
            ..valid_payload()
        };
        assert_eq!(validate_payload(&over), Err("percentage out of range"));

        let under = ConnectorPayload {
            percentage: -0.1,
            ..valid_payload()
        };
        assert_eq!(validate_payload(&under), Err("percentage out of range"));

        let nan = ConnectorPayload {
            percentage: f64::NAN,
            ..valid_payload()
        };
        assert_eq!(validate_payload(&nan), Err("percentage out of range"));

        let inf = ConnectorPayload {
            percentage: f64::INFINITY,
            ..valid_payload()
        };
        assert_eq!(validate_payload(&inf), Err("percentage out of range"));
    }

    #[test]
    fn accepts_boundary_percentages() {
        let zero = ConnectorPayload {
            percentage: 0.0,
            ..valid_payload()
        };
        assert!(validate_payload(&zero).is_ok());

        let hundred = ConnectorPayload {
            percentage: 100.0,
            ..valid_payload()
        };
        assert!(validate_payload(&hundred).is_ok());
    }

    #[test]
    fn rejects_empty_label() {
        let payload = ConnectorPayload {
            label: "".to_owned(),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("label invalid"));
    }

    #[test]
    fn rejects_label_over_64_chars() {
        let payload = ConnectorPayload {
            label: "x".repeat(65),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("label invalid"));
    }

    #[test]
    fn rejects_label_with_control_characters() {
        let payload = ConnectorPayload {
            label: "75%\n".to_owned(),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("label invalid"));
    }

    #[test]
    fn rejects_empty_timestamp() {
        let payload = ConnectorPayload {
            timestamp: "".to_owned(),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("timestamp invalid"));
    }

    #[test]
    fn rejects_timestamp_over_32_chars() {
        let payload = ConnectorPayload {
            timestamp: "2".repeat(33),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&payload), Err("timestamp invalid"));
    }

    #[test]
    fn validates_optional_reset_at() {
        let with_reset = ConnectorPayload {
            reset_at: Some("2026-09-05T00:00:00Z".to_owned()),
            ..valid_payload()
        };
        assert!(validate_payload(&with_reset).is_ok());

        let bad_reset = ConnectorPayload {
            reset_at: Some("".to_owned()),
            ..valid_payload()
        };
        assert_eq!(validate_payload(&bad_reset), Err("reset_at invalid"));
    }

    #[test]
    fn generate_token_is_32_lowercase_hex_chars() {
        let token = generate_token();
        assert_eq!(token.len(), 32);
        assert!(
            token
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()),
            "token should be lowercase hex"
        );
        // Two tokens must not be identical (with overwhelming probability).
        let token2 = generate_token();
        assert_ne!(token, token2);
    }
}
