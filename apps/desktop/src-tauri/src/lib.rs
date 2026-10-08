mod replay;
mod replay_codec;
mod replay_paths;
mod recovery;
mod aspect_geometry;
#[cfg(windows)] mod aspect_windows;
mod window_aspect;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn session_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("ir.dota2notes.desktop", "session-v1").map_err(|error| error.to_string())
}

#[tauri::command]
fn save_session_token(token: String) -> Result<(), String> {
    if token.len() != 43 || !token.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') {
        return Err("Invalid session token".into());
    }
    session_entry()?.set_password(&token).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_session_token() -> Result<Option<String>, String> {
    match session_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn clear_session_token() -> Result<(), String> {
    match session_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn open_steam_login(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid login URL")?;
    let production = parsed.scheme() == "https" && parsed.host_str() == Some("api.dota2notes.ir") && parsed.port().is_none();
    let development = cfg!(debug_assertions) && parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1") && parsed.port() == Some(4100);
    let mut keys: Vec<&str> = parsed.query_pairs().map(|(name, _)| if name == "challenge" { "challenge" } else if name == "nonce" { "nonce" } else { "unexpected" }).collect();
    keys.sort_unstable();
    if !(production || development) || parsed.path() != "/api/auth/desktop/start" || parsed.fragment().is_some() || keys != ["challenge", "nonce"] ||
       parsed.query_pairs().any(|(_, value)| value.len() != 43 || !value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')) {
        return Err("Unsupported Steam login destination".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
#[tauri::command]
fn launch_dota(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("steam_launch_failed".into()); }
    // The registered Steam protocol handles client startup and game location.
    app.opener().open_url("steam://rungameid/570", None::<&str>).map_err(|_| "steam_launch_failed".into())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    { builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") { let _ = window.set_focus(); }
    })); }
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            { use tauri_plugin_deep_link::DeepLinkExt; _app.deep_link().register_all()?; }
            Ok(())
        })
        .manage(replay::ReplayState::default())
        .invoke_handler(tauri::generate_handler![launch_dota, open_steam_login, save_session_token, load_session_token, clear_session_token, replay::replay_settings, replay::choose_dota_folder, replay::list_replays, replay::download_replay, recovery::export_recovery_codes, window_aspect::set_window_aspect_ratio])
        .run(tauri::generate_context!())
        .expect("error while running Dota Notes");
}
