//! File kind classification.
//!
//! Mirrors `classifyInventoryKind` and `deriveTrustLevel` from company-skills.ts.

use crate::types::{FileKind, TrustLevel};

/// Returns the `FileKind` for a relative path inside a skill directory.
///
/// Mirrors TS `classifyInventoryKind(relativePath)`:
/// - `skill.md` (or path ending `/skill.md`) → `Skill`
/// - `references/**` → `Reference`
/// - `scripts/**` → `Script`
/// - `assets/**` → `Asset`
/// - `*.md` → `Markdown`
/// - script extensions (.sh .js .mjs .cjs .ts .py .rb .bash) → `Script`
/// - image/media extensions (.png .jpg .jpeg .gif .svg .webp .pdf) → `Asset`
/// - everything else → `Other`
pub fn classify_inventory_kind(relative_path: &str) -> FileKind {
    let normalized = normalize_portable_path(relative_path).to_lowercase();

    if normalized == "skill.md" || normalized.ends_with("/skill.md") {
        return FileKind::Skill;
    }
    if normalized.starts_with("references/") {
        return FileKind::Reference;
    }
    if normalized.starts_with("scripts/") {
        return FileKind::Script;
    }
    if normalized.starts_with("assets/") {
        return FileKind::Asset;
    }
    if normalized.ends_with(".md") {
        return FileKind::Markdown;
    }

    let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);

    const SCRIPT_EXTS: &[&str] = &[".sh", ".js", ".mjs", ".cjs", ".ts", ".py", ".rb", ".bash"];
    if SCRIPT_EXTS.iter().any(|ext| file_name.ends_with(ext)) {
        return FileKind::Script;
    }

    const ASSET_EXTS: &[&str] = &[
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf",
    ];
    if ASSET_EXTS.iter().any(|ext| file_name.ends_with(ext)) {
        return FileKind::Asset;
    }

    FileKind::Other
}

/// Mirrors TS `deriveTrustLevel(fileInventory)`.
pub fn derive_trust_level(files: &[crate::types::FileInventoryEntry]) -> TrustLevel {
    if files.iter().any(|f| f.kind == FileKind::Script) {
        return TrustLevel::ScriptsExecutables;
    }
    if files
        .iter()
        .any(|f| f.kind == FileKind::Asset || f.kind == FileKind::Other)
    {
        return TrustLevel::Assets;
    }
    TrustLevel::MarkdownOnly
}

/// Normalises a relative path to a portable, forward-slash form with no leading
/// slash or `./` prefix and no `..` traversal.
///
/// Mirrors TS `normalizePortablePath`.
pub fn normalize_portable_path(input: &str) -> String {
    let cleaned = input.replace('\\', "/");
    // Strip leading ./ and /
    let stripped = cleaned
        .trim_start_matches("./")
        .trim_start_matches('/');

    let mut parts: Vec<&str> = Vec::new();
    for segment in stripped.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_skill_md() {
        assert_eq!(classify_inventory_kind("skill.md"), FileKind::Skill);
        assert_eq!(classify_inventory_kind("nested/skill.md"), FileKind::Skill);
    }

    #[test]
    fn classify_reference() {
        assert_eq!(
            classify_inventory_kind("references/guide.md"),
            FileKind::Reference
        );
    }

    #[test]
    fn classify_script() {
        assert_eq!(classify_inventory_kind("scripts/run.sh"), FileKind::Script);
        assert_eq!(classify_inventory_kind("helper.py"), FileKind::Script);
        assert_eq!(classify_inventory_kind("tool.ts"), FileKind::Script);
    }

    #[test]
    fn classify_asset() {
        assert_eq!(classify_inventory_kind("assets/logo.png"), FileKind::Asset);
        assert_eq!(classify_inventory_kind("screenshot.jpg"), FileKind::Asset);
    }

    #[test]
    fn classify_markdown() {
        assert_eq!(classify_inventory_kind("README.md"), FileKind::Markdown);
    }

    #[test]
    fn classify_other() {
        assert_eq!(classify_inventory_kind("data.json"), FileKind::Other);
    }

    #[test]
    fn normalize_portable_path_strips_prefix() {
        assert_eq!(normalize_portable_path("./foo/bar"), "foo/bar");
        assert_eq!(normalize_portable_path("/foo/bar"), "foo/bar");
        assert_eq!(normalize_portable_path("foo/../bar"), "bar");
        assert_eq!(normalize_portable_path("foo//bar"), "foo/bar");
    }
}
