//! Benchmark binary for `skills-scanner`.
//!
//! Measures the time to scan all skills in a workspace using `scan_workspace_skills`.
//!
//! ## Usage
//!
//! ```sh
//! # Basic run (10 iterations, prints timing summary)
//! cargo run --release --bin scan_bench -- /path/to/workspace
//!
//! # Custom iteration count
//! cargo run --release --bin scan_bench -- /path/to/workspace --iters 50
//!
//! # JSON output (pretty-print the full WorkspaceScanResult)
//! cargo run --release --bin scan_bench -- /path/to/workspace --json
//! ```
//!
//! ## Output
//!
//! ```
//! workspace: /path/to/workspace
//! discovered: 12 skills, 347 total files in inventory
//! timings (10 iters): min=1.23ms  median=1.31ms  mean=1.34ms  max=1.81ms
//! ```

use skills_scanner::scan::scan_workspace_skills;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: scan_bench <workspace_path> [--iters N] [--json]");
        std::process::exit(1);
    }

    let workspace = PathBuf::from(&args[1]);
    if !workspace.is_dir() {
        eprintln!("Error: '{}' is not a directory", workspace.display());
        std::process::exit(1);
    }

    let mut iters: usize = 10;
    let mut json_mode = false;
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--iters" => {
                i += 1;
                iters = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(10);
            }
            "--json" => json_mode = true,
            _ => {}
        }
        i += 1;
    }

    // Warm-up run (discarded)
    let warm = scan_workspace_skills("bench", &workspace);

    if json_mode {
        println!("{}", serde_json::to_string_pretty(&warm).unwrap());
        return;
    }

    let total_files: usize = warm.skills.iter().map(|s| s.file_inventory.len()).sum();
    println!("workspace: {}", workspace.display());
    println!(
        "discovered: {} skills, {} total files in inventory",
        warm.skills.len(),
        total_files
    );

    // Timed runs
    let mut timings: Vec<Duration> = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = Instant::now();
        let _ = scan_workspace_skills("bench", &workspace);
        timings.push(t.elapsed());
    }

    timings.sort();
    let min = timings[0];
    let max = *timings.last().unwrap();
    let median = timings[iters / 2];
    let mean = timings.iter().sum::<Duration>() / iters as u32;

    println!(
        "timings ({iters} iters): min={:.2}ms  median={:.2}ms  mean={:.2}ms  max={:.2}ms",
        min.as_secs_f64() * 1000.0,
        median.as_secs_f64() * 1000.0,
        mean.as_secs_f64() * 1000.0,
        max.as_secs_f64() * 1000.0,
    );
}
