#!/bin/bash

forc build --release
cargo run --bin fuel-contract-message-predicate
turbo run build
