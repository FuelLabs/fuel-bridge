#!/bin/bash

pnpm fuels-forc fmt --check
cargo fmt --check
pnpm fuels-forc build
cargo clippy --all-features --all-targets -- -D warnings
pnpm prettier:check
