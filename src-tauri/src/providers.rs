//! Provider API connectors.
//!
//! Endpoints are documented in `docs/provider-capability-matrix.md`; none were invented.
//!
//! Security contract:
//!   * Every provider HTTPS call happens here, never in the frontend.
//!   * Response bodies are parsed here and only aggregate numbers cross the IPC boundary.
//!   * No response body, URL with credentials, or key value is ever logged or placed in an
//!     error message. Errors carry a fixed string chosen from the HTTP status alone.
//!
//! Parsing is deliberately tolerant: fields are looked up by several candidate names and
//! missing values contribute zero. These connectors have NOT yet been verified against a
//! real account, so a rigid struct would turn a harmless schema difference into a hard
//! failure. See the verification table in the capability matrix.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

use crate::credentials::{self, ProviderId};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = concat!("AIUsageMeter/", env!("CARGO_PKG_VERSION"));
const WINDOW_DAYS: i64 = 30;
/// Both providers cap daily buckets at 31.
const BUCKET_LIMIT: u32 = 31;

/// Anthropic reports cost amounts in the lowest currency unit. The API reference is explicit:
/// "Cost amount in lowest currency units (e.g. cents) as a decimal string. For example
/// `"123.45"` in `"USD"` represents `$1.23`." OpenAI's `amount.value` is already dollars.
const ANTHROPIC_CENTS_PER_DOLLAR: f64 = 100.0;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsagePoint {
    pub date: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_input_tokens: u64,
    pub requests: u64,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    pub provider_id: String,
    pub observed_at: String,
    pub window_start: String,
    pub window_end: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_input_tokens: u64,
    pub total_tokens: u64,
    pub requests: u64,
    pub cost_usd: Option<f64>,
    /// True when the provider documents the cost unit ambiguously and a real-account check
    /// has not yet settled it. The UI must mark such a figure as unconfirmed.
    pub cost_unit_unverified: bool,
    pub daily: Vec<DailyUsagePoint>,
    /// Data-source label required by prompt §20, e.g. `openai_usage_api`.
    pub source: String,
}

/// Carries a connector state the frontend already models, plus a message safe to display.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFetchError {
    pub state: &'static str,
    pub message: String,
    /// The provider's own error text, when it supplied one. Shown in the UI to make a
    /// failure diagnosable. Only the `error.message` field is taken, never the whole body,
    /// and it is never written to the diagnostic log.
    pub detail: Option<String>,
}

impl ProviderFetchError {
    fn new(state: &'static str, message: impl Into<String>) -> Self {
        Self {
            state,
            message: message.into(),
            detail: None,
        }
    }

    fn with_detail(mut self, detail: Option<String>) -> Self {
        self.detail = detail;
        self
    }

    /// Maps an HTTP status to a state and an actionable message.
    ///
    /// 401 and 403 are deliberately distinct: 401 means the key itself was not
    /// accepted, while 403 means a valid key lacks the required scope - usually a
    /// workspace-scoped key, which the usage endpoints reject. Collapsing them
    /// sends users to fix the wrong thing.
    fn from_status(status: u16) -> Self {
        match status {
            401 => Self::new(
                "authentication_required",
                "The provider did not accept this key. Check it was copied in full and has not been revoked.",
            ),
            403 => Self::new(
                "authentication_required",
                "The key is valid but not permitted to read organization usage. Two causes: the key is workspace-scoped (use a Personal key whose Scope is Organization), or your account lacks the admin role - a developer can create keys but cannot read organization usage. Check whether you can create a key at platform.claude.com/settings/admin-keys.",
            ),
            404 => Self::new(
                "page_unavailable",
                "The provider returned 404 for the usage endpoint. This usually means the account \
                 is not an organization with usage reporting enabled.",
            ),
            408 | 504 => Self::new("timed_out", "The provider did not respond in time."),
            429 => Self::new("rate_limited", "The provider rate-limited this request."),
            500..=599 => Self::new("page_unavailable", "The provider's API is currently unavailable."),
            other => Self::new("error", format!("The provider returned HTTP {other}.")),
        }
    }
}

// ---------------------------------------------------------------------------
// Tolerant JSON helpers
// ---------------------------------------------------------------------------

