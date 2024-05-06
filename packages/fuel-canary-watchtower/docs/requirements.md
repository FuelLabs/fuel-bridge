# Bridge Canary Design Requirements

# Bridge contract circuit breaker

Allows the bridge to be stopped by 1-of-n set of keys. This allows for quickly pausing withdrawals if suspicious activity is detected.

# Circuit breaker canary node

A passively syncing canary node that can automatically trigger the bridging circuit breaker if suspicious activity is detected. The canary nodes should monitor withdrawal requests submitted to Ethereum and verify signed block data against the local synced state. If any withdrawal request on Ethereum doesn’t correspond to a valid, locally-synced block, then it should trip the circuit breaker.

The canary node should be run in an environment that is isolated from the main POA block producer. This ensures that if a malicious actor obtains access to our secured POA environment, they will not be able to use that same level of access to disable or inhibit the canary. For example, each security group participant could run their own local canary instance which is not connected to the shared company infrastructure (AWS account).

## Primary Risks Mitigated by the Canary

By comparing withdrawal requests on Ethereum with locally synced state, the canary will be able to automatically detect and mitigate the following attack vectors:

- A compromised PoA signing key used to sign a fake block header containing fraudulent output messages. As the block would not exist in the locally synced state, the canary would be able to immediately pause the bridge and halt the finalization of this header.
- A compromised PoA node deployment with malicious withdrawal code. Since a canary can’t validate blocks that don’t follow the consensus rules, a fraudulent withdrawal request would never be allowed into the local state of a canary node. This would allow the canary to automatically trigger the circuit breaker in the case of a fraudulent chain state, by checking if each header posted to L1 corresponds to a valid locally synced block.

In order to avoid false-positives, the canary should sufficiently delay withdrawal validation (5-10 mins) to tolerate variable network conditions affecting block propagation timings. Header finalization on Ethereum is delayed (~3hrs) to allow enough time for the circuit breaker to be tripped.

# Components

## Fuel Core (Sync-mode)

A live instance of fuel core is required to sync and validate blocks from the network.

## Watchtower

A separate application that runs alongside the canary fuel-core node. The watchtower will integrate with both Ethereum and Fuel core, and determine when to trip the circuit breaker.

- Monitor withdrawal requests on Ethereum and validate them against the canary instance of fuel-core
- Manage a live ethereum mainnet key funded with enough Ethereum to call the smart contract(s) responsible for tripping the breaker.

## Alerting App

“*[Quis custodiet ipsos custodes?](https://en.wikipedia.org/wiki/Quis_custodiet_ipsos_custodes%3F)”*

The alerting app will be a separate process that monitors the operational behavior of the canary and alerts the operator if there are any problems.

The canary operator needs to be notified when:

- Anytime a fraudulent withdrawal is detected
- The Ethereum wallet doesn’t have sufficient funding to trip the breaker
- Tripping the circuit breaker fails for any reason (including a timeout of the request to trip the breaker)
- The fuel-core node is out of sync or offline
- The watchtower is unable to connect to fuel-core or offline

The operator could be notified via [twilio](https://www.twilio.com/messaging/sms) or some other API based alerting solution (pagerduty, opsgenie, etc). This would allow for operators to receive notifications via SMS, email, automated phone calls, etc. Each canary operator should own their own accounts and API keys for triggering these alerts, so that they are still active and functional even if the primary company accounts are compromised.