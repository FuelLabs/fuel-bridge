use std::fmt;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;

use anyhow::Result;

use crate::alerter::{send_alert, AlertLevel, AlertParams};
use crate::ethereum_watcher::gateway_contract::GatewayContractTrait;
use crate::ethereum_watcher::portal_contract::PortalContractTrait;
use crate::ethereum_watcher::state_contract::StateContractTrait;

use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio::task::JoinHandle;

pub static THREAD_CONNECTIONS_ERR: &str = "Connections to the ethereum actions thread have all closed";

#[derive(Deserialize, Clone, PartialEq, Eq, Debug, Default)]
pub enum EthereumAction {
    #[default]
    None,
    PauseState,
    PauseGateway,
    PausePortal,
    PauseAll,
}

#[derive(Clone, Debug)]
pub struct ActionParams {
    action: EthereumAction,
    alert_level: AlertLevel,
}

impl ActionParams {
    pub fn new(action: EthereumAction, alert_level: AlertLevel) -> Self {
        ActionParams { action, alert_level }
    }

    #[cfg(test)]
    pub fn is_action_equal(&self, action: EthereumAction) -> bool {
        self.action == action
    }

    #[cfg(test)]
    pub fn is_alert_level_equal(&self, alert_level: AlertLevel) -> bool {
        self.alert_level == alert_level
    }
}

#[derive(Clone)]
pub struct WatchtowerEthereumActions {
    action_sender: UnboundedSender<ActionParams>,
    action_receiver: Arc<Mutex<UnboundedReceiver<ActionParams>>>,
    alert_sender: UnboundedSender<AlertParams>,
    state_contract: Arc<dyn StateContractTrait>,
    portal_contract: Arc<dyn PortalContractTrait>,
    gateway_contract: Arc<dyn GatewayContractTrait>,
}

impl fmt::Debug for WatchtowerEthereumActions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("WatchtowerEthereumActions")
            .field("action_sender", &self.action_sender)
            .field("action_receiver", &self.action_receiver)
            .field("alert_sender", &self.alert_sender)
            // You can't print `state_contract`, `portal_contract`, `gateway_contract` directly, but you can indicate its presence
            .field("state_contract", &"Arc<dyn StateContractTrait>")
            .field("portal_contract", &"Arc<dyn PortalContractTrait>")
            .field("gateway_contract", &"Arc<dyn GatewayContractTrait>")
            .finish()
    }
}

impl WatchtowerEthereumActions {
    pub fn new(
        alert_sender: UnboundedSender<AlertParams>,
        state_contract: Arc<dyn StateContractTrait>,
        portal_contract: Arc<dyn PortalContractTrait>,
        gateway_contract: Arc<dyn GatewayContractTrait>,
    ) -> Self {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();

        WatchtowerEthereumActions {
            action_sender,
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender,
            state_contract,
            portal_contract,
            gateway_contract,
        }
    }

    pub async fn start_action_handling_thread(&self) -> Result<JoinHandle<()>> {
        let action_receiver = Arc::clone(&self.action_receiver);
        let alert_sender = self.alert_sender.clone();
        let state_contract = Arc::clone(&self.state_contract);
        let portal_contract = Arc::clone(&self.portal_contract);
        let gateway_contract = Arc::clone(&self.gateway_contract);

        let handle = tokio::spawn(async move {
            let mut rx = action_receiver.lock().await;
            while let Some(params) = rx.recv().await {
                Self::handle_action(
                    params.action,
                    alert_sender.clone(),
                    Arc::clone(&state_contract),
                    Arc::clone(&portal_contract),
                    Arc::clone(&gateway_contract),
                    params.alert_level,
                )
                .await;
            }
            send_alert(
                &alert_sender,
                String::from(THREAD_CONNECTIONS_ERR),
                String::from(THREAD_CONNECTIONS_ERR),
                AlertLevel::Error,
            );
        });

        Ok(handle)
    }

