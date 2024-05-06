use std::{fmt, sync::Arc};

use async_trait::async_trait;
use reqwest::{Client, Error as ReqwestError};
use serde::Serialize;

#[cfg(test)]
use mockall::{automock, predicate::*};

// Define a trait for HTTP poster functionality
#[async_trait]
#[cfg_attr(test, automock)]
pub trait HttpPoster: Sync + Send {
    async fn post(&self, url: &str, body: &PagerDutyPayload) -> Result<(), ReqwestError>;
}

// Implement the HttpPoster trait for the reqwest Client
#[async_trait]
impl HttpPoster for Client {
    async fn post(&self, url: &str, body: &PagerDutyPayload) -> Result<(), ReqwestError> {
        self.post(url)
            .header("Content-Type", "application/json")
            .json(body)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

// Define the PagerDutyClient struct
#[derive(Clone)]
pub struct PagerDutyClient {
    api_key: String,
    http_client: Arc<dyn HttpPoster>,
}

impl fmt::Debug for PagerDutyClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PagerDutyClient")
         .field("api_key", &self.api_key)
         // You can't print `http_client` directly, but you can indicate its presence
         .field("http_client", &"Arc<dyn HttpPoster>")
         .finish()
    }
}

// Define the PagerDutyPayload struct for sending data to PagerDuty
#[derive(Serialize)]
pub struct PagerDutyPayload {
    pub payload: PagerDutyEventPayload,
    pub routing_key: String,
    pub event_action: String,
}

// Define the PagerDutyEventPayload struct with event details
#[derive(Serialize)]
pub struct PagerDutyEventPayload {
    pub summary: String,
    pub severity: String,
    pub source: String,
}

// Implement the PagerDutyClientTrait for PagerDutyClient
impl PagerDutyClient {
    pub fn new(api_key: String, http_client: Arc<dyn HttpPoster>) -> Self {
        PagerDutyClient { api_key, http_client }
    }

    pub async fn send_alert(&self, severity: String, summary: String, source: String) -> Result<(), ReqwestError> {
        // Create a payload to send to PagerDuty
        let payload = PagerDutyPayload {
            payload: PagerDutyEventPayload {
                summary,
                severity,
                source,
            },
            routing_key: self.api_key.clone(),
            event_action: "trigger".to_string(),
        };

        // Use the HTTP poster to send the payload to PagerDuty
        self.http_client
            .post("https://events.eu.pagerduty.com/v2/enqueue", &payload)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_send_alert_success() {
        // Create a mock HTTP poster for testing
        let mut mock_http_poster: MockHttpPoster = MockHttpPoster::new();

        // Set up the expected behavior for the mock
        mock_http_poster.expect_post()
            .withf(|url, payload| url == "https://events.eu.pagerduty.com/v2/enqueue"
                && payload.routing_key == "test_api_key"
                && payload.payload.severity == "critical"
                && payload.payload.summary == "Test alert")
            .times(1) // Expect the function to be called once
            .returning(|_, _| Box::pin(async { Ok(()) })); // Simulate a successful post request

        // Create a PagerDutyClient with the mock HTTP poster
        let client = PagerDutyClient::new("test_api_key".to_string(), Arc::new(mock_http_poster));

        // Call the send_alert function and assert that it succeeds
        let result = client
            .send_alert("critical".to_string(), "Test alert".to_string(), "source".to_string())
            .await;
        assert!(result.is_ok());
    }
}
