//! Shared types mirroring the TypeScript interfaces in
//! `packages/shared/src/types/company-skill.ts` and the internal
//! `ImportedSkill` type in `server/src/services/company-skills.ts`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Mirrors `CompanySkillFileInventoryEntry["kind"]` in TypeScript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileKind {
    Skill,
    Reference,
    Script,
    Asset,
    Markdown,
    Other,
}

/// Mirrors `CompanySkillTrustLevel` in TypeScript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustLevel {
    MarkdownOnly,
    Assets,
    ScriptsExecutables,
}

/// Inventory mode for a skill directory scan.
///
/// Mirrors `LocalSkillInventoryMode = "full" | "project_root"` in TS.
///
/// - `Full`: walk entire skill dir, skipping `.git`/`node_modules`.
/// - `ProjectRoot`: only walk `references/`, `scripts/`, `assets/` sub-dirs
///   (used when the workspace root itself is the skill).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InventoryMode {
    Full,
    ProjectRoot,
}

/// Mirrors `CompanySkillFileInventoryEntry` in TypeScript.
/// Fields are `{ path, kind }` only — no extra hash/size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileInventoryEntry {
    pub path: String,
    pub kind: FileKind,
}

/// One discovered skill directory with its inventory mode.
///
/// Mirrors the `{ skillDir, inventoryMode }` tuple returned by
/// `discoverProjectWorkspaceSkillDirectories` in TypeScript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSkill {
    pub skill_dir: String,
    pub inventory_mode: InventoryMode,
}

/// Full representation of an imported skill, mirroring the internal
/// `ImportedSkill` type in `server/src/services/company-skills.ts:38–52`.
///
/// Fields not derived from FS are omitted (e.g. `compatibility` is always
/// `"compatible"` for local-path skills and is set in the serialised form).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedSkill {
    pub key: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub markdown: String,
    pub package_dir: Option<String>,
    pub source_type: String,
    pub source_locator: Option<String>,
    pub source_ref: Option<String>,
    pub trust_level: TrustLevel,
    pub compatibility: String,
    pub file_inventory: Vec<FileInventoryEntry>,
    /// Merged metadata object — always `sourceKind: "local_path"` for Phase 1.
    pub metadata: Option<Value>,
}

/// Result returned by `scan_workspace_skills`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceScanResult {
    pub workspace_cwd: String,
    pub skills: Vec<ImportedSkill>,
    /// Warnings for skills that were discovered but could not be imported.
    #[serde(default)]
    pub warnings: Vec<String>,
}
