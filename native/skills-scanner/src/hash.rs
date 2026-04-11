//! SHA-256 helpers.
//!
//! Mirrors the TypeScript `hashSkillValue` function in company-skills.ts:
//!   `createHash("sha256").update(value).digest("hex").slice(0, 10)`

use sha2::{Digest, Sha256};

/// Returns the first 10 hex characters of the SHA-256 hash of `input`.
/// Matches TS: `createHash("sha256").update(value).digest("hex").slice(0, 10)`
pub fn hash_skill_value(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)[..10].to_string()
}

/// SHA-256 over raw bytes (for file content).
pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    hex::encode(result)[..10].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_length_is_ten() {
        assert_eq!(hash_skill_value("hello").len(), 10);
        assert_eq!(hash_skill_value("").len(), 10);
    }

    #[test]
    fn hash_is_deterministic() {
        assert_eq!(hash_skill_value("paperclip"), hash_skill_value("paperclip"));
    }

    #[test]
    fn hash_differs_for_different_inputs() {
        assert_ne!(hash_skill_value("a"), hash_skill_value("b"));
    }
}
