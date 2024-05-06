#[cfg(test)]
pub mod test_utils {
    use anyhow::Result;
    use ethers::prelude::k256::ecdsa::SigningKey;
    use ethers::prelude::{MockProvider, MockResponse, Provider, Wallet, U64};
    use ethers::signers::Signer;
    use std::sync::Arc;
    use std::time::Duration;

    use crate::alerter::WatchtowerAlerter;
    use crate::ethereum_watcher::gateway_contract::GatewayContract;
    use crate::ethereum_watcher::portal_contract::PortalContract;
    use crate::ethereum_watcher::state_contract::StateContract;
    use crate::pagerduty::{MockHttpPoster, PagerDutyClient};
    use crate::WatchtowerConfig;

    pub static ETHEREUM_CONNECTION_RETRIES: u64 = 2;
    pub static ETHEREUM_BLOCK_TIME: u64 = 12;

    const DEFAULT_KEY: &str = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const DEFAULT_PORTAL_CONTRACT_ADDRESS: &str = "0x03f2901Db5723639978deBed3aBA66d4EA03aF73";
    const DEFAULT_STATE_CONTRACT_ADDRESS: &str = "0xbe7aB12653e705642eb42EF375fd0d35Cfc45b03";
    const DEFAULT_GATEWAY_CONTRACT_ADDRESS: &str = "0x07cf0FF4fdD5d73C4ea5E96bb2cFaa324A348269";
    const DEFAULT_PAGERDUTY_API_KEY: &str = "test_api";
    const PAUSED_RESPONSE_HEX: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const READ_ONLY: bool = false;

    pub fn setup_wallet_and_provider(
    ) -> Result<(Arc<Provider<MockProvider>>, Arc<MockProvider>, Wallet<SigningKey>), anyhow::Error> {
        let chain_id = U64::from(1337);
        let (provider, mock) = Provider::mocked();
        let arc_provider = Arc::new(provider);
        let arc_mock = Arc::new(mock);
        let wallet = DEFAULT_KEY
            .parse::<Wallet<SigningKey>>()?
            .with_chain_id(chain_id.as_u64());
        Ok((arc_provider, arc_mock, wallet))
    }

    fn setup_mock_response(mock: &MockProvider) {
        let paused_response_hex = PAUSED_RESPONSE_HEX.to_string();
        mock.push_response(MockResponse::Value(serde_json::Value::String(paused_response_hex)));
    }

    pub async fn setup_portal_contract(
        provider: Arc<Provider<MockProvider>>,
        mock: Arc<MockProvider>,
        wallet: Wallet<SigningKey>,
    ) -> Result<PortalContract<Provider<MockProvider>>, Box<dyn std::error::Error>> {
        setup_mock_response(&mock);
        let portal_contract: PortalContract<Provider<MockProvider>> =
            PortalContract::new(DEFAULT_PORTAL_CONTRACT_ADDRESS.to_string(), READ_ONLY, provider, wallet)?;

        Ok(portal_contract)
    }

    pub fn setup_gateway_contract(
        provider: Arc<Provider<MockProvider>>,
        mock: Arc<MockProvider>,
        wallet: Wallet<SigningKey>,
    ) -> Result<GatewayContract<Provider<MockProvider>>, Box<dyn std::error::Error>> {
        setup_mock_response(&mock);
        let gateway_contract: GatewayContract<Provider<MockProvider>> = GatewayContract::new(
            DEFAULT_GATEWAY_CONTRACT_ADDRESS.to_string(),
            READ_ONLY,
            provider,
            wallet,
        )?;

        Ok(gateway_contract)
    }

    pub fn setup_state_contract(
        provider: Arc<Provider<MockProvider>>,
        mock: Arc<MockProvider>,
        wallet: Wallet<SigningKey>,
    ) -> Result<StateContract<Provider<MockProvider>>, Box<dyn std::error::Error>> {
        setup_mock_response(&mock);
        let state_contract: StateContract<Provider<MockProvider>> =
            StateContract::new(DEFAULT_STATE_CONTRACT_ADDRESS.to_string(), READ_ONLY, provider, wallet)?;

        Ok(state_contract)
    }

    pub fn setup_watchtower_alerter() -> Result<WatchtowerAlerter, anyhow::Error> {
        // Create a mock configuration for WatchtowerAlerter
        let config = WatchtowerConfig {
            alert_cache_expiry: Duration::from_secs(300),
            watchtower_system_name: "TestSystem".to_string(),
            // Add other necessary configuration fields if needed
            ..Default::default()
        };

        // Create a PagerDutyClient with a mock HTTP poster
        let mock_http_poster: MockHttpPoster = MockHttpPoster::new();
        let mock_pagerduty_client =
            PagerDutyClient::new(DEFAULT_PAGERDUTY_API_KEY.to_string(), Arc::new(mock_http_poster));

        // Create and return the WatchtowerAlerter
        WatchtowerAlerter::new(&config, Some(mock_pagerduty_client))
    }
}
