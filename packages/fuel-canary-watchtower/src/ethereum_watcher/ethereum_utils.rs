use anyhow::{anyhow, Result};
use ethers::middleware::gas_escalator::{Frequency, GeometricGasPrice};
use ethers::prelude::k256::ecdsa::SigningKey;
use ethers::prelude::{GasEscalatorMiddleware, Log, Signer, Wallet};
use ethers::providers::{Http, Middleware, Provider};
use ethers::types::U256;
use fuels::tx::Bytes32;
use std::convert::TryFrom;
use std::ops::Mul;
use std::sync::Arc;

// Geometrically increase gas price:
// Start with `initial_price`, then increase it every 'every_secs' seconds by a fixed
// coefficient. Coefficient defaults to 1.125 (12.5%), the minimum increase for Parity to
// replace a transaction. Coefficient can be adjusted, and there is an optional upper limit.
pub async fn setup_ethereum_provider(
    ethereum_rpc: &str,
    coefficient: f64,
    every_secs: u64,
    max_price: Option<i32>,
) -> Result<Arc<GasEscalatorMiddleware<Provider<Http>>>> {
    let geometric_escalator = GeometricGasPrice::new(coefficient, every_secs, max_price);

    let provider = Provider::<Http>::try_from(ethereum_rpc)?;
    let provider = GasEscalatorMiddleware::new(provider, geometric_escalator, Frequency::PerBlock);

    let provider_result = provider.get_chainid().await;
    match provider_result {
        Ok(_) => Ok(Arc::new(provider)),
        Err(e) => Err(anyhow!("Failed to get chain ID: {e}")),
    }
}

pub fn setup_ethereum_wallet(ethereum_wallet_key: Option<String>, chain_id: u64) -> Result<(Wallet<SigningKey>, bool)> {
    let mut read_only: bool = false;
    let key_str = ethereum_wallet_key.unwrap_or_else(|| {
        read_only = true;
        "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80".to_string()
    });

    let wallet = key_str
        .parse::<Wallet<SigningKey>>()
        .map_err(|e| anyhow!("Failed to parse wallet key: {e}"))?
        .with_chain_id(chain_id);

    Ok((wallet, read_only))
}

pub fn get_public_address(key_str: &str) -> Result<String> {
    let wallet: Wallet<SigningKey> = key_str.parse::<Wallet<SigningKey>>()?;
    let address_str = format!("{:x}", wallet.address());
    Ok(address_str)
}

// Converts a floating point value to its integer representation based on a specific number of decimals.
pub fn get_value(value_fp: f64, decimals: u8) -> U256 {
    let decimals_p1 = if decimals < 9 { decimals } else { decimals - 9 };
    let decimals_p2 = decimals - decimals_p1;

    let value = value_fp * 10.0_f64.powf(decimals_p1 as f64);
    let value = U256::from(value as u64);

    value.mul(10_u64.pow(decimals_p2 as u32))
}

// Processes a vector of logs and extracts 32-byte data from each log.
pub fn process_logs(logs: Vec<Log>) -> Result<Vec<Bytes32>> {
    let mut extracted_data = Vec::new();
    for log in logs {
        let mut bytes32_data: [u8; 32] = [0; 32];
        if log.data.len() == 32 {
            bytes32_data.copy_from_slice(&log.data);
            extracted_data.push(Bytes32::new(bytes32_data));
        } else {
            return Err(anyhow!("Length of log.data does not match that of 32"));
        }
    }
    Ok(extracted_data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::prelude::*;
    use ethers::types::{Log, U64};

    #[test]
    fn test_get_value() {
        // Test with a small decimal value
        assert_eq!(get_value(1.23, 2), U256::from(123));

        // Test with a large decimal value
        assert_eq!(get_value(1234.56789, 5), U256::from(123456789));

        // Test with zero decimals
        assert_eq!(get_value(1234.56789, 0), U256::from(1234));
    }

    #[test]
    fn test_process_logs() {
        let expected_commit: Bytes = "0xc84e7c26f85536eb8c9c1928f89c10748dd11232a3f86826e67f5caee55ceede"
            .parse()
            .unwrap();
        let empty_data = "0x0000000000000000000000000000000000000000000000000000000000000000"
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

        let logs = vec![log_entry];
        assert!(
            process_logs(logs).is_ok(),
            "Should succeed with correct log data length"
        );

        let incorrect_log = Log {
            data: vec![0; 31].into(),
            ..Default::default()
        };
        let logs = vec![incorrect_log];
        assert!(
            process_logs(logs).is_err(),
            "Should fail with incorrect log data length"
        );
    }
}
