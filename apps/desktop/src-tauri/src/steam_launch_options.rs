use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

const FLAG: &str = "-gamestateintegration";
const STEAM_ID_BASE: u64 = 76_561_197_960_265_728;
const MAX_VDF_BYTES: u64 = 16 * 1024 * 1024;
const MAX_VDF_DEPTH: usize = 64;
const LAUNCH_PATH: [&str; 6] = [
    "UserLocalConfigStore",
    "Software",
    "Valve",
    "Steam",
    "apps",
    "570",
];

#[derive(Serialize)]
pub struct SteamLaunchStatus {
    pub state: &'static str,
}

#[derive(Clone)]
struct Token {
    kind: TokenKind,
    start: usize,
    end: usize,
}

#[derive(Clone)]
enum TokenKind {
    Text(String),
    Open,
    Close,
}

enum VdfNode {
    Text {
        value: String,
        start: usize,
        end: usize,
    },
    Object {
        entries: Vec<(String, VdfNode)>,
        close: usize,
    },
}

fn lex(input: &str) -> Result<Vec<Token>, &'static str> {
    let bytes = input.as_bytes();
    let mut tokens = Vec::new();
    let mut pos = 0;
    while pos < bytes.len() {
        if bytes[pos].is_ascii_whitespace() {
            pos += 1;
        } else if bytes[pos] == b'/' && bytes.get(pos + 1) == Some(&b'/') {
            pos += 2;
            while pos < bytes.len() && bytes[pos] != b'\n' {
                pos += 1;
            }
        } else if bytes[pos] == b'{' || bytes[pos] == b'}' {
            let kind = if bytes[pos] == b'{' {
                TokenKind::Open
            } else {
                TokenKind::Close
            };
            tokens.push(Token {
                kind,
                start: pos,
                end: pos + 1,
            });
            pos += 1;
        } else if bytes[pos] == b'"' {
            let start = pos;
            pos += 1;
            let mut decoded = Vec::new();
            let mut closed = false;
            while pos < bytes.len() {
                if bytes[pos] == b'"' {
                    pos += 1;
                    closed = true;
                    break;
                }
                if bytes[pos] == b'\\' && matches!(bytes.get(pos + 1), Some(&b'\\') | Some(&b'"')) {
                    pos += 1;
                }
                decoded.push(bytes[pos]);
                pos += 1;
            }
            if !closed {
                return Err("steam_config_invalid");
            }
            let value = String::from_utf8(decoded).map_err(|_| "steam_config_invalid")?;
            tokens.push(Token {
                kind: TokenKind::Text(value),
                start,
                end: pos,
            });
        } else {
            return Err("steam_config_invalid");
        }
    }
    Ok(tokens)
}

fn parse_entries(tokens: &[Token], pos: &mut usize, depth: usize) -> Result<VdfNode, &'static str> {
    if depth > MAX_VDF_DEPTH {
        return Err("steam_config_invalid");
    }
    let nested = depth > 0;
    let mut entries = Vec::new();
    while let Some(token) = tokens.get(*pos) {
        if matches!(token.kind, TokenKind::Close) {
            if !nested {
                return Err("steam_config_invalid");
            }
            *pos += 1;
            return Ok(VdfNode::Object {
                entries,
                close: token.start,
            });
        }
        let TokenKind::Text(key) = &token.kind else {
            return Err("steam_config_invalid");
        };
        *pos += 1;
        let Some(value) = tokens.get(*pos) else {
            return Err("steam_config_invalid");
        };
        let node = match &value.kind {
            TokenKind::Text(text) => {
                *pos += 1;
                VdfNode::Text {
                    value: text.clone(),
                    start: value.start,
                    end: value.end,
                }
            }
            TokenKind::Open => {
                *pos += 1;
                parse_entries(tokens, pos, depth + 1)?
            }
            TokenKind::Close => return Err("steam_config_invalid"),
        };
        entries.push((key.clone(), node));
    }
    if nested {
        Err("steam_config_invalid")
    } else {
        Ok(VdfNode::Object {
            entries,
            close: tokens.last().map_or(0, |t| t.end),
        })
    }
}

fn parse_vdf(input: &str) -> Result<VdfNode, &'static str> {
    let tokens = lex(input)?;
    let mut pos = 0;
    let root = parse_entries(&tokens, &mut pos, 0)?;
    if pos != tokens.len() {
        return Err("steam_config_invalid");
    }
    Ok(root)
}

