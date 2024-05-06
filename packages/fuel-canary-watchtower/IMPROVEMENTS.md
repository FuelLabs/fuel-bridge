# Improvements

## Alerting Retries

In `src/pagerduty.rs`:

```rust
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
```

If we fail to send an alert to PagerDuty it is not retried but it is still logged. We could have a list of alerts that is retried when PagerDuty is un-reachable. A better solution would be to have multiple alerting channels like Telegram/OpsGenie/Twillio to have more redundancy sources something like we have here : [Panic Alerting](https://github.com/SimplyStaking/panic/blob/master/docs/DESIGN_AND_FEATURES.md#alerting-channels).

## Using backoff mechanism instead of Retries

An example can be found here in `src/ethereum_watcher/ethereum_chain.rs`:

```rust
    for _ in 0..ETHEREUM_CONNECTION_RETRIES {
        if self.provider.get_chainid().await.is_ok() {
            return Ok(());
        }
    }
    Err(anyhow::anyhow!(
        "Failed to establish connection after {} retries",
        ETHEREUM_CONNECTION_RETRIES
    ))
```

Given anywhere in the code where we use `ETHEREUM_CONNECTION_RETRIES` should be updated to use backoff solutions for calling RPCs.

## Verify Block Commit

Given this code block taken from `src/fuel_watcher/fuelchain.rs`:

```rust
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
```

Possible suggestions have been proposed:

1. I 'd like to see different sources of truth being queried, both on the eth and fuel side
2. This is being used only to check that the commit exists and relates to a fuel block, but not if the commit is for example, repeated - so I think this should also check block height. I am on the fence because I am not sure what kind of attack could make use of a repeated commit, but still I would see it as an anomaly.

## Get Token Amount Withdrawn From Tx

Given this code from `src/fuel_watcher/fuel_chain.rs`:

```rust
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
```

Since the `total_amount` is an u64 type, how would this act with an attack that plays around the overflow edges (u64::max_value()). An investigation needs to be performed around this.