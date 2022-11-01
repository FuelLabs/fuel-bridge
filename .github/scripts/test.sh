#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'bridge-fungible-token' ]; then
    cd $PROJECT
    forc build --path ../bridge-message-predicates/contract-message-receiver
    forc build --path ../bridge-fungible-token-abi
    forc build --path ../bridge-fungible-token

    cargo test
fi
