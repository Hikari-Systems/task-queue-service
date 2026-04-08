use serde::Deserialize;
use std::fs;

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DbSslConfig {
    pub enabled: bool,
    pub verify: bool,
    #[serde(rename = "caCertFile")]
    pub ca_cert_file: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DbConfig {
    pub host: String,
    pub port: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssl: DbSslConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LogConfig {
    pub level: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub log: LogConfig,
    pub db: DbConfig,
}

fn apply_override(node: &mut serde_json::Value, path: &[&str], value: &str) {
    if path.is_empty() {
        return;
    }
    if path.len() == 1 {
        if let Some(existing) = node.get_mut(path[0]) {
            *existing = match existing {
                serde_json::Value::Bool(_) => serde_json::Value::Bool(value.trim() == "true"),
                serde_json::Value::Number(n) if n.is_i64() => value
                    .trim()
                    .parse::<i64>()
                    .map(|v| serde_json::Value::Number(v.into()))
                    .unwrap_or_else(|_| serde_json::Value::Number(n.clone())),
                _ => serde_json::Value::String(value.to_string()),
            };
        }
        return;
    }
    if let Some(child) = node.get_mut(path[0]) {
        apply_override(child, &path[1..], value);
    }
}

pub fn load() -> AppConfig {
    let config_path = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.json".to_string());
    let raw = fs::read_to_string(&config_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", config_path, e));
    let mut root: serde_json::Value =
        serde_json::from_str(&raw).expect("Failed to parse config.json");

    // Apply env var overrides using __ as path separator (exact camelCase key names)
    for (key, value) in std::env::vars() {
        if !key.contains("__") {
            continue;
        }
        let parts: Vec<&str> = key.split("__").collect();
        apply_override(&mut root, &parts, &value);
    }

    serde_json::from_value(root).expect("Failed to deserialize config")
}
