# Fuel Canary Watchtower

A tool to monitor both the Fuel and Ethereum chains and the bridge activities occurring between the two chains.

## Project Layout
<pre>
├── <a href="./src/fuel_watcher.rs">fuel_watcher</a>: handles a thread that watches the Fuel chain
│   ├── <a href="./src/fuel_watcher/fuel_chain.rs">fuel_chain</a>: reads basic data from the Fuel chain
│   ├── <a href="./src/fuel_watcher/fuel_utils.rs">fuel_utils</a>: helper functions for fuel data
│   ├── <a href="./src/fuel_watcher/extended_provider.rs">extended_provider</a>: extended provider for full block querying using graphql
├── <a href="./src/ethereum_watcher.rs">ethereum_watcher</a>: handles a thread that watches the Ethereum chain
│   ├── <a href="./src/ethereum_watcher/ethereum_chain.rs">ethereum_chain</a>: reads basic data from the Ethereum chain
│   ├── <a href="./src/ethereum_watcher/ethereum_utils.rs">ethereum_utils</a>: helper functions for ethereum data
│   ├── <a href="./src/ethereum_watcher/state_contract.rs">state_contract</a>: handles interacting with and monitoring events from the Fuel chain state contract
│   ├── <a href="./src/ethereum_watcher/portal_contract.rs">portal_contract</a>: handles interacting with and monitoring events from the Fuel message portal contract
│   ├── <a href="./src/ethereum_watcher/gateway_contract.rs">gateway_contract</a>: handles interacting with and monitoring events from the ERC-20 gateway contract
├── <a href="./src/ethereum_actions.rs">ethereum_actions</a>: handles interactions with the Ethereum chain (pausing contracts)
├── <a href="./src/alerter.rs">alerter</a>: handles logging and pushing out info/alerts
├── <a href="./src/pagerduty.rs">pagerduty</a>: handles sending notifications to pagerduty
├── <a href="./src/config.rs">config</a>: reads configuration set in the watchtower_config.json file
</pre>

### Running

Clone the repository:

```sh
git clone https://github.com/FuelLabs/fuel-canary-watchtower
cd fuel-canary-watchtower
```

Copy the config file and remove the `.example` part, now edit the `watchtower_config.json` file with the details as needed.

If you require alerting you must set your [PagerDuty](https://www.pagerduty.com/) key as such in your terminal:

```sh
export WATCHTOWER_PAGERDUTY_KEY=KEY-HERE
```

If you require automated pausing of contracts you must set your Ethereum private key as such:

```sh
export WATCHTOWER_ETH_PRIVATE_KEY=KEY-HERE
```

Build the project and run it:
```sh
cargo build
cargo run
```

### Config File

An example config file can be found at [watchtower_config.json.example](./watchtower_config.json.example). You can configure alerts by alert level and by action here is an example portal deposit alert:
```json
"portal_deposit_alerts": [
    {
    "alert_action": "PausePortal",
    "alert_level": "Info",
    "time_frame": 300,
    "token_name": "ETH",
    "token_address": "0x0000000000000000000000000000000000000000",
    "token_decimals": 18,
    "amount": 250
  }
]
```

In the above configuration, ETH has exceeded the threshold of `250ETH` being deposited over a period of 300 seconds, an alert of type INFO is sent, and the Portal contract will be paused.

### ABI

The abi is generated from compiling the [fuel-bridge contracts](https://github.com/FuelLabs/fuel-bridge)

### Alerts Module
The alerts module is responsible for pushing alerts through to some monitoring service as well as logging data to a log file. Logging is configured in [logging_config.yaml](./logging_config.yaml).

### Might Want to Add
- We currently only check that committed blocks match what's in the fuel chain. This does not protect us from a bug in the client that might screw up MessageOut receipts and allow for more ETH or tokens to be withdrawn than should be. We might want a setup that keeps a running log of all asset balances that have been approved for withdrawal and then trigger a pause if more are somehow withdrawn than expected. This would require some kind of persistent data store to work efficiently (like the current "alert" concept but with a timing window that spans from the start of the chain to now).


