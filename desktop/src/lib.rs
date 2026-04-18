mod config;
mod server_manager;
mod workspace_commands;

use server_manager::ServerManager;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            workspace_commands::workspace_open_finder,
            workspace_commands::workspace_open_ide,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = config::ensure_default_config() {
                    eprintln!("Failed to create default config: {e}");
                }

                let mut manager = ServerManager::new(&app_handle);

                match manager.start().await {
                    Ok(()) => {}
                    Err(e) => {
                        eprintln!("Failed to start server: {e}");
                        return;
                    }
                }

                match manager.wait_for_ready().await {
                    Ok(port) => {
                        let url = format!("http://127.0.0.1:{port}");
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.navigate(url.parse().unwrap());
                        }
                    }
                    Err(e) => {
                        eprintln!("Server failed to become ready: {e}");
                    }
                }

                // Store manager for shutdown
                app_handle.manage(Mutex::new(Some(manager)));
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app_handle = window.app_handle();
                if let Some(state) = app_handle.try_state::<Mutex<Option<ServerManager>>>() {
                    if let Ok(mut guard) = state.lock() {
                        if let Some(mut manager) = guard.take() {
                            tauri::async_runtime::block_on(async {
                                let _ = manager.shutdown().await;
                            });
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Paperclip desktop");
}
