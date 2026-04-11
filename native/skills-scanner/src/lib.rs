//! `skills-scanner` — Phase 1 Rust port of the filesystem layer in
//! `server/src/services/company-skills.ts`.
//!
//! ## Phase 1 scope (correctness + benchmark)
//!
//! Ports the pure-computation and FS-heavy operations for **local-path** skills:
//!
//! | TypeScript function                        | Rust location                              |
//! |--------------------------------------------|--------------------------------------------|
//! | `hashSkillValue`                           | `hash::hash_skill_value`                   |
//! | `classifyInventoryKind`                    | `classify::classify_inventory_kind`        |
//! | `deriveTrustLevel`                         | `classify::derive_trust_level`             |
//! | `normalizePortablePath`                    | `classify::normalize_portable_path`        |
//! | `parseFrontmatterMarkdown`                 | `frontmatter::parse_frontmatter_markdown`  |
//! | `normalizeAgentUrlKey`                     | `slug::normalize_agent_url_key`            |
//! | `normalizeSkillSlug`                       | `slug::normalize_skill_slug`               |
//! | `deriveImportedSkillSlug`                  | `slug::derive_imported_skill_slug`         |
//! | `deriveCanonicalSkillKey`                  | `slug::derive_canonical_skill_key`         |
//! | `walkLocalFiles`                           | `scan::walk_local_files` (private)         |
//! | `collectLocalSkillInventory`               | `scan::collect_local_skill_inventory`      |
//! | `readLocalSkillImportFromDirectory`        | `scan::read_local_skill_import_from_directory` |
//! | `discoverProjectWorkspaceSkillDirectories` | `scan::discover_project_workspace_skill_directories` |
//! | scan loop                                  | `scan::scan_workspace_skills`              |
//!
//! ## Not yet ported (Phase 2+)
//!
//! - `napi-rs` wrapper / `.node` native module
//! - `packages/skills-scanner-native` pnpm package
//! - GitHub / skills.sh / URL source types in `derive_canonical_skill_key`
//! - Database writes (stays in TypeScript permanently)
//! - Heartbeat orchestration (separate crate)
//! - `company-skills.ts` integration point

pub mod classify;
pub mod frontmatter;
pub mod hash;
pub mod scan;
pub mod slug;
pub mod types;
