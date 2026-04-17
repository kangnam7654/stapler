//! Native shared utilities exported to Node.js via napi-rs.

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, JsString, Result, Status, Task};
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

#[napi(object)]
pub struct ParsedProjectMention {
    pub project_id: String,
    pub color: Option<String>,
}

#[napi(object)]
pub struct ParsedAgentMention {
    pub agent_id: String,
    pub icon: Option<String>,
}

#[napi(js_name = "buildProjectMentionHref")]
pub fn build_project_mention_href(project_id: String, color: Option<String>) -> String {
    stapler_shared::mentions::build_project_mention_href(&project_id, color)
}

#[napi(js_name = "parseProjectMentionHref")]
pub fn parse_project_mention_href(href: String) -> Option<ParsedProjectMention> {
    stapler_shared::mentions::parse_project_mention_href(&href).map(|p| ParsedProjectMention {
        project_id: p.project_id,
        color: p.color,
    })
}

#[napi(js_name = "buildAgentMentionHref")]
pub fn build_agent_mention_href(agent_id: String, icon: Option<String>) -> String {
    stapler_shared::mentions::build_agent_mention_href(&agent_id, icon)
}

#[napi(js_name = "parseAgentMentionHref")]
pub fn parse_agent_mention_href(href: String) -> Option<ParsedAgentMention> {
    stapler_shared::mentions::parse_agent_mention_href(&href).map(|p| ParsedAgentMention {
        agent_id: p.agent_id,
        icon: p.icon,
    })
}

#[napi(js_name = "extractProjectMentionIds")]
pub fn extract_project_mention_ids(markdown: String) -> Vec<String> {
    stapler_shared::mentions::extract_project_mention_ids(&markdown)
}

#[napi(js_name = "extractAgentMentionIds")]
pub fn extract_agent_mention_ids(markdown: String) -> Vec<String> {
    stapler_shared::mentions::extract_agent_mention_ids(&markdown)
}

#[napi(js_name = "parseAllowedTypes")]
pub fn parse_allowed_types(raw: Option<String>) -> Vec<String> {
    stapler_shared::attachments::parse_allowed_types(raw)
}

#[napi(js_name = "matchesContentType")]
pub fn matches_content_type(content_type: String, allowed_patterns: Vec<String>) -> bool {
    stapler_shared::attachments::matches_content_type(&content_type, &allowed_patterns)
}

#[napi(js_name = "sanitizeFriendlyPathSegment")]
pub fn sanitize_friendly_path_segment(value: Option<String>, fallback: String) -> String {
    stapler_shared::paths::sanitize_friendly_path_segment(value, &fallback)
}

#[napi(js_name = "expandHomePrefix")]
pub fn expand_home_prefix(path: String, home_dir: String) -> String {
    stapler_shared::paths::expand_home_prefix(&path, &home_dir)
}

/// Returns the full hex-encoded SHA-256 hash of a string.
#[napi(js_name = "sha256Hex")]
pub fn sha256_hex(value: String) -> String {
    stapler_shared::crypto::sha256_hex(&value)
}

/// Computes HMAC-SHA256 and returns the hex digest.
#[napi(js_name = "hmacSha256Hex")]
pub fn hmac_sha256_hex(key: Buffer, data: Buffer) -> String {
    stapler_shared::crypto::hmac_sha256_hex(&key, &data)
}

/// Computes HMAC-SHA256 and returns the base64url (no padding) digest.
#[napi(js_name = "hmacSha256Base64Url")]
pub fn hmac_sha256_base64url(key: Buffer, data: Buffer) -> String {
    stapler_shared::crypto::hmac_sha256_base64url(&key, &data)
}

/// Constant-time equality comparison for two buffers.
#[napi(js_name = "timingSafeEqual")]
pub fn timing_safe_equal(a: Buffer, b: Buffer) -> bool {
    stapler_shared::crypto::timing_safe_equal(&a, &b)
}

/// Encodes bytes to base64url (no padding).
#[napi(js_name = "base64UrlEncode")]
pub fn base64url_encode(data: Buffer) -> String {
    stapler_shared::crypto::base64url_encode(&data)
}

/// Decodes a base64url (no padding) string to bytes.
#[napi(js_name = "base64UrlDecode")]
pub fn base64url_decode(encoded: String) -> Option<Buffer> {
    stapler_shared::crypto::base64url_decode(&encoded).map(Buffer::from)
}

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

/// Result of `aes256GcmEncrypt` — ciphertext and 16-byte auth tag are
/// returned separately to match the on-disk `LocalEncryptedMaterial` shape.
#[napi(object)]
pub struct AesGcmEncryptResult {
    pub ciphertext: Buffer,
    pub auth_tag: Buffer,
}

/// AES-256-GCM encrypt. Throws on invalid key or IV length.
#[napi(js_name = "aes256GcmEncrypt")]
pub fn aes256_gcm_encrypt(
    key: Buffer,
    iv: Buffer,
    plaintext: Buffer,
) -> Result<AesGcmEncryptResult> {
    match stapler_shared::crypto::aes256_gcm_encrypt(&key, &iv, &plaintext) {
        Some((ciphertext, tag)) => Ok(AesGcmEncryptResult {
            ciphertext: ciphertext.into(),
            auth_tag: tag.into(),
        }),
        None => Err(Error::new(
            Status::InvalidArg,
            "Invalid AES-256-GCM key or IV length".to_string(),
        )),
    }
}

/// AES-256-GCM decrypt. Throws on auth-tag mismatch or invalid lengths.
#[napi(js_name = "aes256GcmDecrypt")]
pub fn aes256_gcm_decrypt(
    key: Buffer,
    iv: Buffer,
    ciphertext: Buffer,
    auth_tag: Buffer,
) -> Result<Buffer> {
    match stapler_shared::crypto::aes256_gcm_decrypt(&key, &iv, &ciphertext, &auth_tag) {
        Some(plaintext) => Ok(plaintext.into()),
        None => Err(Error::new(
            Status::GenericFailure,
            "AES-256-GCM decryption failed (auth tag mismatch or invalid input)".to_string(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Cryptographic RNG
// ---------------------------------------------------------------------------

/// Returns `len` cryptographically secure random bytes from the OS CSPRNG.
#[napi(js_name = "randomBytes")]
pub fn random_bytes(len: u32) -> Buffer {
    stapler_shared::crypto::random_bytes(len as usize).into()
}

// ---------------------------------------------------------------------------
// Streaming SHA-256 file hash (AsyncTask → Promise<string>)
// ---------------------------------------------------------------------------

pub struct Sha256FileTask {
    path: String,
}

impl Task for Sha256FileTask {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> Result<Self::Output> {
        stapler_shared::crypto::sha256_file(std::path::Path::new(&self.path))
            .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.create_string(&output)
    }
}

/// Streams a file through SHA-256 on the napi-rs worker pool and resolves
/// with the lowercase hex digest.
#[napi(js_name = "sha256File", ts_return_type = "Promise<string>")]
pub fn sha256_file(path: String) -> AsyncTask<Sha256FileTask> {
    AsyncTask::new(Sha256FileTask { path })
}

#[napi(js_name = "normalizeCurrency")]
pub fn normalize_currency(code: String) -> String {
    stapler_shared::finance::normalize_currency(&code)
}

#[napi(js_name = "deriveBiller")]
pub fn derive_biller(biller: Option<String>, provider: String) -> String {
    stapler_shared::finance::derive_biller(biller, &provider)
}
