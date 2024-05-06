use crate::alerter::{send_alert, AlertLevel, AlertParams};
use crate::ethereum_actions::{send_action, ActionParams};
use crate::fuel_watcher::fuel_chain::FuelChainTrait;
use crate::WatchtowerConfig;

use anyhow::Result;
use std::cmp::max;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::task::JoinHandle;

use crate::config::{convert_to_decimal_u256, EthereumClientWatcher};
use crate::ethereum_watcher::ethereum_utils::get_value;

use gateway_contract::GatewayContractTrait;
use portal_contract::PortalContractTrait;
use state_contract::StateContractTrait;

use ethereum_chain::EthereumChainTrait;

pub mod ethereum_chain;
pub mod ethereum_utils;
pub mod gateway_contract;
pub mod portal_contract;
pub mod state_contract;

pub static POLL_DURATION: Duration = Duration::from_millis(6000);
pub static COMMIT_CHECK_STARTING_OFFSET: u64 = 24 * 60 * 60;
pub static ETHEREUM_CONNECTION_RETRIES: u64 = 2;
pub static ETHEREUM_BLOCK_TIME: u64 = 12;

async fn check_eth_chain_connection(
    ethereum_chain: &Arc<dyn EthereumChainTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
) {
    if watch_config.connection_alert.alert_level == AlertLevel::None {
        return;
    }

    if let Err(e) = ethereum_chain.check_connection().await {
        send_alert(
            &alert_sender,
            String::from("Ethereum Chain: Failed to check connection"),
            format!("Error: {}", e),
            watch_config.connection_alert.alert_level.clone(),
        );
        send_action(
            &action_sender,
            watch_config.connection_alert.alert_action.clone(),
            Some(watch_config.connection_alert.alert_level.clone()),
        );
    }
}

async fn check_eth_block_production(
    ethereum_chain: &Arc<dyn EthereumChainTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
) {
    if watch_config.block_production_alert.alert_level == AlertLevel::None {
        return;
    }

    let seconds_since_last_block = match ethereum_chain.get_seconds_since_last_block().await {
        Ok(seconds) => seconds,
        Err(e) => {
            send_alert(
                &alert_sender,
                String::from("Ethereum Chain: Failed to check get latest block"),
                format!("Error: {}", e),
                watch_config.query_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                watch_config.query_alert.alert_action.clone(),
                Some(watch_config.query_alert.alert_level.clone()),
            );
            return;
        }
    };

    if seconds_since_last_block > watch_config.block_production_alert.max_block_time {
        send_alert(
            &alert_sender,
            format!(
                "Ethereum Chain: block is taking longer than {} seconds",
                watch_config.block_production_alert.max_block_time,
            ),
            format!("Last block was {} seconds ago", seconds_since_last_block),
            watch_config.block_production_alert.alert_level.clone(),
        );
        send_action(
            &action_sender,
            watch_config.block_production_alert.alert_action.clone(),
            Some(watch_config.block_production_alert.alert_level.clone()),
        );
    }
}

async fn check_eth_account_balance(
    ethereum_chain: &Arc<dyn EthereumChainTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    account_address: &Option<String>,
) {
    // Return early if there's no address or if the alert level is None.
    let address = match account_address {
        Some(addr) => addr,
        None => return,
    };

    if watch_config.account_funds_alert.alert_level == AlertLevel::None {
        return;
    }

    // Proceed with checking the account balance
    let retrieved_balance = match ethereum_chain.get_account_balance(address).await {
        Ok(balance) => balance,
        Err(e) => {
            send_alert(
                &alert_sender,
                String::from("Ethereum Chain: Failed to check ethereum account funds"),
                format!("Error: {}", e),
                watch_config.query_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                watch_config.query_alert.alert_action.clone(),
                Some(watch_config.query_alert.alert_level.clone()),
            );
            return;
        }
    };

    let min_balance = get_value(watch_config.account_funds_alert.min_balance, 18);
    if retrieved_balance < min_balance {
        send_alert(
            &alert_sender,
            format!("Ethereum Chain: Ethereum account {} is low on funds", address),
            format!("Current balance: {}", retrieved_balance),
            watch_config.account_funds_alert.alert_level.clone(),
        );
        send_action(
            &action_sender,
            watch_config.account_funds_alert.alert_action.clone(),
            Some(watch_config.account_funds_alert.alert_level.clone()),
        );
    }
}

