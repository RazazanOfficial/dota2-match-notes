#![cfg_attr(windows, windows_subsystem = "windows")]
#[path="../../src-tauri/src/steam_paths.rs"]mod steam_paths;
#[path="../../src-tauri/src/companion_core.rs"]mod companion_core;
fn main(){let result=match std::env::args().nth(1).as_deref(){Some("--uninstall")=>companion_core::disconnect(),Some("--reset-user-data")=>companion_core::reset_user_data(),_=>companion_core::run()};if result.is_err(){std::process::exit(1);}}
