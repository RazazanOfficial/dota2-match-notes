fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["companion_health", "companion_status", "configure_companion", "asset_status", "prepare_assets", "launch_dota", "steam_launch_options_status", "configure_steam_launch_options", "open_steam_login", "save_session_token", "load_session_token", "clear_session_token", "discover_dota", "replay_settings", "choose_dota_folder", "list_replays", "download_replay", "export_recovery_codes", "set_window_aspect_ratio"])
    )).expect("failed to build Tauri application manifest");
}
