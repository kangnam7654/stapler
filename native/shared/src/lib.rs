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
