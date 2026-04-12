mod detect;
mod probe;
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
    let verbose = args.iter().any(|a| a == "--verbose");

    let mut total = 0u32;
    let mut passed = 0u32;
    let mut failed = 0u32;
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
            let (cmd_or_url, style) = match &adapter.probe {
                AdapterProbe::Cli { command, style } => (command.as_str(), style.as_str()),
                AdapterProbe::Http { url, style } => (url.as_str(), style.as_str()),
                AdapterProbe::Skip { .. } => unreachable!(),
            };

            let result = probe::probe_model(style, cmd_or_url, &model.id).await;

            if result.success {
                passed += 1;
                println!("  {} {}", "PASS".green().bold(), model.id);
            } else {
                failed += 1;
                let detail = result.detail.unwrap_or_default();
                if verbose {
                    println!("  {} {} —\n    {}", "FAIL".red().bold(), model.id, detail);
                } else {
                    let short = detail.lines().next().unwrap_or("");
                    let truncated = if short.len() > 80 { &short[..80] } else { short };
                    println!("  {} {} — {}", "FAIL".red().bold(), model.id, truncated.dimmed());
                }
            }
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

    if failed > 0 {
        std::process::exit(1);
    }

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
