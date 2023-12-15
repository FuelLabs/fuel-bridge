#!/bin/bash

pnpm fuels-forc forc fmt
cargo fmt
pnpm lint:fix
pnpm prettier:format
