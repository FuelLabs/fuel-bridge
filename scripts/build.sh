#!/bin/bash

pnpm fuels-forc build
cargo run
turbo run build
