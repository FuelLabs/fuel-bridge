#!/usr/bin/env bash

PROJECT=$1

if [ $PROJECT = 'POC/script' ]; then
    cd $PROJECT
    forc test
fi
