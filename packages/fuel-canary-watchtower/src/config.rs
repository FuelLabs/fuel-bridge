use crate::alerter::AlertLevel;
use crate::ethereum_actions::EthereumAction;

use anyhow::Result;
use clap::Parser;
use config::{Config, File};
use ethers::types::U256;
use serde::Deserialize;
use std::path::PathBuf;
use std::{env, fs, time::Duration};
use tracing::{error, info, warn};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::layer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

pub static PRIVATE_KEY_ENV_VAR: &str = "WATCHTOWER_ETH_PRIVATE_KEY";
pub static PAGERDUTY_KEY_ENV_VAR: &str = "WATCHTOWER_PAGERDUTY_KEY";

#[derive(Deserialize, Clone, Debug, Default)]
pub struct WatchtowerConfig {
    pub watchtower_system_name: String,
    pub fuel_graphql: String,
    pub ethereum_rpc: String,
    pub state_contract_address: String,
    pub portal_contract_address: String,
    pub gateway_contract_address: String,
    pub ethereum_wallet_key: Option<String>,
    pub pagerduty_api_key: Option<String>,
    pub duplicate_alert_delay: u32,
    pub min_duration_from_start_to_err: Duration,
    pub alert_cache_expiry: Duration,
    pub fuel_client_watcher: FuelClientWatcher,
    pub ethereum_client_watcher: EthereumClientWatcher,
    #[serde(default = "default_coefficient")]
    pub coefficient: f64,
    #[serde(default = "default_every_secs")]
    pub every_secs: u64,
    #[serde(default = "default_max_price")]
    pub max_price: Option<i32>,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct FuelClientWatcher {
    pub connection_alert: GenericAlert,
    pub query_alert: GenericAlert,
    pub block_production_alert: BlockProductionAlert,
    pub portal_withdrawal_alerts: Vec<WithdrawAlert>,
    pub gateway_withdrawal_alerts: Vec<WithdrawAlert>,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct EthereumClientWatcher {
    pub connection_alert: GenericAlert,
    pub query_alert: GenericAlert,
    pub block_production_alert: BlockProductionAlert,
    pub account_funds_alert: AccountFundsAlert,
    pub invalid_state_commit_alert: GenericAlert,
    pub portal_deposit_alerts: Vec<DepositAlert>,
    pub portal_withdrawal_alerts: Vec<WithdrawAlert>,
    pub gateway_deposit_alerts: Vec<DepositAlert>,
    pub gateway_withdrawal_alerts: Vec<WithdrawAlert>,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct GenericAlert {
    #[serde(default = "default_alert_level")]
    pub alert_level: AlertLevel,
    #[serde(default = "default_alert_action")]
    pub alert_action: EthereumAction,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct BlockProductionAlert {
    #[serde(default = "default_alert_level")]
    pub alert_level: AlertLevel,
    #[serde(default = "default_alert_action")]
    pub alert_action: EthereumAction,
    #[serde(default = "default_max_block_time")]
    pub max_block_time: u32,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct AccountFundsAlert {
    #[serde(default = "default_alert_level")]
    pub alert_level: AlertLevel,
    #[serde(default = "default_alert_action")]
    pub alert_action: EthereumAction,
    #[serde(default = "default_minimum_balance")]
    pub min_balance: f64,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct DepositAlert {
    #[serde(default = "default_alert_level")]
    pub alert_level: AlertLevel,
    #[serde(default = "default_alert_action")]
    pub alert_action: EthereumAction,
    #[serde(default = "default_token_name")]
    pub token_name: String,
    #[serde(default = "default_token_decimals_ethereum")]
    pub token_decimals: u8,
    #[serde(default = "default_token_address")]
    pub token_address: String,
    #[serde(default = "default_time_frame")]
    pub time_frame: u32,
    #[serde(default = "default_amount")]
    pub amount: f64,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct WithdrawAlert {
    #[serde(default = "default_alert_level")]
    pub alert_level: AlertLevel,
    #[serde(default = "default_alert_action")]
    pub alert_action: EthereumAction,
    #[serde(default = "default_token_name")]
    pub token_name: String,
    #[serde(default = "default_token_decimals_fuel")]
    pub token_decimals: u8,
    #[serde(default = "default_token_address")]
    pub token_address: String,
    #[serde(default = "default_time_frame")]
    pub time_frame: u32,
    #[serde(default = "default_amount")]
    pub amount: f64,
}

// deserialization default functions
pub fn default_alert_action() -> EthereumAction {
    EthereumAction::None
}
pub fn default_alert_level() -> AlertLevel {
    AlertLevel::None
}
pub fn default_max_block_time() -> u32 {
    60
}
pub fn default_minimum_balance() -> f64 {
    0.1
}
pub fn default_token_name() -> String {
    String::from("ETH")
}
pub fn default_token_address() -> String {
    String::from("0x0000000000000000000000000000000000000000000000000000000000000000")
}
pub fn default_token_decimals_fuel() -> u8 {
    9
}
pub fn default_token_decimals_ethereum() -> u8 {
    18
}
pub fn default_time_frame() -> u32 {
    300
}
pub fn default_amount() -> f64 {
    1000.0
}
pub fn default_coefficient() -> f64 {
    1.125
}
pub fn default_every_secs() -> u64 {
    60
}
pub fn default_max_price() -> Option<i32> {
    None
}

// loads a config from a json file
pub fn load_config(file_path: &str) -> Result<WatchtowerConfig> {
    let json_string = fs::read_to_string(file_path)?;
    let mut config: WatchtowerConfig = serde_json::from_str(&json_string)?;

    retrieve_key_from_env(
        &mut config.ethereum_wallet_key,
        PRIVATE_KEY_ENV_VAR,
        "Specifying the ethereum private key in the config file is not safe. Please use the {} environment variable instead",
        Some("Environment variable not specified. Some alerts and actions have been disabled"),
    );

    retrieve_key_from_env(
        &mut config.pagerduty_api_key,
        PAGERDUTY_KEY_ENV_VAR,
        "Specifying the pagerduty api key in the config file is not safe. Please use the {} environment variable instead",
        Some("Environment variable not specified. Alerting on PagerDuty has been disabled"),
    );

    Ok(config)
}

pub fn convert_to_decimal_u256(amt: U256, decimals: u8) -> String {
    let conversion_factor = 10u128.pow(decimals as u32);
    let amt_decimal = amt.as_u128() as f64 / conversion_factor as f64;
    let formatted_amt = format!("{:.6}", amt_decimal);
    formatted_amt.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn convert_to_decimal_u64(amt: u64, decimals: u8) -> String {
    let conversion_factor = 10u64.pow(decimals as u32);
    let amt_decimal = amt as f64 / conversion_factor as f64;
    let formatted_amt = format!("{:.6}", amt_decimal); // Format with up to 6 decimal places
    formatted_amt.trim_end_matches('0').trim_end_matches('.').to_string()
}

#[derive(Parser, Debug)]
#[command(
    name = "fuel-canary-watchtower",
    version,
    about,
    propagate_version = true,
    arg_required_else_help(true)
)]
pub struct Cli {
    #[arg(
        value_name = "WATCHTOWER_CONFIG_FILE",
        help = "Path to the watchtower config file",
        env = "WATCHTOWER_CONFIG_FILE"
    )]
    watchtower_config_file: PathBuf,
    #[arg(
        value_name = "LOGGING_CONFIG_FILE",
        help = "Path to the logging config file",
        env = "LOGGING_CONFIG_FILE"
    )]
    watchtower_eth_private_key: Option<String>,
    #[arg(
        value_name = "WATCHTOWER_PAGERDUTY_KEY",
        help = "Watchtower pagerduty key",
        env = "WATCHTOWER_PAGERDUTY_KEY"
    )]
    watchtower_pagerduty_key: Option<String>,
}

