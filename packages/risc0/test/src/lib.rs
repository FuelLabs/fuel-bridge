mod helpers;

pub use std::ops::Deref;
pub use std::str::FromStr;

pub use fuel_core::producer::ports::BlockProducerDatabase;
pub use fuel_core::service::ServiceTrait;
pub use fuel_core::types::blockchain::block::Block;
pub use fuel_core::types::fuel_tx::UniqueIdentifier;
pub use fuel_core::types::{fuel_tx::Transaction, services::p2p::Transactions};
pub use fuel_crypto::fuel_types::ChainId;

pub use fuel_tx::field::Witnesses;
pub use fuels::accounts::Account;
pub use fuels::accounts::ViewOnlyAccount;
pub use fuels::programs::call_response::FuelCallResponse;
pub use fuels::{
    accounts::wallet::WalletUnlocked, programs::contract::CallParameters, tx::Bytes32,
};
pub use prover_core::check_transition;

pub use crate::helpers::{
    block_stringify, block_stringify_with_txs, bootstrap1, deploy_smart_wallet,
    get_current_block_with_txs, get_wallet_by_name, send_funds, snapshot, txs_stringify,
    AccountName, SnapshotStringify, WalletContract,
};

/**
 * This test simulates two UTXO transfers and a coinbase mint
 */
#[tokio::test]
async fn test_two_transfers() -> anyhow::Result<()> {
    let (srv, provider) = bootstrap1().await.expect("Could not bootstrap node");

    let initial_state = snapshot(&srv)?;
    let stringified_initial_state = initial_state.stringify()?; // To be used at check_transition(state, _, _)
    let initial_block =
        get_current_block_with_txs(&srv.shared.database).expect("Could not obtain block with txs");
    let initial_block_stringified = block_stringify_with_txs(&initial_block)?;

    send_funds(&provider, None, None, false).await?;
    send_funds(
        &provider,
        Some(get_wallet_by_name(
            AccountName::Carol,
            Some(provider.clone()),
        )),
        Some(get_wallet_by_name(
            AccountName::Dave,
            Some(provider.clone()),
        )),
        true,
    )
    .await?;

    let block = srv.shared.database.get_current_block()?.unwrap();
    let stringified_block = block_stringify(&block)?; // To be used at check_transition(_, block, _)

    let block_height = block.header().height().deref().clone();
    let transactions = srv
        .shared
        .database
        .get_transactions_on_blocks(block_height..block_height + 1)?
        .unwrap();
    let transactions = transactions.first().unwrap();

    let stringified_transactions = txs_stringify(transactions.clone())?; // To be used at check_transition(_, _, transitions)

    let result_block = check_transition(
        stringified_initial_state.as_str(),
        stringified_block.as_str(),
        stringified_transactions.as_str(),
        initial_block_stringified.as_str(),
    );

    srv.stop_and_await().await.expect("Could not shutdown node");

    assert_eq!(block.id(), result_block?.id());

    Ok(())
}

#[tokio::test]
async fn test_intermediate_state_transfers() -> anyhow::Result<()> {
    let (srv, provider) = bootstrap1().await.expect("Could not bootstrap node");

    send_funds(&provider, None, None, true).await?;

    let initial_state = snapshot(&srv)?;
    let stringified_initial_state = initial_state.stringify()?; // To be used at check_transition(state, _, _)
    let initial_block =
        get_current_block_with_txs(&srv.shared.database).expect("Could not obtain block with txs");
    let initial_block_stringified = block_stringify_with_txs(&initial_block)?;

    send_funds(
        &provider,
        Some(get_wallet_by_name(
            AccountName::Carol,
            Some(provider.clone()),
        )),
        Some(get_wallet_by_name(
            AccountName::Dave,
            Some(provider.clone()),
        )),
        true,
    )
    .await?;

    let block = srv.shared.database.get_current_block()?.unwrap();
    let stringified_block = block_stringify(&block)?; // To be used at check_transition(_, block, _)

    let block_height = block.header().height().deref().clone();
    let transactions = srv
        .shared
        .database
        .get_transactions_on_blocks(block_height..block_height + 1)?
        .unwrap();
    let transactions = transactions.first().unwrap();

    let stringified_transactions = txs_stringify(transactions.clone())?; // To be used at check_transition(_, _, transitions)

    let result_block = check_transition(
        stringified_initial_state.as_str(),
        stringified_block.as_str(),
        stringified_transactions.as_str(),
        initial_block_stringified.as_str(),
    );

    srv.stop_and_await().await.expect("Could not shutdown node");

    assert_eq!(block.id(), result_block?.id());

    Ok(())
}

