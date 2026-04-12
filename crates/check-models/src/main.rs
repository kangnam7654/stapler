mod detect;
mod types;

use std::{env, fs, path::PathBuf};
use colored::Colorize;
use types::{AdapterEntry, AdapterProbe};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_path = resolve_json_path()?;
    let data = fs::read_to_string(&json_path)
        .map_err(|e| anyhow::anyhow!(
            "Failed to read {}: {}. Run `tsx scripts/extract-adapter-models.ts` first.",
            json_path.display(), e
        ))?;
    let adapters: Vec<AdapterEntry> = serde_json::from_str(&data)?;

    let args: Vec<String> = env::args().collect();
    let filter = args.iter().position(|a| a == "--adapter")
        .and_then(|i| args.get(i + 1).cloned());

    let mut total = 0u32;
    let passed = 0u32;
    let failed = 0u32;
    let mut skipped = 0u32;

    for adapter in &adapters {
        if let Some(ref f) = filter
            && &adapter.name != f
        {
            continue;
        }

        match &adapter.probe {
            AdapterProbe::Skip { reason } => {
                println!("{} {} ({})",
                    "SKIP".yellow().bold(),
                    adapter.name.bold(),
                    reason.dimmed(),
                );
                skipped += adapter.models.len() as u32;
                continue;
            }
            AdapterProbe::Cli { command, .. } => {
                if !detect::is_cli_available(command) {
                    println!("{} {} ({} not found on PATH)",
                        "SKIP".yellow().bold(),
                        adapter.name.bold(),
                        command.dimmed(),
                    );
                    skipped += adapter.models.len() as u32;
                    continue;
                }
            }
            AdapterProbe::Http { url, .. } => {
                if !detect::is_http_reachable(url).await {
                    println!("{} {} ({} not reachable)",
                        "SKIP".yellow().bold(),
                        adapter.name.bold(),
                        url.dimmed(),
                    );
                    skipped += adapter.models.len() as u32;
                    continue;
                }
            }
        }

        println!("\n{}", adapter.name.bold().underline());

        if adapter.models.is_empty() {
            println!("  {} no models defined", "SKIP".yellow());
            continue;
        }

        for model in &adapter.models {
            total += 1;
            // probe will be implemented in Task 5
            println!("  {} {}", "TODO".dimmed(), model.id);
        }
    }

    println!("\n{}", "─".repeat(50));
    println!(
        "Total: {}  {}  {}  {}",
        total.to_string().bold(),
        format!("{} passed", passed).green(),
        format!("{} failed", failed).red(),
        format!("{} skipped", skipped).yellow(),
    );

    Ok(())
}

fn resolve_json_path() -> anyhow::Result<PathBuf> {
    // Look for adapter-models.json in repo root (same level as Cargo.toml workspace)
    let manifest_dir = env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| ".".to_string());
    let workspace_root = PathBuf::from(&manifest_dir)
        .ancestors()
        .find(|p| p.join("Cargo.toml").exists() && p.join("package.json").exists())
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();
    Ok(workspace_root.join("adapter-models.json"))
}
