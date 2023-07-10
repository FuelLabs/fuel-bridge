#!/bin/bash

# root path
root_folder="$1"

if [ -z "$root_folder" ]; then
    echo "Please provide the root path to the bridge-message-predicates and bridge-fungible-token repos"
    exit 1
fi

echo "Removing current folders"
rm -rf ./bridge-message-predicates
rm -rf ./bridge-fungible-token

echo "Creating symlinks"
ln -s $1/bridge-message-predicates/out bridge-message-predicates
ln -s $1/bridge-fungible-token/bridge-fungible-token/out/debug/ bridge-fungible-token

echo "Done!"