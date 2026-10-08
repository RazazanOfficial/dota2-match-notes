// Runs on the window's own UI thread. WM_SIZING adjusts the proposed rectangle,
// without a JS resize listener, IPC per pixel, or recursive SetWindowPos calls.
use std::ffi::c_void;
use super::aspect_geometry::{constrain, Ratio, Rect};
type Hwnd = *mut c_void;
type Subclass = unsafe extern "system" fn(Hwnd,u32,usize,isize,usize,usize)->isize;
const ID: usize = 0x444e4153;
#[link(name="comctl32")] extern "system" {
    fn SetWindowSubclass(hwnd:Hwnd,callback:Subclass,id:usize,data:usize)->i32;
    fn RemoveWindowSubclass(hwnd:Hwnd,callback:Subclass,id:usize)->i32;
    fn DefSubclassProc(hwnd:Hwnd,message:u32,wparam:usize,lparam:isize)->isize;
}
#[repr(C)] struct MonitorInfo { size:u32,monitor:Rect,work:Rect,flags:u32 }
#[link(name="user32")] extern "system" {
    fn GetWindowRect(hwnd:Hwnd,rect:*mut Rect)->i32;
    fn GetClientRect(hwnd:Hwnd,rect:*mut Rect)->i32;
    fn GetDpiForWindow(hwnd:Hwnd)->u32;
    fn MonitorFromWindow(hwnd:Hwnd,flags:u32)->*mut c_void;
    fn GetMonitorInfoW(monitor:*mut c_void,info:*mut MonitorInfo)->i32;
}
pub unsafe fn install(hwnd:Hwnd,r:Ratio)->Result<(),String> {
    let data=((r.width as usize)<<16) | r.height as usize;
    if SetWindowSubclass(hwnd,callback,ID,data)==0 {return Err("Could not install window aspect handler".into());}
    Ok(())
}
pub unsafe fn space(hwnd:Hwnd)->Result<(u32,u32),String> {
    let mut info=MonitorInfo{size:std::mem::size_of::<MonitorInfo>() as u32,monitor:Rect::default(),work:Rect::default(),flags:0};
    let mut outer=Rect::default();let mut client=Rect::default();
    if GetMonitorInfoW(MonitorFromWindow(hwnd,2),&mut info)==0 || GetWindowRect(hwnd,&mut outer)==0 || GetClientRect(hwnd,&mut client)==0 {
        return Err("Could not read window work area".into());
    }
    let margin=(24.0*GetDpiForWindow(hwnd).max(96) as f64/96.0).round() as i32;
    Ok(((info.work.width()-(outer.width()-client.width())-margin).max(1) as u32,
        (info.work.height()-(outer.height()-client.height())-margin).max(1) as u32))
}
unsafe extern "system" fn callback(hwnd:Hwnd,message:u32,wparam:usize,lparam:isize,_id:usize,data:usize)->isize {
    if message==0x0214 && lparam!=0 && (1..=8).contains(&wparam) {
        let mut outer=Rect::default();let mut client=Rect::default();
        if GetWindowRect(hwnd,&mut outer)!=0 && GetClientRect(hwnd,&mut client)!=0 {
            let r=Ratio{width:(data>>16) as i32,height:(data & 0xffff) as i32};
            if r.width>0 && r.height>0 {
                let scale=GetDpiForWindow(hwnd).max(96) as f64/96.0;
                let minimum=((800.0*scale).round() as i32,(450.0*scale).round() as i32);
                constrain(&mut *(lparam as *mut Rect),outer,wparam,r,(outer.width()-client.width(),outer.height()-client.height()),minimum);
                return 1;
            }
        }
    }
    if message==0x0082 {RemoveWindowSubclass(hwnd,callback,ID);}
    DefSubclassProc(hwnd,message,wparam,lparam)
}
