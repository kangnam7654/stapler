//! Attachment content-type configuration and matching utilities.

pub const DEFAULT_ALLOWED_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/markdown",
    "text/plain",
    "application/json",
    "text/csv",
    "text/html",
];

/// Parse a comma-separated list of MIME type patterns into a normalized array.
/// Returns the default allowed types when the input is empty or None.
#[must_use]
pub fn parse_allowed_types(raw: Option<String>) -> Vec<String> {
    let s = match raw {
        Some(val) => val,
        None => return DEFAULT_ALLOWED_TYPES.iter().map(|&s| s.to_string()).collect(),
    };

    let parsed: Vec<String> = s
        .split(',')
        .map(|segment| segment.trim().to_lowercase())
        .filter(|segment| !segment.is_empty())
        .collect();

    if parsed.is_empty() {
        DEFAULT_ALLOWED_TYPES.iter().map(|&s| s.to_string()).collect()
    } else {
        parsed
    }
}

/// Check whether `content_type` matches any entry in `allowed_patterns`.
///
/// Supports exact matches and wildcard / prefix patterns ("*", "image/*", "text.*").
///
/// **Note**: The `"*"` wildcard accepts all MIME types. Callers accepting
/// user-supplied patterns should validate or reject `"*"` at the API layer
/// if unrestricted content types are not desired.
#[must_use]
pub fn matches_content_type(content_type: &str, allowed_patterns: &[String]) -> bool {
    let ct = content_type.to_lowercase();
    allowed_patterns.iter().any(|pattern| {
        if pattern == "*" {
            return true;
        }
        if pattern.ends_with("/*") || pattern.ends_with(".*") {
            // Match the prefix including the separator
            return ct.starts_with(&pattern[..pattern.len() - 1]);
        }
        ct == *pattern
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_allowed_types() {
        assert_eq!(parse_allowed_types(None).len(), DEFAULT_ALLOWED_TYPES.len());
        assert_eq!(parse_allowed_types(Some("".into())).len(), DEFAULT_ALLOWED_TYPES.len());
        assert_eq!(parse_allowed_types(Some("IMAGE/PNG , application/PDF".into())), vec!["image/png", "application/pdf"]);
    }

    #[test]
    fn test_matches_content_type() {
        let patterns = vec!["image/*".to_string(), "application/pdf".to_string(), "text.*".to_string()];

        assert!(matches_content_type("image/png", &patterns));
        assert!(matches_content_type("image/JPEG", &patterns));
        assert!(matches_content_type("application/pdf", &patterns));
        assert!(matches_content_type("text.plain", &patterns));

        assert!(!matches_content_type("application/json", &patterns));
        assert!(!matches_content_type("text/markdown", &patterns)); // Note: text.* only matches with dot
    }

    #[test]
    fn test_wildcard_all() {
        let patterns = vec!["*".to_string()];
        assert!(matches_content_type("any/thing", &patterns));
    }
}
