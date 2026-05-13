use std::sync::Arc;

use tauri::{Emitter, State};
use tokio::sync::Mutex;

use dbx_core::agent_manager::{AgentDriverInfo, AgentManager, AgentRegistry, InstalledDriver};
use dbx_core::connection::AppState;

const REGISTRY_PATH: &str = "https://github.com/t8y2/dbx-agents/releases/latest/download/agent-registry.json";

static REGISTRY_CACHE: std::sync::LazyLock<Mutex<Option<(std::time::Instant, AgentRegistry)>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

const AGENT_TYPES: &[(&str, &str)] = &[
    ("dameng", "达梦 DM8"),
    ("kingbase", "人大金仓 KingbaseES"),
    ("vastbase", "Vastbase"),
    ("goldendb", "GoldenDB"),
    ("oracle", "Oracle"),
    ("h2", "H2"),
    ("snowflake", "Snowflake"),
    ("trino", "Trino (Presto)"),
    ("hive", "Apache Hive"),
    ("db2", "IBM DB2"),
    ("informix", "IBM Informix"),
    ("neo4j", "Neo4j"),
    ("cassandra", "Apache Cassandra"),
    ("bigquery", "Google BigQuery"),
    ("kylin", "Apache Kylin"),
    ("sundb", "SunDB"),
    ("gaussdb", "GaussDB"),
];

fn build_agent_list(am: &AgentManager, registry: Option<&AgentRegistry>) -> Vec<AgentDriverInfo> {
    let local_state = am.load_state();
    AGENT_TYPES
        .iter()
        .map(|(key, label)| {
            let installed = am.is_driver_installed(key);
            let local = local_state.installed_drivers.get(*key);
            let remote = registry.and_then(|r| r.drivers.get(*key));
            AgentDriverInfo {
                db_type: key.to_string(),
                label: label.to_string(),
                version: remote.map(|r| r.version.clone()).unwrap_or_default(),
                size: remote.map(|r| r.jar.size).unwrap_or(0),
                installed,
                installed_version: local.map(|l| l.version.clone()),
                update_available: match (local, remote) {
                    (Some(l), Some(r)) => l.version != r.version,
                    _ => false,
                },
            }
        })
        .collect()
}

#[tauri::command]
pub async fn list_installed_agents_local(state: State<'_, Arc<AppState>>) -> Result<Vec<AgentDriverInfo>, String> {
    Ok(build_agent_list(&state.agent_manager, None))
}

#[tauri::command]
pub async fn list_installed_agents(state: State<'_, Arc<AppState>>) -> Result<Vec<AgentDriverInfo>, String> {
    let registry = fetch_registry().await.ok();
    Ok(build_agent_list(&state.agent_manager, registry.as_ref()))
}

#[tauri::command]
pub async fn install_agent(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    db_type: String,
) -> Result<(), String> {
    let am = &state.agent_manager;
    let registry = fetch_registry().await?;
    let needs_jre = !am.is_jre_installed();

    if needs_jre {
        let platform = AgentManager::current_platform();
        let jre_info =
            registry.jre.platforms.get(platform).ok_or_else(|| format!("No JRE available for platform: {platform}"))?;
        let jre_archive = am.base_dir().join("jre-download.tar.gz");
        let _ = app.emit(
            "agent-install-progress",
            serde_json::json!({
                "step": "jre", "downloaded": 0u64, "total": jre_info.size,
            }),
        );
        download_with_progress(&app, "jre", &jre_info.url, &jre_archive, jre_info.size).await?;
        let _ = app.emit(
            "agent-install-progress",
            serde_json::json!({
                "step": "jre-extract", "downloaded": 0u64, "total": 0u64,
            }),
        );
        extract_archive(&jre_archive, &am.base_dir().join("jre"))?;
        std::fs::remove_file(&jre_archive).ok();
    }

    let driver = registry.drivers.get(&db_type).ok_or_else(|| format!("Unknown driver type: {db_type}"))?;
    let jar_path = am.driver_jar_path(&db_type);
    let _ = app.emit(
        "agent-install-progress",
        serde_json::json!({
            "step": "driver", "downloaded": 0u64, "total": driver.jar.size,
        }),
    );
    download_with_progress(&app, "driver", &driver.jar.url, &jar_path, driver.jar.size).await?;

    let mut local_state = am.load_state();
    local_state.jre_version = Some(registry.jre.version.clone());
    local_state.installed_drivers.insert(
        db_type,
        InstalledDriver { version: driver.version.clone(), installed_at: chrono::Utc::now().to_rfc3339() },
    );
    am.save_state(&local_state)?;
    let _ = app.emit("agent-install-progress", serde_json::json!({ "step": "done" }));
    Ok(())
}

