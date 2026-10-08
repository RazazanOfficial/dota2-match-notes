fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["open_steam_login", "save_session_token", "load_session_token", "clear_session_token", "replay_settings", "choose_dota_folder", "list_replays", "download_replay", "export_recovery_codes", "set_window_aspect_ratio"])
    )).expect("failed to build Tauri application manifest");
}
