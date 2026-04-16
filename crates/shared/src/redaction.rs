//! Log and payload redaction utilities ported from TypeScript.

use regex::Regex;
use serde_json::{Map, Value};
use std::sync::OnceLock;

pub const REDACTED_EVENT_VALUE: &str = "***REDACTED***";

static SECRET_PAYLOAD_KEY_RE: OnceLock<Regex> = OnceLock::new();
static JWT_VALUE_RE: OnceLock<Regex> = OnceLock::new();

fn get_secret_key_re() -> &'static Regex {
    SECRET_PAYLOAD_KEY_RE.get_or_init(|| {
        Regex::new(r"(?i)(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)").unwrap()
    })
}

fn get_jwt_value_re() -> &'static Regex {
    JWT_VALUE_RE.get_or_init(|| {
        Regex::new(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$").unwrap()
    })
}

/// Redacts a username by masking it with asterisks, preserving the first character.
pub fn mask_user_name_for_logs(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    
    let chars: Vec<char> = trimmed.chars().collect();
    let first = chars[0];
    let mask_len = (chars.len() - 1).max(1);
    format!("{}{}", first, "*".repeat(mask_len))
}

fn is_word_boundary_char(c: char) -> bool {
    !c.is_ascii_alphanumeric() && c != '.' && c != '_' && c != '-'
}

/// Redacts user-specific text (usernames and home directories) from a string.
pub fn redact_current_user_text(
    input: &str,
    user_names: &[String],
    home_dirs: &[String],
    replacement: &str,
) -> String {
    if input.is_empty() {
        return input.to_string();
    }

    let mut result = input.to_string();

    // 1. Redact home directories (longest first)
    let mut sorted_home_dirs = home_dirs.to_vec();
    sorted_home_dirs.sort_by(|a, b| b.len().cmp(&a.len()));

    for home_dir in sorted_home_dirs {
        if home_dir.is_empty() {
            continue;
        }
        
        let normalized = home_dir.trim_end_matches(|c| c == '/' || c == '\\');
        let last_segment = normalized
            .split(|c| c == '/' || c == '\\')
            .last()
            .unwrap_or("");
            
        let replacement_val = if !last_segment.is_empty() {
            let masked_name = mask_user_name_for_logs(last_segment, replacement);
            if let Some(pos) = normalized.rfind(|c| c == '/' || c == '\\') {
                format!("{}{}", &normalized[..pos + 1], masked_name)
            } else {
                masked_name
            }
        } else {
            replacement.to_string()
        };

        result = result.replace(&home_dir, &replacement_val);
    }

    // 2. Redact usernames with boundary checks
    let mut sorted_user_names = user_names.to_vec();
    sorted_user_names.sort_by(|a, b| b.len().cmp(&a.len()));

    for user_name in sorted_user_names {
        if user_name.is_empty() {
            continue;
        }

        let masked = mask_user_name_for_logs(&user_name, replacement);
        let mut new_result = String::with_capacity(result.len());
        let mut last_pos = 0;
        let mut search_pos = 0;

        while let Some(start_offset) = result[search_pos..].find(&user_name) {
            let start = search_pos + start_offset;
            let end = start + user_name.len();
            
            let before_ok = if start == 0 {
                true
            } else {
                let prev_char = result[..start].chars().last().unwrap();
                is_word_boundary_char(prev_char)
            };

            let after_ok = if end == result.len() {
                true
            } else {
                let next_char = result[end..].chars().next().unwrap();
                is_word_boundary_char(next_char)
            };

            if before_ok && after_ok {
                new_result.push_str(&result[last_pos..start]);
                new_result.push_str(&masked);
                last_pos = end;
                search_pos = end;
            } else {
                new_result.push_str(&result[last_pos..start + 1]);
                last_pos = start + 1;
                search_pos = start + 1;
            }
        }
        
        new_result.push_str(&result[last_pos..]);
        result = new_result;
    }

    result
}

/// Redacts sensitive information from an event payload.
/// 
/// Mirrors `redactEventPayload` from TypeScript.
pub fn redact_event_payload(payload: Option<Value>) -> Option<Value> {
    let p = payload?;
    if let Value::Object(map) = p {
        Some(Value::Object(sanitize_record(map)))
    } else {
        Some(p)
    }
}

