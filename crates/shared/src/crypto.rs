//! Cryptographic utilities: SHA-256, HMAC-SHA256, timing-safe comparison,
//! base64url, AES-256-GCM authenticated encryption, cryptographic RNG, and
//! streaming SHA-256 file hashing.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;
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
        <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC-SHA256 accepts any key length");
    mac.update(data);
    hex::encode(mac.finalize().into_bytes())
}

/// Computes HMAC-SHA256 and returns the result as a base64url (no padding) string.
///
/// Mirrors `createHmac("sha256", key).update(data).digest("base64url")`.
#[must_use]
pub fn hmac_sha256_base64url(key: &[u8], data: &[u8]) -> String {
    let mut mac =
        <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC-SHA256 accepts any key length");
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

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

/// Fixed AES-GCM authentication tag length in bytes. Matches Node's
/// `aes-256-gcm` default (the only value the current codebase writes).
pub const AES_GCM_TAG_LEN: usize = 16;

/// AES-256-GCM encrypt. Returns `(ciphertext, auth_tag)` separately so the
/// caller can persist them as distinct fields (matching the
/// `LocalEncryptedMaterial` shape in `local-encrypted-provider.ts`).
///
/// Returns `None` if `key.len() != 32` or `iv.len() != 12`, or on any
/// AEAD failure (in practice: impossible for encrypt with a valid key/nonce).
#[must_use]
pub fn aes256_gcm_encrypt(
    key: &[u8],
    iv: &[u8],
    plaintext: &[u8],
) -> Option<(Vec<u8>, Vec<u8>)> {
    if key.len() != 32 || iv.len() != 12 {
        return None;
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(iv);
    let mut combined = cipher
        .encrypt(nonce, Payload { msg: plaintext, aad: &[] })
        .ok()?;
    // `aes-gcm` appends a 16-byte tag to the ciphertext. Split the tail
    // off so callers see the same `(ciphertext, tag)` split Node's
    // `cipher.getAuthTag()` produces.
    let tag_start = combined.len().checked_sub(AES_GCM_TAG_LEN)?;
    let tag = combined.split_off(tag_start);
    Some((combined, tag))
}

/// AES-256-GCM decrypt. `ciphertext` and `tag` are supplied separately
/// (matching the `LocalEncryptedMaterial` on-disk layout).
///
/// Returns `None` on auth-tag mismatch, invalid key/iv/tag length, or any
/// other AEAD failure.
#[must_use]
pub fn aes256_gcm_decrypt(
    key: &[u8],
    iv: &[u8],
    ciphertext: &[u8],
    tag: &[u8],
) -> Option<Vec<u8>> {
    if key.len() != 32 || iv.len() != 12 || tag.len() != AES_GCM_TAG_LEN {
        return None;
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(iv);
    let mut combined = Vec::with_capacity(ciphertext.len() + tag.len());
    combined.extend_from_slice(ciphertext);
    combined.extend_from_slice(tag);
    cipher
        .decrypt(nonce, Payload { msg: &combined, aad: &[] })
        .ok()
}

// ---------------------------------------------------------------------------
// Cryptographic RNG
// ---------------------------------------------------------------------------

/// Returns `len` cryptographically secure random bytes from the OS CSPRNG.
///
/// Panics only if the OS entropy source is unavailable (mirrors Node's
/// behavior of throwing on `ENOBUFS`/entropy-pool failures).
#[must_use]
pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    getrandom::getrandom(&mut buf).expect("OS CSPRNG unavailable");
    buf
}

// ---------------------------------------------------------------------------
// Streaming SHA-256 file hash
// ---------------------------------------------------------------------------

/// Streams a file through SHA-256 with a 64 KiB read buffer and returns the
/// lowercase hex digest. Mirrors the inline helpers in `run-log-store.ts`
/// and `workspace-operation-log-store.ts`.
pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
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

    // -- AES-256-GCM -------------------------------------------------------

    #[test]
    fn aes_gcm_round_trip() {
        let key = [0x42u8; 32];
        let iv = [0x24u8; 12];
        let plaintext = b"hello world, this is a secret";
        let (ciphertext, tag) = aes256_gcm_encrypt(&key, &iv, plaintext).unwrap();
        assert_eq!(tag.len(), AES_GCM_TAG_LEN);
        let recovered = aes256_gcm_decrypt(&key, &iv, &ciphertext, &tag).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn aes_gcm_known_vector() {
        // NIST GCM Test Case 13: 256-bit zero key, 96-bit zero IV, empty plaintext.
        // Expected tag: 530f8afbc74536b9a963b4f1c4cb738b
        let key = [0u8; 32];
        let iv = [0u8; 12];
        let (ciphertext, tag) = aes256_gcm_encrypt(&key, &iv, b"").unwrap();
        assert!(ciphertext.is_empty());
        assert_eq!(hex::encode(&tag), "530f8afbc74536b9a963b4f1c4cb738b");
    }

    #[test]
    fn aes_gcm_tamper_detection() {
        let key = [0x01u8; 32];
        let iv = [0x02u8; 12];
        let (mut ciphertext, tag) = aes256_gcm_encrypt(&key, &iv, b"tamper me").unwrap();
        ciphertext[0] ^= 0x01; // flip a bit
        assert!(aes256_gcm_decrypt(&key, &iv, &ciphertext, &tag).is_none());
    }

    #[test]
    fn aes_gcm_tag_tamper_detection() {
        let key = [0x03u8; 32];
        let iv = [0x04u8; 12];
        let (ciphertext, mut tag) = aes256_gcm_encrypt(&key, &iv, b"also tamper").unwrap();
        tag[0] ^= 0x01;
        assert!(aes256_gcm_decrypt(&key, &iv, &ciphertext, &tag).is_none());
    }

    #[test]
    fn aes_gcm_wrong_key_size() {
        let key = [0u8; 16]; // AES-128 key rejected for 256-GCM
        let iv = [0u8; 12];
        assert!(aes256_gcm_encrypt(&key, &iv, b"x").is_none());
        assert!(aes256_gcm_decrypt(&key, &iv, b"", &[0u8; AES_GCM_TAG_LEN]).is_none());
    }

    #[test]
    fn aes_gcm_wrong_iv_size() {
        let key = [0u8; 32];
        let iv = [0u8; 8]; // not 12
        assert!(aes256_gcm_encrypt(&key, &iv, b"x").is_none());
    }

    #[test]
    fn aes_gcm_wrong_tag_size() {
        let key = [0u8; 32];
        let iv = [0u8; 12];
        let (ciphertext, tag) = aes256_gcm_encrypt(&key, &iv, b"x").unwrap();
        // Truncate tag to 8 bytes — must be rejected before calling AEAD.
        assert!(aes256_gcm_decrypt(&key, &iv, &ciphertext, &tag[..8]).is_none());
    }

    // -- random_bytes ------------------------------------------------------

    #[test]
    fn random_bytes_length() {
        assert_eq!(random_bytes(32).len(), 32);
        assert_eq!(random_bytes(0).len(), 0);
        assert_eq!(random_bytes(1).len(), 1);
    }

    #[test]
    fn random_bytes_varies() {
        // Two independent 32-byte draws must differ with overwhelming probability.
        let a = random_bytes(32);
        let b = random_bytes(32);
        assert_ne!(a, b);
    }

    // -- sha256_file -------------------------------------------------------

    #[test]
    fn sha256_file_matches_string_hash() {
        use std::io::Write;

        let dir = std::env::temp_dir();
        let path = dir.join(format!(
            "stapler-shared-sha256-file-{}.txt",
            std::process::id()
        ));
        let contents = b"the quick brown fox jumps over the lazy dog";
        {
            let mut f = File::create(&path).unwrap();
            f.write_all(contents).unwrap();
        }
        let file_hash = sha256_file(&path).unwrap();
        let mem_hash = sha256_hex_bytes(contents);
        assert_eq!(file_hash, mem_hash);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn sha256_file_empty() {
        use std::io::Write;

        let dir = std::env::temp_dir();
        let path = dir.join(format!(
            "stapler-shared-sha256-file-empty-{}.txt",
            std::process::id()
        ));
        {
            let mut f = File::create(&path).unwrap();
            f.write_all(b"").unwrap();
        }
        let file_hash = sha256_file(&path).unwrap();
        assert_eq!(
            file_hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn sha256_file_missing_path() {
        let missing = std::env::temp_dir().join("stapler-does-not-exist-xyz-9f9f9f.bin");
        assert!(sha256_file(&missing).is_err());
    }
}
