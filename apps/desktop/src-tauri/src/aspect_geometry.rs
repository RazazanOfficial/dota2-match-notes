#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ratio { pub width: i32, pub height: i32 }
pub fn ratio(id: &str) -> Option<Ratio> {
    let (width, height) = match id {
        "16:9" => (16,9), "16:10" => (16,10), "21:9" => (21,9),
        "4:3" => (4,3), "3:2" => (3,2), _ => return None,
    };
    Some(Ratio { width, height })
}
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }
impl Rect {
    pub fn width(&self) -> i32 { self.right - self.left }
    pub fn height(&self) -> i32 { self.bottom - self.top }
}
pub fn constrain(rect: &mut Rect, previous: Rect, edge: usize, r: Ratio, chrome: (i32,i32), minimum: (i32,i32)) {
    let n = r.width as f64 / r.height as f64;
    let width = (rect.width() - chrome.0).max(1) as f64;
    let height = (rect.height() - chrome.1).max(1) as f64;
    let vertical = matches!(edge,3|6) || (matches!(edge,4|5|7|8) &&
        (rect.height() - previous.height()).abs() as f64 * n > (rect.width() - previous.width()).abs() as f64);
    let w = (if vertical { height * n } else { width }).max(minimum.0 as f64).max(minimum.1 as f64 * n);
    let total_w = w.round() as i32 + chrome.0;
    let total_h = (w / n).round() as i32 + chrome.1;
    if matches!(edge,1|4|7) { rect.left = rect.right - total_w; } else { rect.right = rect.left + total_w; }
    if matches!(edge,3|4|5) { rect.top = rect.bottom - total_h; } else { rect.bottom = rect.top + total_h; }
}
pub fn fit_size(r: Ratio, width: u32, maximum: (u32,u32), minimum: (u32,u32)) -> Option<(u32,u32)> {
    let n = r.width as f64 / r.height as f64;
    let lower = (minimum.0 as f64).max(minimum.1 as f64 * n);
    let upper = (maximum.0 as f64).min(maximum.1 as f64 * n);
    if lower > upper { return None; }
    let w = (width as f64).max(lower).min(upper).floor() as u32;
    Some((w,(w as f64 / n).round() as u32))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn validates_only_supported_ratios() { assert!(ratio("16:9").is_some());assert!(ratio("1920x1080").is_none());assert!(ratio("0:0").is_none()); }
    #[test] fn preserves_opposite_drag_anchors_and_client_ratio_on_all_eight_edges() {
        for id in ["16:9","16:10","21:9","4:3","3:2"] { for edge in 1..=8 {
            let r=ratio(id).unwrap();let old=Rect{left:100,top:100,right:1514,bottom:932};
            let mut rect=Rect{left:70,top:80,right:1650,bottom:990};let proposal=rect;
            constrain(&mut rect,old,edge,r,(14,32),(800,450));
            let w=rect.width()-14;let h=rect.height()-32;
            assert!((w as f64 / h as f64 - r.width as f64 / r.height as f64).abs()<0.003);
            assert!(w>=800 && h>=450);
            if matches!(edge,1|4|7) {assert_eq!(rect.right,proposal.right);}else{assert_eq!(rect.left,proposal.left);}
            if matches!(edge,3|4|5) {assert_eq!(rect.bottom,proposal.bottom);}else{assert_eq!(rect.top,proposal.top);}
        }}
    }
    #[test] fn handles_scaled_frame_and_minimum_without_rounding_drift() {
        let mut rect=Rect{left:0,top:0,right:600,bottom:300};
        let previous=rect;
        constrain(&mut rect,previous,8,ratio("21:9").unwrap(),(21,48),(1200,675));
        assert_eq!(rect.height(),723);assert_eq!(rect.width(),1596);
    }
    #[test] fn fits_work_area_and_rejects_a_display_below_the_minimum() {
        assert_eq!(fit_size(ratio("4:3").unwrap(),1480,(1882,984),(800,450)),Some((1312,984)));
        assert_eq!(fit_size(ratio("21:9").unwrap(),800,(1882,984),(800,450)),Some((1050,450)));
        assert_eq!(fit_size(ratio("16:9").unwrap(),1480,(799,449),(800,450)),None);
    }
}
