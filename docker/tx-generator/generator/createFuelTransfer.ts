// This script will generate transactions between two wallets
// in a random time interval between 1 and 5 minutes. to simulate
// a real network.
import { Provider, Wallet, WalletUnlocked, bn } from 'fuels';
import { getDelay } from './utils/getDelay';

const fuelProvider = new Provider(
    process.env.FUEL_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql'
);
console.log('[FUEL] provider url:', fuelProvider.url);
const FUEL_WALLET_8 = Wallet.fromPrivateKey("0xb114389b060050b649a0d04acc1ad67b91eee214896625703ae96cb4b46f8882", fuelProvider);
const FUEL_WALLET_9 = Wallet.fromPrivateKey("0x7c60d419668302d397a35d64b3302efe8979a746c1f825a6a91482b681fbb600", fuelProvider);

async function createTransaction(from: WalletUnlocked, to: WalletUnlocked) {
    console.log('[FUEL] Create transaction from', from.address.toB256(), 'to', to.address.toB256());
    const delayToNext = getDelay();

    try {
        const resp = await from.transfer(to.address, bn.parseUnits('0.00001'));
        await resp.wait();
    } catch (err) {
        console.log(err)
    }

    console.log(`[FUEL] Waiting ${delayToNext / 1000}s to next transaction`);
    setTimeout(() => {
        createTransaction(to, from);
    }, delayToNext);
}

// Starting sending transactions
console.log('[FUEL] Starting generating transactions');
createTransaction(FUEL_WALLET_8, FUEL_WALLET_9);
