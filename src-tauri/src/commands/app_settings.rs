use std::{path::PathBuf, sync::Arc};

use dbx_core::storage::DesktopSettings;
use tauri::{AppHandle, Manager, State};

use super::connection::AppState;
use crate::{apply_debug_log_level, apply_desktop_settings};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DriverStoreMigrationResult {
    pub driver_store_dir: Option<String>,
    pub migrated_plugins: bool,
    pub migrated_agents: bool,
}

#[tauri::command]
pub async fn load_desktop_settings(state: State<'_, Arc<AppState>>) -> Result<DesktopSettings, String> {
    state.storage.load_desktop_settings().await
}

#[tauri::command]
pub async fn save_desktop_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    settings: DesktopSettings,
) -> Result<(), String> {
    state.storage.save_desktop_settings(&settings).await?;
    apply_debug_log_level(settings.debug_logging_enabled);
    if let Err(err) = apply_desktop_settings(&app, &settings) {
        eprintln!("Failed to apply desktop settings: {err}");
    }
    Ok(())
}

#[tauri::command]
pub async fn load_pinned_tree_node_ids(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    state.storage.load_pinned_tree_node_ids().await
}

#[tauri::command]
pub async fn save_pinned_tree_node_ids(state: State<'_, Arc<AppState>>, ids: Vec<String>) -> Result<(), String> {
    state.storage.save_pinned_tree_node_ids(&ids).await
}

#[tauri::command]
pub async fn load_native_debug_logs(app: AppHandle) -> Result<String, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || load_native_debug_logs_from_dir(log_dir))
        .await
        .map_err(|err| err.to_string())?
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DriverStorePathInfo {
    pub driver_store_dir: Option<String>,
    pub plugins_dir: String,
    pub agents_dir: String,
}

#[tauri::command]
pub async fn get_driver_store_path(state: State<'_, Arc<AppState>>) -> Result<DriverStorePathInfo, String> {
    let settings = state.storage.load_desktop_settings().await.unwrap_or_default();
    Ok(DriverStorePathInfo {
        driver_store_dir: settings.driver_store_dir,
        plugins_dir: state.plugins.root_dir().to_string_lossy().to_string(),
        agents_dir: state.agent_manager.base_dir().to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn set_driver_store_dir(
    state: State<'_, Arc<AppState>>,
    new_dir: Option<String>,
) -> Result<DriverStoreMigrationResult, String> {
    let new_dir = new_dir.filter(|d| !d.trim().is_empty()).map(|d| d.trim().to_string());
    let new_path = new_dir.as_ref().map(PathBuf::from);

    // Resolve current plugin/agent directories
    let current_plugins_dir = state.plugins.root_dir().to_path_buf();
    let current_agents_dir = state.agent_manager.base_dir().clone();

    // Validate: if setting a custom dir, it must be different from current parent
    if let Some(ref np) = new_path {
        let target_plugins = np.join("plugins");
        let target_agents = np.join("agents");

        // Canonicalize for comparison (both sides)
        let np_canonical = if np.exists() {
            np.canonicalize().map_err(|e| format!("Invalid path {}: {e}", np.display()))?
        } else {
            std::fs::create_dir_all(np).map_err(|e| format!("Failed to create directory {}: {e}", np.display()))?;
            np.canonicalize().map_err(|e| format!("Invalid path {}: {e}", np.display()))?
        };

        let current_plugins_parent = current_plugins_dir.parent();
        let current_agents_parent = current_agents_dir.parent();

        // Check if the new dir is the same as the current parent (no-op)
        if current_plugins_parent == Some(&np_canonical) && current_agents_parent == Some(&np_canonical) {
            return Ok(DriverStoreMigrationResult {
                driver_store_dir: new_dir,
                migrated_plugins: false,
                migrated_agents: false,
            });
        }

        // Stop all running agent daemons before migration
        state.agent_manager.stop_daemons().await;

        // Migrate plugins directory
        let migrated_plugins = if current_plugins_dir.exists() {
            migrate_directory(&current_plugins_dir, &target_plugins)?;
            true
        } else {
            false
        };

        // Migrate agents directory
        let migrated_agents = if current_agents_dir.exists() {
            migrate_directory(&current_agents_dir, &target_agents)?;
            true
        } else {
            false
        };

        // Verify migration
        if migrated_plugins {
            verify_migration(&current_plugins_dir, &target_plugins)?;
        }
        if migrated_agents {
            verify_migration(&current_agents_dir, &target_agents)?;
        }

        // Delete old data after successful verification
        if migrated_plugins {
            if let Err(err) = std::fs::remove_dir_all(&current_plugins_dir) {
                log::warn!("Failed to remove old plugins dir {}: {err}", current_plugins_dir.display());
            }
        }
        if migrated_agents {
            if let Err(err) = std::fs::remove_dir_all(&current_agents_dir) {
                log::warn!("Failed to remove old agents dir {}: {err}", current_agents_dir.display());
            }
        }
    }

    // Save the setting
    let mut settings = state.storage.load_desktop_settings().await.unwrap_or_default();
    settings.driver_store_dir = new_dir.clone();
    state.storage.save_desktop_settings(&settings).await?;

    Ok(DriverStoreMigrationResult { driver_store_dir: new_dir, migrated_plugins: true, migrated_agents: true })
}

/// Recursively copy a directory to a new location.
fn migrate_directory(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {e}", dst.display()))?;
    copy_dir_recursive(src, dst)
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {e}", dst.display()))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {} to {}: {e}", src_path.display(), dst_path.display()))?;
        }
    }
    Ok(())
}

