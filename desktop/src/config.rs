use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

fn instance_root() -> Result<PathBuf> {
    let home = dirs::home_dir().context("cannot resolve home dir")?;
    Ok(home.join(".paperclip/instances/default"))
}

pub fn ensure_default_config() -> Result<()> {
    let root = instance_root()?;
    let config_path = root.join("config.json");

    if config_path.exists() {
        return Ok(());
    }

    // Create directory structure
    for dir in &[
        "",
        "db",
        "logs",
        "data/storage",
        "data/backups",
        "secrets",
    ] {
        fs::create_dir_all(root.join(dir))
            .with_context(|| format!("failed to create dir: {}", root.join(dir).display()))?;
    }

    let config = serde_json::json!({
        "database": {
            "mode": "embedded-postgres",
            "embeddedPostgresDataDir": root.join("db").to_str(),
            "embeddedPostgresPort": 54329,
            "backup": {
                "enabled": true,
                "intervalMinutes": 60,
                "retentionDays": 30,
                "dir": root.join("data/backups").to_str()
            }
        },
        "logging": {
            "mode": "file",
            "logDir": root.join("logs").to_str()
        },
        "server": {
            "deploymentMode": "local_trusted",
            "exposure": "private",
            "host": "127.0.0.1",
            "port": 3100,
            "serveUi": true
        },
        "auth": {
            "baseUrlMode": "auto",
            "disableSignUp": false
        },
        "storage": {
            "provider": "local_disk",
            "localDisk": {
                "baseDir": root.join("data/storage").to_str()
            }
        },
        "secrets": {
            "provider": "local_encrypted",
            "strictMode": false,
            "localEncrypted": {
                "keyFilePath": root.join("secrets/master.key").to_str()
            }
        }
    });

    let content = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, content)
        .with_context(|| format!("failed to write config: {}", config_path.display()))?;

    Ok(())
}
