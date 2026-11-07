use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
#[derive(Clone, Deserialize, Serialize)]
pub struct Asset {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
    pub object: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Manifest {
    pub version: String,
    pub files: Vec<Asset>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetProgress {
    pub bytes: u64,
    pub total_bytes: u64,
    pub complete: usize,
    pub total: usize,
}
fn error(_: impl std::fmt::Display) -> String {
    "asset_cache_failed".into()
}
pub fn shared_root() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        return std::env::var_os("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("DotaNotesShared"))
            .ok_or_else(|| "asset_cache_failed".into());
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")))
            .ok_or("asset_cache_failed")?;
        Ok(home.join("DotaNotesShared"))
    }
}
pub fn embedded_manifest() -> Result<Manifest, String> {
    let manifest: Manifest =
        serde_json::from_str(include_str!("../../asset-manifest.json")).map_err(error)?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}
pub fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.files.is_empty() || manifest.files.len() > 10_000 || manifest.version.len() != 64 {
        return Err("asset_manifest_invalid".into());
    }
    let mut seen = std::collections::HashSet::new();
    let mut total = 0u64;
    for file in &manifest.files {
        let path = Path::new(&file.path);
        if path.is_absolute()
            || file.path.contains('\\')
            || file.path.contains(':')
            || path
                .components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
            || !seen.insert(&file.path)
            || file.sha256.len() != 64
            || !file.sha256.bytes().all(|c| c.is_ascii_hexdigit())
            || file.bytes == 0
            || file.bytes > 512 * 1024 * 1024
            || !file.object.starts_with(&file.sha256)
            || file.object.contains('/')
            || file.object.contains('\\')
            || !allowed_extension(&file.path)
        {
            return Err("asset_manifest_invalid".into());
        }
        total = total
            .checked_add(file.bytes)
            .ok_or("asset_manifest_invalid")?;
    }
    if total > 2 * 1024 * 1024 * 1024 {
        return Err("asset_manifest_invalid".into());
    }
    Ok(())
}
fn allowed_extension(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|x| x.to_str())
        .is_some_and(|e| {
            matches!(
                e,
                "png"
                    | "jpg"
                    | "jpeg"
                    | "webp"
                    | "svg"
                    | "gif"
                    | "ico"
                    | "woff"
                    | "woff2"
                    | "mp4"
                    | "webm"
            )
        })
}
pub fn object_path(root: &Path, file: &Asset) -> PathBuf {
    root.join("assets/objects").join(&file.object)
}
pub fn verified(path: &Path, file: &Asset) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    if !meta.is_file() || meta.len() != file.bytes {
        return false;
    }
    let Ok(mut input) = File::open(path) else {
        return false;
    };
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => hash.update(&buffer[..n]),
            Err(_) => return false,
        }
    }
    format!("{:x}", hash.finalize()) == file.sha256
}
pub fn status(root: &Path, manifest: &Manifest) -> AssetProgress {
    let mut bytes = 0;
    let mut complete = 0;
    for file in &manifest.files {
        if verified(&object_path(root, file), file) {
            bytes += file.bytes;
            complete += 1
        }
    }
    AssetProgress {
        bytes,
        total_bytes: manifest.files.iter().map(|f| f.bytes).sum(),
        complete,
        total: manifest.files.len(),
    }
}
pub fn prepare(
    root: &Path,
    manifest: &Manifest,
    report: impl Fn(AssetProgress) + Sync,
) -> Result<(), String> {
    validate_manifest(manifest)?;
    fs::create_dir_all(root.join("assets/objects")).map_err(error)?;
    let initial = status(root, manifest);
    let bytes = AtomicU64::new(initial.bytes);
    let complete = AtomicU64::new(initial.complete as u64);
    let missing: Vec<&Asset> = manifest
        .files
        .iter()
        .filter(|f| !verified(&object_path(root, f), f))
        .collect();
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("DotaNotesAssets/1")
        .build()
        .map_err(error)?;
    let total_bytes = initial.total_bytes;
    let total = initial.total;
    let result = std::thread::scope(|scope| {
        let mut workers = vec![];
        for chunk in missing.chunks(missing.len().div_ceil(4).max(1)) {
            let client = &client;
            let bytes = &bytes;
            let complete = &complete;
            let report = &report;
            workers.push(scope.spawn(move || -> Result<(), String> {
                for asset in chunk {
                    let path = object_path(root, asset);
                    let mut last_error = "asset_download_failed".to_string();
                    let mut saved = false;
                    for attempt in 0..3 {
                        if attempt > 0 {
                            std::thread::sleep(Duration::from_secs(attempt));
                        }
                        let result = (|| -> Result<(), String> {
                            let mut response = client
                                .get(format!(
                                    "https://api.dota2notes.ir/desktop-assets/objects/{}",
                                    asset.object
                                ))
                                .send()
                                .map_err(|_| "asset_download_failed")?;
                            if !response.status().is_success()
                                || response.content_length().is_some_and(|n| n != asset.bytes)
                            {
                                return Err("asset_download_failed".into());
                            }
                            let mut temporary =
                                tempfile::NamedTempFile::new_in(path.parent().unwrap())
                                    .map_err(error)?;
                            let mut count = 0u64;
                            let mut hash = Sha256::new();
                            let mut buffer = [0; 65536];
                            loop {
                                let n = response
                                    .read(&mut buffer)
                                    .map_err(|_| "asset_download_failed")?;
                                if n == 0 {
                                    break;
                                }
                                count += n as u64;
                                if count > asset.bytes {
                                    return Err("asset_integrity_failed".into());
                                }
                                hash.update(&buffer[..n]);
                                temporary.write_all(&buffer[..n]).map_err(error)?;
                            }
                            if count != asset.bytes
                                || format!("{:x}", hash.finalize()) != asset.sha256
                            {
                                return Err("asset_integrity_failed".into());
                            }
                            temporary.persist(&path).map_err(error)?;
                            Ok(())
                        })();
                        match result {
                            Ok(()) => {
                                saved = true;
                                break;
                            }
                            Err(e) => last_error = e,
                        }
                    }
                    if !saved {
                        return Err(last_error);
                    }
                    let current = bytes.fetch_add(asset.bytes, Ordering::Relaxed) + asset.bytes;
                    let count = complete.fetch_add(1, Ordering::Relaxed) + 1;
                    report(AssetProgress {
                        bytes: current,
                        total_bytes,
                        complete: count as usize,
                        total,
                    });
                }
                Ok(())
            }));
        }
        for worker in workers {
            worker.join().map_err(|_| "asset_download_failed")??;
        }
        Ok::<(), String>(())
    });
    result?;
    fs::write(root.join("assets/current-version"), &manifest.version).map_err(error)?;
    Ok(())
}
pub fn resolve(root: &Path, manifest: &Manifest, path: &str) -> Option<PathBuf> {
    manifest
        .files
        .iter()
        .find(|f| f.path == path.trim_start_matches('/'))
        .map(|file| object_path(root, file))
        .filter(|p| p.is_file())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_escape_and_executables() {
        let asset = Asset {
            path: "../escape.png".into(),
            bytes: 3,
            sha256: "a".repeat(64),
            object: format!("{}.png", "a".repeat(64)),
        };
        let mut m = Manifest {
            version: "b".repeat(64),
            files: vec![asset],
        };
        assert!(validate_manifest(&m).is_err());
        m.files[0].path = "tools/run.exe".into();
        assert!(validate_manifest(&m).is_err());
        m.files[0].path = "heroes/a.png".into();
        assert!(validate_manifest(&m).is_ok());
    }
    #[test]
    fn detects_missing_and_same_size_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = b"abc";
        let a = Asset {
            path: "heroes/a.png".into(),
            bytes: 3,
            sha256: format!("{:x}", Sha256::digest(bytes)),
            object: "fixture.png".into(),
        };
        let path = object_path(dir.path(), &a);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        assert!(!verified(&path, &a));
        fs::write(&path, bytes).unwrap();
        assert!(verified(&path, &a));
        fs::write(&path, b"abd").unwrap();
        assert!(!verified(&path, &a));
    }
}
