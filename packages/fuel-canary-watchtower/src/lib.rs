#[cfg(test)]
pub mod test_utils;

mod alerter;
mod config;
mod ethereum_actions;
mod ethereum_watcher;
mod fuel_watcher;
mod pagerduty;

use std::sync::Arc;

use crate::ethereum_watcher::{
    gateway_contract::{GatewayContract, GatewayContractTrait},
    portal_contract::{PortalContract, PortalContractTrait},
    state_contract::{StateContract, StateContractTrait},
};
use alerter::{send_alert, AlertLevel, AlertParams, WatchtowerAlerter};
use anyhow::Result;
pub use config::{load_config, WatchtowerConfig};
use ethereum_actions::WatchtowerEthereumActions;
use ethereum_watcher::{
    ethereum_chain::{EthereumChain, EthereumChainTrait},
    ethereum_utils::{setup_ethereum_provider, setup_ethereum_wallet},
    start_ethereum_watcher,
};
use ethers::middleware::Middleware;
use fuel_watcher::{fuel_chain::FuelChainTrait, start_fuel_watcher};
use pagerduty::PagerDutyClient;
use reqwest::Client;
use tokio::{sync::mpsc::UnboundedSender, task::JoinHandle};

use crate::fuel_watcher::fuel_chain::FuelChain;
use crate::fuel_watcher::fuel_utils::setup_fuel_provider;

pub async fn run(config: &WatchtowerConfig) -> Result<()> {
    // Setup the providers and wallets.
    let fuel_provider = setup_fuel_provider(&config.fuel_graphql).await?;
    let ether_provider = setup_ethereum_provider(
        &config.ethereum_rpc,
        config.coefficient,
        config.every_secs,
        config.max_price,
    )
    .await?;
    let chain_id: u64 = ether_provider.get_chainid().await?.as_u64();
    let (wallet, read_only) = setup_ethereum_wallet(config.ethereum_wallet_key.clone(), chain_id)?;

    // Create the chains.
    let fuel_chain: FuelChain = FuelChain::new(fuel_provider).unwrap();
    let ethereum_chain = EthereumChain::new(ether_provider.clone()).await?;

    // Setup the ethereum based contracts.
    let state_contract_address: String = config.state_contract_address.to_string();
    let portal_contract_address: String = config.portal_contract_address.to_string();
    let gateway_contract_address: String = config.gateway_contract_address.to_string();

    let mut state_contract = StateContract::new(
        state_contract_address,
        read_only,
        ether_provider.clone(),
        wallet.clone(),
    )
    .unwrap();
    let mut portal_contract = PortalContract::new(
        portal_contract_address,
        read_only,
        ether_provider.clone(),
        wallet.clone(),
    )
    .unwrap();
    let mut gateway_contract =
        GatewayContract::new(gateway_contract_address, read_only, ether_provider, wallet).unwrap();

    // Initialize the contracts.
    state_contract.initialize().await?;
    portal_contract.initialize().await?;
    gateway_contract.initialize().await?;

    // Change them to the correct traits
    let arc_state_contract = Arc::new(state_contract) as Arc<dyn StateContractTrait>;
    let arc_gateway_contract = Arc::new(gateway_contract) as Arc<dyn GatewayContractTrait>;
    let arc_portal_contract = Arc::new(portal_contract) as Arc<dyn PortalContractTrait>;
    let arc_ethereum_chain = Arc::new(ethereum_chain) as Arc<dyn EthereumChainTrait>;
    let arc_fuel_chain = Arc::new(fuel_chain) as Arc<dyn FuelChainTrait>;

    let pagerduty_client: Option<PagerDutyClient> = config
        .pagerduty_api_key
        .clone()
        .map(|api_key| PagerDutyClient::new(api_key, Arc::new(Client::new())));

    let alerts = WatchtowerAlerter::new(config, pagerduty_client)
        .map_err(|e| anyhow::anyhow!("Failed to setup alerts: {}", e))?;
    alerts.start_alert_handling_thread();

    let actions = WatchtowerEthereumActions::new(
        alerts.alert_sender(),
        arc_state_contract.clone(),
        arc_portal_contract.clone(),
        arc_gateway_contract.clone(),
    );
    let actions_thread = actions.start_action_handling_thread().await?;

    let ethereum_thread = start_ethereum_watcher(
        config,
        actions.get_action_sender(),
        alerts.alert_sender(),
        &arc_fuel_chain,
        &arc_ethereum_chain,
        &arc_state_contract,
        &arc_portal_contract,
        &arc_gateway_contract,
    )
    .await?;
    let fuel_thread = start_fuel_watcher(
        config,
        &arc_fuel_chain,
        actions.get_action_sender(),
        alerts.alert_sender(),
    )
    .await?;

    handle_watcher_threads(actions_thread, fuel_thread, ethereum_thread, alerts.alert_sender())
        .await
        .unwrap();

    Ok(())
}

async fn handle_watcher_threads(
    actions_thread: JoinHandle<()>,
    fuel_thread: JoinHandle<()>,
    ethereum_thread: JoinHandle<()>,
    alert_sender: UnboundedSender<AlertParams>,
) -> Result<()> {

    if let Err(e) = actions_thread.await {
        send_alert(
            &alert_sender.clone(),
            String::from("Actions thread failed"),
            format!("Error: {}", e),
            AlertLevel::Error,
        );
        return Err(anyhow::anyhow!("Actions thread failed: {}", e));
    }

    if let Err(e) = ethereum_thread.await {
        send_alert(
            &alert_sender.clone(),
            String::from("Ethereum watcher thread failed"),
            format!("Error: {}", e),
            AlertLevel::Error,
        );
        return Err(anyhow::anyhow!("Ethereum watcher thread failed: {}", e));
    }

    if let Err(e) = fuel_thread.await {
        send_alert(
            &alert_sender.clone(),
            String::from("Fuel watcher thread failed"),
            format!("Error: {}", e),
            AlertLevel::Error,
        );
        return Err(anyhow::anyhow!("Fuel watcher thread failed: {}", e));
    }

    Ok(())
}
