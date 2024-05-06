use crate::pagerduty::PagerDutyClient;
use crate::WatchtowerConfig;

use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::sync::Mutex;

#[derive(Deserialize, Clone, PartialEq, Eq, Debug, Default)]
pub enum AlertLevel {
    #[default]
    None,
    Info,
    Warn,
    Error,
}

#[derive(PartialEq, Clone, Debug)]
pub struct AlertParams {
    name: String,
    description: String,
    alert_level: AlertLevel,
}

impl AlertParams {
    pub fn new(name: String, description: String, alert_level: AlertLevel) -> Self {
        AlertParams {
            name,
            description,
            alert_level,
        }
    }
}

/// `alert_cache`: A shared (Arc) and thread-safe (Mutex) hashmap that acts as a cache for alerts.
/// 
/// The hashmap keys are `String` type, which typically represent unique identifiers or names for the alerts. These
/// would be the AlertParams.name which are unique to each alert type.
/// The values are `Instant` type, which are timestamps indicating when each alert was last processed or sent.
#[derive(Clone, Debug)]
pub struct WatchtowerAlerter {
    alert_sender: UnboundedSender<AlertParams>,
    alert_receiver: Arc<Mutex<UnboundedReceiver<AlertParams>>>,
    alert_cache: Arc<Mutex<HashMap<String, Instant>>>,
    alert_cache_expiry: Duration,
    pagerduty_client: Option<PagerDutyClient>,
    watchtower_system_name: String,
    allowed_alerting_start_time: SystemTime,
}

impl WatchtowerAlerter {
    pub fn new(config: &WatchtowerConfig, pagerduty_client: Option<PagerDutyClient>) -> Result<Self> {
        let alert_cache = Arc::new(Mutex::new(HashMap::new()));
        let alert_cache_expiry = config.alert_cache_expiry;
        let watchtower_system_name = config.watchtower_system_name.to_string();
        let allowed_alerting_start_time = SystemTime::now() + config.min_duration_from_start_to_err;

        let (alert_sender, alert_receiver) = mpsc::unbounded_channel::<AlertParams>();

        Ok(WatchtowerAlerter {
            alert_sender,
            alert_receiver: Arc::new(Mutex::new(alert_receiver)),
            alert_cache,
            alert_cache_expiry,
            pagerduty_client,
            watchtower_system_name,
            allowed_alerting_start_time,
        })
    }

    // Function to start the alert handling thread
    pub fn start_alert_handling_thread(&self) {
        let alert_receiver = Arc::clone(&self.alert_receiver);
        let cache = Arc::clone(&self.alert_cache);
        let pagerduty_client = self.pagerduty_client.clone();
        let watchtower_system_name = self.watchtower_system_name.clone();
        let alert_cache_expiry = self.alert_cache_expiry;
        let allowed_alerting_start_time = self.allowed_alerting_start_time;

        tokio::spawn(async move {
            let mut rx = alert_receiver.lock().await;
            while let Some(params) = rx.recv().await {
                WatchtowerAlerter::handle_alert(
                    params,
                    Arc::clone(&cache),
                    &pagerduty_client,
                    &watchtower_system_name,
                    alert_cache_expiry,
                    allowed_alerting_start_time,
                )
                .await;
            }
        });
    }

    // Function to handle a single alert
    async fn handle_alert(
        params: AlertParams,
        cache: Arc<Mutex<HashMap<String, Instant>>>,
        pagerduty_client: &Option<PagerDutyClient>,
        watchtower_system_name: &str,
        alert_cache_expiry: Duration,
        allowed_alerting_start_time: SystemTime,
    ) {
        let now = Instant::now();
        let mut cache = cache.lock().await;

        // Retain only non-expired alerts in cache
        cache.retain(|_, &mut expiry| now < expiry);

        // Check if the alert is in the cache and not expired
        if !cache.contains_key(&params.name) || now >= *cache.get(&params.name).unwrap() {
            cache.insert(params.name.clone(), now + alert_cache_expiry);

            let severity = match params.alert_level {
                AlertLevel::Info => "info",
                AlertLevel::Warn => "warning",
                AlertLevel::Error => "critical",
                AlertLevel::None => return,
            };

            // Send alert to PagerDuty if conditions are met and the client is set
            if SystemTime::now() >= allowed_alerting_start_time
                && (params.alert_level == AlertLevel::Warn || params.alert_level == AlertLevel::Error)
            {
                if let Some(client) = pagerduty_client {
                    if let Err(e) = client
                        .send_alert(
                            severity.to_string(),
                            format!("{}: {}", params.name, params.description),
                            watchtower_system_name.to_string(),
                        )
                        .await
                    {
                        log::error!("Failed to send alert to PagerDuty: {}", e);
                    }
                }
            }

            // Log the alert based on its level
            match params.alert_level {
                AlertLevel::Info => log::info!("{}: {}", params.name, params.description),
                AlertLevel::Warn => log::warn!("{}: {}", params.name, params.description),
                AlertLevel::Error => log::error!("{}: {}", params.name, params.description),
                AlertLevel::None => {}
            }
        }
    }

    pub fn alert_sender(&self) -> UnboundedSender<AlertParams> {
        self.alert_sender.clone()
    }

    // This method is for testing purposes to check if an alert is in the cache
    #[cfg(test)]
    pub async fn test_is_alert_in_cache(&self, name: &str) -> bool {
        let cache = self.alert_cache.lock().await;
        cache.contains_key(name)
    }
}

// Utility function to send alerts
pub fn send_alert(
    alert_sender: &UnboundedSender<AlertParams>,
    name: String,
    description: String,
    alert_level: AlertLevel,
) {
    if let Err(e) = alert_sender.send(AlertParams::new(name, description, alert_level)) {
        log::error!("Failed to send alert: {}", e);
    }
}

