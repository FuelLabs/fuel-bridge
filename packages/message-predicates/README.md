# Fuel Bridge Message Predicates

Most messages sent from the base chain to Fuel will use a predicate as the message recipient. These predicates allow anyone to spend the `InputMessage` but verifies that a specific script is used in the transaction to ensure security and reliability that the message is handled appropriately.

## Message to Contract Predicate

The Message to Contract Predicate is for messages that are trying to send a data payload to a designated Fuel contract. This predicate verifies that the script bytecode hash for the transaction matches for the designated [Message to Contract Script](#message-to-contract-script) and that there are no other `InputMessages` with data in the transaction other than the first input. If these conditions are met, then the predicate evaluates as true.

### Message to Contract Script

The message to contract predicate relies on a script that performs only the following operation:

- Call the function `process_message` on the contract with ID that matches the first 32 bytes in the message data field, while forwarding the exact amount of base asset specified in the `InputMessage` `amount` field

## Building From Source

### Building

Build:

```sh
pnpm fuels-forc build
cargo run
```

Run tests:

```sh
cargo test
```

## Contributing

Code must be formatted.

```sh
pnpm fuels-forc fmt
cargo fmt
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](../../LICENSE).
