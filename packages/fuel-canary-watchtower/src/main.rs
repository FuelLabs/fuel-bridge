use anyhow::Result;
use fuel_canary_watchtower::{init_logger, parse, Error};
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<()> {
    init_logger();

    info!("Starting watchtower");

    if let Err(e) = run().await {
        error!("{:?}", e);
        std::process::exit(1);
    }

    info!("Watchtower exiting");

    Ok(())
}

async fn run() -> Result<()> {
    let config = parse()?;
    fuel_canary_watchtower::run(&config)
        .await
        .map_err(|e| Error::Other(format!("Watchtower run failed: {}", e)))?;

    Ok(())
}

//TODO: Add default watchtower_config_file config
