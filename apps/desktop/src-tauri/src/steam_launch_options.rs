use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::OnceLock,
};

const REQUIRED_FLAGS: [&str; 2] = ["-gamestateintegration", "-console"];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptionalSpec {
    id: String,
    flag: String,
    conflicts_with: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptionalCatalog { schema_version: u8, options: Vec<OptionalSpec> }
fn optional_specs() -> &'static [OptionalSpec] {
    static CATALOG: OnceLock<Vec<OptionalSpec>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let catalog: OptionalCatalog = serde_json::from_str(
            include_str!("../../shared/launch-options.json"))
            .expect("bundled launch options catalog must be valid JSON");
        assert_eq!(catalog.schema_version, 1);
        let mut seen = std::collections::HashSet::new();
        for option in &catalog.options {
            assert!(!option.id.is_empty() && seen.insert(option.id.clone()));
            assert!(option.flag.starts_with('-') && option.flag.len() > 1 &&
                option.flag.bytes().skip(1).all(|b|
                    b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        }
        catalog.options
    })
}
fn valid_selection(selected: &[bool]) -> bool {
    let specs = optional_specs();
    selected.len() == specs.len() && specs.iter().enumerate().all(|(index, option)|
        !selected[index] || option.conflicts_with.iter().all(|conflict|
            !specs.iter().enumerate().any(|(other, candidate)|
                selected[other] && candidate.id == *conflict)))
}
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
    pub optional: Vec<bool>,
    pub desired: Option<Vec<bool>>,
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

#[derive(Clone, Copy)]
enum VdfEncoding { Utf8, Utf8Bom, Utf16Le, Utf16Be }

fn read_vdf_bytes(path: &Path) -> Result<Vec<u8>, &'static str> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "steam_config_unavailable")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_VDF_BYTES {
        return Err("steam_config_unavailable");
    }
    fs::read(path).map_err(|_| "steam_config_unavailable")
}

fn decode_vdf(bytes: &[u8]) -> Result<(String, VdfEncoding), &'static str> {
    if let Some(body) = bytes.strip_prefix(&[0xff, 0xfe]) {
        if body.len() % 2 != 0 { return Err("steam_config_unavailable"); }
        let units = body.chunks_exact(2).map(|part| u16::from_le_bytes([part[0], part[1]]));
        return Ok((String::from_utf16(&units.collect::<Vec<_>>())
            .map_err(|_| "steam_config_unavailable")?, VdfEncoding::Utf16Le));
    }
    if let Some(body) = bytes.strip_prefix(&[0xfe, 0xff]) {
        if body.len() % 2 != 0 { return Err("steam_config_unavailable"); }
        let units = body.chunks_exact(2).map(|part| u16::from_be_bytes([part[0], part[1]]));
        return Ok((String::from_utf16(&units.collect::<Vec<_>>())
            .map_err(|_| "steam_config_unavailable")?, VdfEncoding::Utf16Be));
    }
    if let Some(body) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        return Ok((String::from_utf8(body.to_vec())
            .map_err(|_| "steam_config_unavailable")?, VdfEncoding::Utf8Bom));
    }
    Ok((String::from_utf8(bytes.to_vec()).map_err(|_| "steam_config_unavailable")?, VdfEncoding::Utf8))
}

fn encode_vdf(text: &str, encoding: VdfEncoding) -> Vec<u8> {
    match encoding {
        VdfEncoding::Utf8 => text.as_bytes().to_vec(),
        VdfEncoding::Utf8Bom => [&[0xef, 0xbb, 0xbf][..], text.as_bytes()].concat(),
        VdfEncoding::Utf16Le => {
            let mut bytes = vec![0xff, 0xfe];
            for unit in text.encode_utf16() { bytes.extend_from_slice(&unit.to_le_bytes()); }
            bytes
        }
        VdfEncoding::Utf16Be => {
            let mut bytes = vec![0xfe, 0xff];
            for unit in text.encode_utf16() { bytes.extend_from_slice(&unit.to_be_bytes()); }
            bytes
        }
    }
}

