import { config as dotEnvConfig } from 'dotenv';
import { providers, Wallet as ETHWallet } from 'ethers';
import { Provider, Wallet } from 'fuels';

import { FuelChainState__factory, FuelMessagePortal__factory } from '../../solidity-contracts/typechain';

import { BridgeFungibleTokenAbi__factory } from './types'
import { bridgeFungibleToken } from './types/contract-ids.json'
import { getData } from './utils/data';

dotEnvConfig();

const {
    FUEL_PROVIDER_URL,
    FUEL_PRIVATE_KEY,
    ETH_PRIVATE_KEY,
    ETH_PROVIDER_URL,
    FUEL_CHAIN_ADDRESS,
    FUEL_MESSAGE_PORTAL_ADDRESS
} = process.env;

export const getConfigs = async () => {
    const data = getData();
    const provider = await Provider.create(FUEL_PROVIDER_URL);
    const ethProvider =  new providers.JsonRpcProvider(ETH_PROVIDER_URL);
    const wallet = Wallet.fromPrivateKey(FUEL_PRIVATE_KEY, provider);
    const tknContract = BridgeFungibleTokenAbi__factory.connect(bridgeFungibleToken, wallet);
    const ethWallet = new ETHWallet(ETH_PRIVATE_KEY, ethProvider);
    const ethFuelChainState = FuelChainState__factory.connect(FUEL_CHAIN_ADDRESS, ethProvider);
    const ethFuelMessagePortal = FuelMessagePortal__factory.connect(FUEL_MESSAGE_PORTAL_ADDRESS, ethWallet);
    return {
        ethFuelChainState,
        ethFuelMessagePortal,
        ethProvider,
        provider,
        wallet,
        tknContract,
        data,
    }
}
