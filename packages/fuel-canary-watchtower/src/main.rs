use anyhow::Result;
use fuel_canary_watchtower::WatchtowerConfig;
use log::{error, info};
use std::env;

pub static WATCHTOWER_CONFIG_FILE: &str = "watchtower_config.json";
pub static LOGGING_CONFIG_FILE: &str = "logging_config.yaml";

#[tokio::main]
async fn main() {
    setup_logging();
    let config_file = determine_config_file();
    match load_config(&config_file) {
        Ok(config) => {
            start_watchtower(&config).await;
        }
        Err(e) => {
            log::error!("Error loading config: {}", e);
            std::process::exit(1);
        }
    }
}

fn setup_logging() {
    log4rs::init_file(LOGGING_CONFIG_FILE, Default::default()).expect("Failed to initialize logging");
}

fn determine_config_file() -> String {
    let args: Vec<String> = env::args().collect();
    if args.len() > 1 && args[1].ends_with(".json") {
        info!("Using config file: {}", args[1]);
        args[1].clone()
    } else {
        if args.len() > 1 {
            info!("Invalid config file specified: {}", args[1]);
        }
        info!("Using default config file: {}", WATCHTOWER_CONFIG_FILE);
        WATCHTOWER_CONFIG_FILE.to_string()
    }
}

fn load_config(config_file: &str) -> Result<WatchtowerConfig> {
    match fuel_canary_watchtower::load_config(config_file) {
        Ok(config) => Ok(config),
        Err(e) => Err(anyhow::anyhow!("Failed to load config: {e}")),
    }
}

async fn start_watchtower(config: &WatchtowerConfig) {
    if let Err(e) = fuel_canary_watchtower::run(config).await {
        error!("Watchtower run failed: {}", e);
    }
}