    async fn pause_contract<F>(
        contract_name: &str,
        pause_future: F,
        alert_sender: UnboundedSender<AlertParams>,
        alert_level: AlertLevel,
    ) where
        F: Future<Output = Result<(), anyhow::Error>> + Send,
    {
        send_alert(
            &alert_sender,
            format!("Pausing {} contract", contract_name),
            format!("Pausing {} contract", contract_name),
            AlertLevel::Info,
        );

        // Set a duration for the timeout
        let timeout_duration = Duration::from_secs(30);

        match timeout(timeout_duration, pause_future).await {
            Ok(Ok(_)) => {
                send_alert(
                    &alert_sender,
                    format!("Successfully paused {} contract", contract_name),
                    format!("Successfully paused {} contract", contract_name),
                    AlertLevel::Info,
                );
            }
            Ok(Err(e)) => {
                // This is the case where pause_future completed, but resulted in an error.
                send_alert(
                    &alert_sender,
                    format!("Failed to pause {} contract", contract_name),
                    e.to_string(),
                    alert_level,
                );
            }
            Err(_) => {
                // This is the timeout case
                send_alert(
                    &alert_sender,
                    format!("Timeout while pausing {} contract", contract_name),
                    format!("Timeout while pausing {} contract", contract_name),
                    alert_level,
                );
            }
        }
    }

    async fn handle_action(
        action: EthereumAction,
        alert_sender: UnboundedSender<AlertParams>,
        state_contract: Arc<dyn StateContractTrait>,
        portal_contract: Arc<dyn PortalContractTrait>,
        gateway_contract: Arc<dyn GatewayContractTrait>,
        alert_level: AlertLevel,
    ) {
        match action {
            EthereumAction::PauseState => {
                Self::pause_contract("state", state_contract.pause(), alert_sender, alert_level).await;
            }
            EthereumAction::PauseGateway => {
                Self::pause_contract("gateway", gateway_contract.pause(), alert_sender, alert_level).await;
            }
            EthereumAction::PausePortal => {
                Self::pause_contract("portal", portal_contract.pause(), alert_sender, alert_level).await;
            }
            EthereumAction::PauseAll => {
                Self::pause_contract(
                    "state",
                    state_contract.pause(),
                    alert_sender.clone(),
                    alert_level.clone(),
                )
                .await;
                Self::pause_contract(
                    "gateway",
                    gateway_contract.pause(),
                    alert_sender.clone(),
                    alert_level.clone(),
                )
                .await;
                Self::pause_contract("portal", portal_contract.pause(), alert_sender, alert_level).await;
            }
            EthereumAction::None => {}
        }
    }

    pub fn get_action_sender(&self) -> UnboundedSender<ActionParams> {
        self.action_sender.clone()
    }
}

