//! Skill slug and canonical key derivation.
//!
//! Ports the following TypeScript functions from
//! `server/src/services/company-skills.ts` and
//! `packages/shared/src/agent-url-key.ts`:
//!
//! | TypeScript function          | Rust function                     |
//! |------------------------------|-----------------------------------|
//! | `normalizeAgentUrlKey`       | `normalize_agent_url_key`         |
//! | `normalizeSkillSlug`         | `normalize_skill_slug`            |
//! | `normalizeSkillKey`          | `normalize_skill_key`             |
//! | `deriveImportedSkillSlug`    | `derive_imported_skill_slug`      |
//! | `readCanonicalSkillKey`      | `read_canonical_skill_key`        |
//! | `deriveCanonicalSkillKey`    | `derive_canonical_skill_key`      |
//!
//! Phase 1 supports `local_path` source type only.
//! GitHub / skills_sh / url branches are stubbed with TODO(phase 2).

use serde_json::Value;
use std::collections::HashMap;

use crate::hash::hash_skill_value;

// ── normalizeAgentUrlKey ───────────────────────────────────────────────────
//
// TS: value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
// Returns None for empty / non-string input.

/// Mirrors `normalizeAgentUrlKey` from `packages/shared/src/agent-url-key.ts`.
pub fn normalize_agent_url_key(value: &str) -> Option<String> {
    stapler_shared::validators::normalize_url_key(value)
}

// ── normalizeSkillSlug / normalizeSkillKey ─────────────────────────────────

/// Mirrors `normalizeSkillSlug` (company-skills.ts:180).
pub fn normalize_skill_slug(value: Option<&str>) -> Option<String> {
    value.and_then(normalize_agent_url_key)
}

/// Mirrors `normalizeSkillKey` (company-skills.ts:184).
/// Splits by `/`, normalises each segment, and re-joins.
pub fn normalize_skill_key(value: Option<&str>) -> Option<String> {
    let v = value?;
    let segments: Vec<String> = v
        .split('/')
        .filter_map(|seg| normalize_skill_slug(Some(seg)))
        .collect();
    if segments.is_empty() { None } else { Some(segments.join("/")) }
}

// ── deriveImportedSkillSlug ────────────────────────────────────────────────

/// Mirrors `deriveImportedSkillSlug` (company-skills.ts:656).
///
/// Prefers `frontmatter.slug`, then `frontmatter.name`, then normalised
/// fallback dir name, then the literal `"skill"`.
pub fn derive_imported_skill_slug(
    frontmatter: &serde_json::Map<String, Value>,
    fallback: &str,
) -> String {
    let as_str = |key: &str| -> Option<&str> {
        match frontmatter.get(key) {
            Some(Value::String(s)) => {
                let t = s.trim();
                if t.is_empty() { None } else { Some(t) }
            }
            _ => None,
        }
    };

    normalize_skill_slug(as_str("slug"))
        .or_else(|| normalize_skill_slug(as_str("name")))
        .or_else(|| normalize_agent_url_key(fallback))
        .unwrap_or_else(|| "skill".to_string())
}

// ── readCanonicalSkillKey ──────────────────────────────────────────────────

fn as_str_val(v: &Value) -> Option<&str> {
    match v {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t) }
        }
        _ => None,
    }
}

/// Mirrors `readCanonicalSkillKey` (company-skills.ts:237).
///
/// Looks for a canonical key in frontmatter or nested metadata, in priority
/// order: `key`, `skillKey`, `metadata.skillKey`, `metadata.canonicalKey`,
/// `metadata.paperclipSkillKey`, `metadata.paperclip.skillKey`,
/// `metadata.paperclip.key`.
pub fn read_canonical_skill_key(
    frontmatter: &serde_json::Map<String, Value>,
    metadata: Option<&serde_json::Map<String, Value>>,
) -> Option<String> {
    // Direct frontmatter keys
    let candidates: [Option<&str>; 3] = [
        frontmatter.get("key").and_then(|v| as_str_val(v)),
        frontmatter.get("skillKey").and_then(|v| as_str_val(v)),
        frontmatter.get("skill_key").and_then(|v| as_str_val(v)),
    ];
    for candidate in candidates.iter().filter_map(|c| *c) {
        if let Some(k) = normalize_skill_key(Some(candidate)) {
            return Some(k);
        }
    }

    // metadata object candidates
    if let Some(meta) = metadata {
        let meta_candidates: [Option<&str>; 4] = [
            meta.get("skillKey").and_then(|v| as_str_val(v)),
            meta.get("canonicalKey").and_then(|v| as_str_val(v)),
            meta.get("paperclipSkillKey").and_then(|v| as_str_val(v)),
            meta.get("skill_key").and_then(|v| as_str_val(v)),
        ];
        for candidate in meta_candidates.iter().filter_map(|c| *c) {
            if let Some(k) = normalize_skill_key(Some(candidate)) {
                return Some(k);
            }
        }

        // metadata.paperclip.skillKey / metadata.paperclip.key
        if let Some(Value::Object(paperclip)) = meta.get("paperclip") {
            for key in &["skillKey", "key"] {
                if let Some(candidate) = paperclip.get(*key).and_then(|v| as_str_val(v)) {
                    if let Some(k) = normalize_skill_key(Some(candidate)) {
                        return Some(k);
                    }
                }
            }
        }
    }

    None
}

// ── deriveCanonicalSkillKey ────────────────────────────────────────────────

/// Source type for key derivation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceType {
    LocalPath,
    // TODO(phase 2): GitHub, Url, SkillsSh
}

