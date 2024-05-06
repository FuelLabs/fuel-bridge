use super::{ETHEREUM_BLOCK_TIME, ETHEREUM_CONNECTION_RETRIES};

use anyhow::Result;
use ethers::abi::Address;
use ethers::prelude::k256::ecdsa::SigningKey;
use ethers::prelude::{abigen, SignerMiddleware};
use ethers::providers::Middleware;
use ethers::signers::Wallet;
use ethers::types::{Filter, H160, H256, U256};

use async_trait::async_trait;

use std::cmp::max;
use std::str::FromStr;
use std::sync::Arc;

#[cfg(test)]
use mockall::{automock, predicate::*};

abigen!(FuelERC20Gateway, "./abi/FuelERC20Gateway.json");

#[async_trait]
#[cfg_attr(test, automock)]
pub trait GatewayContractTrait: Send + Sync {
    async fn initialize(&mut self) -> Result<()>;
    async fn get_token_amount_deposited(
        &self,
        timeframe: u32,
        token_address: &str,
        latest_block_num: u64,
    ) -> Result<U256>;
    async fn get_token_amount_withdrawn(
        &self,
        timeframe: u32,
        token_address: &str,
        latest_block_num: u64,
    ) -> Result<U256>;
    async fn pause(&self) -> Result<()>;
}

#[derive(Clone, Debug)]
pub struct GatewayContract<P: Middleware> {
    provider: Arc<P>,
    wallet: Wallet<SigningKey>,
    contract: Option<FuelERC20Gateway<SignerMiddleware<Arc<P>, Wallet<SigningKey>>>>,
    address: H160,
    read_only: bool,
}

impl<P: Middleware + 'static> GatewayContract<P> {
    pub fn new(
        gateway_contract_address: String,
        read_only: bool,
        provider: Arc<P>,
        wallet: Wallet<SigningKey>,
    ) -> Result<Self> {
        let address: H160 = Address::from_str(&gateway_contract_address)?;

        Ok(GatewayContract {
            provider,
            wallet,
            contract: None,
            address,
            read_only,
        })
    }
}

