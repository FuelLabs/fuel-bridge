#!/bin/bash

pnpm fuels-forc fmt
cargo fmt
pnpm lint:fix
pnpm prettier:format