#[cfg(test)]
mod watchtower_alerter_tests {
    use super::*;
    use crate::pagerduty::{MockHttpPoster, PagerDutyClient};
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn test_watchtower_alerter_initialization() {
        // Create a mock configuration for WatchtowerAlerter
        let config = WatchtowerConfig {
            alert_cache_expiry: Duration::from_secs(300),
            watchtower_system_name: "TestSystem".to_string(),
            ..Default::default()
        };

        // Create a PagerDutyClient
        let mock_http_poster: MockHttpPoster = MockHttpPoster::new();
        let mock_pagerduty_client = PagerDutyClient::new("test_api_key".to_string(), Arc::new(mock_http_poster));

        // Create the WatchtowerAlerter
        let alerter = WatchtowerAlerter::new(&config, Some(mock_pagerduty_client)).unwrap();

        // Assert that the WatchtowerAlerter is initialized correctly
        assert_eq!(alerter.alert_cache.lock().await.len(), 0);
        assert_eq!(alerter.alert_cache_expiry, Duration::from_secs(300));
        assert_eq!(alerter.watchtower_system_name, "TestSystem");
    }

    #[tokio::test]
    async fn test_alert_sending_different_levels() {
        // Create a mock configuration for WatchtowerAlerter
        let config = WatchtowerConfig {
            alert_cache_expiry: Duration::from_secs(300),
            watchtower_system_name: "TestSystem".to_string(),
            min_duration_from_start_to_err: Duration::from_secs(0),
            ..Default::default()
        };

        // Create a mock HTTP poster for testing
        let mut mock_http_poster: MockHttpPoster = MockHttpPoster::new();

        // Set up expected behavior for the mock HTTP poster
        mock_http_poster
            .expect_post()
            .withf(|url, payload| {
                url == "https://events.eu.pagerduty.com/v2/enqueue"
                    && payload.routing_key == "test_api_key"
                    && (payload.payload.severity == "critical" || payload.payload.severity == "warning")
            })
            .times(2)
            .returning(|_, _| Box::pin(async { Ok(()) }));

        let mock_pagerduty_client = PagerDutyClient::new("test_api_key".to_string(), Arc::new(mock_http_poster));

        // Create the WatchtowerAlerter
        let alerter = WatchtowerAlerter::new(&config, Some(mock_pagerduty_client)).unwrap();

        // Start the WatchtowerAlerter thread
        alerter.start_alert_handling_thread();

        // Critical and warning are expected to be passed on to pagerduty
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Critical alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Error,
            ))
            .is_ok());
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Warning alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Warn,
            ))
            .is_ok());

        // Info and None are not passed on to pagerduty
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Info alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Info,
            ))
            .is_ok());
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("No alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::None,
            ))
            .is_ok());

        // Allow some time for the alerts to be processed
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Check if all the alerts are in cache
        assert!(alerter.test_is_alert_in_cache(&String::from("Critical alert")).await);
        assert!(alerter.test_is_alert_in_cache(&String::from("Warning alert")).await);
        assert!(alerter.test_is_alert_in_cache(&String::from("Info alert")).await);
        assert!(alerter.test_is_alert_in_cache(&String::from("No alert")).await);
    }

    #[tokio::test]
    async fn test_alert_caching_and_expiry() {
        let config = WatchtowerConfig {
            alert_cache_expiry: Duration::from_secs(1),
            watchtower_system_name: "TestSystem".to_string(),
            min_duration_from_start_to_err: Duration::from_secs(0),
            ..Default::default()
        };

        let mock_pagerduty_client = PagerDutyClient::new("test_api_key".to_string(), Arc::new(MockHttpPoster::new()));

        let alerter = WatchtowerAlerter::new(&config, Some(mock_pagerduty_client)).unwrap();

        // Start the WatchtowerAlerter thread
        alerter.start_alert_handling_thread();

        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Info alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Info,
            ))
            .is_ok());

        // Allow some time for the alerts to be processed
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Initially, the alert should be in cache
        assert!(alerter.test_is_alert_in_cache(&String::from("Info alert")).await);

        // Wait for longer than the expiry duration
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Send another alert so that the cache clears
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("None alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::None,
            ))
            .is_ok());

        // Allow some time for the alerts to be processed
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Now, the alert should be expired and not in cache
        assert!(!alerter.test_is_alert_in_cache(&String::from("Info alert")).await);
        assert!(alerter.test_is_alert_in_cache(&String::from("None alert")).await);
    }

    #[tokio::test]
    async fn test_no_alerts_sent_before_start_time() {
        let config = WatchtowerConfig {
            alert_cache_expiry: Duration::from_secs(1),
            watchtower_system_name: "TestSystem".to_string(),
            min_duration_from_start_to_err: Duration::from_secs(300),
            ..Default::default()
        };

        let mut mock_http_poster: MockHttpPoster = MockHttpPoster::new();
        mock_http_poster.expect_post()
            .times(0) // Expect no calls as the start time has not elapsed
            .returning(|_, _| Box::pin(async { Ok(()) }));

        let alerter = WatchtowerAlerter::new(
            &config,
            Some(PagerDutyClient::new(
                "test_api_key".to_string(),
                Arc::new(mock_http_poster),
            )),
        )
        .unwrap();

        // Start the WatchtowerAlerter thread
        alerter.start_alert_handling_thread();

        // Attempt to send an alert and since no errors are triggered `mock_http_poster` was not executed.
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Critical alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Error,
            ))
            .is_ok());
        assert!(alerter
            .alert_sender
            .send(AlertParams::new(
                String::from("Warn alert"),
                String::from("Ethereum Contract Query Failed!"),
                AlertLevel::Warn,
            ))
            .is_ok());
    }
}
