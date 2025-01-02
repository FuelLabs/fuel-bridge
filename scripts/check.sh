#!/bin/bash

cargo fmt --check
pnpm forc build --release
cargo clippy --all-features --all-targets -- -D warnings
pnpm prettier:check
pnpm lint:check

