use anyhow::{bail, Context, Result};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};

pub struct ServerManager {
    child: Option<Child>,
    port: u16,
    node_path: PathBuf,
    server_entry: PathBuf,
}

impl ServerManager {
    pub fn new(app_handle: &tauri::AppHandle) -> Self {
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .expect("failed to resolve resource dir");

        let node_path = resource_dir.join("resources/node/node");
        let server_entry = resource_dir.join("resources/server/dist/index.mjs");

        Self {
            child: None,
            port: 3100,
            node_path,
            server_entry,
        }
    }

    pub async fn start(&mut self) -> Result<()> {
        let paperclip_home = dirs::home_dir()
            .context("cannot resolve home dir")?
            .join(".paperclip");

        let instance_root = paperclip_home.join("instances/default");

        // NODE_PATH for external native modules (sharp, embedded-postgres, pg)
        let server_dir = self.server_entry.parent().unwrap().parent().unwrap();
        let node_modules = server_dir.join("node_modules");
        let node_path = node_modules.display().to_string();

        let child = Command::new(&self.node_path)
            .arg(&self.server_entry)
            .env("NODE_PATH", &node_path)
            .env("SERVE_UI", "true")
            .env("HOST", "127.0.0.1")
            .env("PORT", self.port.to_string())
            .env("PAPERCLIP_MIGRATION_AUTO_APPLY", "true")
            .env("PAPERCLIP_MIGRATION_PROMPT", "never")
            .env("PAPERCLIP_DEPLOYMENT_MODE", "local_trusted")
            .env("PAPERCLIP_DEPLOYMENT_EXPOSURE", "private")
            .env("PAPERCLIP_HOME", paperclip_home.to_str().unwrap_or(""))
            .env("PAPERCLIP_INSTANCE_ID", "default")
            .env(
                "PAPERCLIP_CONFIG",
                instance_root.join("config.json").to_str().unwrap_or(""),
            )
            .env("NODE_ENV", "production")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("failed to spawn node process")?;

        self.child = Some(child);
        Ok(())
    }

    pub async fn wait_for_ready(&mut self) -> Result<u16> {
        let child = self.child.as_mut().context("server not started")?;
        let stdout = child.stdout.take().context("no stdout handle")?;
        let mut reader = BufReader::new(stdout).lines();

        let result = timeout(Duration::from_secs(60), async {
            while let Some(line) = reader.next_line().await? {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                    if msg.get("event").and_then(|v| v.as_str()) == Some("server_ready") {
                        if let Some(port) = msg.get("port").and_then(|v| v.as_u64()) {
                            // Keep draining stdout in background to prevent EPIPE
                            tokio::spawn(async move {
                                while let Ok(Some(_)) = reader.next_line().await {}
                            });
                            return Ok(port as u16);
                        }
                    }
                }
            }
            bail!("server process exited before sending ready signal")
        })
        .await
        .context("server did not become ready within 60 seconds")??;

        self.port = result;
        Ok(result)
    }

    pub async fn shutdown(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            // Send SIGTERM for graceful PostgreSQL shutdown
            if let Some(id) = child.id() {
                unsafe {
                    libc::kill(id as i32, libc::SIGTERM);
                }
            }

            // Wait up to 15 seconds for graceful exit
            match timeout(Duration::from_secs(15), child.wait()).await {
                Ok(Ok(_)) => {}
                _ => {
                    // Force kill if still running
                    let _ = child.kill().await;
                }
            }
        }
        Ok(())
    }
}