/// First non-null match among `keys`, coerced to u64. Absent fields contribute nothing.
fn number_field(object: &Value, keys: &[&str]) -> u64 {
    for key in keys {
        match object.get(*key) {
            Some(Value::Number(number)) => {
                if let Some(value) = number.as_u64() {
                    return value;
                }
                if let Some(value) = number.as_f64() {
                    if value.is_finite() && value >= 0.0 {
                        return value.round() as u64;
                    }
                }
            }
            // Some payloads nest a total inside an object, e.g. cache_creation.
            Some(Value::Object(nested)) => {
                let total: u64 = nested.values().filter_map(|value| value.as_u64()).sum();
                if total > 0 {
                    return total;
                }
            }
            _ => {}
        }
    }
    0
}

/// Costs arrive as a float (OpenAI `amount.value`) or a decimal string (Anthropic `amount`).
fn money_field(object: &Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        match object.get(*key) {
            Some(Value::Number(number)) => return number.as_f64(),
            Some(Value::String(text)) => {
                if let Ok(value) = text.trim().parse::<f64>() {
                    return Some(value);
                }
            }
            Some(Value::Object(nested)) => {
                if let Some(value) = nested.get("value").and_then(Value::as_f64) {
                    return Some(value);
                }
                if let Some(value) = nested
                    .get("amount")
                    .and_then(Value::as_str)
                    .and_then(|text| text.trim().parse::<f64>().ok())
                {
                    return Some(value);
                }
            }
            _ => {}
        }
    }
    None
}

/// Buckets live under `data` for both providers; fall back to a bare array.
fn buckets(payload: &Value) -> Vec<&Value> {
    payload
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| payload.as_array())
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

fn bucket_results(bucket: &Value) -> Vec<&Value> {
    bucket
        .get("results")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

/// Bucket start as `YYYY-MM-DD`, from either a unix second (OpenAI) or RFC3339 (Anthropic).
fn bucket_date(bucket: &Value) -> String {
    if let Some(seconds) = bucket.get("start_time").and_then(Value::as_i64) {
        if let Ok(moment) = OffsetDateTime::from_unix_timestamp(seconds) {
            return moment.date().to_string();
        }
    }
    for key in ["starting_at", "start_time"] {
        if let Some(text) = bucket.get(key).and_then(Value::as_str) {
            if let Ok(moment) = OffsetDateTime::parse(text, &Rfc3339) {
                return moment.date().to_string();
            }
            if text.len() >= 10 {
                return text[..10].to_string();
            }
        }
    }
    String::new()
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/// Extracts only the provider's `error.message`, capped. Both OpenAI and Anthropic use this
/// shape. The rest of the body is discarded: it can carry request metadata.
fn error_detail(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    let message = parsed
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| parsed.get("message").and_then(Value::as_str))?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(300).collect())
}

fn client() -> Result<reqwest::Client, ProviderFetchError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| ProviderFetchError::new("error", "Could not create the HTTPS client."))
}

/// Performs the request and returns parsed JSON. Transport failures are classified without
/// including the underlying error text, which can contain the request URL.
async fn get_json(request: reqwest::RequestBuilder) -> Result<Value, ProviderFetchError> {
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            ProviderFetchError::new("timed_out", "The provider did not respond in time.")
        } else if error.is_connect() {
            ProviderFetchError::new(
                "page_unavailable",
                "Could not reach the provider. Check the network connection.",
            )
        } else {
            ProviderFetchError::new("error", "The request to the provider failed.")
        }
    })?;

    let status = response.status();
    if !status.is_success() {
        // Read the body only to lift `error.message`; it is never logged.
        let detail = response.text().await.ok().as_deref().and_then(error_detail);
        return Err(ProviderFetchError::from_status(status.as_u16()).with_detail(detail));
    }

    response.json::<Value>().await.map_err(|_| {
        ProviderFetchError::new(
            "error",
            "The provider returned a response that could not be parsed.",
        )
    })
}

fn require_key(provider: ProviderId) -> Result<String, ProviderFetchError> {
    credentials::read(provider)
        .map_err(|error| ProviderFetchError::new("error", error.message()))?
        .ok_or_else(|| {
            ProviderFetchError::new(
                "authentication_required",
                "No API key is configured for this provider.",
            )
        })
}

fn window() -> (OffsetDateTime, OffsetDateTime) {
    let end = OffsetDateTime::now_utc();
    (end - TimeDuration::days(WINDOW_DAYS), end)
}

