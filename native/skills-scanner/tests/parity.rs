//! Parity tests: verify Rust output matches TypeScript expectations.
//!
//! Each test corresponds to a scenario in
//! `server/src/__tests__/company-skills.test.ts`:
//!
//! - `parity_ws_basic_discover` → test.ts:96–118
//! - `parity_ws_project_root_inventory` → test.ts:120–147
//! - `parity_ws_inline_yaml_metadata` → test.ts:149–186
//!
//! Strategy: copy each static fixture under `tests/fixtures/<name>/` into a
//! temp directory, run the Rust function, and compare against the committed
//! golden JSON (`tests/fixtures/<name>.golden.json`).

use skills_scanner::scan::{
    collect_local_skill_inventory, discover_project_workspace_skill_directories,
    read_local_skill_import_from_directory,
};
use skills_scanner::types::InventoryMode;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

// ── Helpers ───────────────────────────────────────────────────────────────

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// Recursively copy `src_dir` into `dst_dir`.
fn copy_dir_all(src: &Path, dst: &Path) {
    fs::create_dir_all(dst).unwrap();
    for entry in fs::read_dir(src).unwrap().flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path).unwrap();
        }
    }
}

/// Stage a named fixture into a TempDir and return it.
fn stage_fixture(name: &str) -> TempDir {
    let src = fixtures_dir().join(name);
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&src, tmp.path());
    tmp
}

/// Load a golden JSON file as a `serde_json::Value`.
fn load_golden(name: &str) -> serde_json::Value {
    let path = fixtures_dir().join(format!("{name}.golden.json"));
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("golden file not found: {}", path.display()));
    serde_json::from_str(&raw).expect("golden file is not valid JSON")
}

// ── Tests ─────────────────────────────────────────────────────────────────

/// Mirrors TS test: "finds bounded skill roots under supported workspace paths"
/// (company-skills.test.ts:96–118).
///
/// Expected: 4 entries in lexicographic order:
///   workspace root (project_root), .agents/skills/release, skills/.system/paperclip, skills/find-skills
#[test]
fn parity_ws_basic_discover() {
    let tmp = stage_fixture("ws_basic");
    let workspace = tmp.path();

    let discovered = discover_project_workspace_skill_directories(workspace);
    let golden = load_golden("ws_basic");
    let golden_entries = golden.as_array().expect("golden must be array");

    assert_eq!(
        discovered.len(),
        golden_entries.len(),
        "discovered count mismatch"
    );

    // canonicalize so macOS /private/var symlinks are resolved consistently
    let workspace_canon = fs::canonicalize(workspace).unwrap();
    let workspace_str = workspace_canon.to_str().unwrap();

    for (actual, expected) in discovered.iter().zip(golden_entries.iter()) {
        // Compare inventory mode
        let expected_mode = expected["inventory_mode"].as_str().unwrap();
        let actual_mode = serde_json::to_value(&actual.inventory_mode).unwrap();
        assert_eq!(
            actual_mode.as_str().unwrap(),
            expected_mode,
            "inventory_mode mismatch for {}",
            actual.skill_dir
        );

        // Compare path suffix (strip the canonicalized workspace prefix)
        let expected_suffix = expected["skill_dir_suffix"].as_str().unwrap();
        let actual_suffix = actual
            .skill_dir
            .strip_prefix(workspace_str)
            .unwrap_or(&actual.skill_dir)
            .trim_start_matches('/')
            .trim_start_matches('\\');
        assert_eq!(
            actual_suffix, expected_suffix,
            "skill_dir suffix mismatch (full path: {})",
            actual.skill_dir
        );
    }
}