/// Verify that the migrated directory has the same file count and total size.
fn verify_migration(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    let src_info = count_files_recursive(src)?;
    let dst_info = count_files_recursive(dst)?;
    if src_info.count != dst_info.count || src_info.total_size != dst_info.total_size {
        // Rollback: remove the incomplete destination
        let _ = std::fs::remove_dir_all(dst);
        return Err(format!(
            "Migration verification failed: source had {} files ({} bytes), destination has {} files ({} bytes)",
            src_info.count, src_info.total_size, dst_info.count, dst_info.total_size
        ));
    }
    Ok(())
}

struct DirStats {
    count: usize,
    total_size: u64,
}

fn count_files_recursive(dir: &std::path::Path) -> Result<DirStats, String> {
    let mut count = 0usize;
    let mut total_size = 0u64;
    fn walk(dir: &std::path::Path, count: &mut usize, total_size: &mut u64) -> Result<(), String> {
        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                walk(&path, count, total_size)?;
            } else {
                *count += 1;
                *total_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
        Ok(())
    }
    walk(dir, &mut count, &mut total_size)?;
    Ok(DirStats { count, total_size })
}

fn load_native_debug_logs_from_dir(log_dir: PathBuf) -> Result<String, String> {
    const MAX_FILES: usize = 6;
    const MAX_FILE_BYTES: u64 = 512 * 1024;
    if !log_dir.exists() {
        return Ok(format!("Native log dir does not exist yet: {}", log_dir.display()));
    }
    let mut files = std::fs::read_dir(&log_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            let modified = metadata.modified().ok()?;
            Some((path, modified, metadata.len()))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|(_, modified, _)| *modified);
    files.reverse();

    let mut output = String::new();
    output.push_str(&format!("Native log dir: {}\n", log_dir.display()));
    for (path, _, len) in files.into_iter().take(MAX_FILES) {
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown");
        output.push_str(&format!("\n===== {name} =====\n"));
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let start = if len > MAX_FILE_BYTES { bytes.len().saturating_sub(MAX_FILE_BYTES as usize) } else { 0 };
        if start > 0 {
            output.push_str("[truncated to last 512 KiB]\n");
        }
        output.push_str(&String::from_utf8_lossy(&bytes[start..]));
        output.push('\n');
    }
    Ok(output)
}
