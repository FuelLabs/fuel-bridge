use anyhow::{anyhow, Result};
use fuel_core_client::client::FuelClient;
use std::sync::Arc;

pub async fn setup_fuel_provider(fuels_graphql: &str) -> Result<Arc<FuelClient>> {
    let provider = FuelClient::new(fuels_graphql).unwrap();
    let provider_result = provider.chain_info().await;
    match provider_result {
        Ok(_) => Ok(Arc::new(provider)),
        Err(e) => Err(anyhow!("Failed to get chain ID: {e}")),
    }
}

// Converts a floating point value to its integer representation based on a specific number of decimals.
pub fn get_value(value_fp: f64, decimals: u8) -> u64 {
    let decimals_p1 = if decimals < 9 { decimals } else { decimals - 9 };
    let decimals_p2 = decimals - decimals_p1;

    let value = value_fp * 10.0_f64.powf(decimals_p1 as f64);

    // Check for potential overflow
    let value_u64 = value as u64;
    let pow_u64 = 10_u64.pow(decimals_p2 as u32);

    // Use checked_mul to prevent overflow
    value_u64.checked_mul(pow_u64).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::get_value;

    #[test]
    fn test_get_value() {
        // Test case 1: Simple conversion without decimal points
        assert_eq!(get_value(100.0, 0), 100);

        // Test case 2: Conversion with decimal points
        assert_eq!(get_value(123.45, 2), 12345);

        // Test case 3: Large number of decimals
        assert_eq!(get_value(1.23456788, 8), 123456788);
    }
}
