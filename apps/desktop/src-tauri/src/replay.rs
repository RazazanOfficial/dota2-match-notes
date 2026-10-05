use std::{fs::{self, File}, io::{BufReader, Read, Write}, path::{Path, PathBuf}, sync::{Arc, atomic::{AtomicBool, Ordering}}, time::{Duration, UNIX_EPOCH}};
use bzip2::read::MultiBzDecoder;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_REPLAY_BYTES: u64 = 2 * 1024 * 1024 * 1024;
#[derive(Default)]
pub struct ReplayState { busy: Arc<AtomicBool> }
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySettings { dota_path: Option<String>, replay_path: Option<String> }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayFile { match_id: String, path: String, size_bytes: u64, modified_seconds: u64 }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayProgress { match_id: String, bytes: u64 }
struct DownloadGuard(Arc<AtomicBool>);
impl Drop for DownloadGuard { fn drop(&mut self) { self.0.store(false, Ordering::Release); } }
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(app.path().app_config_dir().map_err(err)?.join("replays.json")) }
fn read_settings(app: &tauri::AppHandle) -> Result<ReplaySettings, String> { let path=config_path(app)?; if !path.exists() {return Ok(ReplaySettings::default());} serde_json::from_reader(File::open(path).map_err(err)?).map_err(err) }
fn valid_id(id: &str) -> bool { (8..=12).contains(&id.len()) && !id.starts_with('0') && id.bytes().all(|b| b.is_ascii_digit()) }
fn valid_header(path: &Path) -> bool { let mut bytes=[0;8]; fs::metadata(path).map(|m| m.len() > 8).unwrap_or(false) && File::open(path).and_then(|mut file|file.read_exact(&mut bytes)).is_ok() && (&bytes==b"PBDEMS2\0" || &bytes==b"HL2DEMO\0") }
fn file_info(path: &Path, id: &str) -> Result<ReplayFile,String> { let metadata=fs::metadata(path).map_err(err)?; Ok(ReplayFile {match_id:id.into(),path:path.to_string_lossy().into(),size_bytes:metadata.len(),modified_seconds:metadata.modified().map_err(err)?.duration_since(UNIX_EPOCH).map_err(err)?.as_secs()}) }
fn locate_dota(selected: &Path) -> Result<PathBuf,String> {
    let path=selected.canonicalize().map_err(err)?;
    let candidates=[path.join("game").join("dota"),path.join("dota"),path.clone(),path.parent().unwrap_or(&path).to_path_buf()];
    candidates.into_iter().find(|p| p.is_dir() && p.file_name().map(|n|n.to_string_lossy().eq_ignore_ascii_case("dota")).unwrap_or(false) && p.parent().and_then(Path::file_name).map(|n|n.to_string_lossy().eq_ignore_ascii_case("game")).unwrap_or(false)).ok_or_else(||"Select the Dota 2 installation folder (dota 2 beta/game/dota).".into())
}
fn ensure_replay_directory(dota: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(dota.join("replays")).map_err(err)?;
    let path = dota.join("replays").canonicalize().map_err(err)?;
    let canonical_dota = dota.canonicalize().map_err(err)?;
    if path.parent() != Some(canonical_dota.as_path()) {
        return Err("The replay folder must be inside the selected Dota installation.".into());
    }
    Ok(path)
}
fn replay_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config = read_settings(app)?;
    let root = PathBuf::from(config.dota_path.ok_or("Choose your Dota installation folder first.")?);
    ensure_replay_directory(&locate_dota(&root)?)
}
#[tauri::command]
pub fn replay_settings(app: tauri::AppHandle) -> Result<ReplaySettings,String> { read_settings(&app) }
#[tauri::command]
pub async fn choose_dota_folder(app: tauri::AppHandle, state: tauri::State<'_, ReplayState>) -> Result<Option<ReplaySettings>,String> {
    if state.busy.swap(true, Ordering::AcqRel) {return Err("Wait for the current download to finish.".into());}
    let _guard = DownloadGuard(state.busy.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected)=app.dialog().file().set_title("Dota 2 installation").blocking_pick_folder() else {return Ok(None)};
        let selected=selected.into_path().map_err(err)?;
        let dota=locate_dota(&selected)?;
        let replay_path = ensure_replay_directory(&dota)?;
        let root=dota.parent().and_then(Path::parent).ok_or("Invalid Dota installation.")?;
        let settings=ReplaySettings {dota_path:Some(root.to_string_lossy().into()),replay_path:Some(replay_path.to_string_lossy().into())};
        let config=config_path(&app)?;fs::create_dir_all(config.parent().ok_or("Invalid config folder")?).map_err(err)?;
        let temporary=config.with_extension("json.tmp");fs::write(&temporary,serde_json::to_vec(&settings).map_err(err)?).map_err(err)?;fs::rename(&temporary,&config).map_err(err)?;
        Ok(Some(settings))
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn list_replays(app: tauri::AppHandle) -> Result<Vec<ReplayFile>,String> {
    tauri::async_runtime::spawn_blocking(move || {
        if read_settings(&app)?.dota_path.is_none() {return Ok(vec![]);}
        let directory=replay_directory(&app)?;let mut files=vec![];
        for entry in fs::read_dir(directory).map_err(err)? {
            let entry=entry.map_err(err)?;let path=entry.path();let id=path.file_stem().and_then(|n|n.to_str()).unwrap_or("");
            if entry.file_type().map_err(err)?.is_file() && path.extension().and_then(|n|n.to_str())==Some("dem") && valid_id(id) && valid_header(&path) {files.push(file_info(&path,id)?);}
        }
        files.sort_by(|a,b|b.modified_seconds.cmp(&a.modified_seconds));Ok(files)
    }).await.map_err(err)?
}
fn validate_api_origin(origin: &str) -> Result<reqwest::Url,String> {
    let parsed=reqwest::Url::parse(origin).map_err(err)?;
    let production=parsed.scheme()=="https" && parsed.host_str()==Some("api.dota2notes.ir") && parsed.port().is_none();
    let development=cfg!(debug_assertions) && parsed.scheme()=="http" && parsed.host_str()==Some("127.0.0.1") && parsed.port()==Some(4100);
    if !(production || development) || parsed.path()!="/" || parsed.query().is_some() || parsed.fragment().is_some() || !parsed.username().is_empty() || parsed.password().is_some() {return Err("Unsupported API origin.".into());}
    Ok(parsed)
}
fn write_demo(reader: &mut impl Read, file: &mut File, mut progress: impl FnMut(u64)) -> Result<u64,String> {
    let mut header=[0;8];reader.read_exact(&mut header).map_err(err)?;
    if &header!=b"PBDEMS2\0" && &header!=b"HL2DEMO\0" {return Err("Downloaded content is not a Dota .dem replay.".into());}
    file.write_all(&header).map_err(err)?;let mut written=8u64;let mut buffer=[0;65536];let mut reported=0;
    loop {let count=reader.read(&mut buffer).map_err(err)?;if count==0{break;}written+=count as u64;if written>MAX_REPLAY_BYTES{return Err("Replay exceeds the supported 2 GB size.".into());}file.write_all(&buffer[..count]).map_err(err)?;if written-reported>=1024*1024 {progress(written);reported=written;}}
    if written <= 8 { return Err("Replay body is empty.".into()); }
    file.sync_all().map_err(err)?;progress(written);Ok(written)
}
#[tauri::command]
pub async fn download_replay(app: tauri::AppHandle, state: tauri::State<'_, ReplayState>, match_id: String, auth_token: Option<String>, api_origin: Option<String>) -> Result<ReplayFile,String> {
    if !valid_id(&match_id) {return Err("Invalid match ID.".into());}
    let token=auth_token.ok_or("Connect your Steam account before downloading.")?;
    if token.len()!=43 || !token.bytes().all(|b|b.is_ascii_alphanumeric() || b==b'-' || b==b'_') {return Err("Invalid desktop session.".into());}
    let origin=validate_api_origin(&api_origin.ok_or("API origin is missing.")?)?;
    if state.busy.swap(true,Ordering::AcqRel) {return Err("A replay is already downloading.".into());}
    let guard=DownloadGuard(state.busy.clone());
    let result=tauri::async_runtime::spawn_blocking(move || {
        let directory=replay_directory(&app)?;let final_path=directory.join(format!("{match_id}.dem"));
        if final_path.exists() {if valid_header(&final_path){return file_info(&final_path,&match_id);}return Err("An invalid replay already exists with this match ID; move it before downloading.".into());}
        let client=reqwest::blocking::Client::builder().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(20)).timeout(Duration::from_secs(900)).user_agent("DotaNotesDesktop/0.1").build().map_err(err)?;
        let url=origin.join(&format!("/api/replays/{match_id}/file")).map_err(err)?;
        let response=client.get(url).bearer_auth(token).send().map_err(err)?;
        if response.status()!=reqwest::StatusCode::OK || response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).map(|v|v.starts_with("application/octet-stream"))!=Some(true) {
            return Err(format!("Replay archive is not ready (HTTP {}).",response.status()));
        }
        let mut temporary = tempfile::Builder::new()
            .prefix(&format!(".{match_id}."))
            .suffix(".part")
            .tempfile_in(&directory)
            .map_err(err)?;
        let mut decoder = MultiBzDecoder::new(BufReader::new(response));
        write_demo(&mut decoder, temporary.as_file_mut(), |bytes| {
            let _ = app.emit("replay-progress", ReplayProgress { match_id: match_id.clone(), bytes });
        })?;
        // Publish the complete demo without replacing an existing replay.
        // A failed download drops and removes the temporary file automatically.
        temporary.persist_noclobber(&final_path).map_err(err)?;
        file_info(&final_path, &match_id)
    }).await.map_err(err)?;drop(guard);result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ids_are_numeric_and_bounded() {assert!(valid_id("9026000101"));for id in ["../9026000101","0","9026","0000000000","9026000101.exe"]{assert!(!valid_id(id));}}
    #[test]
    fn decodes_a_real_bzip_stream_to_a_demo() {
        let expected = b"PBDEMS2\0replay-body";
        let mut encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
        encoder.write_all(expected).unwrap();
        let compressed = encoder.finish().unwrap();
        let mut decoder = MultiBzDecoder::new(compressed.as_slice());
        let mut temporary = tempfile::NamedTempFile::new().unwrap();
        let count = write_demo(&mut decoder, temporary.as_file_mut(), |_| {}).unwrap();
        assert_eq!(count, expected.len() as u64);
        assert_eq!(fs::read(temporary.path()).unwrap().as_slice(), &expected[..]);
    }
    #[test]
    fn rejects_html_and_empty_replays() {
        let mut temporary = tempfile::NamedTempFile::new().unwrap();
        assert!(write_demo(&mut &b"<html>expired"[..], temporary.as_file_mut(), |_| {}).is_err());
        assert!(write_demo(&mut &b"PBDEMS2\0"[..], temporary.as_file_mut(), |_| {}).is_err());
    }
    #[test]
    fn finds_the_game_folder_from_supported_locations() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("dota 2 beta");
        let dota = root.join("game").join("dota");
        fs::create_dir_all(dota.join("replays")).unwrap();
        for selected in [&root, &root.join("game"), &dota, &dota.join("replays")] {
            assert_eq!(locate_dota(selected).unwrap(), dota.canonicalize().unwrap());
        }
        assert!(locate_dota(temporary.path()).is_err());
    }
    #[test] fn only_connects_to_the_configured_api_origin() {assert!(validate_api_origin("https://api.dota2notes.ir").is_ok());for url in ["https://api.dota2notes.ir.evil.com","http://api.dota2notes.ir","https://api.dota2notes.ir/file","https://user@api.dota2notes.ir"]{assert!(validate_api_origin(url).is_err());}}
}
