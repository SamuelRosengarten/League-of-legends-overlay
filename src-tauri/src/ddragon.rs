//! Riot Data Dragon (static game data: item, rune, spell and champion names and icons).
//! JSON is cached on disk so icons and tooltips keep working offline after the first run.

use std::path::Path;
use std::time::{Duration, SystemTime};

const BASE: &str = "https://ddragon.leagueoflegends.com/";
/// How long the unversioned `api/versions.json` is trusted before re-checking.
const VERSIONS_TTL: Duration = Duration::from_secs(6 * 60 * 60);

/// Only plain Data Dragon JSON paths are allowed (`api/...json` or `cdn/...json`).
pub fn valid_path(path: &str) -> bool {
    (path.starts_with("api/") || path.starts_with("cdn/"))
        && path.ends_with(".json")
        && !path.contains("..")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "/._-".contains(c))
}

fn cache_name(path: &str) -> String {
    path.replace('/', "_")
}

/// `cdn/<version>/...` files never change once published; `api/...` files do.
fn is_versioned(path: &str) -> bool {
    path.starts_with("cdn/")
}

fn is_fresh(file: &Path, ttl: Duration) -> bool {
    std::fs::metadata(file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < ttl)
}

pub fn agent() -> ureq::Agent {
    let tls = native_tls::TlsConnector::new().expect("tls");
    ureq::AgentBuilder::new()
        .tls_connector(std::sync::Arc::new(tls))
        .timeout(Duration::from_secs(15))
        .build()
}

/// Return the JSON at `path`, from the disk cache when possible. If the network fails,
/// a stale cached copy is better than nothing.
pub fn get(agent: &ureq::Agent, cache_dir: &Path, path: &str) -> Result<String, String> {
    if !valid_path(path) {
        return Err(format!("invalid Data Dragon path: {path}"));
    }
    let file = cache_dir.join(cache_name(path));
    let cached = file.exists() && (is_versioned(path) || is_fresh(&file, VERSIONS_TTL));
    if cached {
        if let Ok(text) = std::fs::read_to_string(&file) {
            return Ok(text);
        }
    }
    let fetched = agent
        .get(&format!("{BASE}{path}"))
        .call()
        .map_err(|e| e.to_string())
        .and_then(|r| r.into_string().map_err(|e| e.to_string()));
    match fetched {
        Ok(text) => {
            let _ = std::fs::create_dir_all(cache_dir);
            let _ = std::fs::write(&file, &text);
            Ok(text)
        }
        Err(e) => std::fs::read_to_string(&file).map_err(|_| e),
    }
}

/// The newest version in `api/versions.json` (a JSON array, newest first).
pub fn latest_version(versions_json: &str) -> Option<String> {
    let list: Vec<String> = serde_json::from_str(versions_json).ok()?;
    list.into_iter().next().filter(|v| !v.is_empty())
}

/// Delete cached files of older Data Dragon versions, which are never used again.
pub fn prune(cache_dir: &Path, current: &str) {
    let keep = format!("cdn_{current}_");
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("cdn_") && !name.starts_with(&keep) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_data_dragon_json_paths_are_valid() {
        assert!(valid_path("api/versions.json"));
        assert!(valid_path("cdn/16.20.1/data/en_US/item.json"));
        assert!(!valid_path("cdn/16.20.1/img/item/1055.png"));
        assert!(!valid_path("cdn/../../etc/passwd.json"));
        assert!(!valid_path("https://evil.example/x.json"));
        assert!(!valid_path("other/x.json"));
    }

    #[test]
    fn latest_version_is_the_first_entry() {
        assert_eq!(
            latest_version(r#"["16.20.1","16.19.1"]"#).as_deref(),
            Some("16.20.1")
        );
        assert_eq!(latest_version("[]"), None);
        assert_eq!(latest_version("nope"), None);
    }

    #[test]
    fn prune_removes_only_older_versioned_files() {
        let dir = std::env::temp_dir().join(format!("ddragon-prune-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in [
            "cdn_16.19.1_data_en_US_item.json",
            "cdn_16.20.1_data_en_US_item.json",
            "api_versions.json",
        ] {
            std::fs::write(dir.join(name), "{}").unwrap();
        }
        prune(&dir, "16.20.1");
        assert!(!dir.join("cdn_16.19.1_data_en_US_item.json").exists());
        assert!(dir.join("cdn_16.20.1_data_en_US_item.json").exists());
        assert!(dir.join("api_versions.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn versioned_files_come_from_cache_without_network() {
        let dir = std::env::temp_dir().join(format!("ddragon-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = "cdn/1.0.0/data/en_US/item.json";
        std::fs::write(dir.join(cache_name(path)), r#"{"cached":true}"#).unwrap();
        // An agent that cannot connect anywhere proves the network isn't touched.
        let offline = ureq::AgentBuilder::new()
            .proxy(ureq::Proxy::new("http://127.0.0.1:9").unwrap())
            .build();
        assert_eq!(get(&offline, &dir, path).unwrap(), r#"{"cached":true}"#);
        assert!(get(&offline, &dir, "cdn/1.0.0/data/en_US/missing.json").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
