#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'contract-message-test' ]; then
    cd $PROJECT
    forc build --path ../contract-message-predicate
    forc build --path ../contract-message-script
    forc build --path ../contract-message-test

    cargo test
fi
