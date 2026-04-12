use std::time::Duration;
use tokio::process::Command;

/// Result of a single model probe.
pub struct ProbeResult {
    pub success: bool,
    pub detail: Option<String>,
}

/// Probe a model by adapter style.
pub async fn probe_model(
    style: &str,
    command_or_url: &str,
    model_id: &str,
) -> ProbeResult {
    match style {
        "gemini" => probe_gemini(command_or_url, model_id).await,
        "claude" => probe_claude(command_or_url, model_id).await,
        "codex" => probe_codex(command_or_url, model_id).await,
        "cursor" => probe_cursor(command_or_url, model_id).await,
        "ollama" => probe_ollama(command_or_url, model_id).await,
        "lm-studio" => probe_lm_studio(command_or_url, model_id).await,
        _ => ProbeResult { success: false, detail: Some(format!("unknown style: {style}")) },
    }
}

async fn probe_gemini(cmd: &str, model: &str) -> ProbeResult {
    run_cli(cmd, &["--model", model, "-p", "say: ok"], 20).await
}

async fn probe_claude(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["--print", "--model", model, "--output-format", "text", "-p", "say: ok"],
        30,
    ).await
}

async fn probe_codex(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["exec", "--json", "--model", model, "-q", "say: ok"],
        30,
    ).await
}

async fn probe_cursor(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["-p", "--mode", "ask", "--model", model, "say: ok"],
        30,
    ).await
}

async fn probe_ollama(base_url: &str, model: &str) -> ProbeResult {
    let url = format!("{}/api/generate", base_url);
    let body = serde_json::json!({
        "model": model,
        "prompt": "say: ok",
        "stream": false,
    });
    probe_http_post(&url, &body, 60).await
}

async fn probe_lm_studio(base_url: &str, model: &str) -> ProbeResult {
    let url = format!("{}/v1/chat/completions", base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "say: ok"}],
        "max_tokens": 10,
    });
    probe_http_post(&url, &body, 60).await
}

async fn run_cli(cmd: &str, args: &[&str], timeout_secs: u64) -> ProbeResult {
    let result = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        async {
            let child = Command::new(cmd)
                .args(args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .stdin(std::process::Stdio::null())
                .spawn()?;
            let output = child.wait_with_output().await?;
            Ok::<_, anyhow::Error>(output)
        },
    ).await;

    match result {
        Ok(Ok(output)) if output.status.success() => ProbeResult {
            success: true,
            detail: None,
        },
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = stderr.lines().next().unwrap_or("non-zero exit").to_string();
            ProbeResult { success: false, detail: Some(detail) }
        }
        Ok(Err(e)) => ProbeResult {
            success: false,
            detail: Some(format!("spawn error: {e}")),
        },
        Err(_) => ProbeResult {
            success: false,
            detail: Some("timeout".to_string()),
        },
    }
}

async fn probe_http_post(url: &str, body: &serde_json::Value, timeout_secs: u64) -> ProbeResult {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_default();

    match client.post(url).json(body).send().await {
        Ok(resp) if resp.status().is_success() => ProbeResult {
            success: true,
            detail: None,
        },
        Ok(resp) => ProbeResult {
            success: false,
            detail: Some(format!("HTTP {}", resp.status())),
        },
        Err(e) => ProbeResult {
            success: false,
            detail: Some(e.to_string()),
        },
    }
}
