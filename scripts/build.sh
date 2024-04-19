#!/bin/bash

forc build --release
# forc build --release --experimental-new-encoding
cargo run
turbo run build
