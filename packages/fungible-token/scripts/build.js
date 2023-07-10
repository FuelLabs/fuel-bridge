const { hexlify } = require('fuels');
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');
// Set paths
const BRIDGE_FUNGIBLE_PATH = join(__dirname, '../bridge-fungible-token/out/debug/bridge_fungible_token.bin');
const BRIDGE_FUNGIBLE_ABI_PATH = join(__dirname, '../bridge-fungible-token/out/debug/bridge_fungible_token-abi.json');
const BRIDGE_FUNGIBLE_STORAGE_PATH = join(__dirname, '../bridge-fungible-token/out/debug/bridge_fungible_token-storage_slots.json');
const DIST_FOLDER = join(__dirname, '../dist');
const DIST_FILE = join(DIST_FOLDER, '/index.ts');
// Read files
const bridgeFungibleBytes = readFileSync(BRIDGE_FUNGIBLE_PATH);
const bridgeFungibleAbiBytes = readFileSync(BRIDGE_FUNGIBLE_ABI_PATH);
const bridgeFungibleStoageBytes = readFileSync(BRIDGE_FUNGIBLE_STORAGE_PATH);
// Write file
mkdirSync(DIST_FOLDER, { recursive: true });
writeFileSync(DIST_FILE, [
    `export const fungibleTokenBinary = "${hexlify(bridgeFungibleBytes)}";`,
    `export const fungibleTokenABI = ${bridgeFungibleAbiBytes.toString()};`,
    `export const fungibleTokenStorageSlots = ${bridgeFungibleStoageBytes.toString()};`,
].join('\n'));
