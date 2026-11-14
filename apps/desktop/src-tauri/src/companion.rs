use tauri::Manager;
#[tauri::command]
pub async fn companion_background_enabled() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        crate::companion_core::retry_pending_revocations();
        crate::companion_core::background_enabled()
    }).await.unwrap_or(false)
}
#[tauri::command]
pub async fn companion_runtime_status() -> Result<crate::companion_core::RuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(crate::companion_core::runtime_status)
        .await.map_err(|_| "companion_status_failed".to_owned())
}
#[tauri::command]
pub async fn set_companion_background_enabled(
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    if window.label() != "main" { return Err("companion_config_invalid".into()); }
    tauri::async_runtime::spawn_blocking(move ||
        crate::companion_core::set_background_enabled(enabled))
        .await.map_err(|_| "companion_setup_failed".to_owned())?
}
#[tauri::command]
pub async fn companion_status() -> Result<Option<String>, String> {
    Ok(crate::companion_core::config()
        .ok()
        .filter(|c| {
            c.enabled
                && crate::companion_core::credential(c)
                    .and_then(|entry| {
                        entry
                            .get_password()
                            .map_err(|_| "companion_credential_failed".into())
                    })
                    .is_ok()
        })
        .map(|c| c.device_id))
}
#[tauri::command]
pub async fn configure_companion(
    app: tauri::AppHandle,
    device_id: String,
    steam_id: String,
    token: Option<String>,
) -> Result<(), String> {
    if device_id.len() != 36
        || !device_id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() || b == b'-')
        || steam_id.len() != 17
        || !steam_id.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("companion_config_invalid".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::companion_core::background_enabled() {
            return Err("companion_background_disabled".into());
        }
        let token = match token {
            Some(token) => token,
            None => {
                let existing = crate::companion_core::config()?;
                if existing.device_id != device_id || existing.steam_id != steam_id {
                    return Err("companion_config_invalid".into());
                }
                crate::companion_core::credential(&existing)?
                    .get_password()
                    .map_err(|_| "companion_credential_failed")?
            }
        };
        if token.len() != 43
            || !token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return Err("companion_config_invalid".into());
        }
        let config = crate::companion_core::new_config(device_id, steam_id, &token);
        let previous = crate::companion_core::config().ok();
        crate::companion_core::credential(&config)?
            .set_password(&token)
            .map_err(|_| "companion_credential_failed")?;
        crate::companion_core::store(&config)?;
        let _ = crate::companion_core::install_gsi(&config);
        let executable = app
            .path()
            .resolve(
                "resources/dota-notes-companion.exe",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|_| "companion_missing")?;
        if !executable.is_file() {
            return Err("companion_missing".into());
        }
        crate::companion_core::schedule(&config, &executable)?;
        if let Some(previous) = previous.filter(|old| old.device_id != config.device_id) {
            crate::companion_core::revoke_previous_device(&previous);
        }
        Ok(())
    })
    .await
    .map_err(|_| "companion_setup_failed")?
}

#[tauri::command]
pub fn companion_health() -> serde_json::Value {
    let value = crate::companion_core::root()
        .ok()
        .and_then(|r| std::fs::read(r.join("gsi-health.json")).ok())
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok());
    value.unwrap_or(serde_json::Value::Null)
}