#[tauri::command]
pub async fn uninstall_agent(state: State<'_, Arc<AppState>>, db_type: String) -> Result<(), String> {
    let am = &state.agent_manager;
    let jar_path = am.driver_jar_path(&db_type);
    if jar_path.exists() {
        std::fs::remove_file(&jar_path).map_err(|e| e.to_string())?;
    }
    let driver_dir = jar_path.parent().unwrap();
    if driver_dir.exists() {
        std::fs::remove_dir_all(driver_dir).map_err(|e| e.to_string())?;
    }
    let mut local_state = am.load_state();
    local_state.installed_drivers.remove(&db_type);
    am.save_state(&local_state)?;
    Ok(())
}

#[tauri::command]
pub async fn check_jre_installed(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(state.agent_manager.is_jre_installed())
}

#[tauri::command]
pub async fn invalidate_agent_registry_cache() -> Result<(), String> {
    *REGISTRY_CACHE.lock().await = None;
    Ok(())
}

#[tauri::command]
pub async fn reinstall_jre(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let am = &state.agent_manager;
    let jre_dir = am.base_dir().join("jre");
    if jre_dir.exists() {
        std::fs::remove_dir_all(&jre_dir).map_err(|e| format!("Failed to remove old JRE: {e}"))?;
    }
    let registry = fetch_registry().await?;
    let platform = AgentManager::current_platform();
    let jre_info =
        registry.jre.platforms.get(platform).ok_or_else(|| format!("No JRE available for platform: {platform}"))?;
    let jre_archive = am.base_dir().join("jre-download.tar.gz");
    download_with_progress(&app, "jre", &jre_info.url, &jre_archive, jre_info.size).await?;
    extract_archive(&jre_archive, &jre_dir)?;
    std::fs::remove_file(&jre_archive).ok();
    let mut local_state = am.load_state();
    local_state.jre_version = Some(registry.jre.version.clone());
    am.save_state(&local_state)?;
    let _ = app.emit("agent-install-progress", serde_json::json!({ "step": "done" }));
    Ok(())
}

async fn fetch_registry() -> Result<AgentRegistry, String> {
    {
        let cache = REGISTRY_CACHE.lock().await;
        if let Some((ts, reg)) = cache.as_ref() {
            if ts.elapsed() < std::time::Duration::from_secs(300) {
                return Ok(reg.clone());
            }
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    let resp = dbx_core::race_github_proxies(&client, REGISTRY_PATH, "dbx-agent-manager")
        .await
        .map_err(|e| format!("Failed to fetch agent registry: {e}"))?;
    let reg: AgentRegistry = resp.json().await.map_err(|e| format!("Failed to parse registry: {e}"))?;
    *REGISTRY_CACHE.lock().await = Some((std::time::Instant::now(), reg.clone()));
    Ok(reg)
}

async fn download_with_progress(
    app: &tauri::AppHandle,
    step: &str,
    url: &str,
    dest: &std::path::Path,
    total_size: u64,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = dbx_core::race_github_proxies(&client, url, "dbx-agent-manager")
        .await
        .map_err(|e| format!("Failed to download {url}: {e}"))?;

    let content_length = resp.content_length().unwrap_or(total_size);
    let mut file = std::fs::File::create(dest).map_err(|e| format!("Failed to create file: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut bytes = resp;
    while let Some(chunk) = bytes.chunk().await.map_err(|e| format!("Download stream error: {e}"))? {
        std::io::Write::write_all(&mut file, &chunk).map_err(|e| format!("Failed to write chunk: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "agent-install-progress",
            serde_json::json!({ "step": step, "downloaded": downloaded, "total": content_length }),
        );
    }
    Ok(())
}

fn extract_archive(archive: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    use std::process::Command;
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let status = Command::new("tar")
        .args(["xzf", &archive.to_string_lossy(), "-C", &dest.to_string_lossy(), "--strip-components=1"])
        .status()
        .map_err(|e| format!("Failed to extract archive: {e}"))?;
    if !status.success() {
        return Err("Failed to extract JRE archive".to_string());
    }
    Ok(())
}
