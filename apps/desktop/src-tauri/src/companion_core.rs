use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
const STEAM_ID_BASE: u64 = 76_561_197_960_265_728;
fn valid_steam_id(value: &str) -> bool {
    value.len() == 17 && value.bytes().all(|b| b.is_ascii_digit()) &&
        value.parse::<u64>().ok().is_some_and(|id|
            id > STEAM_ID_BASE && id <= STEAM_ID_BASE + u32::MAX as u64)
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub device_id: String,
    pub steam_id: String,
    pub local_auth: String,
    pub enabled: bool,
    pub task_name: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub match_id: u64,
    pub ended_at: u64,
    #[serde(default)]
    pub steam_id: String,
}
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn root() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        return std::env::var_os("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("DotaNotesShared/companion"))
            .ok_or_else(|| "companion_storage_failed".into());
    }
    #[cfg(not(windows))]
    {
        Ok(std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("companion_storage_failed")?
            .join(".local/share/DotaNotesShared/companion"))
    }
}
pub fn background_enabled() -> bool {
    root().is_ok_and(|path| !path.join("background-disabled").exists())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub configured: bool,
    pub task_registered: bool,
    pub listener_active: bool,
    pub last_gsi_at: Option<u64>,
}
pub fn runtime_status() -> RuntimeStatus {
    let current = config().ok().filter(|value| value.enabled && background_enabled());
    #[cfg(windows)]
    let task_registered = current.as_ref().is_some_and(|value|
        hidden("schtasks.exe", &["/Query", "/TN", &value.task_name]).is_ok());
    #[cfg(not(windows))]
    let task_registered = false;
    let listener_active = current.is_some() && std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 16272)), Duration::from_millis(250)).is_ok();
    let last_gsi_at = root().ok()
        .and_then(|path| fs::read(path.join("gsi-health.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|value| value.get("lastSeenAt")?.as_u64());
    RuntimeStatus { configured: current.is_some(), task_registered, listener_active, last_gsi_at }
}
pub fn set_background_enabled(enabled: bool) -> Result<(), String> {
    let root = root()?;
    fs::create_dir_all(&root).map_err(|_| "companion_storage_failed")?;
    let marker = root.join("background-disabled");
    if enabled {
        if marker.exists() { fs::remove_file(marker).map_err(|_| "companion_storage_failed")?; }
    } else {
        fs::write(marker, b"disabled").map_err(|_| "companion_storage_failed")?;
        disconnect()?;
    }
    Ok(())
}
pub fn config() -> Result<Config, String> {
    serde_json::from_slice(
        &fs::read(root()?.join("device.json")).map_err(|_| "companion_not_configured")?,
    )
    .map_err(|_| "companion_config_invalid".into())
}
pub fn credential(config: &Config) -> Result<keyring::Entry, String> {
    keyring::Entry::new("ir.dota2notes.companion", &config.device_id)
        .map_err(|_| "companion_credential_failed".into())
}
pub fn store(config: &Config) -> Result<(), String> {
    let root = root()?;
    fs::create_dir_all(&root).map_err(|_| "companion_storage_failed")?;
    let mut file =
        tempfile::NamedTempFile::new_in(&root).map_err(|_| "companion_storage_failed")?;
    serde_json::to_writer(&mut file, config).map_err(|_| "companion_storage_failed")?;
    file.persist(root.join("device.json"))
        .map_err(|_| "companion_storage_failed")?;
    Ok(())
}
pub fn event_from_gsi(body: &[u8], config: &Config) -> Option<Observation> {
    let json: serde_json::Value = serde_json::from_slice(body).ok()?;
    if json.pointer("/auth/token")?.as_str()? != config.local_auth
        || json.pointer("/provider/appid")?.as_u64()? != 570
    {
        return None;
    }
    let steam_id = json.pointer("/player/steamid")?.as_str()?;
    if !valid_steam_id(steam_id) {
        return None;
    }
    if !matches!(
        json.pointer("/player/team_name")?.as_str()?,
        "radiant" | "dire"
    ) {
        return None;
    }
    if json.pointer("/map/game_state")?.as_str()? != "DOTA_GAMERULES_STATE_POST_GAME" {
        return None;
    }
    let id = json.pointer("/map/matchid")?;
    let match_id = id
        .as_str()
        .and_then(|s| s.parse().ok())
        .or_else(|| id.as_u64())?;
    if !(10_000_000..=999_999_999_999).contains(&match_id) {
        return None;
    }
    Some(Observation {
        match_id,
        ended_at: now_ms(),
        steam_id: steam_id.to_owned(),
    })
}
pub fn queue(root: &Path, config: &Config, event: &Observation) -> Result<(), String> {
    let steam_id = if event.steam_id.is_empty() { &config.steam_id } else { &event.steam_id };
    if !valid_steam_id(steam_id) { return Err("companion_invalid_steam_id".into()); }
    let dir = root.join("outbox").join(steam_id);
    let path = dir.join(format!("{}.json", event.match_id));
    if path.exists() {
        return Ok(());
    }
    let sent = root
        .join("sent")
        .join(steam_id)
        .join(format!("{}.json", event.match_id));
    if sent.exists() {
        return Ok(());
    }
    let total = fs::read_dir(root.join("outbox")).ok().into_iter().flatten()
        .flatten().filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| fs::read_dir(entry.path()).ok().map_or(0, |files| files.flatten()
            .filter(|file| file.path().extension().and_then(|s| s.to_str()) == Some("json"))
            .count())).sum::<usize>();
    if total >= 5_000 { return Err("companion_queue_full".into()); }
    fs::create_dir_all(&dir).map_err(|_| "companion_storage_failed")?;
    if fs::read_dir(&dir)
        .map_err(|_| "companion_storage_failed")?
        .count()
        >= 1000
    {
        return Err("companion_queue_full".into());
    }
    let mut file = tempfile::NamedTempFile::new_in(&dir).map_err(|_| "companion_storage_failed")?;
    serde_json::to_writer(&mut file, event).map_err(|_| "companion_storage_failed")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "companion_storage_failed")?;
    file.persist_noclobber(path)
        .map_err(|_| "companion_storage_failed")?;
    Ok(())
}
fn receive(mut stream: TcpStream, config: &Config) -> Result<(), String> {
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    let mut bytes = vec![];
    let mut buffer = [0; 4096];
    let split = loop {
        let n = stream.read(&mut buffer).map_err(|_| "gsi_read_failed")?;
        if n == 0 {
            return Err("gsi_read_failed".into());
        }
        bytes.extend_from_slice(&buffer[..n]);
        if let Some(i) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
            break i + 4;
        }
        if bytes.len() > 8192 {
            return Err("gsi_request_large".into());
        }
    };
    let headers = std::str::from_utf8(&bytes[..split]).map_err(|_| "gsi_invalid")?;
    if !headers.starts_with("POST /gsi HTTP/1.") {
        return Err("gsi_invalid".into());
    }
    let len: usize = headers
        .lines()
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, v)| v.trim().parse().ok())
        .filter(|n| *n <= 65536)
        .ok_or("gsi_request_large")?;
    while bytes.len() < split + len {
        let n = stream.read(&mut buffer).map_err(|_| "gsi_read_failed")?;
        if n == 0 {
            return Err("gsi_read_failed".into());
        }
        bytes.extend_from_slice(&buffer[..n]);
    }
    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes[split..split + len]) {
        if json.pointer("/auth/token").and_then(|v| v.as_str()) == Some(&config.local_auth)
            && json.pointer("/provider/appid").and_then(|v| v.as_u64()) == Some(570)
        {
            if let Ok(root) = root() {
                let _ = fs::write(
                    root.join("gsi-health.json"),
                    serde_json::json!({"steamId":json.pointer("/player/steamid").and_then(|v|v.as_str()),"lastSeenAt":now_ms()})
                        .to_string(),
                );
            }
        }
    }
    if let Some(event) = event_from_gsi(&bytes[split..split + len], config) {
        queue(&root()?, config, &event)?;
    }
    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}").map_err(|_|"gsi_write_failed")?;
    Ok(())
}
pub fn install_gsi(config: &Config) -> Result<(), String> {
    let text=format!("\"Dota Notes\"\n{{\n \"uri\" \"http://127.0.0.1:16272/gsi\"\n \"timeout\" \"2.0\"\n \"buffer\" \"0.5\"\n \"throttle\" \"1.0\"\n \"heartbeat\" \"15.0\"\n \"auth\" {{ \"token\" \"{}\" }}\n \"data\" {{ \"provider\" \"1\" \"map\" \"1\" \"player\" \"1\" }}\n}}\n",config.local_auth);
    let mut found = false;
    for install in crate::steam_paths::discover() {
        let dir = install.join("game/dota/cfg/gamestate_integration");
        fs::create_dir_all(&dir).map_err(|_| "gsi_config_write_failed")?;
        let path = dir.join("gamestate_integration_dota_notes.cfg");
        if fs::read_to_string(&path).ok().as_deref() != Some(&text) {
            fs::write(path, &text).map_err(|_| "gsi_config_write_failed")?;
        }
        found = true;
    }
    if found {
        Ok(())
    } else {
        Err("dota_folder_required".into())
    }
}
fn send_pending(client: &reqwest::blocking::Client, config: &Config) {
    let Ok(root) = root() else { return };
    let Ok(accounts) = fs::read_dir(root.join("outbox")) else {
        return;
    };
    let Ok(token) =
        credential(config).and_then(|e| e.get_password().map_err(|_| "credential".into()))
    else {
        return;
    };
    for account in accounts.flatten() {
        let steam_id = account.file_name().to_string_lossy().into_owned();
        if !valid_steam_id(&steam_id)
            || !account.file_type().is_ok_and(|kind| kind.is_dir()) { continue; }
        let Ok(entries) = fs::read_dir(account.path()) else { continue };
        let entries: Vec<_> = entries.flatten()
            .filter(|entry| entry.path().extension().and_then(|name| name.to_str()) == Some("json"))
            .take(10).collect();
        if entries.is_empty() { continue; }
        let registration = client
            .post("https://api.dota2notes.ir/api/sync/companion/eligibility")
            .bearer_auth(&token).json(&serde_json::json!({"steamId":steam_id})).send()
            .ok().filter(|response| response.status().is_success())
            .and_then(|response| response.json::<serde_json::Value>().ok())
            .and_then(|json| json.get("registered")?.as_bool());
        let Some(registered) = registration else { break };
        for entry in entries {
            if crate::companion_core::config().ok()
                .is_none_or(|c| !c.enabled || c.device_id != config.device_id) { return; }
            if !registered { let _ = fs::remove_file(entry.path()); continue; }
            let Ok(body) = fs::read(entry.path()) else { continue };
            let Ok(mut event) = serde_json::from_slice::<Observation>(&body) else { continue };
            if event.steam_id.is_empty() { event.steam_id = steam_id.clone(); }
            if event.steam_id != steam_id { let _ = fs::remove_file(entry.path()); continue; }
            let response = client
                .post("https://api.dota2notes.ir/api/sync/observations")
                .bearer_auth(&token).json(&event).send();
            match response {
                Ok(response) if response.status().is_success() => {
                    let sent = root.join("sent").join(&steam_id);
                    if fs::create_dir_all(&sent).is_ok() {
                        let _ = fs::rename(entry.path(), sent.join(format!("{}.json", event.match_id)));
                    }
                }
                Ok(response) if response.status() == reqwest::StatusCode::BAD_REQUEST => {
                    let _ = fs::remove_file(entry.path());
                }
                _ => break,
            }
        }
    }
}
pub fn run() -> Result<(), String> {
    if !background_enabled() { return Ok(()); }
    let initial = config()?;
    if !initial.enabled {
        return Ok(());
    }
    let listener = TcpListener::bind("127.0.0.1:16272").map_err(|_| "companion_already_running")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "companion_listener_failed")?;
    std::thread::spawn(|| {
        let Ok(client) = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
        else {
            return;
        };
        loop {
            let Ok(config) = config() else { break };
            if !config.enabled {
                break;
            }
            send_pending(&client, &config);
            retry_pending_revocations();
            std::thread::sleep(Duration::from_secs(30));
        }
    });
    let mut configured = std::time::Instant::now() - Duration::from_secs(60);
    let mut repaired = std::time::Instant::now() - Duration::from_secs(600);
    loop {
        let current = config()?;
        if !current.enabled || !background_enabled() {
            break;
        }
        if configured.elapsed() >= Duration::from_secs(60) {
            let _ = install_gsi(&current);
            configured = std::time::Instant::now();
        }
        if repaired.elapsed() >= Duration::from_secs(600) {
            crate::steam_launch_options::repair_required_in_background(&current);
            repaired = std::time::Instant::now();
        }
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = receive(stream, &current);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150))
            }
            Err(_) => return Err("companion_listener_failed".into()),
        }
    }
    Ok(())
}
#[cfg(windows)]
fn hidden(command: &str, args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new(command)
        .args(args)
        .creation_flags(0x08000000)
        .output()
        .map_err(|_| "companion_task_failed")?;
    if !output.status.success() {
        return Err("companion_task_failed".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().into())
}
#[cfg(windows)]
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
pub fn schedule(config: &Config, executable: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let user = hidden("whoami.exe", &[])?;
        let exe = escape(&executable.to_string_lossy());
        let user = escape(&user);
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger></Triggers><Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>{exe}</Command></Exec></Actions></Task>"#
        );
        let file = root()?.join("task.xml");
        let mut bytes = vec![255, 254];
        for c in xml.encode_utf16() {
            bytes.extend_from_slice(&c.to_le_bytes());
        }
        fs::write(&file, bytes).map_err(|_| "companion_task_failed")?;
        hidden(
            "schtasks.exe",
            &[
                "/Create",
                "/TN",
                &config.task_name,
                "/XML",
                &file.to_string_lossy(),
                "/F",
            ],
        )?;
        let _ = hidden("schtasks.exe", &["/Run", "/TN", &config.task_name]);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (config, executable);
        Err("companion_windows_required".into())
    }
}
pub fn disconnect() -> Result<(), String> {
    if let Ok(mut config) = config() {
        config.enabled = false;
        store(&config)?;
        #[cfg(windows)]
        {
            let _ = hidden("schtasks.exe", &["/End", "/TN", &config.task_name]);
            let _ = hidden("schtasks.exe", &["/Delete", "/TN", &config.task_name, "/F"]);
        }
        revoke_previous_device(&config);
        for install in crate::steam_paths::discover() {
            let path = install
                .join("game/dota/cfg/gamestate_integration/gamestate_integration_dota_notes.cfg");
            if fs::read_to_string(&path).is_ok_and(|text| text.contains(&config.local_auth)) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}
pub fn revoke_previous_device(config: &Config) {
    if !revoke_device_id(&config.device_id) {
        let Ok(root) = root() else { return };
        let path = root.join("pending-revocations.json");
        let mut pending: Vec<String> = fs::read(&path).ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
        if !pending.contains(&config.device_id) {
            pending.push(config.device_id.clone());
            if let Ok(mut file) = tempfile::NamedTempFile::new_in(&root) {
                if serde_json::to_writer(&mut file, &pending).is_ok() &&
                    file.as_file().sync_all().is_ok() { let _ = file.persist(path); }
            }
        }
    }
}
fn revoke_device_id(device_id: &str) -> bool {
    let Ok(entry) = keyring::Entry::new("ir.dota2notes.companion", device_id) else { return false };
    let Ok(token) = entry.get_password() else { return false };
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(1500))
        .redirect(reqwest::redirect::Policy::none()).build() else { return false };
    let success = client.delete("https://api.dota2notes.ir/api/sync/companion")
        .bearer_auth(token).send().is_ok_and(|response| response.status().is_success());
    if success { let _ = entry.delete_credential(); }
    success
}
pub fn retry_pending_revocations() {
    let Ok(root) = root() else { return };
    let path = root.join("pending-revocations.json");
    let Ok(bytes) = fs::read(&path) else { return };
    let Ok(pending) = serde_json::from_slice::<Vec<String>>(&bytes) else { return };
    let remaining: Vec<String> = pending.into_iter()
        .filter(|id| !revoke_device_id(id)).collect();
    if remaining.is_empty() { let _ = fs::remove_file(path); return; }
    if let Ok(mut file) = tempfile::NamedTempFile::new_in(&root) {
        if serde_json::to_writer(&mut file, &remaining).is_ok() &&
            file.as_file().sync_all().is_ok() { let _ = file.persist(path); }
    }
}
pub fn reset_user_data() -> Result<(), String> {
    disconnect()?;
    if let Ok(entry) = keyring::Entry::new("ir.dota2notes.desktop", "session-v1") {
        let _ = entry.delete_credential();
    }
    #[cfg(windows)]
    for variable in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(variable) {
            let base = PathBuf::from(base);
            for name in ["ir.dota2notes.desktop", "Dota Notes"] {
                let path = base.join(name);
                if path.is_dir() {
                    fs::remove_dir_all(path).map_err(|_| "reset_failed")?;
                }
            }
        }
    }
    let root = root()?.parent().ok_or("reset_failed")?.to_path_buf();
    if root.is_dir() {
        fs::remove_dir_all(root).map_err(|_| "reset_failed")?;
    }
    Ok(())
}
pub fn new_config(device_id: String, steam_id: String, token: &str) -> Config {
    let previous = config().ok();
    let local_auth = previous.as_ref()
        .map(|p| p.local_auth.clone())
        .unwrap_or_else(|| format!("{:x}", Sha256::digest(format!("local-gsi:{token}"))));
    let hash = format!(
        "{:x}",
        Sha256::digest(root()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default())
    );
    Config {
        device_id,
        steam_id,
        local_auth,
        enabled: true,
        task_name: previous.map(|p| p.task_name)
            .unwrap_or_else(|| format!("DotaNotes-Companion-{}", &hash[..12])),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn cfg() -> Config {
        Config {
            device_id: "device".into(),
            steam_id: "76561198000000001".into(),
            local_auth: "local-secret".into(),
            enabled: true,
            task_name: "test".into(),
        }
    }
    #[test]
    fn accepts_valid_completed_matches_for_any_steam_account() {
        let mut payload = serde_json::json!({"provider":{"appid":570},"auth":{"token":"local-secret"},"player":{"steamid":"76561198000000001","team_name":"radiant"},"map":{"matchid":"9070000001","game_state":"DOTA_GAMERULES_STATE_POST_GAME"}});
        assert_eq!(
            event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg())
                .unwrap()
                .match_id,
            9070000001
        );
        payload["player"]["steamid"] = "other".into();
        assert!(event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg()).is_none());
        payload["player"]["steamid"] = "76561198000000002".into();
        assert_eq!(event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg())
            .unwrap().steam_id, "76561198000000002");
        payload["player"]["steamid"] = "76561198000000001".into();
        payload["map"]["game_state"] = "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS".into();
        assert!(event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg()).is_none());
    }
    #[test]
    fn queues_once_and_keeps_original_end_time() {
        let dir = tempfile::tempdir().unwrap();
        let a = Observation {
            match_id: 9070000001,
            ended_at: 123,
            steam_id: cfg().steam_id,
        };
        queue(dir.path(), &cfg(), &a).unwrap();
        queue(dir.path(), &cfg(), &Observation { ended_at: 456, ..a }).unwrap();
        let saved: Observation = serde_json::from_slice(
            &fs::read(dir.path().join("outbox/76561198000000001/9070000001.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.ended_at, 123);
    }
    #[test]
    fn keeps_different_accounts_in_separate_outboxes() {
        let dir = tempfile::tempdir().unwrap();
        let second = Observation { match_id: 9070000002, ended_at: 123,
            steam_id: "76561198000000002".into() };
        queue(dir.path(), &cfg(), &second).unwrap();
        assert!(dir.path().join("outbox/76561198000000002/9070000002.json").exists());
        assert!(!dir.path().join("outbox/76561198000000001/9070000002.json").exists());
    }
}