#[tokio::test]
async fn test_deployment_transaction() -> anyhow::Result<()> {
    let (srv, provider) = bootstrap1().await.expect("Could not bootstrap node");

    let initial_state = snapshot(&srv)?;
    let stringified_initial_state = initial_state.stringify()?;
    let initial_block =
        get_current_block_with_txs(&srv.shared.database).expect("Could not obtain block with txs");
    let initial_block_stringified = block_stringify_with_txs(&initial_block)?;

    let deployer = get_wallet_by_name(AccountName::Alice, Some(provider.clone()));
    deploy_smart_wallet(&deployer)
        .await
        .expect("Could not deploy smart wallet");

    let block = srv.shared.database.get_current_block()?.unwrap();
    let stringified_block = block_stringify(&block)?; // To be used at check_transition(_, block, _)

    let block_height = block.header().height().deref().clone();
    let transactions = srv
        .shared
        .database
        .get_transactions_on_blocks(block_height..block_height + 1)?
        .unwrap();
    let transactions = transactions.first().unwrap();

    let stringified_transactions = txs_stringify(transactions.clone())?; // To be used at check_transition(_, _, transitions)

    let result_block = check_transition(
        stringified_initial_state.as_str(),
        stringified_block.as_str(),
        stringified_transactions.as_str(),
        initial_block_stringified.as_str(),
    );

    assert_eq!(block.id(), result_block?.id());

    srv.stop_and_await().await.expect("Could not shutdown node");
    Ok(())
}

#[tokio::test]
async fn test_contract_interaction() -> anyhow::Result<()> {
    let (srv, provider) = bootstrap1().await.expect("Could not bootstrap node");

    let deployer = get_wallet_by_name(AccountName::Alice, Some(provider.clone()));
    let contract: WalletContract<WalletUnlocked> = deploy_smart_wallet(&deployer)
        .await
        .expect("Could not deploy smart wallet");

    let initial_state = snapshot(&srv)?;
    let stringified_initial_state = initial_state.clone().stringify()?;
    let initial_block =
        get_current_block_with_txs(&srv.shared.database).expect("Could not obtain block with txs");
    let initial_block_stringified = block_stringify_with_txs(&initial_block)?;
    let _tx: FuelCallResponse<_> = contract
        .methods()
        .receive_funds()
        .call_params(
            CallParameters::default()
                .with_asset_id(Default::default())
                .with_amount(100),
        )?
        .call()
        .await?;

    let block = srv.shared.database.get_current_block()?.unwrap();
    let stringified_block = block_stringify(&block)?; // To be used at check_transition(_, block, _)

    let block_height = block.header().height().deref().clone();
    let transactions = srv
        .shared
        .database
        .get_transactions_on_blocks(block_height..block_height + 1)?
        .unwrap();

    let transactions = transactions.first().unwrap();
    let stringified_transactions = txs_stringify(transactions.clone())?; // To be used at check_transition(_, _, transitions)

    let result_block = check_transition(
        stringified_initial_state.as_str(),
        stringified_block.as_str(),
        stringified_transactions.as_str(),
        initial_block_stringified.as_str(),
    );

    assert_eq!(block.id(), result_block?.id());

    srv.stop_and_await().await.expect("Could not shutdown node");
    Ok(())
}

#[tokio::test]
async fn test_invalid_signature() -> anyhow::Result<()> {
    let (srv, provider) = bootstrap1().await.expect("Could not bootstrap node");

    let initial_state = snapshot(&srv)?;
    let stringified_initial_state = initial_state.stringify()?; // To be used at check_transition(state, _, _)
    let initial_block =
        get_current_block_with_txs(&srv.shared.database).expect("Could not obtain block with txs");
    let initial_block_stringified = block_stringify_with_txs(&initial_block)?;

    send_funds(&provider, None, None, true).await?;

    let block = srv.shared.database.get_current_block()?.unwrap();
    let stringified_block = block_stringify(&block)?; // To be used at check_transition(_, block, _)

    let block_height = block.header().height().deref().clone();

    let transactions = srv
        .shared
        .database
        .get_transactions_on_blocks(block_height..block_height + 1)?
        .unwrap();
    let mut transactions = transactions.first().unwrap().clone();
    transactions.0 = transactions
        .0
        .into_iter()
        .map(|t| {
            match t {
                Transaction::Script(mut tx) => {
                    *tx.witnesses_mut() = Default::default();
                    Transaction::Script(tx)
                }
                _ => t, // For other types of transactions, no modification is needed
            }
        })
        .collect();

    let stringified_transactions = txs_stringify(transactions.clone())?; // To be used at check_transition(_, _, transitions)

    let result_block = check_transition(
        stringified_initial_state.as_str(),
        stringified_block.as_str(),
        stringified_transactions.as_str(),
        initial_block_stringified.as_str(),
    );

    srv.stop_and_await().await.expect("Could not shutdown node");

    assert!(result_block.is_err());

    Ok(())
}
