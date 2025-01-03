#!/bin/bash

forc build --release
pnpm forc fmt --path packages/message-predicates --check
cargo run --bin fuel-contract-message-predicate
turbo run build