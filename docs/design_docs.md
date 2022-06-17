# Design Documentation

- [ETH Bridge](#eth-bridge)
  - [ETH Bridge Deposit](#eth-bridge-deposit)
  - [ETH Bridge Withdrawal](#eth-bridge-withdrawal)
- [ERC-20 Bridge](#ERC-20-bridge)
  - [ERC-20 Bridge Deposit](#ERC-20-bridge-deposit)
  - [ERC-20 Bridge Withdrawal](#ERC-20-bridge-withdrawal)
- [Retryable Messages](#Retryable-Messages)

This document defines the high level bridge implementation.

## ETH Bridge

The ETH bridge facilitates the transfer of ETH from Ethereum to be represented as the native token on Fuel.

### ETH Bridge Deposit

1. User starts a deposit by calling `sendETH` on `FuelMessageOutbox` which accepts a value that gets custodied by `FuelMessageInbox` while bridged
1. The `FuelMessageOutbox` creates a message to be relayed later on Fuel by only the designated recipient
1. User can now spend the amount value in the input message like any other input

![ETH Deposit Diagram](/docs/imgs/FuelMessagingETHDeposit.png)

### ETH Bridge Withdrawal

1. User starts a withdrawal by creating a transaction that outputs a message output with a specific amount of ETH
1. `MessageOutput` is noted on L1 by including the messagId in a merkle root in the state header committed to L1
1. After any necessary finalization period, the user calls to the `FuelMessageInbox` with a merkle proof of the previous sent message
1. The `FuelMessageInbox` verifies the given merkle proof and send the ETH to the designated message recipient

![ETH Withdrawal Diagram](/docs/imgs/FuelMessagingETHWithdraw.png)

## ERC-20 Bridge

The ERC-20 bridge facilitates the transfer of ERC-20 tokens from Ethereum to be represented as tokens on Fuel.

### ERC-20 Bridge Deposit

1. User starts a deposit by calling deposit (has already approved token transfer to `L1ERC20Gateway`)
1. `L1ERC20Gateway` transfers tokens to itself to custody while bridged
1. `L1ERC20Gateway` creates a message in the `FuelMessageOutbox` to be relayed on Fuel with the `MessageToFungibleTokenPredicate` so that anyone can spend the `MessageInput` on a user's behalf but with guarantees that the transaction is built as it’s supposed to
1. Client sees the message on L1 via event logs
1. A transaction is built and submitted by either the user or some relayer that meets the requirements of the `MessageToFungibleTokenPredicate`
1. A single call is made from the transaction script to the intended recipient Fuel token contract. This function verifies the sender and predicate owner of the `InputMessage`, parses the data from the `InputMessage` data field and mints the appropriate amount of tokens

![ERC20 Deposit Diagram](/docs/imgs/FuelMessagingERC20Deposit.png)

### ERC-20 Bridge Withdrawal

1. User starts a withdrawal by calling the `FuelMyToken` contract sending some coins to withdraw along with it
1. `FuelMyToken` contract looks to see what coins it was sent, burns them and then creates a `MessageOutput` via opcode
1. `MessageOutput` is noted on L1 by including the messagId in a merkle root in the state header committed to L1
1. After any necessary finalization period, the user calls to the `FuelMessageInbox` with a merkle proof of the previous sent message
1. The `FuelMessageInbox` verifies the given merkle proof and makes the message call to the `L1ERC20Gatewa`y specified in the message
1. The `L1ERC20Gateway` verifies it’s being called by the `FuelMessageInbox` and releases the specified amount of tokens to the specified address

![ERC20 Withdrawal Diagram](/docs/imgs/FuelMessagingERC20Withdraw.png)

## Retryable Messages

In order to prevent messages getting lost during generic messaging from L1 to Fuel, developers should follow the following standard practice utilizing common libraries.

1. Either a contract or EOA calls `sendMessage` on the `FuelMessageOutbox` that creates a message to be relayed on Fuel with the `MessageToContractPredicate` so that anyone can spend the `MessageInput` on a user's behalf but with guarantees that the transaction is built as it’s supposed to
1. Client sees the message on L1 via event logs
1. A transaction is built and submitted by either the user or some relayer that meets the requirements of the `MessageToContractPredicate`
1. The transaction script sends any amount on the message to the recipient contract and calls `processMessage` on the recipient Fuel token contract
1. This contract extends the standard `MessageRetryable` code which checks if the transaction includes the appropriate variable outputs otherwise the `messageId` gets placed in storage to be retried in a later transaction

![Retryable Messages Diagram](/docs/imgs/FuelMessagingRetryableMessages.png)
