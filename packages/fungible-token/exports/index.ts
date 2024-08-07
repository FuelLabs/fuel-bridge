export { default as fungibleTokenABI } from '../bridge-fungible-token/implementation/out/release/bridge_fungible_token-abi.json';
export { default as fungibleTokenStorageSlots } from '../bridge-fungible-token/implementation/out/release/bridge_fungible_token-storage_slots.json';

export { default as bridgeProxyABI } from '../bridge-fungible-token/proxy/out/release/proxy-abi.json';
export { default as bridgeProxyStorageSlots } from '../bridge-fungible-token/proxy/out/release/proxy-storage_slots.json';

import _fungibleTokenBinary from '../bridge-fungible-token/implementation/out/release/bridge_fungible_token.bin';
import _bridgeProxyBinary from '../bridge-fungible-token/proxy/out/release/proxy.bin';

export const fungibleTokenBinary = _fungibleTokenBinary;
export const bridgeProxyBinary = _bridgeProxyBinary;

export * from './types';
