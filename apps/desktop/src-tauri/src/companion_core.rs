use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
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
    if json.pointer("/player/steamid")?.as_str()? != config.steam_id {
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
    })
}
pub fn queue(root: &Path, config: &Config, event: &Observation) -> Result<(), String> {
    let dir = root.join("outbox").join(&config.steam_id);
    fs::create_dir_all(&dir).map_err(|_| "companion_storage_failed")?;
    let path = dir.join(format!("{}.json", event.match_id));
    if path.exists() {
        return Ok(());
    }
    let sent = root
        .join("sent")
        .join(&config.steam_id)
        .join(format!("{}.json", event.match_id));
    if sent.exists() {
        return Ok(());
    }
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
                    serde_json::json!({"steamId":config.steam_id,"lastSeenAt":now_ms()})
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
    let dir = root.join("outbox").join(&config.steam_id);
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };
    let Ok(token) =
        credential(config).and_then(|e| e.get_password().map_err(|_| "credential".into()))
    else {
        return;
    };
    for entry in entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .take(10)
    {
        if crate::companion_core::config()
            .ok()
            .is_none_or(|c| !c.enabled || c.device_id != config.device_id)
        {
            break;
        }
        let Ok(body) = fs::read(entry.path()) else {
            continue;
        };
        let Ok(event) = serde_json::from_slice::<Observation>(&body) else {
            continue;
        };
        let response = client
            .post("https://api.dota2notes.ir/api/sync/observations")
            .bearer_auth(&token)
            .json(&event)
            .send();
        match response {
            Ok(response) if response.status().is_success() => {
                let sent = root.join("sent").join(&config.steam_id);
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
pub fn run() -> Result<(), String> {
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
            std::thread::sleep(Duration::from_secs(30));
        }
    });
    let mut configured = std::time::Instant::now() - Duration::from_secs(60);
    loop {
        let current = config()?;
        if !current.enabled {
            break;
        }
        if configured.elapsed() >= Duration::from_secs(60) {
            let _ = install_gsi(&current);
            configured = std::time::Instant::now();
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
        if let Ok(entry) = credential(&config) {
            if let Ok(token) = entry.get_password() {
                if let Ok(client) = reqwest::blocking::Client::builder()
                    .timeout(Duration::from_millis(1500))
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                {
                    let _ = client
                        .delete("https://api.dota2notes.ir/api/sync/companion")
                        .bearer_auth(token)
                        .send();
                }
            }
            let _ = entry.delete_credential();
        }
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
    let local_auth = previous
        .filter(|p| p.steam_id == steam_id)
        .map(|p| p.local_auth)
        .unwrap_or_else(|| format!("{:x}", Sha256::digest(format!("local-gsi:{token}"))));
    let hash = format!(
        "{:x}",
        Sha256::digest(format!(
            "{steam_id}:{}",
            root()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default()
        ))
    );
    Config {
        device_id,
        steam_id,
        local_auth,
        enabled: true,
        task_name: format!("DotaNotes-Companion-{}", &hash[..12]),
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
    fn only_accepts_own_completed_real_matches() {
        let mut payload = serde_json::json!({"provider":{"appid":570},"auth":{"token":"local-secret"},"player":{"steamid":"76561198000000001","team_name":"radiant"},"map":{"matchid":"9070000001","game_state":"DOTA_GAMERULES_STATE_POST_GAME"}});
        assert_eq!(
            event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg())
                .unwrap()
                .match_id,
            9070000001
        );
        payload["player"]["steamid"] = "other".into();
        assert!(event_from_gsi(&serde_json::to_vec(&payload).unwrap(), &cfg()).is_none());
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
        };
        queue(dir.path(), &cfg(), &a).unwrap();
        queue(dir.path(), &cfg(), &Observation { ended_at: 456, ..a }).unwrap();
        let saved: Observation = serde_json::from_slice(
            &fs::read(dir.path().join("outbox/76561198000000001/9070000001.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.ended_at, 123);
    }
}
