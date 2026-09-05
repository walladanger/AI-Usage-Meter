//! Provider API credentials, stored in the Windows Credential Manager.
//!
//! Security contract (from the project's immutable constraints):
//!   * Secrets live only in the OS credential store — never settings.json, SQLite, or Git.
//!   * A secret value is never written to a log, never returned to the frontend, and never
//!     included in an error message. Only a masked hint (last four characters) is exposed.
//!   * `read` is crate-internal so only the provider connectors can obtain a key.

use keyring::Entry;
use serde::{Deserialize, Serialize};

/// Credential Manager target prefix. Entries appear as `com.aiusagemeter.desktop:<provider>`.
const SERVICE: &str = "com.aiusagemeter.desktop";

/// Guards against storing a pasted document instead of a key.
const MAX_SECRET_LEN: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Openai,
    Anthropic,
    Google,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
            Self::Google => "google",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "openai" => Some(Self::Openai),
            "anthropic" => Some(Self::Anthropic),
            "google" => Some(Self::Google),
            _ => None,
        }
    }
}

/// What the UI is allowed to know about a stored credential.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub provider_id: String,
    pub configured: bool,
    /// Masked tail, e.g. `****cdef`. `None` when nothing is stored.
    pub hint: Option<String>,
}

#[derive(Debug)]
pub enum CredentialError {
    /// The submitted value is empty, too long, or not printable ASCII.
    Invalid(&'static str),
    /// The OS credential store refused the operation.
    Store(String),
}

impl CredentialError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Invalid(_) => "invalid-credential",
            Self::Store(_) => "credential-store-unavailable",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Invalid(message) => (*message).to_string(),
            Self::Store(message) => message.clone(),
        }
    }
}

fn entry(provider: ProviderId) -> Result<Entry, CredentialError> {
    Entry::new(SERVICE, provider.as_str())
        .map_err(|error| CredentialError::Store(error.to_string()))
}

/// Masks everything but the last four characters. Short keys are masked entirely so a
/// mistyped two-character value cannot be read back off the screen.
fn mask(secret: &str) -> String {
    let visible: String = secret
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    if secret.chars().count() <= 8 {
        "*".repeat(8)
    } else {
        format!("{}{visible}", "*".repeat(8))
    }
}

/// Rejects anything that cannot be an API key before it reaches the credential store.
fn validate(secret: &str) -> Result<&str, CredentialError> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err(CredentialError::Invalid("The API key cannot be empty."));
    }
    if trimmed.len() > MAX_SECRET_LEN {
        return Err(CredentialError::Invalid(
            "The API key is too long to be valid.",
        ));
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_graphic())
    {
        return Err(CredentialError::Invalid(
            "The API key contains characters that are not valid in a key.",
        ));
    }
    Ok(trimmed)
}

pub fn store(provider: ProviderId, secret: &str) -> Result<CredentialStatus, CredentialError> {
    let trimmed = validate(secret)?;
    entry(provider)?
        .set_password(trimmed)
        .map_err(|error| CredentialError::Store(error.to_string()))?;
    Ok(CredentialStatus {
        provider_id: provider.as_str().to_string(),
        configured: true,
        hint: Some(mask(trimmed)),
    })
}

pub fn delete(provider: ProviderId) -> Result<CredentialStatus, CredentialError> {
    match entry(provider)?.delete_credential() {
        Ok(()) => {}
        // Deleting something that is already absent is the requested end state, not a failure.
        Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(CredentialError::Store(error.to_string())),
    }
    Ok(CredentialStatus {
        provider_id: provider.as_str().to_string(),
        configured: false,
        hint: None,
    })
}

pub fn status(provider: ProviderId) -> Result<CredentialStatus, CredentialError> {
    match entry(provider)?.get_password() {
        Ok(secret) => Ok(CredentialStatus {
            provider_id: provider.as_str().to_string(),
            configured: true,
            hint: Some(mask(&secret)),
        }),
        Err(keyring::Error::NoEntry) => Ok(CredentialStatus {
            provider_id: provider.as_str().to_string(),
            configured: false,
            hint: None,
        }),
        Err(error) => Err(CredentialError::Store(error.to_string())),
    }
}

/// Crate-internal so only the provider connectors can obtain a key. There is deliberately
/// no Tauri command that returns this value.
pub(crate) fn read(provider: ProviderId) -> Result<Option<String>, CredentialError> {
    match entry(provider)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(CredentialError::Store(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_ids_round_trip() {
        for provider in [
            ProviderId::Openai,
            ProviderId::Anthropic,
            ProviderId::Google,
        ] {
            assert_eq!(ProviderId::parse(provider.as_str()), Some(provider));
        }
        assert_eq!(ProviderId::parse("mistral"), None);
    }

    #[test]
    fn mask_never_reveals_more_than_the_last_four_characters() {
        let masked = mask("sk-admin-0123456789abcdef");
        assert!(masked.ends_with("cdef"));
        assert!(!masked.contains("0123456789"));
        assert!(!masked.contains("sk-admin"));
    }

    #[test]
    fn mask_hides_short_values_entirely() {
        assert_eq!(mask("abc"), "********");
        assert_eq!(mask("12345678"), "********");
    }

    #[test]
    fn validate_rejects_empty_and_oversized_and_non_ascii_values() {
        assert!(validate("   ").is_err());
        assert!(validate(&"a".repeat(MAX_SECRET_LEN + 1)).is_err());
        assert!(validate("sk-admin key with spaces").is_err());
        assert_eq!(validate("  sk-admin-abc  ").unwrap(), "sk-admin-abc");
    }
}
