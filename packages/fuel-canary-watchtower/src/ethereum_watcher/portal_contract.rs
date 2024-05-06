use super::{ETHEREUM_BLOCK_TIME, ETHEREUM_CONNECTION_RETRIES};

use anyhow::Result;
use ethers::abi::Address;
use ethers::prelude::k256::ecdsa::SigningKey;
use ethers::prelude::{abigen, SignerMiddleware};
use ethers::providers::Middleware;
use ethers::signers::Wallet;
use ethers::types::{Filter, H160, U256};

use async_trait::async_trait;

use std::cmp::max;
use std::ops::Mul;
use std::str::FromStr;
use std::sync::Arc;

#[cfg(test)]
use mockall::{automock, predicate::*};

abigen!(FuelMessagePortal, "./abi/FuelMessagePortal.json");

#[async_trait]
#[cfg_attr(test, automock)] 
pub trait PortalContractTrait: Send + Sync {
    async fn initialize(&mut self) -> Result<()>;
    async fn get_base_amount_deposited(&self, timeframe: u32, latest_block_num: u64) -> Result<U256>;
    async fn get_base_amount_withdrawn(&self, timeframe: u32, latest_block_num: u64) -> Result<U256>;
    async fn pause(&self) -> Result<()>;
}

#[derive(Clone, Debug)]
pub struct PortalContract<P: Middleware>{
    provider: Arc<P>,
    wallet:  Wallet<SigningKey>,
    contract: Option<FuelMessagePortal<SignerMiddleware<Arc<P>, Wallet<SigningKey>>>>,
    address: H160,
    read_only: bool,
}

impl <P: Middleware + 'static>PortalContract<P>{
    pub fn new(
        portal_contract_address: String,
        read_only: bool,
        provider: Arc<P>,
        wallet: Wallet<SigningKey>,
    ) -> Result<Self> {
        let address: H160 = Address::from_str(&portal_contract_address)?;

        Ok(PortalContract {
            provider,
            wallet,
            address,
            contract: None,
            read_only,
        })
    }
}