pub fn parse() -> crate::errors::Result<WatchtowerConfig> {
    let cli = Cli::parse();

    let watchtower_config: WatchtowerConfig = Config::builder()
        .add_source(File::from(cli.watchtower_config_file.clone()))
        .build()
        .map_err(crate::errors::Error::from)?
        .try_deserialize()
        .map_err(|e| {
            crate::errors::Error::Parsing(format!("{} in {}", e, cli.watchtower_config_file.to_string_lossy()))
        })?;
    info!("Using config file: {}", cli.watchtower_config_file.to_string_lossy());

    retrieve_key_from_env(
        &watchtower_config.ethereum_wallet_key,
        PRIVATE_KEY_ENV_VAR,
        "Specifying the ethereum private key in the config file is not safe. Please use the {} environment variable instead",
        Some("Environment variable not specified. Some alerts and actions have been disabled"),
    );

    retrieve_key_from_env(
        &watchtower_config.pagerduty_api_key,
        PAGERDUTY_KEY_ENV_VAR,
        "Specifying the pagerduty api key in the config file is not safe. Please use the {} environment variable instead",
        Some("Environment variable not specified. Alerting on PagerDuty has been disabled"),
    );

    Ok(watchtower_config)
}

fn retrieve_key_from_env(
    config_key: &Option<String>,
    env_var: &str,
    warning_msg: &str,
    error_msg: Option<&str>,
) -> Option<String> {
    if config_key.is_some() {
        warn!(warning_msg, env_var);
        config_key.clone()
    } else {
        match env::var(env_var) {
            Ok(key) => Some(key),
            Err(_) => {
                if let Some(msg) = error_msg {
                    error!(msg, env_var);
                } else {
                    warn!(
                        "{} environment variable not specified. Some alerts and actions have been disabled",
                        env_var
                    );
                }
                None
            }
        }
    }
}

pub const LOG_FILTER: &str = "RUST_LOG";

pub fn init_logger() {
    let filter_string = match env::var_os(LOG_FILTER) {
        Some(_) => env::var(LOG_FILTER).expect("Invalid `RUST_LOG` provided"),
        None => "info".to_string(),
    };

    let file_appender = RollingFileAppender::new(Rotation::DAILY, "logs", "app.log");

    let stdout_layer = layer()
        .with_target(false)
        .with_writer(std::io::stdout)
        .with_level(true)
        .with_line_number(true)
        .with_ansi(true)
        .with_filter(EnvFilter::new(filter_string.clone()));

    // Create the file layer
    let file_layer = layer()
        .with_writer(file_appender)
        .with_target(false)
        .with_level(true)
        .with_line_number(true)
        .with_ansi(false)
        .with_filter(EnvFilter::new(filter_string));

    // Build the subscriber with the formatting layer
    tracing_subscriber::registry()
        .with(stdout_layer)
        .with(file_layer)
        .init();
}
