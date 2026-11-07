use crate::asset_cache::{self, AssetProgress};
use std::io::{Read, Seek, SeekFrom};
use tauri::Emitter;
#[tauri::command]
pub async fn asset_status() -> Result<AssetProgress, String> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(asset_cache::status(
            &asset_cache::shared_root()?,
            &asset_cache::embedded_manifest()?,
        ))
    })
    .await
    .map_err(|_| "asset_cache_failed")?
}
#[tauri::command]
pub async fn prepare_assets(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        asset_cache::prepare(
            &asset_cache::shared_root()?,
            &asset_cache::embedded_manifest()?,
            |value| {
                let _ = app.emit("asset-progress", value);
            },
        )
    })
    .await
    .map_err(|_| "asset_cache_failed")?
}
pub fn respond(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let response = (|| -> Option<tauri::http::Response<Vec<u8>>> {
        let root = asset_cache::shared_root().ok()?;
        let manifest = asset_cache::embedded_manifest().ok()?;
        let path = asset_cache::resolve(&root, &manifest, request.uri().path())?;
        let mut file = std::fs::File::open(&path).ok()?;
        let len = file.metadata().ok()?.len();
        let extension = path.extension()?.to_str()?;
        let mime = match extension {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "gif" => "image/gif",
            "ico" => "image/x-icon",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            _ => return None,
        };
        let mut builder = tauri::http::Response::builder()
            .header("Content-Type", mime)
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .header("Access-Control-Allow-Origin", "*");
        let mut body = vec![];
        if let Some(range) = request.headers().get("range").and_then(|r| r.to_str().ok()) {
            let (start, end) = range.strip_prefix("bytes=")?.split_once('-')?;
            let start: u64 = start.parse().ok()?;
            let end: u64 = if end.is_empty() {
                len.checked_sub(1)?
            } else {
                end.parse().ok()?
            };
            if start > end || end >= len {
                return tauri::http::Response::builder()
                    .status(416)
                    .header("Content-Range", format!("bytes */{len}"))
                    .body(vec![])
                    .ok();
            }
            file.seek(SeekFrom::Start(start)).ok()?;
            file.take(end - start + 1).read_to_end(&mut body).ok()?;
            builder = builder
                .status(206)
                .header("Content-Range", format!("bytes {start}-{end}/{len}"));
        } else {
            file.read_to_end(&mut body).ok()?;
        }
        builder
            .header("Content-Length", body.len().to_string())
            .body(if request.method() == tauri::http::Method::HEAD {
                vec![]
            } else {
                body
            })
            .ok()
    })();
    response.unwrap_or_else(|| {
        tauri::http::Response::builder()
            .status(404)
            .body(vec![])
            .unwrap()
    })
}
