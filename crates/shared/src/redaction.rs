//! Log redaction utilities ported from TypeScript.

use regex::Regex;

/// Redacts a username by masking it with asterisks, preserving the first character.
/// 
/// Mirrors `maskUserNameForLogs` from TypeScript.
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

/// Redacts user-specific text (usernames and home directories) from a string.
/// 
/// Mirrors `redactCurrentUserText` from TypeScript.
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

    // Redact home directories (longest first to avoid partial matches)
    let mut sorted_home_dirs = home_dirs.to_vec();
    sorted_home_dirs.sort_by(|a, b| b.len().cmp(&a.len()));

    for home_dir in sorted_home_dirs {
        if home_dir.is_empty() {
            continue;
        }
        
        // Find the last segment for masking
        let normalized = home_dir.trim_end_matches(|c| c == '/' || c == '\\');
        let last_segment = normalized
            .split(|c| c == '/' || c == '\\')
            .last()
            .unwrap_or("");
            
        let replacement_val = if !last_segment.is_empty() {
            let masked_name = mask_user_name_for_logs(last_segment, replacement);
            // Reconstruct the path with the masked segment
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

    // Redact usernames with word boundary equivalent regex
    let mut sorted_user_names = user_names.to_vec();
    sorted_user_names.sort_by(|a, b| b.len().cmp(&a.len()));

    for user_name in sorted_user_names {
        if user_name.is_empty() {
            continue;
        }

        let escaped = regex::escape(&user_name);
        let masked = mask_user_name_for_logs(&user_name, replacement);
        
        // Since we can't use look-behind in `regex` crate, we'll use a manual replacement
        // or a regex that captures the surrounding context.
        let re = Regex::new(&format!(r"([^A-Za-z0-9._-]|^){}([^A-Za-z0-9._-]|$) ", escaped)).unwrap();
        
        // We need to preserve the surrounding characters
        let mut new_result = String::with_capacity(result.len());
        let mut last_end = 0;
        for cap in re.captures_iter(&result) {
            let m = cap.get(0).unwrap();
            new_result.push_str(&result[last_end..m.start()]);
            
            let prefix = cap.get(1).map_or("", |c| c.as_str());
            let suffix = cap.get(2).map_or("", |c| c.as_str());
            
            new_result.push_str(prefix);
            new_result.push_str(&masked);
            new_result.push_str(suffix);
            
            last_end = m.end();
        }
        new_result.push_str(&result[last_end..]);
        result = new_result;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_user_name() {
        assert_eq!(mask_user_name_for_logs("kangnam", "*"), "k******");
        assert_eq!(mask_user_name_for_logs("a", "*"), "a*");
        assert_eq!(mask_user_name_for_logs("", "fallback"), "fallback");
    }

    #[test]
    fn test_redact_current_user_text() {
        let input = "Hello kangnam, your home is /Users/kangnam/projects";
        let user_names = vec!["kangnam".to_string()];
        let home_dirs = vec!["/Users/kangnam".to_string()];
        let replacement = "*";
        
        let redacted = redact_current_user_text(input, &user_names, &home_dirs, replacement);
        // Should redact /Users/kangnam first to /Users/k******
        // Then redact kangnam (standalone) to k******
        assert!(redacted.contains("/Users/k******"));
        assert!(redacted.contains("Hello k******"));
    }
}
