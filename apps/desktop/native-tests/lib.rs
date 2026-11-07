// Test the real production modules without a GUI/WebKit dependency.
#[path = "../src-tauri/src/replay_download.rs"]
pub mod replay_download;
#[path = "../src-tauri/src/replay_codec.rs"]
pub mod replay_codec;

#[path = "../src-tauri/src/asset_cache.rs"]
pub mod asset_cache;

#[path = "../src-tauri/src/steam_paths.rs"]
pub mod steam_paths;