// ---------------------------------------------------------------------------
// OpenAI — https://api.openai.com/v1/organization/{usage/completions,costs}
// ---------------------------------------------------------------------------

pub async fn fetch_openai() -> Result<ProviderUsageSnapshot, ProviderFetchError> {
    let key = require_key(ProviderId::Openai)?;
    let http = client()?;
    let (start, end) = window();

    let usage = get_json(
        http.get("https://api.openai.com/v1/organization/usage/completions")
            .bearer_auth(&key)
            .query(&[
                ("start_time", start.unix_timestamp().to_string()),
                ("end_time", end.unix_timestamp().to_string()),
                ("bucket_width", "1d".to_string()),
                ("limit", BUCKET_LIMIT.to_string()),
            ]),
    )
    .await?;

    let mut daily: Vec<DailyUsagePoint> = Vec::new();
    for bucket in buckets(&usage) {
        let mut point = DailyUsagePoint {
            date: bucket_date(bucket),
            ..Default::default()
        };
        for result in bucket_results(bucket) {
            point.input_tokens += number_field(result, &["input_tokens"]);
            point.output_tokens += number_field(result, &["output_tokens"]);
            point.cached_input_tokens += number_field(result, &["input_cached_tokens"]);
            point.requests += number_field(result, &["num_model_requests"]);
        }
        daily.push(point);
    }

    // Costs are a separate endpoint. A failure here must not discard the usage numbers we
    // already have, so the cost stays None and the snapshot is still returned.
    let cost_total = match get_json(
        http.get("https://api.openai.com/v1/organization/costs")
            .bearer_auth(&key)
            .query(&[
                ("start_time", start.unix_timestamp().to_string()),
                ("bucket_width", "1d".to_string()),
                ("limit", BUCKET_LIMIT.to_string()),
            ]),
    )
    .await
    {
        Ok(costs) => {
            let mut total = 0.0_f64;
            let mut seen = false;
            for bucket in buckets(&costs) {
                let date = bucket_date(bucket);
                let mut bucket_cost = 0.0_f64;
                for result in bucket_results(bucket) {
                    if let Some(amount) = money_field(result, &["amount"]) {
                        bucket_cost += amount;
                        seen = true;
                    }
                }
                if let Some(point) = daily.iter_mut().find(|point| point.date == date) {
                    point.cost_usd = Some(bucket_cost);
                }
                total += bucket_cost;
            }
            seen.then_some(total)
        }
        Err(_) => None,
    };

    Ok(finish(
        ProviderId::Openai,
        start,
        end,
        daily,
        cost_total,
        false,
        "openai_usage_api",
    ))
}

// ---------------------------------------------------------------------------
// Anthropic — https://api.anthropic.com/v1/organizations/{usage_report/messages,cost_report}
// ---------------------------------------------------------------------------

pub async fn fetch_anthropic() -> Result<ProviderUsageSnapshot, ProviderFetchError> {
    let key = require_key(ProviderId::Anthropic)?;
    let http = client()?;
    let (start, end) = window();
    let starting_at = start.format(&Rfc3339).unwrap_or_default();
    let ending_at = end.format(&Rfc3339).unwrap_or_default();

    let usage = get_json(
        http.get("https://api.anthropic.com/v1/organizations/usage_report/messages")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .query(&[
                ("starting_at", starting_at.as_str()),
                ("ending_at", ending_at.as_str()),
                ("bucket_width", "1d"),
                ("limit", "31"),
            ]),
    )
    .await?;

    let mut daily: Vec<DailyUsagePoint> = Vec::new();
    for bucket in buckets(&usage) {
        let mut point = DailyUsagePoint {
            date: bucket_date(bucket),
            ..Default::default()
        };
        for result in bucket_results(bucket) {
            point.input_tokens += number_field(result, &["uncached_input_tokens", "input_tokens"]);
            point.output_tokens += number_field(result, &["output_tokens"]);
            point.cached_input_tokens +=
                number_field(result, &["cache_read_input_tokens", "cached_input_tokens"])
                    + number_field(result, &["cache_creation_input_tokens", "cache_creation"]);
            // The usage report is token-oriented and does not carry a request count.
        }
        daily.push(point);
    }

    let cost_total = match get_json(
        http.get("https://api.anthropic.com/v1/organizations/cost_report")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .query(&[
                ("starting_at", starting_at.as_str()),
                ("ending_at", ending_at.as_str()),
            ]),
    )
    .await
    {
        Ok(costs) => {
            let mut total = 0.0_f64;
            let mut seen = false;
            for bucket in buckets(&costs) {
                let date = bucket_date(bucket);
                let mut bucket_cost = 0.0_f64;
                for result in bucket_results(bucket) {
                    if let Some(amount) = money_field(result, &["amount", "cost"]) {
                        // Cents -> dollars. Omitting this reported costs 100x too high.
                        bucket_cost += amount / ANTHROPIC_CENTS_PER_DOLLAR;
                        seen = true;
                    }
                }
                if let Some(point) = daily.iter_mut().find(|point| point.date == date) {
                    point.cost_usd = Some(bucket_cost);
                }
                total += bucket_cost;
            }
            seen.then_some(total)
        }
        Err(_) => None,
    };

    // The cost unit was ambiguous in the guide but is settled in the API reference (see
    // ANTHROPIC_CENTS_PER_DOLLAR), so the amount above is a real dollar figure. The
    // `cost_unit_unverified` mechanism stays for any future provider that is still unclear.
    Ok(finish(
        ProviderId::Anthropic,
        start,
        end,
        daily,
        cost_total,
        false,
        "anthropic_admin_api",
    ))
}