pub fn sanitize_record(record: Map<String, Value>) -> Map<String, Value> {
    let mut redacted = Map::new();
    let secret_key_re = get_secret_key_re();
    let jwt_value_re = get_jwt_value_re();

    for (key, value) in record {
        if secret_key_re.is_match(&key) {
            if is_secret_ref_binding(&value) {
                redacted.insert(key, sanitize_value(value));
                continue;
            }
            if is_plain_binding(&value) {
                if let Value::Object(mut map) = value {
                    map.insert("value".to_string(), Value::String(REDACTED_EVENT_VALUE.to_string()));
                    redacted.insert(key, Value::Object(map));
                }
                continue;
            }
            redacted.insert(key, Value::String(REDACTED_EVENT_VALUE.to_string()));
            continue;
        }

        if let Value::String(ref s) = value {
            if jwt_value_re.is_match(s) {
                redacted.insert(key, Value::String(REDACTED_EVENT_VALUE.to_string()));
                continue;
            }
        }

        redacted.insert(key, sanitize_value(value));
    }
    redacted
}

fn sanitize_value(value: Value) -> Value {
    match value {
        Value::Null => Value::Null,
        Value::Bool(b) => Value::Bool(b),
        Value::Number(n) => Value::Number(n),
        Value::String(s) => Value::String(s),
        Value::Array(arr) => Value::Array(arr.into_iter().map(sanitize_value).collect()),
        Value::Object(map) => {
            if is_secret_ref_binding_obj(&map) {
                Value::Object(map)
            } else if is_plain_binding_obj(&map) {
                let mut new_map = Map::new();
                for (k, v) in map {
                    if k == "value" {
                        new_map.insert(k, sanitize_value(v));
                    } else {
                        new_map.insert(k, v);
                    }
                }
                Value::Object(new_map)
            } else {
                Value::Object(sanitize_record(map))
            }
        }
    }
}

fn is_secret_ref_binding(value: &Value) -> bool {
    if let Value::Object(map) = value {
        is_secret_ref_binding_obj(map)
    } else {
        false
    }
}

fn is_secret_ref_binding_obj(map: &Map<String, Value>) -> bool {
    map.get("type").and_then(|v| v.as_str()) == Some("secret_ref") && map.contains_key("secretId")
}

fn is_plain_binding(value: &Value) -> bool {
    if let Value::Object(map) = value {
        is_plain_binding_obj(map)
    } else {
        false
    }
}

fn is_plain_binding_obj(map: &Map<String, Value>) -> bool {
    map.get("type").and_then(|v| v.as_str()) == Some("plain") && map.contains_key("value")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mask_user_name() {
        assert_eq!(mask_user_name_for_logs("kangnam", "*"), "k******");
        assert_eq!(mask_user_name_for_logs("a", "*"), "a*");
        assert_eq!(mask_user_name_for_logs("", "fallback"), "fallback");
    }

    #[test]
    fn test_redact_current_user_text() {
        let input = "user paperclipuser said paperclipuser/project should stay but apaperclipuserz should not change";
        let user_names = vec!["paperclipuser".to_string()];
        let home_dirs = vec![];
        let replacement = "*";
        
        let redacted = redact_current_user_text(input, &user_names, &home_dirs, replacement);
        let masked = mask_user_name_for_logs("paperclipuser", "*");
        
        assert_eq!(
            redacted, 
            format!("user {} said {}/project should stay but apaperclipuserz should not change", masked, masked)
        );
    }

    #[test]
    fn test_redact_event_payload() {
        let payload = json!({
            "api_key": "sk-123456",
            "nested": {
                "password": "my-password",
                "normal": "value"
            },
            "array": [
                {"secret": "hidden"},
                "public"
            ],
            "jwt": "header.payload.signature"
        });

        let redacted = redact_event_payload(Some(payload)).unwrap();
        
        assert_eq!(redacted["api_key"], REDACTED_EVENT_VALUE);
        assert_eq!(redacted["nested"]["password"], REDACTED_EVENT_VALUE);
        assert_eq!(redacted["nested"]["normal"], "value");
        assert_eq!(redacted["array"][0]["secret"], REDACTED_EVENT_VALUE);
        assert_eq!(redacted["array"][1], "public");
        assert_eq!(redacted["jwt"], REDACTED_EVENT_VALUE);
    }

    #[test]
    fn test_redact_secret_bindings() {
        let payload = json!({
            "api_key": {
                "type": "secret_ref",
                "secretId": "id-123"
            },
            "auth_token": {
                "type": "plain",
                "value": "secret-token"
            }
        });

        let redacted = redact_event_payload(Some(payload)).unwrap();
        
        // secret_ref should be preserved
        assert_eq!(redacted["api_key"]["type"], "secret_ref");
        assert_eq!(redacted["api_key"]["secretId"], "id-123");
        
        // plain binding value should be redacted because "auth_token" matches regex
        assert_eq!(redacted["auth_token"]["type"], "plain");
        assert_eq!(redacted["auth_token"]["value"], REDACTED_EVENT_VALUE);
    }
}