fn child<'a>(node: &'a VdfNode, key: &str) -> Result<Option<&'a VdfNode>, &'static str> {
    let VdfNode::Object { entries, .. } = node else {
        return Err("steam_config_invalid");
    };
    let mut found = None;
    for (name, value) in entries {
        if name.eq_ignore_ascii_case(key) {
            if found.is_some() {
                return Err("steam_config_ambiguous");
            }
            found = Some(value);
        }
    }
    Ok(found)
}

fn at_path<'a>(root: &'a VdfNode, path: &[&str]) -> Result<Option<&'a VdfNode>, &'static str> {
    let mut current = root;
    for key in path {
        let Some(next) = child(current, key)? else {
            return Ok(None);
        };
        current = next;
    }
    Ok(Some(current))
}

fn read_vdf(path: &Path) -> Result<String, &'static str> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "steam_config_unavailable")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_VDF_BYTES {
        return Err("steam_config_unavailable");
    }
    String::from_utf8(fs::read(path).map_err(|_| "steam_config_unavailable")?)
        .map_err(|_| "steam_config_unavailable")
}

fn account_id(steam_id: &str) -> Result<String, &'static str> {
    if steam_id.len() != 17 || !steam_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("steam_account_ambiguous");
    }
    let value = steam_id
        .parse::<u64>()
        .map_err(|_| "steam_account_ambiguous")?;
    let id = value
        .checked_sub(STEAM_ID_BASE)
        .ok_or("steam_account_ambiguous")?;
    if id == 0 || id > u32::MAX as u64 {
        return Err("steam_account_ambiguous");
    }
    Ok(id.to_string())
}

fn most_recent_is(root: &Path, steam_id: &str) -> Result<bool, &'static str> {
    let login = parse_vdf(&read_vdf(&root.join("config/loginusers.vdf"))?)?;
    let Some(VdfNode::Object { entries, .. }) = at_path(&login, &["users"])? else {
        return Err("steam_account_ambiguous");
    };
    let mut recent = None;
    for (account, node) in entries {
        if let Some(VdfNode::Text { value, .. }) = child(node, "MostRecent")? {
            if value == "1" {
                if recent.is_some() {
                    return Err("steam_account_ambiguous");
                }
                recent = Some(account.as_str());
            }
        }
    }
    Ok(recent == Some(steam_id))
}

fn localconfig_for(steam_id: &str) -> Result<PathBuf, &'static str> {
    let account = account_id(steam_id)?;
    let mut matched = None;
    for root in crate::steam_paths::steam_roots() {
        if !root.join("Steam.exe").is_file() {
            continue;
        }
        let Ok(root) = root.canonicalize() else {
            continue;
        };
        if crate::steam_paths::discover_from(&[root.clone()]).is_empty() {
            continue;
        }
        let path = root
            .join("userdata")
            .join(&account)
            .join("config/localconfig.vdf");
        if !path.is_file() {
            continue;
        }
        if !most_recent_is(&root, steam_id)? {
            return Err("steam_account_ambiguous");
        }
        if fs::symlink_metadata(&path)
            .map_err(|_| "steam_config_unavailable")?
            .file_type()
            .is_symlink()
        {
            return Err("steam_config_unavailable");
        }
        let path = path
            .canonicalize()
            .map_err(|_| "steam_config_unavailable")?;
        // Reject a junction in userdata/account/config, including one pointing
        // to another account under the same Steam root.
        if path != root.join("userdata").join(&account).join("config").join("localconfig.vdf") {
            return Err("steam_config_unavailable");
        }
        if matched.as_ref().is_some_and(|previous| previous != &path) {
            return Err("steam_account_ambiguous");
        }
        matched = Some(path);
    }
    matched.ok_or("steam_config_unavailable")
}

fn launch_value(root: &VdfNode) -> Result<Option<&str>, &'static str> {
    let Some(parent) = at_path(root, &LAUNCH_PATH)? else {
        return Ok(None);
    };
    match child(parent, "LaunchOptions")? {
        Some(VdfNode::Text { value, .. }) => Ok(Some(value)),
        Some(_) => Err("steam_config_invalid"),
        None => Ok(None),
    }
}

