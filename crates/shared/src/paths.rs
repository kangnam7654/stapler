//! Path sanitization and expansion utilities ported from TypeScript.

/// Sanitizes a string for use as a "friendly" path segment.
///
/// Mirrors `sanitizeFriendlyPathSegment` from `server/src/home-paths.ts`.
///
/// Logic:
/// 1. Trim whitespace.
/// 2. Replace characters NOT in [a-zA-Z0-9._-] with a single dash.
/// 3. Trim leading and trailing dashes.
/// 4. Reject literal "." or ".." to prevent path traversal.
/// 5. Return fallback if the result is empty.
#[must_use]
pub fn sanitize_friendly_path_segment(value: Option<String>, fallback: &str) -> String {
    let s = match value {
        Some(v) => v.trim().to_string(),
        None => return fallback.to_string(),
    };

    if s.is_empty() {
        return fallback.to_string();
    }

    let mut result = String::with_capacity(s.len());
    let mut last_was_dash = true; // Start true to suppress leading dashes

    for c in s.chars() {
        let is_allowed = c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-';
        if is_allowed {
            if c == '-' {
                if !last_was_dash {
                    result.push('-');
                    last_was_dash = true;
                }
            } else {
                result.push(c);
                last_was_dash = false;
            }
        } else if !last_was_dash {
            result.push('-');
            last_was_dash = true;
        }
    }

    // Remove trailing dash
    if result.ends_with('-') {
        result.pop();
    }

    // Reject path traversal segments and empty results
    if result.is_empty() || result == ".." || result == "." {
        fallback.to_string()
    } else {
        result
    }
}

/// Expands a home directory prefix (~) in a path string.
///
/// Mirrors `expandHomePrefix` from `server/src/home-paths.ts`.
///
/// Logic:
/// 1. If path is exactly "~", return home_dir.
/// 2. If path starts with "~/", return home_dir joined with the rest.
/// 3. Reject suffixes containing ".." path traversal components.
/// 4. Otherwise return path as is.
#[must_use]
pub fn expand_home_prefix(path: &str, home_dir: &str) -> String {
    if path == "~" {
        return home_dir.to_string();
    }
    if path.starts_with("~/") || path.starts_with("~\\") {
        let suffix = &path[2..];

        // Reject path traversal: suffix must not contain ".." as a path component
        if suffix.split(['/', '\\']).any(|seg| seg == "..") {
            return path.to_string();
        }

        let mut result = home_dir.trim_end_matches(['/', '\\']).to_string();

        // Ensure separator
        if !result.is_empty() {
            #[cfg(windows)]
            result.push('\\');
            #[cfg(not(windows))]
            result.push('/');
        }

        result.push_str(suffix);
        return result;
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_friendly_path_segment() {
        assert_eq!(sanitize_friendly_path_segment(Some("Hello World".into()), "def"), "Hello-World");
        assert_eq!(sanitize_friendly_path_segment(Some("  foo_bar.baz  ".into()), "def"), "foo_bar.baz");
        assert_eq!(sanitize_friendly_path_segment(Some("!!!".into()), "def"), "def");
        assert_eq!(sanitize_friendly_path_segment(None, "def"), "def");
        assert_eq!(sanitize_friendly_path_segment(Some("---a---".into()), "def"), "a");
    }

    #[test]
    fn test_sanitize_rejects_path_traversal() {
        // ".." as sole result should return fallback
        assert_eq!(sanitize_friendly_path_segment(Some("..".into()), "def"), "def");
        // "." as sole result should return fallback
        assert_eq!(sanitize_friendly_path_segment(Some(".".into()), "def"), "def");
        // "..foo" is safe — not a traversal segment
        assert_eq!(sanitize_friendly_path_segment(Some("..foo".into()), "def"), "..foo");
    }

    #[test]
    fn test_expand_home_prefix() {
        let home = "/Users/test";
        assert_eq!(expand_home_prefix("~", home), "/Users/test");

        #[cfg(not(windows))]
        assert_eq!(expand_home_prefix("~/projects", home), "/Users/test/projects");

        assert_eq!(expand_home_prefix("/abs/path", home), "/abs/path");
    }

    #[test]
    fn test_expand_home_prefix_rejects_traversal() {
        let home = "/Users/test";
        // Path traversal should return the unexpanded path
        assert_eq!(expand_home_prefix("~/../../../etc/passwd", home), "~/../../../etc/passwd");
        assert_eq!(expand_home_prefix("~/foo/../bar", home), "~/foo/../bar");
        // Normal paths should still work
        assert_eq!(expand_home_prefix("~/my..file", home), "/Users/test/my..file");
    }
}
