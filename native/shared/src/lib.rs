//! Native shared utilities exported to Node.js via napi-rs.

use napi_derive::napi;

/// Normalizes a string to be used as a URL key (slug).
/// 
/// Logic:
/// 1. Trim whitespace.
/// 2. Convert to lowercase.
/// 3. Replace any sequence of non-alphanumeric characters with a single dash.
/// 4. Trim leading and trailing dashes.
/// 5. Return null (None) if the result is empty.
#[napi(js_name = "normalizeUrlKey")]
pub fn normalize_url_key(value: Option<String>) -> Option<String> {
    let v = value?;
    stapler_shared::validators::normalize_url_key(&v)
}

/// Checks if a string looks like a UUID (v1-v5).
#[napi(js_name = "isUuidLike")]
pub fn is_uuid_like(value: Option<String>) -> bool {
    let v = match value {
        Some(v) => v,
        None => return false,
    };
    stapler_shared::validators::is_uuid_like(&v)
}

/// Redacts a username by masking it with asterisks, preserving the first character.
#[napi(js_name = "maskUserNameForLogs")]
pub fn mask_user_name_for_logs(value: String, fallback: String) -> String {
    stapler_shared::redaction::mask_user_name_for_logs(&value, &fallback)
}

/// Redacts user-specific text (usernames and home directories) from a string.
#[napi(js_name = "redactCurrentUserText")]
pub fn redact_current_user_text(
    input: String,
    user_names: Vec<String>,
    home_dirs: Vec<String>,
    replacement: String,
) -> String {
    stapler_shared::redaction::redact_current_user_text(&input, &user_names, &home_dirs, &replacement)
}

/// Redacts sensitive information from an event payload.
#[napi(js_name = "redactEventPayload")]
pub fn redact_event_payload(payload: Option<serde_json::Value>) -> Option<serde_json::Value> {
    stapler_shared::redaction::redact_event_payload(payload)
}
