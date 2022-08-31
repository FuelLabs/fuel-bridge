#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'contract-message-test' ]; then
    cd $PROJECT
    cargo fmt --verbose --check
fi