// Utility function to send actions
pub fn send_action(
    action_sender: &UnboundedSender<ActionParams>,
    action: EthereumAction,
    alert_level: Option<AlertLevel>,
) {
    let alert_level = alert_level.unwrap_or(AlertLevel::Info);
    let params = ActionParams::new(action, alert_level);
    if let Err(e) = action_sender.send(params) {
        log::error!("Failed to send action: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use std::pin::Pin;

    use super::*;
    use tokio::sync::mpsc;

    use crate::ethereum_watcher::{
        gateway_contract::MockGatewayContractTrait, portal_contract::MockPortalContractTrait,
        state_contract::MockStateContractTrait,
    };

    // Util to help tests
    async fn assert_alert_received(
        alert_receiver: &mut UnboundedReceiver<AlertParams>,
        expected_name: &str,
        expected_description: &str,
        expected_level: AlertLevel,
    ) {

        // Create the expected alert we will compare the actual one too.
        let  expected_alert = AlertParams::new(
            String::from(expected_name), 
            String::from(expected_description),
            expected_level,
        );

        if let Some(alert) = alert_receiver.recv().await {
            println!("{:?}", alert);
            assert_eq!(alert, expected_alert);
        } else {
            panic!("Expected alert not received");
        }
    }

    #[tokio::test]
    async fn test_handle_pause_state_action() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract: MockStateContractTrait = MockStateContractTrait::new();
        let mut mock_portal_contract: MockPortalContractTrait = MockPortalContractTrait::new();
        let mut mock_gateway_contract: MockGatewayContractTrait = MockGatewayContractTrait::new();

        // Mock the behavior of the pause function
        mock_state_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));
        mock_portal_contract.expect_pause().times(0);
        mock_gateway_contract.expect_pause().times(0);

        // Create an instance of WatchtowerEthereumActions
        let actions = WatchtowerEthereumActions {
            action_sender: action_sender.clone(),
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender: alert_sender.clone(),
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        // Start the action handling thread
        let _ = actions.start_action_handling_thread().await;
    
        send_action(&action_sender, EthereumAction::PauseState, Some(AlertLevel::Info));

        assert_alert_received(
            &mut alert_receiver,
            "Pausing state contract",
            "Pausing state contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused state contract",
            "Successfully paused state contract",
            AlertLevel::Info,
        )
        .await;
    }

    #[tokio::test]
    async fn test_pause_state_contract_timeout() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract: MockStateContractTrait = MockStateContractTrait::new();
        let mut mock_portal_contract: MockPortalContractTrait = MockPortalContractTrait::new();
        let mut mock_gateway_contract: MockGatewayContractTrait = MockGatewayContractTrait::new();

        // Mock the behavior of the pause function to never complete
        mock_state_contract.expect_pause().times(1).returning(|| {
            Box::pin(async {
                // Simulate a long-running future that does not resolve within the test
                let pending_future: Pin<Box<dyn Future<Output = Result<(), anyhow::Error>> + Send>> = Box::pin(async {
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    Ok(())
                });
                pending_future.await
            })
        });
        mock_portal_contract.expect_pause().times(0);
        mock_gateway_contract.expect_pause().times(0);

        // Create an instance of WatchtowerEthereumActions
        let actions = WatchtowerEthereumActions {
            action_sender: action_sender.clone(),
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender: alert_sender.clone(),
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        // Start the action handling thread
        let _ = actions.start_action_handling_thread().await;

        // Send a PauseState action
        send_action(&action_sender, EthereumAction::PauseState, Some(AlertLevel::Error));

        assert_alert_received(
            &mut alert_receiver,
            "Pausing state contract",
            "Pausing state contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Timeout while pausing state contract",
            "Timeout while pausing state contract",
            AlertLevel::Error,
        )
        .await;
    }

    #[tokio::test]
    async fn test_pause_state_contract_with_error_response() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract = MockStateContractTrait::new();
        let mock_portal_contract: MockPortalContractTrait = MockPortalContractTrait::new();
        let mock_gateway_contract: MockGatewayContractTrait = MockGatewayContractTrait::new();

        // Mock the pause function to return an error
        // Mock the pause function to return an error
        mock_state_contract.expect_pause().times(1).returning(|| {
            Box::pin(async {
                Err(anyhow::Error::msg("Mock pause error")) // Create a new error instance here
            })
        });

        let actions = WatchtowerEthereumActions {
            action_sender,
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender,
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        let _ = actions.start_action_handling_thread().await;

        // Send a PauseState action
        send_action(
            &actions.action_sender,
            EthereumAction::PauseState,
            Some(AlertLevel::Error),
        );

        assert_alert_received(
            &mut alert_receiver,
            "Pausing state contract",
            "Pausing state contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Failed to pause state contract",
            "Mock pause error",
            AlertLevel::Error,
        )
        .await;
    }

    #[tokio::test]
    async fn test_handle_pause_gateway_action() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract: MockStateContractTrait = MockStateContractTrait::new();
        let mut mock_portal_contract: MockPortalContractTrait = MockPortalContractTrait::new();
        let mut mock_gateway_contract: MockGatewayContractTrait = MockGatewayContractTrait::new();

        // Mock the behavior of the pause function
        mock_state_contract.expect_pause().times(0);
        mock_portal_contract.expect_pause().times(0);
        mock_gateway_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));

        let actions = WatchtowerEthereumActions {
            action_sender: action_sender.clone(),
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender: alert_sender.clone(),
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        let _ = actions.start_action_handling_thread().await;

        send_action(&action_sender, EthereumAction::PauseGateway, Some(AlertLevel::Info));

        assert_alert_received(
            &mut alert_receiver,
            "Pausing gateway contract",
            "Pausing gateway contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused gateway contract",
            "Successfully paused gateway contract",
            AlertLevel::Info,
        )
        .await;
    }

    #[tokio::test]
    async fn test_handle_pause_portal_action() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract: MockStateContractTrait = MockStateContractTrait::new();
        let mut mock_portal_contract: MockPortalContractTrait = MockPortalContractTrait::new();
        let mut mock_gateway_contract: MockGatewayContractTrait = MockGatewayContractTrait::new();

        // Mock the behavior of the pause function
        mock_state_contract.expect_pause().times(0);
        mock_portal_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));
        mock_gateway_contract.expect_pause().times(0);

        let actions = WatchtowerEthereumActions {
            action_sender: action_sender.clone(),
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender: alert_sender.clone(),
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        let _ = actions.start_action_handling_thread().await;

        send_action(&action_sender, EthereumAction::PausePortal, Some(AlertLevel::Info));

        assert_alert_received(
            &mut alert_receiver,
            "Pausing portal contract",
            "Pausing portal contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused portal contract",
            "Successfully paused portal contract",
            AlertLevel::Info,
        )
        .await;
    }

    #[tokio::test]
    async fn test_handle_pause_all_action() {
        let (action_sender, action_receiver) = mpsc::unbounded_channel::<ActionParams>();
        let (alert_sender, mut alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        let mut mock_state_contract = MockStateContractTrait::new();
        let mut mock_portal_contract = MockPortalContractTrait::new();
        let mut mock_gateway_contract = MockGatewayContractTrait::new();

        // Mock the behavior of the pause function for all contracts
        mock_state_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));
        mock_portal_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));
        mock_gateway_contract
            .expect_pause()
            .times(1)
            .returning(|| Box::pin(async { Ok(()) }));

        let actions = WatchtowerEthereumActions {
            action_sender,
            action_receiver: Arc::new(Mutex::new(action_receiver)),
            alert_sender,
            state_contract: Arc::new(mock_state_contract),
            portal_contract: Arc::new(mock_portal_contract),
            gateway_contract: Arc::new(mock_gateway_contract),
        };

        let _ = actions.start_action_handling_thread().await;

        // Send a PauseAll action
        send_action(&actions.action_sender, EthereumAction::PauseAll, Some(AlertLevel::Info));

        // Verify alerts for pausing each contract
        assert_alert_received(
            &mut alert_receiver,
            "Pausing state contract",
            "Pausing state contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused state contract",
            "Successfully paused state contract",
            AlertLevel::Info,
        )
        .await;

        assert_alert_received(
            &mut alert_receiver,
            "Pausing gateway contract",
            "Pausing gateway contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused gateway contract",
            "Successfully paused gateway contract",
            AlertLevel::Info,
        )
        .await;

        assert_alert_received(
            &mut alert_receiver,
            "Pausing portal contract",
            "Pausing portal contract",
            AlertLevel::Info,
        )
        .await;
        assert_alert_received(
            &mut alert_receiver,
            "Successfully paused portal contract",
            "Successfully paused portal contract",
            AlertLevel::Info,
        )
        .await;
    }
}
