use crate::alerter::AlertLevel;
use crate::ethereum_actions::EthereumAction;

use anyhow::Result;
use ethers::types::U256;
use serde::Deserialize;
use std::{env, fs, time::Duration};

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

    // Fill in the ethereum wallet key
    if config.ethereum_wallet_key.is_some() {
        log::warn!("Specifying the ethereum private key in the config file is not safe. Please use the {} environment variable instead", PRIVATE_KEY_ENV_VAR);
    } else {
        config.ethereum_wallet_key = match env::var(PRIVATE_KEY_ENV_VAR) {
            Ok(wallet_key) => Some(wallet_key),
            Err(_) => {
                log::warn!(
                    "{} environment variable not specified. Some alerts and actions have been disabled",
                    PRIVATE_KEY_ENV_VAR
                );
                None
            }
        };
    }

    // Fill in the pagerduty api key
    if config.pagerduty_api_key.is_some() {
        log::warn!(
            "Specifying the pagerduty api key in the config file is not safe. Please use the {} environment variable instead",
            PAGERDUTY_KEY_ENV_VAR,
        );
    } else {
        // We alert with an error here as this watchtower is ineffective if people aren't alerted.
        config.pagerduty_api_key = match env::var(PAGERDUTY_KEY_ENV_VAR) {
            Ok(wallet_key) => Some(wallet_key),
            Err(_) => {
                log::error!(
                    "{} environment variable not specified. Alerting on PagerDuty has been disabled",
                    PAGERDUTY_KEY_ENV_VAR
                );
                None
            }
        };
    }
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