async fn check_eth_invalid_commits(
    ethereum_chain: &Arc<dyn EthereumChainTrait>,
    state_contract: &Arc<dyn StateContractTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    fuel_chain: &Arc<dyn FuelChainTrait>,
    last_commit_check_block: &mut u64,
) {
    if watch_config.invalid_state_commit_alert.alert_level == AlertLevel::None {
        return;
    }
    let hashes = match state_contract.get_latest_commits(*last_commit_check_block).await {
        Ok(hashes) => hashes,
        Err(e) => {
            send_alert(
                &alert_sender,
                String::from("Ethereum Chain: Failed to check state contract"),
                format!("Error: {}", e),
                watch_config.query_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                watch_config.query_alert.alert_action.clone(),
                Some(watch_config.query_alert.alert_level.clone()),
            );
            return;
        }
    };

    for hash in hashes {
        match fuel_chain.verify_block_commit(&hash).await {
            Ok(valid) => {
                if !valid {
                    send_alert(
                        &alert_sender,
                        String::from("Ethereum Chain: Invalid commit was made on the state contract"),
                        format!("Block Hash: {} not found on the fuel chain", hash),
                        watch_config.invalid_state_commit_alert.alert_level.clone(),
                    );
                    send_action(
                        &action_sender,
                        watch_config.invalid_state_commit_alert.alert_action.clone(),
                        Some(watch_config.invalid_state_commit_alert.alert_level.clone()),
                    );
                }
            }
            Err(e) => {
                send_alert(
                    &alert_sender,
                    String::from("Fuel Chain: Failed to check fuel chain for state commit"),
                    format!("Error: {}", e),
                    watch_config.query_alert.alert_level.clone(),
                );
                send_action(
                    &action_sender,
                    watch_config.query_alert.alert_action.clone(),
                    Some(watch_config.query_alert.alert_level.clone()),
                );
            }
        }
    }
    *last_commit_check_block = match ethereum_chain.get_latest_block_number().await {
        Ok(block_num) => block_num,
        Err(_) => *last_commit_check_block,
    };
}

async fn check_eth_base_asset_deposits(
    portal_contract: &Arc<dyn PortalContractTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    last_commit_check_block: &u64,
) {
    for portal_deposit_alert in &watch_config.portal_deposit_alerts {
        if portal_deposit_alert.alert_level == AlertLevel::None {
            continue;
        }

        let time_frame = portal_deposit_alert.time_frame;
        let amount = match portal_contract
            .get_base_amount_deposited(time_frame, *last_commit_check_block)
            .await
        {
            Ok(amt) => amt,
            Err(e) => {
                send_alert(
                    &alert_sender,
                    format!(
                        "Ethereum Chain: Failed to check portal contract for {} deposits",
                        portal_deposit_alert.token_name
                    ),
                    format!("Error: {}", e),
                    watch_config.query_alert.alert_level.clone(),
                );
                send_action(
                    &action_sender,
                    watch_config.query_alert.alert_action.clone(),
                    Some(watch_config.query_alert.alert_level.clone()),
                );
                continue;
            }
        };

        let amount_threshold = get_value(portal_deposit_alert.amount, portal_deposit_alert.token_decimals);
        if amount >= amount_threshold {
            let dec_amt = convert_to_decimal_u256(amount, portal_deposit_alert.token_decimals);
            let dec_amt_threshold = convert_to_decimal_u256(amount_threshold, portal_deposit_alert.token_decimals);

            send_alert(
                &alert_sender,
                format!(
                    "Ethereum Chain: {} is above deposit threshold {}{} for a period of {} seconds",
                    portal_deposit_alert.token_name, dec_amt_threshold, portal_deposit_alert.token_name, time_frame,
                ),
                format!("Amount deposited: {}{}", dec_amt, portal_deposit_alert.token_name),
                portal_deposit_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                portal_deposit_alert.alert_action.clone(),
                Some(portal_deposit_alert.alert_level.clone()),
            );
        }
    }
}

async fn check_eth_base_asset_withdrawals(
    portal_contract: &Arc<dyn PortalContractTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    last_commit_check_block: &u64,
) {
    for portal_withdrawal_alert in &watch_config.portal_withdrawal_alerts {
        if portal_withdrawal_alert.alert_level == AlertLevel::None {
            continue;
        }

        let time_frame = portal_withdrawal_alert.time_frame;
        let amount = match portal_contract
            .get_base_amount_withdrawn(time_frame, *last_commit_check_block)
            .await
        {
            Ok(amt) => amt,
            Err(e) => {
                send_alert(
                    &alert_sender,
                    format!(
                        "Ethereum Chain: Failed to check portal contract for {} withdrawals",
                        portal_withdrawal_alert.token_name
                    ),
                    format!("Error: {}", e),
                    watch_config.query_alert.alert_level.clone(),
                );
                send_action(
                    &action_sender,
                    watch_config.query_alert.alert_action.clone(),
                    Some(watch_config.query_alert.alert_level.clone()),
                );
                continue;
            }
        };

        let amount_threshold = get_value(portal_withdrawal_alert.amount, portal_withdrawal_alert.token_decimals);
        if amount >= amount_threshold {
            let dec_amt = convert_to_decimal_u256(amount, portal_withdrawal_alert.token_decimals);
            let dec_amt_threshold = convert_to_decimal_u256(amount_threshold, portal_withdrawal_alert.token_decimals);

            send_alert(
                &alert_sender,
                format!(
                    "Ethereum Chain: {} is above withdrawal threshold {}{} for a period of {} seconds",
                    portal_withdrawal_alert.token_name,
                    dec_amt_threshold,
                    portal_withdrawal_alert.token_name,
                    time_frame,
                ),
                format!("Amount withdrawn: {}{}", dec_amt, portal_withdrawal_alert.token_name),
                portal_withdrawal_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                portal_withdrawal_alert.alert_action.clone(),
                Some(portal_withdrawal_alert.alert_level.clone()),
            );
        }
    }
}

