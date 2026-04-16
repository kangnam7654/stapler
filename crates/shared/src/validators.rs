//! Validators and normalization utilities ported from TypeScript.

/// Normalizes a string to be used as a URL key (slug).
///
/// Mirrors `normalizeProjectUrlKey` and `normalizeAgentUrlKey` from TypeScript.
///
/// Logic:
/// 1. Trim whitespace.
/// 2. Convert to lowercase.
/// 3. Replace any sequence of non-alphanumeric characters with a single dash.
/// 4. Trim leading and trailing dashes.
/// 5. Return None if the result is empty.
#[must_use]
pub fn normalize_url_key(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut result = String::with_capacity(trimmed.len());
    let mut last_was_dash = true; // Start as true to suppress leading dashes

    for c in trimmed.chars() {
        if c.is_ascii_alphanumeric() {
            result.push(c.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            result.push('-');
            last_was_dash = true;
        }
    }

    // Remove trailing dash if present
    if result.ends_with('-') {
        result.pop();
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

/// Checks if a string looks like a UUID (v1-v5).
///
/// Mirrors the TypeScript `UUID_RE` which validates:
/// - 8-4-4-4-12 hex digit format
/// - Version digit at position 14 must be 1-5
/// - Variant nibble at position 19 must be 8, 9, a, or b
#[must_use]
pub fn is_uuid_like(value: &str) -> bool {
    let s = value.trim();
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    for (i, &byte) in bytes.iter().enumerate().take(36) {
        match i {
            8 | 13 | 18 | 23 => {
                if byte != b'-' {
                    return false;
                }
            }
            // Version digit: must be 1-5 (matching TS regex [1-5])
            14 => {
                if !matches!(byte, b'1'..=b'5') {
                    return false;
                }
            }
            // Variant nibble: must be 8, 9, a, or b (matching TS regex [89ab])
            19 => {
                if !matches!(byte, b'8' | b'9' | b'a' | b'b' | b'A' | b'B') {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_key() {
        assert_eq!(normalize_url_key("Hello World"), Some("hello-world".to_string()));
        assert_eq!(normalize_url_key("  Foo #! Bar  "), Some("foo-bar".to_string()));
        assert_eq!(normalize_url_key("---foo---"), Some("foo".to_string()));
        assert_eq!(normalize_url_key("a...b"), Some("a-b".to_string()));
        assert_eq!(normalize_url_key("123"), Some("123".to_string()));
        assert_eq!(normalize_url_key("   "), None);
        assert_eq!(normalize_url_key("!!!"), None);
    }

    #[test]
    fn test_is_uuid_like() {
        assert!(is_uuid_like("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_uuid_like("  550e8400-e29b-41d4-a716-446655440000  "));
        assert!(is_uuid_like("550E8400-E29B-41D4-A716-446655440000")); // case insensitive hex
        assert!(!is_uuid_like("550e8400-e29b-41d4-a716-44665544000")); // too short
        assert!(!is_uuid_like("550e8400-e29b-41d4-a716-4466554400001")); // too long
        assert!(!is_uuid_like("z50e8400-e29b-41d4-a716-446655440000")); // invalid hex
        assert!(!is_uuid_like("550e8400_e29b_41d4_a716_446655440000")); // invalid separator
    }

    #[test]
    fn test_uuid_version_check() {
        // Version 0 (invalid) at position 14
        assert!(!is_uuid_like("550e8400-e29b-01d4-a716-446655440000"));
        // Version 6+ (invalid) at position 14
        assert!(!is_uuid_like("550e8400-e29b-61d4-a716-446655440000"));
        // Versions 1-5 are valid
        assert!(is_uuid_like("550e8400-e29b-11d4-a716-446655440000")); // v1
        assert!(is_uuid_like("550e8400-e29b-21d4-a716-446655440000")); // v2
        assert!(is_uuid_like("550e8400-e29b-31d4-a716-446655440000")); // v3
        assert!(is_uuid_like("550e8400-e29b-41d4-a716-446655440000")); // v4
        assert!(is_uuid_like("550e8400-e29b-51d4-a716-446655440000")); // v5
    }

    #[test]
    fn test_uuid_variant_check() {
        // Variant 0 (invalid) at position 19
        assert!(!is_uuid_like("550e8400-e29b-41d4-0716-446655440000"));
        // Variant 7 (invalid)
        assert!(!is_uuid_like("550e8400-e29b-41d4-7716-446655440000"));
        // Valid variants: 8, 9, a, b
        assert!(is_uuid_like("550e8400-e29b-41d4-8716-446655440000"));
        assert!(is_uuid_like("550e8400-e29b-41d4-9716-446655440000"));
        assert!(is_uuid_like("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_uuid_like("550e8400-e29b-41d4-b716-446655440000"));
        assert!(is_uuid_like("550e8400-e29b-41d4-A716-446655440000")); // uppercase variant
        assert!(is_uuid_like("550e8400-e29b-41d4-B716-446655440000"));
    }
}
