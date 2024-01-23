#!/bin/bash

pnpm forc fmt
cargo fmt
pnpm lint:fix
pnpm prettier:format
