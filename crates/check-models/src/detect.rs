use std::process::Command;

/// Check if a CLI command is available on PATH.
pub fn is_cli_available(command: &str) -> bool {
    Command::new("which")
        .arg(command)
        .output()
        .is_ok_and(|o| o.status.success())
}

/// Check if an HTTP endpoint is reachable (GET with short timeout).
pub async fn is_http_reachable(base_url: &str) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    // Ollama: /api/tags, LM Studio: /v1/models
    let urls = [
        format!("{}/api/tags", base_url),
        format!("{}/v1/models", base_url),
    ];

    for url in &urls {
        if let Ok(resp) = client.get(url).send().await
            && resp.status().is_success()
        {
            return true;
        }
    }
    false
}