fn has_flag(options: &str) -> bool {
    let mut token = String::new();
    let mut quoted = false;
    let mut chars = options.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => quoted = !quoted,
            '\\' if chars.peek() == Some(&'"') => token.push(chars.next().unwrap_or('"')),
            ch if ch.is_whitespace() && !quoted => {
                if token.eq_ignore_ascii_case(FLAG) {
                    return true;
                }
                token.clear();
            }
            ch => token.push(ch),
        }
    }
    token.eq_ignore_ascii_case(FLAG)
}

fn escape_vdf(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn patched_config(input: &str) -> Result<String, &'static str> {
    let root = parse_vdf(input)?;
    if launch_value(&root)?.is_some_and(has_flag) {
        return Ok(input.to_owned());
    }
    let mut parent = &root;
    let mut missing = 0;
    for (index, key) in LAUNCH_PATH.iter().enumerate() {
        match child(parent, key)? {
            Some(next @ VdfNode::Object { .. }) => parent = next,
            Some(_) => return Err("steam_config_invalid"),
            None => {
                missing = LAUNCH_PATH.len() - index;
                break;
            }
        }
    }
    let existing = if missing == 0 {
        child(parent, "LaunchOptions")?
    } else {
        None
    };
    if let Some(VdfNode::Text { value, start, end }) = existing {
        let appended = if value.trim().is_empty() {
            FLAG.to_owned()
        } else {
            format!("{value} {FLAG}")
        };
        return Ok(format!(
            "{}\"{}\"{}",
            &input[..*start],
            escape_vdf(&appended),
            &input[*end..]
        ));
    }
    if existing.is_some() {
        return Err("steam_config_invalid");
    }
    let VdfNode::Object { close, .. } = parent else {
        return Err("steam_config_invalid");
    };
    let mut insert = String::new();
    let from = LAUNCH_PATH.len() - missing;
    for key in &LAUNCH_PATH[from..] {
        insert.push_str(&format!("\n\"{key}\"\n{{"));
    }
    insert.push_str(&format!("\n\"LaunchOptions\"\t\"{FLAG}\""));
    for _ in 0..missing {
        insert.push_str("\n}");
    }
    insert.push('\n');
    Ok(format!(
        "{}{}{}",
        &input[..*close],
        insert,
        &input[*close..]
    ))
}

#[cfg(windows)]
fn steam_running() -> Result<bool, &'static str> {
    use std::{os::windows::process::CommandExt, process::Command};
    let result = Command::new("tasklist.exe")
        .args(["/FI", "IMAGENAME eq steam.exe", "/FO", "CSV", "/NH"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|_| "steam_process_check_failed")?;
    if !result.status.success() {
        return Err("steam_process_check_failed");
    }
    Ok(String::from_utf8_lossy(&result.stdout)
        .lines()
        .any(|line| line.to_ascii_lowercase().starts_with("\"steam.exe\",")))
}

#[cfg(not(windows))]
fn steam_running() -> Result<bool, &'static str> {
    Err("steam_config_unavailable")
}

fn status_inner(steam_id: &str) -> SteamLaunchStatus {
    let state = match localconfig_for(steam_id)
        .and_then(|path| read_vdf(&path))
        .and_then(|text| parse_vdf(&text))
        .and_then(|root| launch_value(&root).map(|value| value.is_some_and(has_flag)))
    {
        Ok(true) => "configured",
        Ok(false) => match steam_running() {
            Ok(true) => "steam_running",
            Ok(false) => "missing",
            Err(_) => "unavailable",
        },
        Err("steam_account_ambiguous" | "steam_config_ambiguous") => "ambiguous",
        Err(_) => "unavailable",
    };
    SteamLaunchStatus { state }
}