async fn check_eth_token_deposits(
    gateway_contract: &Arc<dyn GatewayContractTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    last_commit_check_block: u64,
) {
    for gateway_deposit_alert in &watch_config.gateway_deposit_alerts {
        // Skip iterations where alert level is None
        if gateway_deposit_alert.alert_level == AlertLevel::None {
            continue;
        }

        let latest_block = last_commit_check_block;
        let time_frame = gateway_deposit_alert.time_frame;
        let amount = match gateway_contract
            .get_token_amount_deposited(time_frame, &gateway_deposit_alert.token_address, latest_block)
            .await
        {
            Ok(amt) => amt,
            Err(e) => {
                send_alert(
                    &alert_sender,
                    format!(
                        "Ethereum Chain: Failed to check gateway contract for {} at address {}",
                        gateway_deposit_alert.token_name, gateway_deposit_alert.token_address,
                    ),
                    format!("Error: {}", e),
                    watch_config.query_alert.alert_level.clone(),
                );
                send_action(
                    &action_sender,
                    watch_config.query_alert.alert_action.clone(),
                    Some(watch_config.query_alert.alert_level.clone()),
                );
                continue;
            }
        };

        let amount_threshold = get_value(gateway_deposit_alert.amount, gateway_deposit_alert.token_decimals);
        if amount >= amount_threshold {
            let dec_amt = convert_to_decimal_u256(amount, gateway_deposit_alert.token_decimals);
            let dec_amt_threshold = convert_to_decimal_u256(amount_threshold, gateway_deposit_alert.token_decimals);

            send_alert(
                &alert_sender,
                format!(
                    "Ethereum Chain: {} at address {} is above deposit threshold {}{} for a period of {} seconds",
                    gateway_deposit_alert.token_name,
                    gateway_deposit_alert.token_address,
                    dec_amt_threshold,
                    gateway_deposit_alert.token_name,
                    time_frame,
                ),
                format!("Amount deposited: {}{}", dec_amt, gateway_deposit_alert.token_name),
                gateway_deposit_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                gateway_deposit_alert.alert_action.clone(),
                Some(gateway_deposit_alert.alert_level.clone()),
            );
        }
    }
}

async fn check_eth_token_withdrawals(
    gateway_contract: &Arc<dyn GatewayContractTrait>,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    watch_config: &EthereumClientWatcher,
    last_commit_check_block: u64,
) {
    for gateway_withdrawal_alert in &watch_config.gateway_withdrawal_alerts {
        if gateway_withdrawal_alert.alert_level == AlertLevel::None {
            continue;
        }

        let latest_block = last_commit_check_block;
        let time_frame = gateway_withdrawal_alert.time_frame;
        let amount = match gateway_contract
            .get_token_amount_withdrawn(
                gateway_withdrawal_alert.time_frame,
                &gateway_withdrawal_alert.token_address,
                latest_block,
            )
            .await
        {
            Ok(amt) => amt,
            Err(e) => {
                send_alert(
                    &alert_sender,
                    format!(
                        "Ethereum Chain: Failed to check gateway contract for {} at address {}",
                        gateway_withdrawal_alert.token_name, gateway_withdrawal_alert.token_address,
                    ),
                    format!("Error: {}", e),
                    watch_config.query_alert.alert_level.clone(),
                );
                send_action(
                    &action_sender,
                    watch_config.query_alert.alert_action.clone(),
                    Some(watch_config.query_alert.alert_level.clone()),
                );
                continue;
            }
        };

        let amount_threshold = get_value(gateway_withdrawal_alert.amount, gateway_withdrawal_alert.token_decimals);
        if amount >= amount_threshold {
            let dec_amt = convert_to_decimal_u256(amount, gateway_withdrawal_alert.token_decimals);
            let dec_amt_threshold = convert_to_decimal_u256(amount_threshold, gateway_withdrawal_alert.token_decimals);

            send_alert(
                &alert_sender,
                format!(
                    "Ethereum Chain: {} at address {} is above withdrawal threshold {}{} for a period of {} seconds",
                    gateway_withdrawal_alert.token_name,
                    gateway_withdrawal_alert.token_address,
                    dec_amt_threshold,
                    gateway_withdrawal_alert.token_name,
                    time_frame,
                ),
                format!("Amount withdrawn: {}{}", dec_amt, gateway_withdrawal_alert.token_name),
                gateway_withdrawal_alert.alert_level.clone(),
            );
            send_action(
                &action_sender,
                gateway_withdrawal_alert.alert_action.clone(),
                Some(gateway_withdrawal_alert.alert_level.clone()),
            );
        }
    }
}