fn finish(
    provider: ProviderId,
    start: OffsetDateTime,
    end: OffsetDateTime,
    daily: Vec<DailyUsagePoint>,
    cost_usd: Option<f64>,
    cost_unit_unverified: bool,
    source: &str,
) -> ProviderUsageSnapshot {
    let input_tokens = daily.iter().map(|point| point.input_tokens).sum();
    let output_tokens = daily.iter().map(|point| point.output_tokens).sum();
    let cached_input_tokens = daily
        .iter()
        .map(|point| point.cached_input_tokens)
        .sum::<u64>();
    let requests = daily.iter().map(|point| point.requests).sum();
    ProviderUsageSnapshot {
        provider_id: provider.as_str().to_string(),
        observed_at: now_rfc3339(),
        window_start: start.format(&Rfc3339).unwrap_or_default(),
        window_end: end.format(&Rfc3339).unwrap_or_default(),
        input_tokens,
        output_tokens,
        cached_input_tokens,
        total_tokens: input_tokens + output_tokens,
        requests,
        cost_usd,
        cost_unit_unverified,
        daily,
        source: source.to_string(),
    }
}

pub async fn fetch(provider: ProviderId) -> Result<ProviderUsageSnapshot, ProviderFetchError> {
    match provider {
        ProviderId::Openai => fetch_openai().await,
        ProviderId::Anthropic => fetch_anthropic().await,
        // Deferred: Gemini has no single usage endpoint. See the capability matrix.
        ProviderId::Google => Err(ProviderFetchError::new(
            "no_data",
            "Google has no official Gemini usage endpoint. Use manual entry for this provider.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn number_field_prefers_the_first_present_key_and_defaults_to_zero() {
        let result = json!({ "uncached_input_tokens": 120, "output_tokens": 45 });
        assert_eq!(
            number_field(&result, &["uncached_input_tokens", "input_tokens"]),
            120
        );
        assert_eq!(
            number_field(&result, &["input_tokens", "uncached_input_tokens"]),
            120
        );
        assert_eq!(number_field(&result, &["missing"]), 0);
    }

    #[test]
    fn number_field_sums_a_nested_object_such_as_cache_creation() {
        let result = json!({ "cache_creation": { "ephemeral_5m": 10, "ephemeral_1h": 7 } });
        assert_eq!(number_field(&result, &["cache_creation"]), 17);
    }

    #[test]
    fn anthropic_cent_amounts_convert_to_dollars() {
        // Documented example: "123.45" in USD represents $1.23.
        let result = json!({ "amount": "123.45" });
        let cents = money_field(&result, &["amount", "cost"]).unwrap();
        let dollars = cents / ANTHROPIC_CENTS_PER_DOLLAR;
        assert!((dollars - 1.2345).abs() < 1e-9, "got {dollars}");

        // Documented example: "41280.000000" represents $412.80.
        let big = json!({ "amount": "41280.000000" });
        let dollars = money_field(&big, &["amount", "cost"]).unwrap() / ANTHROPIC_CENTS_PER_DOLLAR;
        assert!((dollars - 412.80).abs() < 1e-9, "got {dollars}");
    }

    #[test]
    fn openai_amounts_are_already_dollars_and_are_not_divided() {
        let openai = json!({ "amount": { "value": 6.72, "currency": "usd" } });
        assert_eq!(money_field(&openai, &["amount"]), Some(6.72));
    }

    #[test]
    fn money_field_reads_openai_objects_and_anthropic_decimal_strings() {
        let openai = json!({ "amount": { "value": 6.72, "currency": "usd" } });
        assert_eq!(money_field(&openai, &["amount"]), Some(6.72));

        let anthropic = json!({ "amount": "12.7250" });
        assert_eq!(money_field(&anthropic, &["amount"]), Some(12.725));

        assert_eq!(money_field(&json!({}), &["amount"]), None);
    }

    #[test]
    fn bucket_date_handles_unix_seconds_and_rfc3339() {
        assert_eq!(
            bucket_date(&json!({ "start_time": 1_735_689_600 })),
            "2025-01-01"
        );
        assert_eq!(
            bucket_date(&json!({ "starting_at": "2025-01-08T00:00:00Z" })),
            "2025-01-08"
        );
        assert_eq!(bucket_date(&json!({})), "");
    }

    #[test]
    fn buckets_accepts_a_data_envelope_or_a_bare_array() {
        assert_eq!(
            buckets(&json!({ "data": [{ "a": 1 }, { "b": 2 }] })).len(),
            2
        );
        assert_eq!(buckets(&json!([{ "a": 1 }])).len(), 1);
        assert_eq!(buckets(&json!({ "unexpected": true })).len(), 0);
    }

    #[test]
    fn unauthorized_and_forbidden_give_different_advice() {
        // 401: the key was not accepted at all.
        let unauthorized = ProviderFetchError::from_status(401);
        assert!(unauthorized.message.contains("did not accept this key"));

        // 403: a valid key that is not permitted. Observed in the field with a correctly
        // scoped Personal key whose owner only held the developer role, so the message must
        // name both causes - an earlier version blamed scope alone and misdirected the user.
        let forbidden = ProviderFetchError::from_status(403);
        assert!(forbidden.message.contains("workspace-scoped"));
        assert!(forbidden.message.contains("admin role"));
        assert!(forbidden.message.contains("admin-keys"));
    }

    #[test]
    fn error_detail_takes_only_the_message_field() {
        let anthropic = r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#;
        assert_eq!(
            error_detail(anthropic).as_deref(),
            Some("invalid x-api-key")
        );

        let openai =
            r#"{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}"#;
        assert_eq!(
            error_detail(openai).as_deref(),
            Some("Incorrect API key provided")
        );

        assert_eq!(error_detail("not json"), None);
        assert_eq!(error_detail(r#"{"error":{"message":"  "}}"#), None);
    }

    #[test]
    fn error_detail_is_capped_so_a_large_body_cannot_flood_the_ui() {
        let long = format!(r#"{{"error":{{"message":"{}"}}}}"#, "x".repeat(5000));
        assert_eq!(error_detail(&long).expect("detail").chars().count(), 300);
    }

    #[test]
    fn http_status_maps_to_a_connector_state_without_leaking_a_body() {
        assert_eq!(
            ProviderFetchError::from_status(401).state,
            "authentication_required"
        );
        assert_eq!(
            ProviderFetchError::from_status(404).state,
            "page_unavailable"
        );
        assert_eq!(ProviderFetchError::from_status(429).state, "rate_limited");
        assert_eq!(
            ProviderFetchError::from_status(503).state,
            "page_unavailable"
        );
        assert_eq!(ProviderFetchError::from_status(418).state, "error");
    }

    #[test]
    fn openai_style_payload_totals_across_buckets() {
        let payload = json!({ "data": [
            { "start_time": 1_735_689_600, "results": [
                { "input_tokens": 100, "output_tokens": 20, "input_cached_tokens": 5, "num_model_requests": 3 },
                { "input_tokens": 50, "output_tokens": 10, "num_model_requests": 1 }
            ] }
        ] });
        let mut total_input = 0;
        let mut total_requests = 0;
        for bucket in buckets(&payload) {
            for result in bucket_results(bucket) {
                total_input += number_field(result, &["input_tokens"]);
                total_requests += number_field(result, &["num_model_requests"]);
            }
        }
        assert_eq!(total_input, 150);
        assert_eq!(total_requests, 4);
    }
}