fn configure_inner(steam_id: &str) -> Result<SteamLaunchStatus, &'static str> {
    if steam_running()? {
        return Ok(SteamLaunchStatus {
            state: "steam_running",
        });
    }
    let path = match localconfig_for(steam_id) {
        Ok(path) => path,
        Err("steam_account_ambiguous" | "steam_config_ambiguous") => {
            return Ok(SteamLaunchStatus { state: "ambiguous" });
        }
        Err(_) => {
            return Ok(SteamLaunchStatus {
                state: "unavailable",
            })
        }
    };
    let original = read_vdf(&path)?;
    let updated = patched_config(&original)?;
    if updated == original {
        return Ok(SteamLaunchStatus {
            state: "configured",
        });
    }
    if steam_running()? || read_vdf(&path)? != original {
        return Err("steam_config_changed");
    }
    let parent = path.parent().ok_or("steam_config_unavailable")?;
    let backup = parent.join(format!(
        "localconfig.vdf.dota-notes-backup-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "steam_config_write_failed")?
            .as_nanos()
    ));
    let mut backup_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(backup)
        .map_err(|_| "steam_config_write_failed")?;
    backup_file
        .write_all(original.as_bytes())
        .and_then(|_| backup_file.sync_all())
        .map_err(|_| "steam_config_write_failed")?;
    let mut replacement =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "steam_config_write_failed")?;
    replacement
        .as_file()
        .set_permissions(
            fs::metadata(&path)
                .map_err(|_| "steam_config_write_failed")?
                .permissions(),
        )
        .map_err(|_| "steam_config_write_failed")?;
    replacement
        .write_all(updated.as_bytes())
        .and_then(|_| replacement.as_file().sync_all())
        .map_err(|_| "steam_config_write_failed")?;
    if steam_running()? || read_vdf(&path)? != original {
        return Err("steam_config_changed");
    }
    replacement
        .persist(&path)
        .map_err(|_| "steam_config_write_failed")?;
    let verified = parse_vdf(&read_vdf(&path)?)?;
    if !launch_value(&verified)?.is_some_and(has_flag) {
        return Err("steam_config_verify_failed");
    }
    Ok(SteamLaunchStatus {
        state: "configured",
    })
}

#[tauri::command]
pub async fn steam_launch_options_status(
    window: tauri::WebviewWindow,
    steam_id: String,
) -> Result<SteamLaunchStatus, String> {
    if window.label() != "main" {
        return Err("steam_config_unavailable".into());
    }
    tauri::async_runtime::spawn_blocking(move || status_inner(&steam_id))
        .await
        .map_err(|_| "steam_config_unavailable".into())
}

#[tauri::command]
pub async fn configure_steam_launch_options(
    window: tauri::WebviewWindow,
    steam_id: String,
) -> Result<SteamLaunchStatus, String> {
    if window.label() != "main" {
        return Err("steam_config_unavailable".into());
    }
    tauri::async_runtime::spawn_blocking(move || configure_inner(&steam_id).map_err(str::to_owned))
        .await
        .map_err(|_| String::from("steam_config_write_failed"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = "\"UserLocalConfigStore\" { \"Software\" { \"Valve\" { \"Steam\" { \"apps\" { \"570\" { \"LaunchOptions\" \"-novid -console\" } } } } } }";

    #[test]
    fn appends_once_without_changing_other_options() {
        let patched = patched_config(CONFIG).unwrap();
        assert_eq!(
            launch_value(&parse_vdf(&patched).unwrap()).unwrap(),
            Some("-novid -console -gamestateintegration")
        );
        assert_eq!(patched_config(&patched).unwrap(), patched);
    }

    #[test]
    fn adds_missing_app_node_and_keeps_comments() {
        let input = "\"UserLocalConfigStore\" { \"Software\" { \"Valve\" { \"Steam\" { \"apps\" { // keep\n } } } } }";
        let patched = patched_config(input).unwrap();
        assert!(patched.contains("// keep"));
        assert_eq!(
            launch_value(&parse_vdf(&patched).unwrap()).unwrap(),
            Some(FLAG)
        );
    }

    #[test]
    fn refuses_ambiguous_launch_options() {
        let input = CONFIG.replace(
            "\"LaunchOptions\" \"-novid -console\"",
            "\"LaunchOptions\" \"-novid\" \"LaunchOptions\" \"-console\"",
        );
        assert_eq!(patched_config(&input).err(), Some("steam_config_ambiguous"));
    }

    #[test]
    fn validates_steam_account_id() {
        assert_eq!(account_id("76561197960265729"), Ok("1".to_owned()));
        assert_eq!(
            account_id("76561197960265728").err(),
            Some("steam_account_ambiguous")
        );
        assert_eq!(account_id("bad").err(), Some("steam_account_ambiguous"));
    }

    #[test]
    fn flag_inside_other_quoted_argument_does_not_count() {
        assert!(!has_flag("\"echo -gamestateintegration\""));
        assert!(has_flag("-novid \"-gamestateintegration\""));
    }

    #[test]
    fn rejects_excessively_nested_vdf_before_recursing_further() {
        let input = format!(
            "{}{}",
            "\"nested\" {{".repeat(MAX_VDF_DEPTH + 1),
            "}".repeat(MAX_VDF_DEPTH + 1)
        );
        assert_eq!(parse_vdf(&input).err(), Some("steam_config_invalid"));
    }
}
