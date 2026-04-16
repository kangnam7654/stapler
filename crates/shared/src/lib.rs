//! Shared types, validators, and constants for the Stapler control plane.
//!
//! This crate is the Rust equivalent of `packages/shared`.
//! Types will be ported incrementally in Phase 1.

/// Placeholder — will hold domain types (Company, Agent, Task, etc.)
pub mod types {}

/// Validators and normalization utilities.
pub mod validators;

/// Log redaction utilities.
pub mod redaction;

/// Project and agent mention processing.
pub mod mentions;

/// Attachment content-type utilities.
pub mod attachments;

/// Path utilities.
pub mod paths;

/// Finance and cost utilities.
pub mod finance;

/// Cryptographic hashing utilities.
pub mod crypto;

#[cfg(test)]
mod tests {
    #[test]
    fn shared_crate_compiles() {
        assert_eq!(
            crate::validators::normalize_url_key("smoke test"),
            Some("smoke-test".to_string())
        );
    }
}
