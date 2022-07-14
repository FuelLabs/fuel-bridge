#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'POC/script' ]; then
    cd $PROJECT
    cargo fmt --verbose --check
fi
