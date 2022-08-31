#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'contract-message-test' ]; then
    cd $PROJECT
    forc build --path ../contract-message-predicate
    forc build --path ../contract-message-receiver
    forc build --path ../contract-message-script

    forc test
fi
