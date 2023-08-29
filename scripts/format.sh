#!/bin/bash

forc fmt
cargo fmt
pnpm prettier:format