/// Mirrors TS test: "limits root SKILL.md imports to skill-related support folders"
/// (company-skills.test.ts:120–147).
///
/// Expected inventory paths: { SKILL.md, assets/logo.svg, references/checklist.md, scripts/run.sh }
/// Expected NOT present: README.md, src/index.ts
#[test]
fn parity_ws_project_root_inventory() {
    let tmp = stage_fixture("ws_project_root");

    let inv =
        collect_local_skill_inventory(tmp.path(), InventoryMode::ProjectRoot).unwrap();
    let golden = load_golden("ws_project_root");
    let golden_entries = golden.as_array().expect("golden must be array");

    // Compare as sets (paths)
    let actual_paths: HashSet<String> = inv.iter().map(|e| e.path.clone()).collect();
    let expected_paths: HashSet<String> = golden_entries
        .iter()
        .map(|e| e["path"].as_str().unwrap().to_string())
        .collect();

    assert_eq!(
        actual_paths, expected_paths,
        "inventory path set mismatch\nactual: {:?}\nexpected: {:?}",
        actual_paths, expected_paths
    );

    // Verify kinds match too
    for entry in &inv {
        let expected_kind = golden_entries
            .iter()
            .find(|e| e["path"].as_str().unwrap() == entry.path)
            .map(|e| e["kind"].as_str().unwrap())
            .unwrap_or_else(|| panic!("path {} not in golden", entry.path));

        let actual_kind = serde_json::to_value(&entry.kind).unwrap();
        assert_eq!(
            actual_kind.as_str().unwrap(),
            expected_kind,
            "kind mismatch for path {}",
            entry.path
        );
    }

    // Confirm README.md and src/index.ts are excluded
    assert!(
        !actual_paths.contains("README.md"),
        "README.md must be excluded in project_root mode"
    );
    assert!(
        !actual_paths.contains("src/index.ts"),
        "src/index.ts must be excluded in project_root mode"
    );

    // Confirm scripts/run.sh gives trust_level scripts_executables
    use skills_scanner::classify::derive_trust_level;
    use skills_scanner::types::TrustLevel;
    assert_eq!(
        derive_trust_level(&inv),
        TrustLevel::ScriptsExecutables,
        "trust level should be scripts_executables"
    );
}

/// Mirrors TS test: "parses inline object array items in skill frontmatter metadata"
/// (company-skills.test.ts:149–186).
///
/// Expected: metadata.sourceKind == "local_path",
///           metadata.sources == [{ kind: "github-dir", repo: "paperclipai/paperclip", path: "skills/paperclip" }]
#[test]
fn parity_ws_inline_yaml_metadata() {
    let tmp = stage_fixture("ws_inline_yaml");

    let skill = read_local_skill_import_from_directory(
        "test-company",
        tmp.path(),
        InventoryMode::Full,
        None,
    )
    .unwrap();

    let golden = load_golden("ws_inline_yaml");

    let metadata = skill.metadata.as_ref().expect("metadata must be Some");
    let meta_obj = metadata.as_object().expect("metadata must be an object");

    // sourceKind
    assert_eq!(
        meta_obj.get("sourceKind").and_then(|v| v.as_str()),
        Some("local_path"),
        "sourceKind must be local_path"
    );

    // sources array
    let sources = meta_obj
        .get("sources")
        .and_then(|v| v.as_array())
        .expect("metadata.sources must be an array");
    let expected_sources = golden["sources"]
        .as_array()
        .expect("golden must have sources array");

    assert_eq!(
        sources.len(),
        expected_sources.len(),
        "sources array length mismatch"
    );

    let actual_src = sources[0].as_object().unwrap();
    let expected_src = expected_sources[0].as_object().unwrap();

    assert_eq!(
        actual_src.get("kind").and_then(|v| v.as_str()),
        expected_src.get("kind").and_then(|v| v.as_str()),
        "sources[0].kind mismatch"
    );
    assert_eq!(
        actual_src.get("repo").and_then(|v| v.as_str()),
        expected_src.get("repo").and_then(|v| v.as_str()),
        "sources[0].repo mismatch"
    );
    assert_eq!(
        actual_src.get("path").and_then(|v| v.as_str()),
        expected_src.get("path").and_then(|v| v.as_str()),
        "sources[0].path mismatch"
    );
}