fn read_vdf(path: &Path) -> Result<String, &'static str> {
    decode_vdf(&read_vdf_bytes(path)?).map(|(text, _)| text)
}

fn localconfigs() -> Result<Vec<PathBuf>, &'static str> {
    let mut paths = Vec::new();
    for root in crate::steam_paths::steam_roots() {
        if !root.join("Steam.exe").is_file() { continue; }
        let Ok(root) = root.canonicalize() else { continue };
        if crate::steam_paths::discover_from(&[root.clone()]).is_empty() { continue; }
        let Ok(accounts) = fs::read_dir(root.join("userdata")) else { continue };
        for account in accounts.flatten() {
            let id = account.file_name().to_string_lossy().into_owned();
            if id.parse::<u32>().ok().is_none_or(|number| number == 0) { continue; }
            let path = account.path().join("config/localconfig.vdf");
            if !path.is_file() { continue; }
            if !fs::symlink_metadata(&path).is_ok_and(|meta| !meta.file_type().is_symlink()) {
                continue;
            }
            if let Ok(resolved) = path.canonicalize() {
                if resolved == root.join("userdata").join(&id).join("config/localconfig.vdf") {
                    paths.push(resolved);
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    if paths.is_empty() { Err("steam_config_unavailable") } else { Ok(paths) }
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

fn has_flag(options: &str, flag: &str) -> bool {
    let mut token = String::new();
    let mut quoted = false;
    let mut chars = options.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => quoted = !quoted,
            '\\' if chars.peek() == Some(&'"') => token.push(chars.next().unwrap_or('"')),
            ch if ch.is_whitespace() && !quoted => {
                if token.eq_ignore_ascii_case(flag) {
                    return true;
                }
                token.clear();
            }
            ch => token.push(ch),
        }
    }
    token.eq_ignore_ascii_case(flag)
}

fn option_tokens(input: &str) -> Vec<(usize, usize, String)> {
    let mut tokens = Vec::new();
    let mut start = None;
    let mut quoted = false;
    let mut value = String::new();
    let mut chars = input.char_indices().peekable();
    while let Some((index, ch)) = chars.next() {
        if ch.is_whitespace() && !quoted {
            if let Some(begin) = start.take() {
                tokens.push((begin, index, std::mem::take(&mut value)));
            }
            continue;
        }
        if start.is_none() { start = Some(index); }
        match ch {
            '"' => quoted = !quoted,
            '\\' if chars.peek().is_some_and(|(_, next)| *next == '"') => {
                value.push(chars.next().map(|(_, next)| next).unwrap_or('"'));
            }
            _ => value.push(ch),
        }
    }
    if let Some(begin) = start { tokens.push((begin, input.len(), value)); }
    tokens
}

fn selected_options(input: &str, optional: Option<&[bool]>) -> String {
    let mut output = String::new();
    let mut previous = 0;
    for (start, end, value) in option_tokens(input) {
        if optional.is_some_and(|selected| optional_specs().iter().enumerate()
            .any(|(index, option)| !selected[index] && value.eq_ignore_ascii_case(&option.flag))) {
            output.push_str(&input[previous..start]);
            previous = end;
        }
    }
    output.push_str(&input[previous..]);
    let mut output = output.trim().to_owned();
    for flag in REQUIRED_FLAGS {
        if !has_flag(&output, flag) {
            if !output.is_empty() { output.push(' '); }
            output.push_str(flag);
        }
    }
    if let Some(selected) = optional {
        for (index, option) in optional_specs().iter().enumerate() {
            if selected[index] && !has_flag(&output, &option.flag) {
                if !output.is_empty() { output.push(' '); }
                output.push_str(&option.flag);
            }
        }
    }
    output
}

fn escape_vdf(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn patched_config_with(input: &str, optional: Option<&[bool]>) -> Result<String, &'static str> {
    if optional.is_some_and(|selected| !valid_selection(selected)) {
        return Err("steam_options_conflict");
    }
    let root = parse_vdf(input)?;
    let prior = launch_value(&root)?;
    if prior.is_some_and(|value| selected_options(value, optional) == value) {
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
        let appended = selected_options(value, optional);
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
    insert.push_str(&format!("\n\"LaunchOptions\"\t\"{}\"", selected_options("", optional)));
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

fn patched_config(input: &str) -> Result<String, &'static str> {
    patched_config_with(input, None)
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
    let mut optional = vec![true; optional_specs().len()];
    let state = match localconfigs().and_then(|mut paths| {
        if !steam_id.is_empty() {
            let id = steam_id.parse::<u64>().ok()
                .and_then(|value| value.checked_sub(STEAM_ID_BASE))
                .filter(|value| *value > 0 && *value <= u32::MAX as u64)
                .ok_or("steam_account_ambiguous")?.to_string();
            paths.retain(|path| path.parent().and_then(|p| p.parent())
                .and_then(|p| p.file_name()).and_then(|name| name.to_str()) == Some(id.as_str()));
            if paths.is_empty() { return Err("steam_config_unavailable"); }
        }
        let mut required = true;
        for path in paths {
            let text = read_vdf(&path)?;
            let root = parse_vdf(&text)?;
            let value = launch_value(&root)?.unwrap_or("");
            required &= REQUIRED_FLAGS.iter().all(|flag| has_flag(value, flag));
            for (index, option) in optional_specs().iter().enumerate() {
                optional[index] &= has_flag(value, &option.flag);
            }
        }
        Ok(required)
    }) {
        Ok(true) => "configured",
        Ok(false) => match steam_running() {
            Ok(true) => "steam_running",
            Ok(false) => "missing",
            Err(_) => "unavailable",
        },
        Err(_) => "unavailable",
    };
    SteamLaunchStatus { state, optional, desired: saved_optional() }
}

fn configure_path(path: &Path, optional: Option<&[bool]>) -> Result<(), &'static str> {
    let original_bytes = read_vdf_bytes(path)?;
    let (original, encoding) = decode_vdf(&original_bytes)?;
    let updated = patched_config_with(&original, optional)?;
    if updated == original {
        return Ok(());
    }
    if steam_running()? || read_vdf_bytes(path)? != original_bytes {
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
        .write_all(&original_bytes)
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
        .write_all(&encode_vdf(&updated, encoding))
        .and_then(|_| replacement.as_file().sync_all())
        .map_err(|_| "steam_config_write_failed")?;
    if steam_running()? || read_vdf_bytes(path)? != original_bytes {
        return Err("steam_config_changed");
    }
    replacement
        .persist(&path)
        .map_err(|_| "steam_config_write_failed")?;
    let verified = parse_vdf(&read_vdf(&path)?)?;
    if !launch_value(&verified)?.is_some_and(|value| {
        REQUIRED_FLAGS.iter().all(|flag| has_flag(value, flag)) &&
        optional.is_none_or(|selected| optional_specs().iter().enumerate()
            .all(|(index, option)| has_flag(value, &option.flag) == selected[index]))
    }) {
        return Err("steam_config_verify_failed");
    }
    Ok(())
}

fn configure_all_inner(optional: Option<Vec<bool>>) -> Result<SteamLaunchStatus, &'static str> {
    if steam_running()? { return Ok(status_inner("")); }
    let Ok(paths) = localconfigs() else { return Ok(status_inner("")) };
    for path in paths {
        configure_path(&path, optional.as_deref())?;
    }
    Ok(status_inner(""))
}

fn saved_optional() -> Option<Vec<bool>> {
    let path = crate::companion_core::root().ok()?.join("launch-options.json");
    let selected: Vec<bool> = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    valid_selection(&selected).then_some(selected)
}

fn save_optional(optional: &[bool]) -> Result<(), &'static str> {
    if !valid_selection(optional) { return Err("steam_options_conflict"); }
    let root = crate::companion_core::root().map_err(|_| "steam_config_write_failed")?;
    fs::create_dir_all(&root).map_err(|_| "steam_config_write_failed")?;
    let mut file = tempfile::NamedTempFile::new_in(&root).map_err(|_| "steam_config_write_failed")?;
    serde_json::to_writer(&mut file, &optional).map_err(|_| "steam_config_write_failed")?;
    file.as_file().sync_all().map_err(|_| "steam_config_write_failed")?;
    file.persist(root.join("launch-options.json"))
        .map_err(|_| "steam_config_write_failed")?;
    Ok(())
}

pub fn repair_required_in_background(config: &crate::companion_core::Config) {
    if steam_running().ok() != Some(false) { return; }
    let Ok(token) = crate::companion_core::credential(config)
        .and_then(|entry| entry.get_password().map_err(|_| "credential".into())) else { return };
    let Ok(client) = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(3))
        .timeout(std::time::Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::none()).build() else { return };
    let Ok(paths) = localconfigs() else { return };
    for path in paths {
        let Some(account) = path.parent().and_then(|p| p.parent())
            .and_then(|p| p.file_name()).and_then(|name| name.to_str()) else { continue };
        let Ok(account_id) = account.parse::<u64>() else { continue };
        let Some(steam_id) = STEAM_ID_BASE.checked_add(account_id) else { continue };
        let registered = client.post("https://api.dota2notes.ir/api/sync/companion/eligibility")
            .bearer_auth(&token).json(&serde_json::json!({"steamId":steam_id.to_string()}))
            .send().ok()
            .filter(|response| response.status().is_success())
            .and_then(|response| response.json::<serde_json::Value>().ok())
            .and_then(|json| json.get("registered")?.as_bool());
        if registered == Some(true) {
            let optional = saved_optional();
            let _ = configure_path(&path, optional.as_deref());
        }
    }
}

