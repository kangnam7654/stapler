//! Cryptographic utilities: SHA-256, HMAC-SHA256, timing-safe comparison, base64url.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

/// Computes HMAC-SHA256 and returns the result as a hex string.
///
/// Mirrors `createHmac("sha256", key).update(data).digest("hex")`.
#[must_use]
pub fn hmac_sha256_hex(key: &[u8], data: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC-SHA256 accepts any key length");
    mac.update(data);
    hex::encode(mac.finalize().into_bytes())
}

/// Computes HMAC-SHA256 and returns the result as a base64url (no padding) string.
///
/// Mirrors `createHmac("sha256", key).update(data).digest("base64url")`.
#[must_use]
pub fn hmac_sha256_base64url(key: &[u8], data: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC-SHA256 accepts any key length");
    mac.update(data);
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

/// Constant-time equality comparison for two byte slices.
///
/// Returns `false` if lengths differ. Uses the `subtle` crate for
/// constant-time byte comparison to prevent timing side-channels.
#[must_use]
pub fn timing_safe_equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.ct_eq(b).into()
}

// ---------------------------------------------------------------------------
// Base64url (RFC 4648 §5, no padding)
// ---------------------------------------------------------------------------

/// Encodes raw bytes to base64url (no padding).
///
/// Mirrors `Buffer.from(data).toString("base64url")`.
#[must_use]
pub fn base64url_encode(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

/// Decodes a base64url (no padding) string to raw bytes.
///
/// Returns `None` on invalid input.
/// Mirrors `Buffer.from(encoded, "base64url")`.
#[must_use]
pub fn base64url_decode(encoded: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(encoded).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- SHA-256 -----------------------------------------------------------

    #[test]
    fn sha256_hex_known_vector() {
        assert_eq!(
            sha256_hex("hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn sha256_hex_empty() {
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

    // -- HMAC-SHA256 -------------------------------------------------------

    #[test]
    fn hmac_sha256_hex_known_vector() {
        // RFC 4231 Test Case 2: key = "Jefe", data = "what do ya want for nothing?"
        let result = hmac_sha256_hex(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            result,
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn hmac_sha256_base64url_roundtrip() {
        let hex_result = hmac_sha256_hex(b"secret", b"data");
        let b64_result = hmac_sha256_base64url(b"secret", b"data");
        // Decode base64url and re-encode as hex to verify consistency
        let decoded = base64url_decode(&b64_result).unwrap();
        assert_eq!(hex::encode(decoded), hex_result);
    }

    // -- timing_safe_equal -------------------------------------------------

    #[test]
    fn timing_safe_equal_same() {
        assert!(timing_safe_equal(b"hello", b"hello"));
    }

    #[test]
    fn timing_safe_equal_different() {
        assert!(!timing_safe_equal(b"hello", b"world"));
    }

    #[test]
    fn timing_safe_equal_different_lengths() {
        assert!(!timing_safe_equal(b"short", b"longer"));
    }

    #[test]
    fn timing_safe_equal_empty() {
        assert!(timing_safe_equal(b"", b""));
    }

    // -- base64url ---------------------------------------------------------

    #[test]
    fn base64url_encode_known_vector() {
        // "Hello" → "SGVsbG8"
        assert_eq!(base64url_encode(b"Hello"), "SGVsbG8");
    }

    #[test]
    fn base64url_roundtrip() {
        let original = b"test data with special chars: +/=";
        let encoded = base64url_encode(original);
        let decoded = base64url_decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn base64url_decode_invalid() {
        assert!(base64url_decode("!!!invalid!!!").is_none());
    }

    #[test]
    fn base64url_no_padding() {
        // Verify no '=' padding characters
        let encoded = base64url_encode(b"a");
        assert!(!encoded.contains('='));
    }
}
