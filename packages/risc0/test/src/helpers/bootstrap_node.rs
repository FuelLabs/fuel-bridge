use std::time::Duration;

use fuel_core::{
    chain_config::{ChainConfig, CoinConfig, StateConfig},
    database::Database,
    service::{config::Trigger, Config as FuelServiceConfig, FuelService},
    types::fuel_types::AssetId,
};
use fuel_crypto::fuel_types::{Address, Bytes32};

use fuels::{
    accounts::{provider::Provider, ViewOnlyAccount},
    prelude::WalletUnlocked,
};

use super::constants::{DEFAULT_MNEMONIC_PHRASE, N_ACCOUNTS};

pub async fn bootstrap1() -> anyhow::Result<(FuelService, Provider)> {
    let mut accounts: Vec<WalletUnlocked> = Vec::new();

    for index in 0..N_ACCOUNTS {
        let wallet = WalletUnlocked::new_from_mnemonic_phrase_with_path(
            DEFAULT_MNEMONIC_PHRASE,
            None,
            format!("m/44'/60'/0'/0/{}", index).as_str(),
        )
        .expect("Could not instantiate account");

        accounts.push(wallet);
    }

    let coins: Vec<CoinConfig> = accounts
        .clone()
        .iter()
        .enumerate()
        .map(|(index, account)| {
            let asset_id: AssetId = Default::default();
            let amount = 10_000_000;

            let mut vec_tx_id = vec![0u8; 32];
            vec_tx_id[31] = index as u8;
            let tx_id_slice: &[u8; 32] = vec_tx_id.as_slice().try_into().expect("asd");
            let tx_id = Bytes32::from_bytes_ref(tx_id_slice).clone();

            CoinConfig {
                tx_id: Some(tx_id),
                output_index: Some(0),
                tx_pointer_block_height: Some(0.into()),
                tx_pointer_tx_idx: Some(0),
                maturity: Some(0.into()),
                owner: Address::new(*account.address().clone().hash),
                amount,
                asset_id,
            }
        })
        .collect();

    let mut fuel_service_config = FuelServiceConfig {
        chain_conf: ChainConfig {
            initial_state: Some(StateConfig {
                coins: Some(coins),
                height: Some((0).into()),
                ..Default::default()
            }),
            ..ChainConfig::local_testnet()
        },
        block_production: Trigger::Interval {
            block_time: Duration::from_secs(1),
        },
        ..FuelServiceConfig::local_node()
    };
    fuel_service_config.txpool.min_gas_price = 1;

    let database = Database::in_memory();

    let srv = FuelService::from_database(database.clone(), fuel_service_config.clone())
        .await
        .unwrap();
    srv.await_relayer_synced().await.unwrap();
    let provider = Provider::connect(srv.bound_address.to_string())
        .await
        .unwrap();

    anyhow::Ok((srv, provider))
}