#[cfg(feature = "desktop_commands")]
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

#[cfg(feature = "desktop_commands")]
#[tauri::command]
pub async fn configure_steam_launch_options(
    window: tauri::WebviewWindow,
    steam_id: String,
    optional: Option<Vec<bool>>,
) -> Result<SteamLaunchStatus, String> {
    if window.label() != "main" {
        return Err("steam_config_unavailable".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _ = steam_id;
        if let Some(ref selected) = optional { save_optional(selected).map_err(str::to_owned)?; }
        configure_all_inner(optional).map_err(str::to_owned)
    })
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
            Some("-gamestateintegration -console")
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
    fn flag_inside_other_quoted_argument_does_not_count() {
        assert!(!has_flag("\"echo -gamestateintegration\"", "-gamestateintegration"));
        assert!(has_flag("-novid \"-gamestateintegration\"", "-gamestateintegration"));
    }

    #[test]
    fn optional_flags_change_without_removing_other_launch_options() {
        let input = CONFIG.replace("-novid -console", "-novid -windowed -console +fps_max 120");
        let patched = patched_config_with(&input, Some(&[false, true, false])).unwrap();
        let tree = parse_vdf(&patched).unwrap();
        let value = launch_value(&tree).unwrap().unwrap();
        assert!(has_flag(value, "-fullscreen"));
        assert!(!has_flag(value, "-novid"));
        assert!(!has_flag(value, "-windowed"));
        assert!(value.contains("+fps_max 120"));
        assert!(REQUIRED_FLAGS.iter().all(|flag| has_flag(value, flag)));
        assert_eq!(patched_config_with(&patched, Some(&[false, true, false])).unwrap(), patched);
    }

    #[test]
    fn preserves_steam_config_encoding_when_patching() {
        for encoding in [VdfEncoding::Utf8, VdfEncoding::Utf8Bom,
            VdfEncoding::Utf16Le, VdfEncoding::Utf16Be] {
            let bytes = encode_vdf(CONFIG, encoding);
            let (decoded, format) = decode_vdf(&bytes).unwrap();
            assert_eq!(decoded, CONFIG);
            let updated = patched_config(&decoded).unwrap();
            let (verified, _) = decode_vdf(&encode_vdf(&updated, format)).unwrap();
            assert!(REQUIRED_FLAGS.iter().all(|flag|
                has_flag(launch_value(&parse_vdf(&verified).unwrap()).unwrap().unwrap(), flag)));
        }
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
