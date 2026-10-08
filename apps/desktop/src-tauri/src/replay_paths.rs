use std::path::Path;

// Canonical Windows paths remain unchanged for file operations. Only IPC/UI
// output removes the extended-length prefix (including its UNC variant).
pub fn display_path(path: &Path) -> String {
    display_path_string(&path.to_string_lossy())
}

fn display_path_string(path: &str) -> String {
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc}");
    }
    if let Some(disk) = path.strip_prefix(r"\\?\") {
        if disk.as_bytes().get(1) == Some(&b':') {
            return disk.into();
        }
    }
    path.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_paths_are_readable_without_changing_normal_paths() {
        assert_eq!(display_path_string(r"\\?\E:\Steam\dota 2 beta"), r"E:\Steam\dota 2 beta");
        assert_eq!(display_path_string(r"\\?\UNC\server\share\بازی"), r"\\server\share\بازی");
        assert_eq!(display_path_string(r"E:\Steam\dota 2 beta"), r"E:\Steam\dota 2 beta");
        assert_eq!(display_path_string("/home/steam/dota"), "/home/steam/dota");
    }
}
