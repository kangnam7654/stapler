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
