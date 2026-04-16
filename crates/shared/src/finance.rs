//! Finance and cost calculation utilities ported from TypeScript.

/// Normalizes a currency code to uppercase.
///
/// Mirrors the transform logic in `finance.ts`.
#[must_use]
pub fn normalize_currency(code: &str) -> String {
    code.trim().to_uppercase()
}

/// Derives the biller name, falling back to the provider if not explicitly provided.
///
/// Mirrors the transform logic in `cost.ts`.
#[must_use]
pub fn derive_biller(biller: Option<String>, provider: &str) -> String {
    match biller {
        Some(b) => {
            let trimmed = b.trim();
            if trimmed.is_empty() {
                provider.trim().to_string()
            } else {
                trimmed.to_string()
            }
        }
        None => provider.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_currency() {
        assert_eq!(normalize_currency("usd"), "USD");
        assert_eq!(normalize_currency("  Krw  "), "KRW");
    }

    #[test]
    fn test_derive_biller() {
        assert_eq!(derive_biller(Some("MyBiller".into()), "MyProvider"), "MyBiller");
        assert_eq!(derive_biller(None, "MyProvider"), "MyProvider");
        assert_eq!(derive_biller(Some("  ".into()), "MyProvider"), "MyProvider");
    }
}