/// Mirrors `deriveCanonicalSkillKey` (company-skills.ts:253).
///
/// Phase 1 implements the `local_path` branch only.
pub fn derive_canonical_skill_key(
    company_id: &str,
    slug: &str,
    source_type: SourceType,
    source_locator: Option<&str>,
    metadata: Option<&serde_json::Map<String, Value>>,
) -> String {
    // Check for explicit canonical key in metadata first
    if let Some(meta) = metadata {
        if let Some(explicit) = read_canonical_skill_key(&serde_json::Map::new(), Some(meta)) {
            return explicit;
        }
        let source_kind = meta.get("sourceKind").and_then(|v| as_str_val(v));
        if source_kind == Some("paperclip_bundled") {
            return format!("paperclipai/paperclip/{slug}");
        }
        // TODO(phase 2): github / skills_sh / url source kinds
    }

    match source_type {
        SourceType::LocalPath => {
            // Mirrors TS: if sourceKind === "managed_local" → company/{companyId}/{slug}
            let source_kind = metadata
                .and_then(|m| m.get("sourceKind"))
                .and_then(|v| as_str_val(v));
            if source_kind == Some("managed_local") {
                return format!("company/{company_id}/{slug}");
            }
            if let Some(locator) = source_locator {
                return format!(
                    "local/{}/{slug}",
                    hash_skill_value(&std::fs::canonicalize(locator)
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|_| locator.to_string()))
                );
            }
            format!("company/{company_id}/{slug}")
        }
    }
}

/// Build the full merged metadata map for a local-path skill, mirroring the
/// TS logic in `readLocalSkillImportFromDirectory` (company-skills.ts:845-850).
///
/// Priority (later fields win):
///   1. `skillKey` from frontmatter key reading
///   2. parsed `frontmatter.metadata` object
///   3. `sourceKind: "local_path"` (always set)
///   4. `extra_metadata` override from the caller
pub fn build_local_path_metadata(
    frontmatter: &serde_json::Map<String, Value>,
    extra_metadata: Option<HashMap<String, Value>>,
) -> serde_json::Map<String, Value> {
    let mut merged: serde_json::Map<String, Value> = serde_json::Map::new();

    // 1. Explicit skill key from frontmatter
    let parsed_metadata = match frontmatter.get("metadata") {
        Some(Value::Object(m)) => Some(m.clone()),
        _ => None,
    };
    if let Some(skill_key) = read_canonical_skill_key(frontmatter, parsed_metadata.as_ref()) {
        merged.insert("skillKey".to_string(), Value::String(skill_key));
    }

    // 2. frontmatter.metadata entries
    if let Some(meta) = &parsed_metadata {
        for (k, v) in meta {
            merged.insert(k.clone(), v.clone());
        }
    }

    // 3. sourceKind fixed
    merged.insert("sourceKind".to_string(), Value::String("local_path".to_string()));

    // 4. extra_metadata overrides
    if let Some(extra) = extra_metadata {
        for (k, v) in extra {
            merged.insert(k, v);
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_agent_url_key_basic() {
        assert_eq!(normalize_agent_url_key("Hello World"), Some("hello-world".into()));
        assert_eq!(normalize_agent_url_key("  my-skill  "), Some("my-skill".into()));
        assert_eq!(normalize_agent_url_key("Find Skills!"), Some("find-skills".into()));
        assert_eq!(normalize_agent_url_key(""), None);
        assert_eq!(normalize_agent_url_key("---"), None);
    }

    #[test]
    fn normalize_skill_key_segments() {
        assert_eq!(
            normalize_skill_key(Some("owner/repo/skill name")),
            Some("owner/repo/skill-name".into())
        );
        assert_eq!(normalize_skill_key(None), None);
    }

    #[test]
    fn derive_imported_skill_slug_prefers_slug_over_name() {
        let mut fm = serde_json::Map::new();
        fm.insert("slug".into(), Value::String("my-slug".into()));
        fm.insert("name".into(), Value::String("My Name".into()));
        assert_eq!(derive_imported_skill_slug(&fm, "fallback"), "my-slug");
    }

    #[test]
    fn derive_imported_skill_slug_falls_back_to_name() {
        let mut fm = serde_json::Map::new();
        fm.insert("name".into(), Value::String("Find Skills".into()));
        assert_eq!(derive_imported_skill_slug(&fm, "dir-name"), "find-skills");
    }

    #[test]
    fn derive_imported_skill_slug_falls_back_to_dir() {
        let fm = serde_json::Map::new();
        assert_eq!(derive_imported_skill_slug(&fm, "release"), "release");
    }

    #[test]
    fn derive_canonical_key_local_path_with_locator() {
        // Locator that doesn't exist on disk → falls through to hash of the locator string.
        let key = derive_canonical_skill_key(
            "company123",
            "my-skill",
            SourceType::LocalPath,
            Some("/nonexistent/path/my-skill"),
            None,
        );
        assert!(key.starts_with("local/"), "got: {key}");
        assert!(key.ends_with("/my-skill"), "got: {key}");
    }

    #[test]
    fn derive_canonical_key_managed_local() {
        let mut meta = serde_json::Map::new();
        meta.insert("sourceKind".into(), Value::String("managed_local".into()));
        let key = derive_canonical_skill_key(
            "company123",
            "my-skill",
            SourceType::LocalPath,
            None,
            Some(&meta),
        );
        assert_eq!(key, "company/company123/my-skill");
    }
}
