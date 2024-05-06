use super::ETHEREUM_CONNECTION_RETRIES;

use anyhow::{anyhow, Result};
use ethers::providers::Middleware;
use ethers::types::Address;

use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;

pub use ethers::types::U256;

#[cfg(test)]
use mockall::{automock, predicate::*};

#[async_trait]
#[cfg_attr(test, automock)]
pub trait EthereumChainTrait: Send + Sync {
    async fn check_connection(&self) -> Result<()>;
    async fn get_seconds_since_last_block(&self) -> Result<u32>;
    async fn get_latest_block_number(&self) -> Result<u64>;
    async fn get_account_balance(&self, addr: &str) -> Result<U256>;
}

#[derive(Clone, Debug)]
pub struct EthereumChain<P: Middleware> {
    provider: Arc<P>,
}

impl<P: Middleware + 'static> EthereumChain<P> {
    pub async fn new(provider: Arc<P>) -> Result<Self> {
        Ok(EthereumChain { provider })
    }
}

#[async_trait]
impl<P: Middleware + 'static> EthereumChainTrait for EthereumChain<P> {
    async fn check_connection(&self) -> Result<()> {
        for _ in 0..ETHEREUM_CONNECTION_RETRIES {
            if self.provider.get_chainid().await.is_ok() {
                return Ok(());
            }
        }
        Err(anyhow::anyhow!(
            "Failed to establish connection after {} retries",
            ETHEREUM_CONNECTION_RETRIES
        ))
    }

    async fn get_seconds_since_last_block(&self) -> Result<u32> {
        let block_num = self.get_latest_block_number().await?;
        let mut block_option = None;

        for _ in 0..ETHEREUM_CONNECTION_RETRIES {
            if let Ok(block) = self.provider.get_block(block_num).await {
                block_option = block;
                break;
            }
        }

        let block =
            block_option.ok_or_else(|| anyhow!("Failed to get block after {} retries", ETHEREUM_CONNECTION_RETRIES))?;

        let last_block_timestamp = block.timestamp.as_u64();
        let millis_now = (SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64) / 1000;

        if millis_now >= last_block_timestamp {
            Ok((millis_now - last_block_timestamp) as u32)
        } else {
            Ok(0)
        }
    }

    async fn get_latest_block_number(&self) -> Result<u64> {
        for _ in 0..ETHEREUM_CONNECTION_RETRIES {
            if let Ok(num) = self.provider.get_block_number().await {
                return Ok(num.as_u64());
            }
        }
        Err(anyhow::anyhow!(
            "Failed to retrieve block number after {} retries",
            ETHEREUM_CONNECTION_RETRIES
        ))
    }

    async fn get_account_balance(&self, addr: &str) -> Result<U256> {
        for _i in 0..ETHEREUM_CONNECTION_RETRIES {
            if let Ok(balance) = self.provider.get_balance(Address::from_str(addr)?, None).await {
                return Ok(balance);
            }
        }
        Err(anyhow::anyhow!(
            "Failed to retrieve balance after {} retries",
            ETHEREUM_CONNECTION_RETRIES
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::providers::{MockProvider, MockResponse, Provider};
    use ethers::types::{Block, U64};

    async fn setup_mock_provider() -> (MockProvider, EthereumChain<Provider<MockProvider>>) {
        let mock = MockProvider::new();
        let provider = Provider::new(mock.clone());
        let arc_provider = Arc::new(provider);
        let chain = EthereumChain::new(arc_provider.clone()).await;

        assert!(chain.is_ok());

        (mock, chain.unwrap())
    }

    #[tokio::test]
    async fn test_check_connection() {
        let (mock, chain) = setup_mock_provider().await;

        // Mock the response for get_chainid call
        let chain_id_response = MockResponse::Value(serde_json::json!(U64::from(1337)));
        mock.push_response(chain_id_response);

        assert!(chain.check_connection().await.is_ok());
    }

    #[tokio::test]
    async fn test_get_seconds_since_last_block() {
        let (mock, chain) = setup_mock_provider().await;
        let latest_block_number = U64::from(100);
        let past_timestamp = U256::from(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() - 10);

        mock.push_response(MockResponse::Value(
            serde_json::to_value(&Block::<()> {
                number: Some(latest_block_number),
                timestamp: past_timestamp,
                ..Default::default()
            })
            .unwrap(),
        ));

        mock.push_response(MockResponse::Value(serde_json::json!(latest_block_number)));

        let seconds_since_last_block = chain.get_seconds_since_last_block().await;
        assert!(seconds_since_last_block.is_ok());
        assert_eq!(seconds_since_last_block.unwrap(), 10);
    }

    #[tokio::test]
    async fn test_get_latest_block_number() {
        let (mock, chain) = setup_mock_provider().await;
        mock.push_response(MockResponse::Value(serde_json::json!(U64::from(100))));

        let block_number = chain.get_latest_block_number().await;
        assert!(block_number.is_ok());
        assert_eq!(block_number.unwrap(), 100);
    }

    #[tokio::test]
    async fn test_get_account_balance() {
        let (mock, chain) = setup_mock_provider().await;
        let addr = "0x0000000000000000000000000000000000000000";
        let balance = U256::from(1000);

        mock.push_response(MockResponse::Value(serde_json::to_value(balance).unwrap()));

        let result = chain.get_account_balance(addr).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), balance);
    }
}
