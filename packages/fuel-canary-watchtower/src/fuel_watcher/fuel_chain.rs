use super::{extended_provider::ClientExt, FUEL_BLOCK_TIME, FUEL_CONNECTION_RETRIES};

use anyhow::Result;
use fuel_core_client::client::{
    schema::tx::{transparent_receipt::ReceiptType, OpaqueTransaction, TransactionStatus},
    types::ChainInfo,
    FuelClient,
};
use fuels::{
    client::{PageDirection, PaginationRequest},
    core::{
        codec::ABIDecoder,
        traits::{Parameterize, Tokenizable},
    },
    macros::{Parameterize, Tokenizable},
    tx::Bytes32,
    types::{Bits256, Identity},
};

use async_trait::async_trait;

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(test)]
use mockall::{automock, predicate::*};

#[derive(Parameterize, Tokenizable, Debug)]
pub struct WithdrawalEvent {
    amount: u64,
    from: Identity,
    to: Bits256,
}

#[async_trait]
#[cfg_attr(test, automock)]
pub trait FuelChainTrait: Send + Sync {
    async fn check_connection(&self) -> Result<()>;
    async fn get_seconds_since_last_block(&self) -> Result<u32>;
    async fn fetch_chain_info(&self) -> Result<ChainInfo>;
    async fn get_base_amount_withdrawn(&self, timeframe: u32) -> Result<u64>;
    async fn get_base_amount_withdrawn_from_tx(&self, tx: &OpaqueTransaction) -> Result<u64>;
    async fn get_token_amount_withdrawn(&self, timeframe: u32, token_contract_id: &str) -> Result<u64>;
    async fn get_token_amount_withdrawn_from_tx(&self, tx: &OpaqueTransaction, token_contract_id: &str) -> Result<u64>;
    async fn verify_block_commit(&self, block_hash: &Bytes32) -> Result<bool>;
}

#[derive(Clone, Debug)]
pub struct FuelChain {
    provider: Arc<FuelClient>,
}

impl FuelChain {
    pub fn new(provider: Arc<FuelClient>) -> Result<Self> {
        Ok(FuelChain { provider })
    }
}

#[async_trait]
impl FuelChainTrait for FuelChain {
    async fn check_connection(&self) -> Result<()> {
        for _ in 0..FUEL_CONNECTION_RETRIES {
            if self.provider.chain_info().await.is_ok() {
                return Ok(());
            }
        }
        Err(anyhow::anyhow!(
            "Failed to establish connection after {} retries",
            FUEL_CONNECTION_RETRIES
        ))
    }

    async fn get_seconds_since_last_block(&self) -> Result<u32> {
        let chain_info = self.fetch_chain_info().await?;

        // Assuming `latest_block_time` is of type `Tai64` and is always present.
        let latest_block_time = chain_info.latest_block.header.time;
        let last_block_timestamp = latest_block_time.to_unix() as u64;

        let current_timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        if current_timestamp < last_block_timestamp {
            Ok(0)
        }else {
            Ok((current_timestamp - last_block_timestamp) as u32)
        }
    }

    async fn fetch_chain_info(&self) -> Result<ChainInfo> {
        for _ in 0..FUEL_CONNECTION_RETRIES {
            match self.provider.chain_info().await {
                Ok(info) => return Ok(info),
                _ => continue,
            }
        }
        Err(anyhow::anyhow!(
            "Failed to establish connection after {} retries",
            FUEL_CONNECTION_RETRIES
        ))
    }

    async fn get_base_amount_withdrawn(&self, timeframe: u32) -> Result<u64> {
        let adjusted_timeframe = timeframe / FUEL_BLOCK_TIME as u32;
        let num_blocks = usize::try_from(adjusted_timeframe).map_err(|e| anyhow::anyhow!("{e}"))?;

        // Fetch and process missing blocks
        let mut total_from_blocks = 0;
        for i in 0..FUEL_CONNECTION_RETRIES {
            let req = PaginationRequest {
                cursor: None,
                results: num_blocks,
                direction: PageDirection::Backward,
            };
            match self.provider.full_blocks(req).await {
                Ok(blocks_result) => {
                    for block in blocks_result.results {
                        let mut block_total = 0;
                        for tx in block.transactions {
                            match self.get_base_amount_withdrawn_from_tx(&tx).await {
                                Ok(amount) => block_total += amount,
                                Err(e) => return Err(anyhow::anyhow!("{e}")),
                            }
                        }
                        total_from_blocks += block_total;
                    }
                    break;
                }
                Err(e) if i == FUEL_CONNECTION_RETRIES - 1 => return Err(anyhow::anyhow!("{e}")),
                Err(_) => continue,
            }
        }

        Ok(total_from_blocks)
    }

    async fn get_base_amount_withdrawn_from_tx(&self, tx: &OpaqueTransaction) -> Result<u64> {
        // Process the transaction from the chain within a certain number of tries.
        let mut total_amount: u64 = 0;

        // Check if there is a status assigned.
        let status = match &tx.status {
            Some(status) => status,
            None => return Ok(0),
        };

        // Check if the status is a success, if not we return.
        if !matches!(status, TransactionStatus::SuccessStatus { .. }) {
            return Ok(0);
        }

        // Check if there are receipts assigned.
        let receipts = match &tx.receipts {
            Some(receipts) => receipts,
            None => return Ok(0),
        };

        // Fetch the receipts from the transaction.
        for receipt in receipts {
            if let ReceiptType::MessageOut = receipt.receipt_type {
                let amount = match &receipt.amount {
                    Some(amount) => amount.0,
                    None => 0,
                };
                total_amount += amount;
            }
        }

        Ok(total_amount)
    }

