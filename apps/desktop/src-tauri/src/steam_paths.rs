use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
// Valve KeyValues lexer: supports escaped Windows paths, quoted strings and comments.
pub fn tokens(input: &str) -> Vec<String> {
    let mut out = vec![];
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for x in chars.by_ref() {
                if x == '\n' {
                    break;
                }
            }
            continue;
        }
        if c == '"' {
            let mut s = String::new();
            while let Some(x) = chars.next() {
                if x == '"' {
                    break;
                }
                if x == '\\' {
                    if let Some(n) = chars.next() {
                        if n != '\\' && n != '"' {
                            s.push('\\');
                        }
                        s.push(n);
                    }
                } else {
                    s.push(x)
                }
            }
            out.push(s);
        } else if c == '{' || c == '}' {
            out.push(c.to_string());
        }
    }
    out
}
pub fn field(input: &str, key: &str) -> Option<String> {
    let tokens = tokens(input);
    tokens
        .windows(2)
        .find(|p| p[0].eq_ignore_ascii_case(key) && p[1] != "{")
        .map(|p| p[1].clone())
}
pub fn library_paths(input: &str) -> Vec<PathBuf> {
    let t = tokens(input);
    t.windows(2)
        .filter(|p| {
            p[0].eq_ignore_ascii_case("path")
                || (p[0].bytes().all(|b| b.is_ascii_digit()) && p[1] != "{")
        })
        .map(|p| PathBuf::from(&p[1]))
        .collect()
}
pub fn valid_install(root: &Path) -> bool {
    let dota = root.join("game/dota");
    #[cfg(windows)]
    let exe = root.join("game/bin/win64/dota2.exe");
    #[cfg(not(windows))]
    let exe = if root.join("game/bin/win64/dota2.exe").is_file() {
        root.join("game/bin/win64/dota2.exe")
    } else {
        root.join("game/bin/linuxsteamrt64/dota2")
    };
    dota.is_dir() && exe.is_file()
}
pub fn discover_from(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut libraries = vec![];
    for root in roots {
        libraries.push(root.clone());
        for relative in ["steamapps/libraryfolders.vdf", "config/libraryfolders.vdf"] {
            if let Ok(text) = fs::read_to_string(root.join(relative)) {
                libraries.extend(library_paths(&text));
            }
        }
    }
    let mut seen = HashSet::new();
    let mut installs = vec![];
    for library in libraries {
        let Ok(text) = fs::read_to_string(library.join("steamapps/appmanifest_570.acf")) else {
            continue;
        };
        if field(&text, "appid").as_deref() != Some("570") {
            continue;
        }
        let Some(name) = field(&text, "installdir") else {
            continue;
        };
        if name.contains('/') || name.contains('\\') || name == ".." {
            continue;
        }
        let root = library.join("steamapps/common").join(name);
        if valid_install(&root) {
            if let Ok(root) = root.canonicalize() {
                if seen.insert(root.clone()) {
                    installs.push(root)
                }
            }
        }
    }
    installs
}
pub fn steam_roots() -> Vec<PathBuf> {
    let mut roots = vec![];
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        for (key, value) in [
            (r"HKCU\Software\Valve\Steam", "SteamPath"),
            (r"HKLM\SOFTWARE\Valve\Steam", "InstallPath"),
            (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        ] {
            if let Ok(output) = Command::new("reg.exe")
                .args(["query", key, "/v", value])
                .creation_flags(0x08000000)
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if let Some((_, path)) = line.split_once("REG_SZ") {
                        roots.push(PathBuf::from(path.trim()));
                    }
                }
            }
        }
        for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Some(base) = std::env::var_os(variable) {
                roots.push(PathBuf::from(base).join("Steam"));
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(PathBuf::from(&home).join(".steam/steam"));
            roots.push(PathBuf::from(home).join(".local/share/Steam"));
        }
    }
    roots
}
pub fn discover() -> Vec<PathBuf> {
    discover_from(&steam_roots())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_second_library_without_scanning_drives() {
        let tmp = tempfile::tempdir().unwrap();
        let steam = tmp.path().join("Steam");
        let library = tmp.path().join("Other Games");
        let root = library.join("steamapps/common/dota 2 beta");
        fs::create_dir_all(steam.join("steamapps")).unwrap();
        fs::create_dir_all(root.join("game/dota")).unwrap();
        fs::create_dir_all(root.join("game/bin/win64")).unwrap();
        fs::write(root.join("game/bin/win64/dota2.exe"), b"exe").unwrap();
        fs::write(
            steam.join("steamapps/libraryfolders.vdf"),
            format!(
                "\"libraryfolders\" {{ \"1\" {{ \"path\" \"{}\" }} }}",
                library.display()
            ),
        )
        .unwrap();
        fs::write(
            library.join("steamapps/appmanifest_570.acf"),
            "\"AppState\" {\"appid\" \"570\" \"installdir\" \"dota 2 beta\"}",
        )
        .unwrap();
        assert_eq!(
            discover_from(&[steam.clone()]),
            vec![root.canonicalize().unwrap()]
        );
        fs::remove_file(root.join("game/bin/win64/dota2.exe")).unwrap();
        assert!(discover_from(&[steam]).is_empty());
    }
    #[test]
    fn parses_windows_escapes_and_rejects_wrong_app() {
        assert_eq!(
            library_paths(r#""libraryfolders" { "0" {"path" "D:\\SteamLibrary"} }"#),
            vec![PathBuf::from(r"D:\SteamLibrary")]
        );
        assert_eq!(
            field(r#""AppState"{"appid" "570"}"#, "appid").as_deref(),
            Some("570")
        );
    }
}
