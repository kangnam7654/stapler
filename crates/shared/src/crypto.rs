//! Cryptographic hashing utilities.
//!
//! Provides SHA-256 hex digest functions used for token hashing,
//! content addressing, and other non-secret hashing operations.

use sha2::{Digest, Sha256};

/// Returns the full hex-encoded SHA-256 hash of a UTF-8 string.
///
/// Used for API key hashing, token verification, and content addressing.
/// Mirrors `createHash("sha256").update(value).digest("hex")` in TypeScript.
#[must_use]
pub fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

/// Returns the full hex-encoded SHA-256 hash of raw bytes.
#[must_use]
pub fn sha256_hex_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_hex_known_vector() {
        // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        assert_eq!(
            sha256_hex("hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn sha256_hex_empty() {
        // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        assert_eq!(
            sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sha256_hex_bytes_matches_string() {
        assert_eq!(sha256_hex("test"), sha256_hex_bytes(b"test"));
    }

    #[test]
    fn sha256_hex_length_is_64() {
        assert_eq!(sha256_hex("anything").len(), 64);
    }
}
