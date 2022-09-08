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

1. User starts a deposit by calling `sendETH()` on `FuelMessagePortal` which accepts an amount of ETH that gets custodied while bridged
1. The Fuel client sees an outgoing message event emitted on the `FuelMessagePortal` and adds a corresponding `InputMessage` to the UTXO set with the designated recipient
1. The recipient can now spend the amount value in the input message like any other input

![ETH Deposit Diagram](/docs/imgs/FuelMessagingETHDeposit.png)

### ETH Bridge Withdrawal

1. User starts a withdrawal by creating a transaction that outputs an `OutputMessage` with a specific amount of ETH
1. All `OutputMessages` are committed to L1 via a merkle tree of all `OutputMessage` `messageId`s by a designated committer (either a multisig or future consensus contract)
1. After a finalization period, the user calls to the `FuelMessagePortal` with a merkle proof of the previously sent message which then sends the ETH to the message recipient

![ETH Withdrawal Diagram](/docs/imgs/FuelMessagingETHWithdraw.png)

## ERC-20 Bridge

The ERC-20 bridge facilitates the transfer of ERC-20 tokens from Ethereum to be represented as tokens on Fuel.

### ERC-20 Bridge Deposit

1. User starts a deposit by calling the `deposit()` function on the `L1ERC20Gateway` (after they have approved token transfer to `L1ERC20Gateway`)
1. The `L1ERC20Gateway` transfers tokens to itself to custody while they are bridged
1. The `L1ERC20Gateway` creates a message in the `FuelMessagePortal` to be relayed on Fuel with the `MessageToFungibleTokenPredicate` as the recipient so that anyone can spend the `InputMessage` on a user's behalf but with guarantees that the transaction is built as it’s supposed to
1. The Fuel client sees an outgoing message event emitted on the `FuelMessagePortal` and adds a corresponding `InputMessage` to the UTXO set with the designated recipient predicate
1. A transaction is built and submitted by either the user or a relayer service that meets the requirements of the `MessageToFungibleTokenPredicate` recipient
1. A single call is made from the transaction script to the intended target Fuel token contract specified in the messages data field. This function verifies the sender and predicate recipient of the `InputMessage`, parses the data from the `InputMessage` data field and mints the appropriate amount of tokens

![ERC20 Deposit Diagram](/docs/imgs/FuelMessagingERC20Deposit.png)

### ERC-20 Bridge Withdrawal

1. User starts a withdrawal by calling the `FuelMyToken` contract sending some coins to withdraw along with it
1. The `FuelMyToken` contract looks to see what coins it was sent, burns them and then creates an `OutputMessage` via the `SMO` opcode
1. All `OutputMessages` are committed to L1 via a merkle tree of all `OutputMessage` `messageId`s by a designated committer (either a multisig or future consensus contract)
1. After a finalization period, the user calls to the `FuelMessagePortal` with a merkle proof of the previously sent message which then calls to the `L1ERC20Gateway` with the abi specified in the message data
1. The `L1ERC20Gateway` verifies it’s being called by the `FuelMessagePortal` and releases the specified amount of tokens to the specified address

![ERC20 Withdrawal Diagram](/docs/imgs/FuelMessagingERC20Withdraw.png)