#[async_trait]
impl <P: Middleware + 'static> PortalContractTrait for PortalContract<P>{
    async fn initialize(&mut self) -> Result<()> {

        // Create the contract instance
        let client = SignerMiddleware::new(
            self.provider.clone(),
            self.wallet.clone(),
        );

        let contract = FuelMessagePortal::new(
            self.address, Arc::new(client),
        );

        // Try calling a read function to check if the contract is valid
        if contract.paused().call().await.is_ok() {
            self.contract = Some(contract);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid portal contract"))
        }
    }

    async fn get_base_amount_deposited(&self, timeframe: u32, latest_block_num: u64) -> Result<U256>{
        let block_offset = timeframe as u64 / ETHEREUM_BLOCK_TIME;
        let start_block = max(latest_block_num, block_offset) - block_offset;

        // MessageSent(bytes32 indexed sender, bytes32 indexed recipient, uint256 indexed nonce,
        // uint64 amount, bytes data)
        let filter = Filter::new()
            .address(self.address)
            .event("MessageSent(bytes32,bytes32,uint256,uint64,bytes)")
            .from_block(start_block);

        for i in 0..ETHEREUM_CONNECTION_RETRIES {
            match self.provider.get_logs(&filter).await {
                Ok(logs) => {
                    let mut total = U256::zero();
                    for log in logs {
                        let amount = U256::from_big_endian(
                            &log.data[0..32]).mul(
                            U256::from(1_000_000_000),
                        );
                        total += amount;
                    }
                    return Ok(total);
                }
                Err(e) => {
                    if i == ETHEREUM_CONNECTION_RETRIES - 1 {
                        return Err(anyhow::anyhow!("{e}"));
                    }
                }
            }
        }
        Ok(U256::zero())
    }

    async fn get_base_amount_withdrawn(
        &self,
        timeframe: u32,
        latest_block_num: u64,
    ) -> Result<U256> {
    
        let block_offset = timeframe as u64 / ETHEREUM_BLOCK_TIME;
        let start_block = max(latest_block_num, block_offset) - block_offset;
    
        // MessageRelayed(bytes32 indexed messageId, bytes32 indexed sender, bytes32 indexed
        // recipient, uint64 amount)
        let filter = Filter::new()
            .address(self.address)
            .event("MessageRelayed(bytes32,bytes32,bytes32,uint64)")
            .from_block(start_block);
        for i in 0..ETHEREUM_CONNECTION_RETRIES {
            match self.provider.get_logs(&filter).await {
                Ok(logs) => {
                    let mut total = U256::zero();
                    for log in logs {
                        let amount = U256::from_big_endian(
                            &log.data[0..32]).mul(
                            U256::from(1_000_000_000),
                        );
                        total += amount;
                    }
                    return Ok(total);
                }
                Err(e) => {
                    if i == ETHEREUM_CONNECTION_RETRIES - 1 {
                        return Err(anyhow::anyhow!("{e}"));
                    }
                }
            }
        }
        Ok(U256::zero())
    }

    async fn pause(&self) -> Result<()> {
        if self.read_only {
            return Err(anyhow::anyhow!("Ethereum account not configured"));
        }

        let contract = self
            .contract
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Portal Contract not initialized"))?;

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
            Err(e) => Err(anyhow::anyhow!("Failed to pause portal contract: {}", e)),
            Ok(res) => {
                println!("Pausing portal contract at tx {:?}", res);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use ethers::abi::Token;
    use ethers::prelude::*;
    use crate::{
        test_utils::test_utils::{setup_portal_contract, setup_wallet_and_provider},
        ethereum_watcher::portal_contract::PortalContractTrait,
    };

    #[tokio::test]
    async fn new_portal_contract_test() {
        let (
            provider,
            mock,
            wallet,
        ) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let portal_contract = setup_portal_contract(
            provider,
            mock,
            wallet,
        ).await.expect("Setup failed");

        assert!(!portal_contract.read_only);
        assert_eq!(portal_contract.address, "0x03f2901Db5723639978deBed3aBA66d4EA03aF73".parse().unwrap());
    }

    #[tokio::test]
    async fn initialize_portal_contract_test() {
        let (
            provider,
            mock,
            wallet,
        ) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let mut portal_contract = setup_portal_contract(
            provider,
            mock.clone(),
            wallet,
        ).await.expect("Setup failed");

        let additional_response_hex = format!("0x{}", "00".repeat(32));
        mock.push_response(
            MockResponse::Value(serde_json::Value::String(additional_response_hex)),
        );

        let result = portal_contract.initialize().await;
        assert!(result.is_ok());
        assert!(portal_contract.contract.is_some());
    }

    #[tokio::test]
    async fn get_base_amount_deposited_test() {
        let (
            provider,
            mock,
            wallet,
        ) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let portal_contract = setup_portal_contract(
            provider,
            mock.clone(),
            wallet,
        ).await.expect("Setup failed");

        // Serialize the deposit amounts to a byte vector
        let deposit_data_one: Vec<u8> = ethers::abi::encode(&[Token::Uint(U256::from(100000u64))]);
        let deposit_data_two: Vec<u8> = ethers::abi::encode(&[Token::Uint(U256::from(230000u64))]);

        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000".parse().unwrap();
        let log_entry_one = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],
            data: deposit_data_one.clone().into(),
            block_hash: Some(empty_data),
            block_number: Some(U64::from(42)),
            transaction_hash: Some(empty_data),
            transaction_index: Some(U64::from(1)),
            log_index: Some(U256::from(2)),
            transaction_log_index: Some(U256::from(3)),
            log_type: Some("mined".to_string()),
            removed: Some(false),
        };
        let log_entry_two = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],
            data: deposit_data_two.clone().into(),
            block_hash: Some(empty_data),
            block_number: Some(U64::from(42)),
            transaction_hash: Some(empty_data),
            transaction_index: Some(U64::from(1)),
            log_index: Some(U256::from(2)),
            transaction_log_index: Some(U256::from(3)),
            log_type: Some("mined".to_string()),
            removed: Some(false),
        };

        mock.push::<Vec<Log>, _>(vec![log_entry_one, log_entry_two]).unwrap();

        // Call get_base_amount_deposited
        let timeframe = 30;
        let latest_block_num = 42;
        let result: std::prelude::v1::Result<U256, anyhow::Error> = portal_contract.get_base_amount_deposited(
            timeframe,
            latest_block_num,
        ).await;

        // Assert that the method call was successful
        assert!(result.is_ok(), "Failed to get base amount deposited");
    
        let total_amount: U256 = result.unwrap();
        assert_eq!(total_amount.as_u64(), 330000000000000, "Total amount deposited does not match expected value");
    }

    #[tokio::test]
    async fn get_base_amount_withdrawn_test() {
        let (
            provider,
            mock,
            wallet,
        ) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let portal_contract = setup_portal_contract(
            provider,
            mock.clone(),
            wallet,
        ).await.expect("Setup failed");

        // Serialize the withdrawal amounts to a byte vector
        let withdrawal_data_one: Vec<u8> = ethers::abi::encode(&[Token::Uint(U256::from(50000u64))]);
        let withdrawal_data_two: Vec<u8> = ethers::abi::encode(&[Token::Uint(U256::from(150000u64))]);

        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000".parse().unwrap();
        let log_entry_one = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],  // Replace with appropriate topics for MessageRelayed
            data: withdrawal_data_one.clone().into(),
            block_hash: Some(empty_data),
            block_number: Some(U64::from(42)),
            transaction_hash: Some(empty_data),
            transaction_index: Some(U64::from(1)),
            log_index: Some(U256::from(2)),
            transaction_log_index: Some(U256::from(3)),
            log_type: Some("mined".to_string()),
            removed: Some(false),
        };
        let log_entry_two = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],  // Replace with appropriate topics for MessageRelayed
            data: withdrawal_data_two.clone().into(),
            block_hash: Some(empty_data),
            block_number: Some(U64::from(42)),
            transaction_hash: Some(empty_data),
            transaction_index: Some(U64::from(1)),
            log_index: Some(U256::from(2)),
            transaction_log_index: Some(U256::from(3)),
            log_type: Some("mined".to_string()),
            removed: Some(false),
        };

        mock.push::<Vec<Log>, _>(vec![log_entry_one, log_entry_two]).unwrap();

        // Call get_base_amount_withdrawn
        let timeframe = 30;
        let latest_block_num = 100;
        let result: std::prelude::v1::Result<U256, anyhow::Error> = portal_contract.get_base_amount_withdrawn(
            timeframe,
            latest_block_num,
        ).await;

        // Assert that the method call was successful
        assert!(result.is_ok(), "Failed to get amount withdrawn");

        let total_amount = result.unwrap();
        // The expected total amount should be the sum of the withdrawal amounts multiplied by 1_000_000_000
        let expected_total_amount = U256::from((50000u64 + 150000u64) * 1_000_000_000);
        assert_eq!(total_amount, expected_total_amount, "Total amount withdrawn does not match expected value");
    }
}