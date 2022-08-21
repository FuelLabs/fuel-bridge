#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'contract-message-predicate' ]; then
    cd $PROJECT
    forc build --path ../contract-message-script
    forc test
fi