    async fn get_token_amount_withdrawn(&self, timeframe: u32, token_contract_id: &str) -> Result<u64> {
        let adjusted_timeframe = timeframe / FUEL_BLOCK_TIME as u32;
        let num_blocks = usize::try_from(adjusted_timeframe).map_err(|e| anyhow::anyhow!("{e}"))?;

        // Fetch and process missing blocks
        let mut total_from_blocks = 0;
        for i in 0..FUEL_CONNECTION_RETRIES {
            let req = PaginationRequest {
                cursor: None,
                results: num_blocks,
                direction: PageDirection::Backward,
            };
            match self.provider.full_blocks(req).await {
                Ok(blocks_result) => {
                    for block in blocks_result.results {
                        let mut block_total = 0;
                        for tx in block.transactions {
                            match self.get_token_amount_withdrawn_from_tx(&tx, token_contract_id).await {
                                Ok(amount) => block_total += amount,
                                Err(e) => return Err(anyhow::anyhow!("{e}")),
                            }
                        }
                        total_from_blocks += block_total;
                    }
                    break;
                }
                Err(e) if i == FUEL_CONNECTION_RETRIES - 1 => return Err(anyhow::anyhow!("{e}")),
                Err(_) => continue,
            }
        }

        Ok(total_from_blocks)
    }

    async fn get_token_amount_withdrawn_from_tx(&self, tx: &OpaqueTransaction, token_contract_id: &str) -> Result<u64> {
        // Query the transaction from the chain within a certain number of tries.
        let mut total_amount: u64 = 0;

        // Check if there is a status assigned.
        let status = match &tx.status {
            Some(status) => status,
            None => return Ok(0),
        };

        // Check if the status is a success, if not we return.
        if !matches!(status, TransactionStatus::SuccessStatus { .. }) {
            return Ok(0);
        }

        // Check if there are receipts assigned.
        let receipts = match &tx.receipts {
            Some(receipts) => receipts,
            None => return Ok(0),
        };

        // Fetch the receipts from the transaction.
        let mut burn_found: bool = false;
        for receipt in receipts {
            if let ReceiptType::Burn = receipt.receipt_type {
                // Skip this receipt if contract is None
                let contract_id = match &receipt.contract {
                    Some(contract) => contract.id.to_string(),
                    None => continue,
                };

                // Set burn_found to true if the contract_id matches token_contract_id
                if contract_id == token_contract_id {
                    burn_found = true;
                }
            }

            if let ReceiptType::LogData = receipt.receipt_type {
                // If a burn receipt was not found continue
                if !burn_found {
                    continue;
                }

                // Skip this receipt if contract is None
                let contract_id = match &receipt.contract {
                    Some(contract) => contract.id.to_string(),
                    None => continue,
                };

                // Just incase verify that this log data belongs to the correct contract
                if contract_id != token_contract_id {
                    continue;
                }

                // Skip this receipt if data is None
                let data = match &receipt.data {
                    Some(data) => data,
                    None => continue,
                };

                let token = ABIDecoder::default().decode(&WithdrawalEvent::param_type(), data)?;

                let withdrawal_event: WithdrawalEvent = WithdrawalEvent::from_token(token)?;
                total_amount += withdrawal_event.amount;
            }
        }

        Ok(total_amount)
    }

    async fn verify_block_commit(&self, block_hash: &Bytes32) -> Result<bool> {
        for i in 0..FUEL_CONNECTION_RETRIES {
            match self.provider.block(block_hash).await {
                Ok(Some(_)) => {
                    return Ok(true);
                }
                Ok(None) => {
                    return Ok(false);
                }
                Err(e) => {
                    if i == FUEL_CONNECTION_RETRIES - 1 {
                        return Err(anyhow::anyhow!("{e}"));
                    }
                }
            }
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fuels::prelude::*;

    #[tokio::test]
    async fn test_check_connection() {
        // Start a local Fuel node
        let server = FuelService::start(Config::default()).await.unwrap();
        let addr_str = format!("http://{}", server.bound_address());

        // Create a provider pointing to the local node
        let provider = FuelClient::new(addr_str).unwrap();
        let provider = Arc::new(provider);

        // Initialize the FuelChain with the local provider
        let fuel_chain = FuelChain::new(provider).unwrap();

        // Test the check_connection function
        assert!(fuel_chain.check_connection().await.is_ok());
    }

    #[tokio::test]
    async fn test_get_seconds_since_last_block() {
        // Start a local Fuel node
        let server = FuelService::start(Config::default()).await.unwrap();
        let addr_str = format!("http://{}", server.bound_address());

        // Create a provider pointing to the local node
        let provider = FuelClient::new(addr_str).unwrap();
        let provider = Arc::new(provider);

        // Initialize the FuelChain with the local provider
        let fuel_chain = FuelChain::new(provider).unwrap();

        // Test the get_seconds_since_last_block function
        let seconds_since_last_block = fuel_chain.get_seconds_since_last_block().await;
        assert!(seconds_since_last_block.is_ok());

        // Test that seconds is not 0
        let seconds = seconds_since_last_block.unwrap();
        assert_ne!(seconds, 0);
    }

    #[tokio::test]
    async fn test_fetch_chain_info() {
        // Start a local Fuel node
        let server = FuelService::start(Config::default()).await.unwrap();
        let addr_str = format!("http://{}", server.bound_address());

        // Create a provider pointing to the local node
        let provider = FuelClient::new(addr_str).unwrap();
        let provider = Arc::new(provider);

        // Initialize the FuelChain with the local provider
        let fuel_chain = FuelChain::new(provider).unwrap();

        // Test fetch_chain_info
        let result = fuel_chain.fetch_chain_info().await;
        assert!(result.is_ok());
    }
}