#[async_trait]
impl<P: Middleware + 'static> GatewayContractTrait for GatewayContract<P> {
    async fn initialize(&mut self) -> Result<()> {
        // Create the contract instance
        let client = SignerMiddleware::new(self.provider.clone(), self.wallet.clone());

        let contract = FuelERC20Gateway::new(self.address, Arc::new(client));

        // Try calling a read function to check if the contract is valid
        if contract.paused().call().await.is_ok() {
            self.contract = Some(contract);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid gateway contract"))
        }
    }

    async fn get_token_amount_deposited(
        &self,
        timeframe: u32,
        token_address: &str,
        latest_block_num: u64,
    ) -> Result<U256> {
        let block_offset = timeframe as u64 / ETHEREUM_BLOCK_TIME;
        let start_block = max(latest_block_num, block_offset) - block_offset;
        let token_address = match token_address.parse::<H160>() {
            Ok(addr) => addr,
            Err(e) => return Err(anyhow::anyhow!("{e}")),
        };

        // Deposit(bytes32 indexed sender, address indexed tokenId, bytes32 fuelTokenId,
        // uint256 amount)
        let token_topics = H256::from(token_address);
        let filter = Filter::new()
            .address(self.address)
            .event("Deposit(bytes32,address,bytes32,uint256)")
            .topic2(token_topics)
            .from_block(start_block);
        for i in 0..ETHEREUM_CONNECTION_RETRIES {
            match self.provider.get_logs(&filter).await {
                Ok(logs) => {
                    let mut total = U256::zero();
                    for log in logs {
                        let amount = U256::from_big_endian(&log.data[0..32]);
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

    async fn get_token_amount_withdrawn(
        &self,
        timeframe: u32,
        token_address: &str,
        latest_block_num: u64,
    ) -> Result<U256> {
        let block_offset = timeframe as u64 / ETHEREUM_BLOCK_TIME;
        let start_block = max(latest_block_num, block_offset) - block_offset;
        let token_address = match token_address.parse::<H160>() {
            Ok(addr) => addr,
            Err(e) => return Err(anyhow::anyhow!("{e}")),
        };

        // Withdrawal(bytes32 indexed recipient, address indexed tokenId, bytes32 fuelTokenId,
        // uint256 amount)
        let token_topics = H256::from(token_address);
        let filter = Filter::new()
            .address(self.address)
            .event("Withdrawal(bytes32,address,bytes32,uint256)")
            .topic2(token_topics)
            .from_block(start_block);
        for i in 0..ETHEREUM_CONNECTION_RETRIES {
            match self.provider.get_logs(&filter).await {
                Ok(logs) => {
                    let mut total = U256::zero();
                    for log in logs {
                        let amount = U256::from_big_endian(&log.data[0..32]);
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
            .ok_or_else(|| anyhow::anyhow!("Gateway Contract not initialized"))?;

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
            Err(e) => Err(anyhow::anyhow!("Failed to pause gateway contract: {}", e)),
            Ok(res) => {
                println!("Pausing gateway contract at tx {:?}", res);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use ethers::abi::Token;
    use ethers::prelude::*;
    use std::str::FromStr;

    use crate::{
        ethereum_watcher::gateway_contract::GatewayContractTrait,
        test_utils::test_utils::{setup_gateway_contract, setup_wallet_and_provider},
    };

    #[tokio::test]
    async fn new_gateway_contract_creates_instance_correctly() {
        let (provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let gateway_contract = setup_gateway_contract(provider, mock, wallet).expect("Setup failed");

        assert!(!gateway_contract.read_only);
        assert_eq!(
            gateway_contract.address,
            H160::from_str("0x07cf0FF4fdD5d73C4ea5E96bb2cFaa324A348269").unwrap()
        );
    }

    #[tokio::test]
    async fn initialize_gateway_contract_initializes_contract() {
        let (arc_provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let mut gateway_contract = setup_gateway_contract(arc_provider, mock.clone(), wallet).expect("Setup failed");

        let additional_response_hex = format!("0x{}", "00".repeat(32));
        mock.push_response(MockResponse::Value(serde_json::Value::String(
            additional_response_hex.to_string(),
        )));

        let result = gateway_contract.initialize().await;
        assert!(result.is_ok());
        assert!(gateway_contract.contract.is_some());
    }

    #[tokio::test]
    async fn get_token_amount_deposited_retrieves_correct_amount() {
        let (arc_provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let gateway_contract = setup_gateway_contract(arc_provider, mock.clone(), wallet).expect("Setup failed");

        // Serialize the deposit amounts to a byte vector

        // Extend the vectors with the encoded deposit amounts
        let deposit_data_one = ethers::abi::encode(&[Token::Uint(U256::from(100000u64))]);
        let deposit_data_two = ethers::abi::encode(&[Token::Uint(U256::from(230000u64))]);

        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000"
            .parse()
            .unwrap();
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

        let token_address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        let timeframe = 30;
        let latest_block_num = 42;

        let result = gateway_contract
            .get_token_amount_deposited(timeframe, token_address, latest_block_num)
            .await;

        assert!(result.is_ok(), "Failed to get token amount deposited");

        let total_amount: U256 = result.unwrap();
        assert_eq!(
            total_amount.as_u64(),
            330000,
            "Total amount deposited does not match expected value"
        );
    }

    #[tokio::test]
    async fn get_token_amount_withdrawn_retrieves_correct_amount() {
        let (provider, mock, wallet) = setup_wallet_and_provider().expect("Wallet and provider setup failed");
        let gateway_contract = setup_gateway_contract(provider, mock.clone(), wallet).expect("Setup failed");

        // Create and extend the vectors with the encoded withdrawal amounts
        let withdrawal_data_one = ethers::abi::encode(&[Token::Uint(U256::from(100000u64))]);
        let withdrawal_data_two = ethers::abi::encode(&[Token::Uint(U256::from(230000u64))]);

        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000"
            .parse()
            .unwrap();
        let log_entry_one = Log {
            address: "0x0000000000000000000000000000000000000001".parse().unwrap(),
            topics: vec![empty_data],
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
            topics: vec![empty_data],
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

        let token_address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        let timeframe = 30;
        let latest_block_num = 42;

        let result = gateway_contract
            .get_token_amount_withdrawn(timeframe, token_address, latest_block_num)
            .await;

        assert!(result.is_ok(), "Failed to get token amount withdrawn");

        let total_amount: U256 = result.unwrap();
        let expected_total = 330000u64;
        assert_eq!(
            total_amount.as_u64(),
            expected_total,
            "Total amount withdrawn does not match expected value"
        );
    }
}
