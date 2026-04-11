//! Helper binary to generate golden JSON fixtures.
//! Run: cargo run --bin gen_golden
//! (Only used during development to bootstrap golden files.)

use skills_scanner::scan::{collect_local_skill_inventory, discover_project_workspace_skill_directories, read_local_skill_import_from_directory};
use skills_scanner::types::InventoryMode;

fn fixture_path(name: &str) -> std::path::PathBuf {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest.join("tests/fixtures").join(name)
}

fn main() {
    // ws_basic: discover
    let ws_basic = fixture_path("ws_basic");
    let discovered = discover_project_workspace_skill_directories(&ws_basic);
    // Strip the absolute prefix so the golden is relative
    let golden_basic: Vec<serde_json::Value> = discovered.iter().map(|d| {
        let rel = d.skill_dir.strip_prefix(ws_basic.to_str().unwrap())
            .unwrap_or(&d.skill_dir)
            .trim_start_matches('/')
            .trim_start_matches('\\')
            .to_string();
        serde_json::json!({
            "skill_dir_suffix": rel,
            "inventory_mode": d.inventory_mode
        })
    }).collect();
    println!("=== ws_basic.golden.json ===");
    println!("{}", serde_json::to_string_pretty(&golden_basic).unwrap());

    // ws_project_root: inventory
    let ws_pr = fixture_path("ws_project_root");
    let inv = collect_local_skill_inventory(&ws_pr, InventoryMode::ProjectRoot).unwrap();
    println!("\n=== ws_project_root.golden.json ===");
    println!("{}", serde_json::to_string_pretty(&inv).unwrap());

    // ws_inline_yaml: metadata
    let ws_iy = fixture_path("ws_inline_yaml");
    let skill = read_local_skill_import_from_directory("test-company", &ws_iy, InventoryMode::Full, None).unwrap();
    println!("\n=== ws_inline_yaml.golden.json (metadata) ===");
    println!("{}", serde_json::to_string_pretty(&skill.metadata).unwrap());
}
