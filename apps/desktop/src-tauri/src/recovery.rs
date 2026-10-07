use std::{fs::OpenOptions, io::Write, time::{SystemTime, UNIX_EPOCH}};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_recovery_codes(app: tauri::AppHandle, account_id: String, codes: Vec<String>) -> Result<bool, String> {
    if account_id.is_empty() || account_id.len() > 10 || !account_id.bytes().all(|byte| byte.is_ascii_digit()) ||
        codes.len() != 6 || codes.iter().any(|code| code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())) {
        return Err("Invalid recovery code export".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let created = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
        let name = format!("Dota-Notes-Recovery-Codes-{account_id}-{created}.txt");
        let selected = app.dialog().file().set_title("Save recovery codes")
            .set_file_name(name).add_filter("Text files", &["txt"]).blocking_save_file();
        let Some(selected) = selected else { return Ok(false) };
        let mut path = selected.into_path().map_err(|error| error.to_string())?;
        if path.extension().and_then(|value| value.to_str()) != Some("txt") { path.set_extension("txt"); }
        let content = format!(
            "DOTA NOTES - ACCOUNT RECOVERY CODES\r\n===================================\r\n\r\nSteam Account ID: {account_id}\r\n\r\n{}\r\n\r\nEach code can be used once to reset your password.\r\nKeep this file private and in a safe place. Do not share these codes.\r\nIf you generate new codes, this set will stop working.\r\n",
            codes.iter().enumerate().map(|(index, code)| format!("{:02}. {code}", index + 1)).collect::<Vec<_>>().join("\r\n"),
        );
        let mut file = OpenOptions::new().write(true).create_new(true).open(&path)
            .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
        if let Err(error) = file.write_all(content.as_bytes()).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(format!("Could not save recovery codes: {error}"));
        }
        Ok(true)
    }).await.map_err(|error| error.to_string())?
}