pub async fn start_ethereum_watcher(
    config: &WatchtowerConfig,
    action_sender: UnboundedSender<ActionParams>,
    alert_sender: UnboundedSender<AlertParams>,
    fuel_chain: &Arc<dyn FuelChainTrait>,
    ethereum_chain: &Arc<dyn EthereumChainTrait>,
    state_contract: &Arc<dyn StateContractTrait>,
    portal_contract: &Arc<dyn PortalContractTrait>,
    gateway_contract: &Arc<dyn GatewayContractTrait>,
) -> Result<JoinHandle<()>> {
    let watch_config = config.ethereum_client_watcher.clone();
    let account_address = match &config.ethereum_wallet_key {
        Some(key) => Some(ethereum_utils::get_public_address(key)?),
        None => None,
    };
    let commit_start_block_offset = COMMIT_CHECK_STARTING_OFFSET / ETHEREUM_BLOCK_TIME;
    let mut last_commit_check_block = max(
        ethereum_chain.get_latest_block_number().await?,
        commit_start_block_offset,
    ) - commit_start_block_offset;

    let fuel_chain = Arc::clone(fuel_chain);
    let ethereum_chain = Arc::clone(ethereum_chain);
    let state_contract = Arc::clone(state_contract);
    let portal_contract = Arc::clone(portal_contract);
    let gateway_contract = Arc::clone(gateway_contract);

    let handle = tokio::spawn(async move {
        loop {
            send_alert(
                &alert_sender.clone(),
                String::from("Watching ethereum chain"),
                String::from("Periodically querying the ethereum chain"),
                AlertLevel::Info,
            );

            check_eth_chain_connection(
                &ethereum_chain,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
            )
            .await;

            check_eth_block_production(
                &ethereum_chain,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
            )
            .await;

            check_eth_account_balance(
                &ethereum_chain,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                &account_address,
            )
            .await;

            check_eth_invalid_commits(
                &ethereum_chain,
                &state_contract,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                &fuel_chain,
                &mut last_commit_check_block,
            )
            .await;

            check_eth_base_asset_deposits(
                &portal_contract,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                &last_commit_check_block,
            )
            .await;

            check_eth_base_asset_withdrawals(
                &portal_contract,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                &last_commit_check_block,
            )
            .await;

            check_eth_token_deposits(
                &gateway_contract,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                last_commit_check_block,
            )
            .await;

            check_eth_token_withdrawals(
                &gateway_contract,
                action_sender.clone(),
                alert_sender.clone(),
                &watch_config,
                last_commit_check_block,
            )
            .await;

            thread::sleep(POLL_DURATION);
        }
    });

    Ok(handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::{
        config::*,
        ethereum_actions::EthereumAction,
        ethereum_watcher::{
            ethereum_chain::MockEthereumChainTrait, gateway_contract::MockGatewayContractTrait,
            portal_contract::MockPortalContractTrait, state_contract::MockStateContractTrait,
        },
        fuel_watcher::fuel_chain::MockFuelChainTrait,
    };
    use ethers::types::U256;
    use fuels::tx::Bytes32;
    use tokio::sync::mpsc::unbounded_channel;

    #[tokio::test]
    async fn test_check_eth_chain_connection_success() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the connection check succeeds
        mock_ethereum_chain
            .expect_check_connection()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            connection_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_chain_connection(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Check that no alert or action was sent
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent on successful connection check"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent on successful connection check"
        );
    }

    #[tokio::test]
    async fn test_check_eth_chain_connection_alert_level_none() {
        let mock_ethereum_chain = MockEthereumChainTrait::new();

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            connection_alert: GenericAlert {
                alert_level: AlertLevel::None,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_chain_connection(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Check that no alert or action was sent
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when alert level is None"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when alert level is None"
        );
    }

    #[tokio::test]
    async fn test_check_eth_chain_connection_fails() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the connection check fails
        mock_ethereum_chain
            .expect_check_connection()
            .times(1)
            .returning(|| Box::pin(async { Err(anyhow::anyhow!("connection failed")) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            connection_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_chain_connection(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check connection"), 
            String::from("Error: connection failed"),
            AlertLevel::Warn,
        );

        // Check if the alert was sent
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert was not sent");
        }

        // Check if the action was sent
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action was not sent");
        }
    }

    #[tokio::test]
    async fn test_check_eth_block_production_success() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the block production is within the time limit
        mock_ethereum_chain
            .expect_get_seconds_since_last_block()
            .times(1)
            .returning(|| Box::pin(async { Ok(10) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            block_production_alert: BlockProductionAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
                max_block_time: 20,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_block_production(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Check that no alert or action was sent
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent for successful block production"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent for successful block production"
        );
    }

    #[tokio::test]
    async fn test_check_eth_block_production_delay() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the block production time exceeds the limit
        mock_ethereum_chain
            .expect_get_seconds_since_last_block()
            .times(1)
            .returning(|| Box::pin(async { Ok(25) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            block_production_alert: BlockProductionAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
                max_block_time: 20,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_block_production(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: block is taking longer than 20 seconds"), 
            String::from("Last block was 25 seconds ago"),
            AlertLevel::Warn,
        );

        // Check if the alert was sent
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert was not sent");
        }

        // Check if the action was sent
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action was not sent");
        }
    }

    #[tokio::test]
    async fn test_check_eth_block_production_failure() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a failure in checking block production
        mock_ethereum_chain
            .expect_get_seconds_since_last_block()
            .times(1)
            .returning(|| Box::pin(async { Err(anyhow::anyhow!("Failed to get block time")) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            block_production_alert: BlockProductionAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
                max_block_time: 20,
            },
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_block_production(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check get latest block"), 
            String::from("Error: Failed to get block time"),
            AlertLevel::Error,
        );

        // Check if the alert was sent
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert was not sent");
        }

        // Check if the action was sent
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action was not sent");
        }
    }

    #[tokio::test]
    async fn test_check_eth_block_production_alert_level_none() {
        let mock_ethereum_chain = MockEthereumChainTrait::new();

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            block_production_alert: BlockProductionAlert {
                alert_level: AlertLevel::None,
                alert_action: EthereumAction::None,
                max_block_time: 20,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_block_production(&ethereum_chain, action_sender, alert_sender, &watch_config).await;

        // Check that no alert or action was sent
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when alert level is None"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when alert level is None"
        );
    }

    #[tokio::test]
    async fn test_check_eth_account_balance_success() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the account balance is above the minimum required balance
        let account_address = Some("0x123".to_string());
        let account_address_clone = account_address.clone();
        let balance_above_minimum = get_value(100.0, 18);
        mock_ethereum_chain
            .expect_get_account_balance()
            .withf(move |addr| addr == account_address.as_ref().unwrap())
            .times(1)
            .returning(move |_| Box::pin(async move { Ok(balance_above_minimum) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            account_funds_alert: AccountFundsAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
                min_balance: 10.into(),
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_account_balance(
            &ethereum_chain,
            action_sender,
            alert_sender,
            &watch_config,
            &account_address_clone,
        )
        .await;

        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent if balance is above minimum"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent if balance is above minimum"
        );
    }

    #[tokio::test]
    async fn test_check_eth_account_balance_below_minimum() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();

        // Simulate a scenario where the account balance is below the minimum required balance
        let account_address = Some("0x123".to_string());
        let account_address_clone = account_address.clone();
        let balance_below_minimum = U256::from(500);
        mock_ethereum_chain
            .expect_get_account_balance()
            .withf(move |addr| addr == account_address.as_ref().unwrap())
            .times(1)
            .returning(move |_| Box::pin(async move { Ok(balance_below_minimum) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            account_funds_alert: AccountFundsAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
                min_balance: 1000.into(),
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_account_balance(
            &ethereum_chain,
            action_sender,
            alert_sender,
            &watch_config,
            &account_address_clone,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Ethereum account 0x123 is low on funds"), 
            String::from("Current balance: 500"),
            AlertLevel::Warn,
        );

        // Check if the alert was sent
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert was not sent");
        }

        // Check if the action was sent
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action was not sent");
        }
    }

    #[tokio::test]
    async fn test_check_eth_account_balance_alert_level_none() {
        let mock_ethereum_chain = MockEthereumChainTrait::new();

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let account_address = Some("0x123".to_string());
        let watch_config = EthereumClientWatcher {
            account_funds_alert: AccountFundsAlert {
                alert_level: AlertLevel::None,
                alert_action: EthereumAction::None,
                min_balance: 1000.into(),
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        check_eth_account_balance(
            &ethereum_chain,
            action_sender,
            alert_sender,
            &watch_config,
            &account_address,
        )
        .await;

        // Check that
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when alert level is None"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when alert level is None"
        );
    }

    #[tokio::test]
    async fn test_check_eth_invalid_commits_all_valid() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();
        let mut mock_state_contract = MockStateContractTrait::new();
        let mut mock_fuel_chain = MockFuelChainTrait::new();

        let expected_commit = "0xc84e7c26f85536eb8c9c1928f89c10748dd11232a3f86826e67f5caee55ceede"
            .parse()
            .unwrap();
        let commit_hashes = vec![expected_commit];
        let state_hashes = commit_hashes.clone();
        let latest_block_number = 100;

        // Mock state contract to return commit hashes
        mock_state_contract
            .expect_get_latest_commits()
            .times(1)
            .returning(move |_| {
                let commit_hashes_clone = state_hashes.clone();
                Box::pin(async move { Ok(commit_hashes_clone) })
            });

        // Mock fuel chain to return true for commit verification
        for hash in &commit_hashes {
            let hash_clone = *hash;
            mock_fuel_chain
                .expect_verify_block_commit()
                .withf(move |h| *h == hash_clone)
                .times(1)
                .returning(move |_| Box::pin(async move { Ok(true) }));
        }

        // Mock ethereum chain to return the latest block number
        mock_ethereum_chain
            .expect_get_latest_block_number()
            .times(1)
            .returning(move || Box::pin(async move { Ok(latest_block_number) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            invalid_state_commit_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        let state_contract = Arc::new(mock_state_contract) as Arc<dyn StateContractTrait>;
        let fuel_chain = Arc::new(mock_fuel_chain) as Arc<dyn FuelChainTrait>;
        let mut last_commit_check_block = 0;

        check_eth_invalid_commits(
            &ethereum_chain,
            &state_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &fuel_chain,
            &mut last_commit_check_block,
        )
        .await;

        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when all commits are valid"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when all commits are valid"
        );
        assert_eq!(
            last_commit_check_block, latest_block_number,
            "Last commit check block should be updated"
        );
    }

    #[tokio::test]
    async fn test_check_eth_invalid_commits_some_invalid() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();
        let mut mock_state_contract = MockStateContractTrait::new();
        let mut mock_fuel_chain = MockFuelChainTrait::new();

        let valid_commit = Bytes32::default();
        let invalid_commit = "0xc84e7c26f85536eb8c9c1928f89c10748dd11232a3f86826e67f5caee55ceede"
            .parse()
            .unwrap();
        let commit_hashes = vec![valid_commit, invalid_commit];
        let state_hashes = commit_hashes.clone();
        let latest_block_number = 100;

        mock_state_contract
            .expect_get_latest_commits()
            .times(1)
            .returning(move |_| {
                let commit_hashes_clone = state_hashes.clone();
                Box::pin(async move { Ok(commit_hashes_clone) })
            });

        for hash in &commit_hashes {
            let hash_clone = *hash;
            let validity = hash_clone != invalid_commit;
            mock_fuel_chain
                .expect_verify_block_commit()
                .withf(move |h| *h == hash_clone)
                .times(1)
                .returning(move |_| Box::pin(async move { Ok(validity) }));
        }

        mock_ethereum_chain
            .expect_get_latest_block_number()
            .times(1)
            .returning(move || Box::pin(async move { Ok(latest_block_number) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            invalid_state_commit_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        let state_contract = Arc::new(mock_state_contract) as Arc<dyn StateContractTrait>;
        let fuel_chain = Arc::new(mock_fuel_chain) as Arc<dyn FuelChainTrait>;
        let mut last_commit_check_block = 0;

        check_eth_invalid_commits(
            &ethereum_chain,
            &state_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &fuel_chain,
            &mut last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Invalid commit was made on the state contract"), 
            String::from("Block Hash: c84e7c26f85536eb8c9c1928f89c10748dd11232a3f86826e67f5caee55ceede not found on the fuel chain"),
            AlertLevel::Warn,
        );

        // Check if the alert was sent
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert was not sent");
        }

        // Check if the action was sent
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action was not sent");
        }
        assert_eq!(
            last_commit_check_block, latest_block_number,
            "Last commit check block should be updated"
        );
    }

    #[tokio::test]
    async fn test_check_eth_invalid_commits_no_commits() {
        let mut mock_ethereum_chain = MockEthereumChainTrait::new();
        let mut mock_state_contract = MockStateContractTrait::new();
        let mock_fuel_chain = MockFuelChainTrait::new();

        // Simulate an empty list of commit hashes
        let commit_hashes = Vec::new();
        let latest_block_number = 100;

        mock_state_contract
            .expect_get_latest_commits()
            .times(1)
            .returning(move |_| {
                let commit_hashes_clone = commit_hashes.clone();
                Box::pin(async move { Ok(commit_hashes_clone) })
            });

        // Since there are no commits, the fuel chain's commit verification won't be called
        // We don't need to set up expectations for the mock_fuel_chain

        mock_ethereum_chain
            .expect_get_latest_block_number()
            .times(1)
            .returning(move || Box::pin(async move { Ok(latest_block_number) }));

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            invalid_state_commit_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        let state_contract = Arc::new(mock_state_contract) as Arc<dyn StateContractTrait>;
        let fuel_chain = Arc::new(mock_fuel_chain) as Arc<dyn FuelChainTrait>;
        let mut last_commit_check_block = 0;

        check_eth_invalid_commits(
            &ethereum_chain,
            &state_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &fuel_chain,
            &mut last_commit_check_block,
        )
        .await;

        // Assert that no alert or action was sent since there were no commits
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when there are no commits"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when there are no commits"
        );

        // Assert that the last commit check block is updated to the latest block number
        assert_eq!(
            last_commit_check_block, latest_block_number,
            "Last commit check block should be updated to the latest block number"
        );
    }

    #[tokio::test]
    async fn test_check_eth_invalid_commits_state_contract_error() {
        let mock_ethereum_chain = MockEthereumChainTrait::new();
        let mut mock_state_contract = MockStateContractTrait::new();
        let mock_fuel_chain = MockFuelChainTrait::new();

        // Simulate an error in fetching commit hashes
        let state_contract_error = "Error fetching commits";
        mock_state_contract
            .expect_get_latest_commits()
            .times(1)
            .returning(move |_| Box::pin(async move { Err(anyhow::anyhow!(state_contract_error)) }));

        // Since there's an error in fetching commits, the fuel chain's commit verification won't be called
        // We don't need to set up expectations for the mock_fuel_chain

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            invalid_state_commit_alert: GenericAlert {
                alert_level: AlertLevel::Warn,
                alert_action: EthereumAction::None,
            },
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        let state_contract = Arc::new(mock_state_contract) as Arc<dyn StateContractTrait>;
        let fuel_chain = Arc::new(mock_fuel_chain) as Arc<dyn FuelChainTrait>;
        let mut last_commit_check_block = 0;

        check_eth_invalid_commits(
            &ethereum_chain,
            &state_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &fuel_chain,
            &mut last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check state contract"), 
            String::from("Error: Error fetching commits"),
            AlertLevel::Error,
        );

        // Assert that an alert was sent due to the error in fetching commits
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for state contract error was not sent");
        }

        // Assert that an action was sent due to the error in fetching commits
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action for state contract error was not sent");
        }

        // No change in last commit check block as there was an error
        assert_eq!(
            last_commit_check_block, 0,
            "Last commit check block should not change on error"
        );
    }

    #[tokio::test]
    async fn test_check_eth_invalid_commits_alert_level_none() {
        let mock_ethereum_chain = MockEthereumChainTrait::new();
        let mock_state_contract = MockStateContractTrait::new();
        let mock_fuel_chain = MockFuelChainTrait::new();

        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            invalid_state_commit_alert: GenericAlert {
                alert_level: AlertLevel::None,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        let ethereum_chain = Arc::new(mock_ethereum_chain) as Arc<dyn EthereumChainTrait>;
        let state_contract = Arc::new(mock_state_contract) as Arc<dyn StateContractTrait>;
        let fuel_chain = Arc::new(mock_fuel_chain) as Arc<dyn FuelChainTrait>;
        let mut last_commit_check_block = 0;

        check_eth_invalid_commits(
            &ethereum_chain,
            &state_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &fuel_chain,
            &mut last_commit_check_block,
        )
        .await;

        // No change in last commit check block as there was no alert
        assert!(
            alert_receiver.try_recv().is_err(),
            "No alert should be sent when there is alert level none"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "No action should be sent when there is alert level none"
        );
        assert_eq!(
            last_commit_check_block, 0,
            "Last commit check block should not change on error"
        );
    }

    #[tokio::test]
    async fn test_portal_successful_deposit_check_no_alert() {
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();
        let watch_config = EthereumClientWatcher {
            portal_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            ..Default::default()
        };

        // Mock portal contract response
        mock_portal_contract
            .expect_get_base_amount_deposited()
            .times(1)
            .returning(move |_, _| Box::pin(async move { Ok(U256::from(50)) }));

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block = 100;

        check_eth_base_asset_deposits(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_portal_deposit_amount_triggers_alert() {
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let threshold = get_value(150.0, 18);
        let watch_config = EthereumClientWatcher {
            portal_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            ..Default::default()
        };

        // Mock portal contract response to exceed threshold
        mock_portal_contract
            .expect_get_base_amount_deposited()
            .times(1)
            .returning(move |_, _| Box::pin(async move { Ok(threshold) }));

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_deposits(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: ETH is above deposit threshold 100ETH for a period of 60 seconds"), 
            String::from("Amount deposited: 150ETH"),
            AlertLevel::Warn,
        );

        // Assertions to ensure alert and action are triggered
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for portal contract error was not sent");
        }

        // Assert that an action was sent due to the error in fetching commits
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action for portal contract error was not sent");
        }
    }

    #[tokio::test]
    async fn test_portal_failed_deposit_check() {
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        // Mock portal contract response to simulate an error
        mock_portal_contract
            .expect_get_base_amount_deposited()
            .times(1)
            .returning(move |_, _| {
                Box::pin(async move {
                    Err(anyhow::Error::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "mock error",
                    )))
                })
            });

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_deposits(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check portal contract for ETH deposits"), 
            String::from("Error: mock error"),
            AlertLevel::Error,
        );

        // Assertions to ensure alert and action are triggered due to error
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for failed deposit check was not sent");
        }

        // Assert that an action was sent due to the error
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action for failed deposit check was not sent");
        }
    }

    #[tokio::test]
    async fn test_portal_no_deposit_alerts_configured() {
        let mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_deposit_alerts: vec![],
            ..Default::default()
        };

        // No need to mock portal_contract response as it should not be called
        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_deposits(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_portal_deposit_amount_alert_level_none() {
        let mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::None,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            ..Default::default()
        };

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_deposits(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_portal_withdrawal_amount_triggers_alert() {
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let threshold = get_value(150.0, 18);
        let watch_config = EthereumClientWatcher {
            portal_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            ..Default::default()
        };

        // Mock portal contract response
        mock_portal_contract
            .expect_get_base_amount_withdrawn()
            .times(1)
            .returning(move |_, _| Box::pin(async move { Ok(threshold) }));

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block = 100;

        check_eth_base_asset_withdrawals(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: ETH is above withdrawal threshold 100ETH for a period of 60 seconds"), 
            String::from("Amount withdrawn: 150ETH"),
            AlertLevel::Warn,
        );

        // Assertions to ensure alert and action are triggered
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for failed deposit check was not sent");
        }

        // Assert that an action was sent due to the error
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action for failed deposit check was not sent");
        }
    }

    #[tokio::test]
    async fn test_portal_failed_withdrawal_check() {
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        // Mock portal contract response to simulate an error
        mock_portal_contract
            .expect_get_base_amount_withdrawn()
            .times(1)
            .returning(move |_, _| {
                Box::pin(async move {
                    Err(anyhow::Error::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "mock error",
                    )))
                })
            });

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_withdrawals(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check portal contract for ETH withdrawals"), 
            String::from("Error: mock error"),
            AlertLevel::Error,
        );

        // Assertions to ensure alert and action are triggered due to error
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for failed withdrawals check was not sent");
        }

        // Assert that an action was sent due to the error
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action for failed withdrawals check was not sent");
        }
    }

    #[tokio::test]
    async fn test_portal_no_withdrawal_alerts_configured() {
        let mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_withdrawal_alerts: vec![],
            ..Default::default()
        };

        // No need to mock portal_contract response as it should not be called
        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_withdrawals(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_portal_withdrawal_amount_alert_level_none() {
        let mock_portal_contract = MockPortalContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            portal_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::None,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("ETH"),
                token_address: String::from("0x0000000000000000000000000000000000000000"),
            }],
            ..Default::default()
        };

        let portal_contract = Arc::new(mock_portal_contract) as Arc<dyn PortalContractTrait>;
        let last_commit_check_block: u64 = 100;

        check_eth_base_asset_withdrawals(
            &portal_contract,
            action_sender,
            alert_sender,
            &watch_config,
            &last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_gateway_token_deposit_amount_triggers_alert() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let threshold = get_value(150.0, 18);
        let watch_config = EthereumClientWatcher {
            gateway_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            ..Default::default()
        };

        mock_gateway_contract
            .expect_get_token_amount_deposited()
            .times(1)
            .returning(move |_, _, _| Box::pin(async move { Ok(threshold) }));

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_deposits(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: USDC at address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 is above deposit threshold 100USDC for a period of 60 seconds"), 
            String::from("Amount deposited: 150USDC"),
            AlertLevel::Warn,
        );

        // Assertions to ensure alert and action are triggered
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for gateway contract error was not sent");
        }

        // Assert that an action was sent due to the error in fetching commits
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action for gateway contract error was not sent");
        }
    }

    #[tokio::test]
    async fn test_gateway_successful_token_deposit_check_no_alert() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            ..Default::default()
        };

        // Mocking the response to be below the threshold
        mock_gateway_contract
            .expect_get_token_amount_deposited()
            .times(1)
            .returning(move |_, _, _| Box::pin(async move { Ok(U256::from(50)) }));

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_deposits(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_gateway_failed_token_deposit_check() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_deposit_alerts: vec![DepositAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        // Mocking an error response
        mock_gateway_contract
            .expect_get_token_amount_deposited()
            .times(1)
            .returning(move |_, _, _| {
                Box::pin(async move {
                    Err(anyhow::Error::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "mock error",
                    )))
                })
            });

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_deposits(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check gateway contract for USDC at address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), 
            String::from("Error: mock error"),
            AlertLevel::Error,
        );

        // Assertions to ensure alert and action are triggered due to error
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for gateway contract error was not sent");
        }

        // Assert that an action was sent due to the error in fetching commits
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action for gateway contract error was not sent");
        }
    }

    #[tokio::test]
    async fn test_gateway_no_deposit_alerts_configured() {
        let mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_deposit_alerts: vec![],
            ..Default::default()
        };

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_deposits(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_gateway_withdrawal_amount_triggers_alert() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let amount_threshold = get_value(150.0, 18); // Example threshold value
        let watch_config = EthereumClientWatcher {
            gateway_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            ..Default::default()
        };

        mock_gateway_contract
            .expect_get_token_amount_withdrawn()
            .times(1)
            .returning(move |_, _, _| {
                Box::pin(async move { Ok(amount_threshold) }) // Amount exceeds threshold
            });

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_withdrawals(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: USDC at address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 is above withdrawal threshold 100USDC for a period of 60 seconds"), 
            String::from("Amount withdrawn: 150USDC"),
            AlertLevel::Warn,
        );

        // Assertions to ensure alert and action are triggered
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for gateway contract error was not sent");
        }

        // Assert that an action was sent due to the error in fetching commits
        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Warn));
        } else {
            panic!("Action for gateway contract error was not sent");
        }
    }

    #[tokio::test]
    async fn test_gateway_successful_withdrawal_check_no_alert() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            ..Default::default()
        };

        // Mock the gateway contract response to return an amount below the threshold
        let amount_below_threshold = get_value(50.0, 18);
        mock_gateway_contract
            .expect_get_token_amount_withdrawn()
            .times(1)
            .returning(move |_, _, _| Box::pin(async move { Ok(amount_below_threshold) }));

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_withdrawals(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_gateway_failed_withdrawal_check() {
        let mut mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::Warn,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            query_alert: GenericAlert {
                alert_level: AlertLevel::Error,
                alert_action: EthereumAction::None,
            },
            ..Default::default()
        };

        // Mock the gateway contract response to simulate an error
        mock_gateway_contract
            .expect_get_token_amount_withdrawn()
            .times(1)
            .returning(move |_, _, _| {
                Box::pin(async move {
                    Err(anyhow::Error::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "mock error",
                    )))
                })
            });

        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_withdrawals(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from("Ethereum Chain: Failed to check gateway contract for USDC at address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), 
            String::from("Error: mock error"),
            AlertLevel::Error,
        );

        // Assertions to ensure alert and action are triggered due to error
        if let Ok(alert) = alert_receiver.try_recv() {
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Alert for failed withdrawal check was not sent");
        }

        if let Ok(action) = action_receiver.try_recv() {
            assert!(action.is_action_equal(EthereumAction::None));
            assert!(action.is_alert_level_equal(AlertLevel::Error));
        } else {
            panic!("Action for failed withdrawal check was not sent");
        }
    }

    #[tokio::test]
    async fn test_gateway_no_withdrawal_alerts_configured() {
        let mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_withdrawal_alerts: vec![],
            ..Default::default()
        };

        // No need to mock gateway_contract response as it should not be called
        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_withdrawals(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(alert_receiver.try_recv().is_err(), "Alert was unexpectedly sent");
        assert!(action_receiver.try_recv().is_err(), "Action was unexpectedly sent");
    }

    #[tokio::test]
    async fn test_withdrawal_alert_level_none() {
        let mock_gateway_contract = MockGatewayContractTrait::new();
        let (action_sender, mut action_receiver) = unbounded_channel();
        let (alert_sender, mut alert_receiver) = unbounded_channel();

        let watch_config = EthereumClientWatcher {
            gateway_withdrawal_alerts: vec![WithdrawAlert {
                alert_level: AlertLevel::None,
                time_frame: 60,
                amount: 100.0,
                token_decimals: 18,
                alert_action: EthereumAction::None,
                token_name: String::from("USDC"),
                token_address: String::from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            }],
            ..Default::default()
        };

        // No need to mock gateway_contract response as alerts with AlertLevel::None should not trigger checks
        let gateway_contract = Arc::new(mock_gateway_contract) as Arc<dyn GatewayContractTrait>;
        let last_commit_check_block = 100;

        check_eth_token_withdrawals(
            &gateway_contract,
            action_sender,
            alert_sender,
            &watch_config,
            last_commit_check_block,
        )
        .await;

        // Assertions to ensure no alerts or actions are triggered
        assert!(
            alert_receiver.try_recv().is_err(),
            "Alert was unexpectedly sent despite AlertLevel::None"
        );
        assert!(
            action_receiver.try_recv().is_err(),
            "Action was unexpectedly sent despite AlertLevel::None"
        );
    }
}
