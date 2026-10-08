use super::aspect_geometry::ratio;
#[cfg(windows)]
fn apply(window:&tauri::WebviewWindow,id:&str,resize:bool)->Result<(),String> {
    let r=ratio(id).ok_or("Unsupported aspect ratio")?;
    let hwnd=window.hwnd().map_err(|e|e.to_string())?.0 as *mut std::ffi::c_void;
    // Maximize uses all the display. The aspect restriction only applies to normal dragging.
    let size=if resize && !window.is_maximized().map_err(|e|e.to_string())? {
        let scale=window.scale_factor().map_err(|e|e.to_string())?;
        let inner=window.inner_size().map_err(|e|e.to_string())?;
        let maximum=unsafe{super::aspect_windows::space(hwnd)}?;
        let minimum=((800.0*scale).round() as u32,(450.0*scale).round() as u32);
        let (width,height)=super::aspect_geometry::fit_size(r,inner.width,maximum,minimum).ok_or("Display is below the minimum size")?;
        Some(tauri::PhysicalSize::new(width,height))
    }else{None};
    unsafe{super::aspect_windows::install(hwnd,r)}?;
    if let Some(size)=size {if window.inner_size().map_err(|e|e.to_string())?!=size {window.set_size(size).map_err(|e|e.to_string())?;}}
    Ok(())
}
#[cfg(not(windows))]
fn apply(_window:&tauri::WebviewWindow,_id:&str,_resize:bool)->Result<(),String> {
    Err("Native aspect dragging is supported on Windows".into())
}
#[tauri::command]
pub async fn set_window_aspect_ratio(window:tauri::WebviewWindow,ratio:String,resize:bool)->Result<(),String> {
    if window.label()!="main" || super::aspect_geometry::ratio(&ratio).is_none() {return Err("Unsupported window aspect request".into());}
    let (sender,receiver)=std::sync::mpsc::channel();
    let target=window.clone();
    window.run_on_main_thread(move||{let _=sender.send(apply(&target,&ratio,resize));}).map_err(|e|e.to_string())?;
    tauri::async_runtime::spawn_blocking(move||receiver.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_|"Window aspect request timed out".to_string()))
        .await.map_err(|e|e.to_string())??
}
