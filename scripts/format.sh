#!/bin/bash

forc fmt
cargo fmt
pnpm lint:fix
pnpm prettier:format
