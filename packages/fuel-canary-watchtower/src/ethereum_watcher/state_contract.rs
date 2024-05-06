use super::{ethereum_utils, ETHEREUM_CONNECTION_RETRIES};

use anyhow::Result;
use ethers::abi::Address;
use ethers::prelude::k256::ecdsa::SigningKey;
use ethers::prelude::{abigen, SignerMiddleware};
use ethers::providers::Middleware;
use ethers::signers::Wallet;
use ethers::types::{Filter, H160};
use fuels::tx::Bytes32;

use async_trait::async_trait;

use std::str::FromStr;
use std::sync::Arc;

#[cfg(test)]
use mockall::{automock, predicate::*};

abigen!(FuelChainState, "./abi/FuelChainState.json");

#[async_trait]
#[cfg_attr(test, automock)]
pub trait StateContractTrait: Send + Sync {
    async fn initialize(&mut self) -> Result<()>;
    async fn get_latest_commits(&self, from_block: u64) -> Result<Vec<Bytes32>>;
    async fn pause(&self) -> Result<()>;
}

#[derive(Clone, Debug)]
pub struct StateContract<P: Middleware> {
    provider: Arc<P>,
    wallet: Wallet<SigningKey>,
    contract: Option<FuelChainState<SignerMiddleware<Arc<P>, Wallet<SigningKey>>>>,
    address: H160,
    read_only: bool,
}

impl<P: Middleware + 'static> StateContract<P> {
    pub fn new(
        state_contract_address: String,
        read_only: bool,
        provider: Arc<P>,
        wallet: Wallet<SigningKey>,
    ) -> Result<Self> {
        let address: H160 = Address::from_str(&state_contract_address)?;

        Ok(StateContract {
            provider,
            wallet,
            address,
            contract: None,
            read_only,
        })
    }
}

#[async_trait]
impl<P: Middleware + 'static> StateContractTrait for StateContract<P> {
    async fn initialize(&mut self) -> Result<()> {
        let client = SignerMiddleware::new(self.provider.clone(), self.wallet.clone());

        let contract = FuelChainState::new(self.address, Arc::new(client));

        // Try calling a read function to check if the contract is valid
        match contract.paused().call().await {
            Err(_) => Err(anyhow::anyhow!("Invalid state contract")),
            Ok(_) => {
                self.contract = Some(contract);
                Ok(())
            }
        }
    }

    async fn get_latest_commits(&self, from_block: u64) -> Result<Vec<Bytes32>> {
        //CommitSubmitted(uint256 indexed commitHeight, bytes32 blockHash)
        let filter = Filter::new()
            .address(self.address)
            .event("CommitSubmitted(uint256,bytes32)")
            .from_block(from_block);

        for i in 0..ETHEREUM_CONNECTION_RETRIES {
            let logs = match self.provider.get_logs(&filter).await {
                Ok(logs) => logs,
                Err(e) if i == ETHEREUM_CONNECTION_RETRIES - 1 => return Err(anyhow::anyhow!("{e}")),
                _ => continue,
            };

            return ethereum_utils::process_logs(logs);
        }

        Ok(vec![])
    }

    async fn pause(&self) -> Result<()> {
        if self.read_only {
            return Err(anyhow::anyhow!("Ethereum account not configured"));
        }

        let contract = self
            .contract
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("State Contract not initialized"))?;

        // Check if the contract is already paused
        let is_paused = contract.paused().call().await?;
        if is_paused {
            // If the contract is already paused, do nothing
            return Ok(());
        }

        // Proceed with pausing the contract
        let pause_call = contract.pause();
        let result = pause_call.send().await;
        match result {
            Err(e) => Err(anyhow::anyhow!("Failed to pause state contract: {}", e)),
            Ok(res) => {
                println!("Pausing state contract at tx {:?}", res);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        ethereum_watcher::state_contract::StateContractTrait,
        test_utils::test_utils::{setup_state_contract, setup_wallet_and_provider},
    };
    use ethers::prelude::*;

    #[tokio::test]
    async fn new_state_contract_test() {
        let (provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let state_contract = setup_state_contract(provider, mock, wallet).expect("Setup failed");

        assert!(!state_contract.read_only);
        assert_eq!(
            state_contract.address,
            "0xbe7aB12653e705642eb42EF375fd0d35Cfc45b03".parse().unwrap()
        );
    }

    #[tokio::test]
    async fn initialize_state_contract_test() {
        let (provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let mut state_contract = setup_state_contract(provider, mock.clone(), wallet).expect("Setup failed");

        // Mock a successful response for the `paused` call
        let paused_response_hex: String = format!("0x{}", "00".repeat(32));
        mock.push_response(MockResponse::Value(serde_json::Value::String(paused_response_hex)));

        let result = state_contract.initialize().await;
        assert!(result.is_ok());
        assert!(state_contract.contract.is_some());
    }

    #[tokio::test]
    async fn get_latest_commits_test() {
        let (provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let state_contract = setup_state_contract(provider, mock.clone(), wallet).expect("Setup failed");

        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000"
            .parse()
            .unwrap();
        let expected_commit: Bytes = "0xc84e7c26f85536eb8c9c1928f89c10748dd11232a3f86826e67f5caee55ceede"
            .parse()
            .unwrap();
        let log_entry = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],
            data: expected_commit.clone(),
            block_hash: Some(empty_data),
            block_number: Some(U64::from(42)),
            transaction_hash: Some(empty_data),
            transaction_index: Some(U64::from(1)),
            log_index: Some(U256::from(2)),
            transaction_log_index: Some(U256::from(3)),
            log_type: Some("mined".to_string()),
            removed: Some(false),
        };

        mock.push::<Vec<Log>, _>(vec![log_entry]).unwrap();

        let mut bytes32_data: [u8; 32] = [0; 32];
        bytes32_data.copy_from_slice(&expected_commit);

        let block_num: u64 = 42;
        let commits = state_contract.get_latest_commits(block_num).await.unwrap();
        assert_eq!(&commits[0].as_slice(), &bytes32_data.as_slice());
    }
}
