#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'bridge-fungible-token' ]; then
    cd $PROJECT
    cargo fmt --verbose --check
fi
