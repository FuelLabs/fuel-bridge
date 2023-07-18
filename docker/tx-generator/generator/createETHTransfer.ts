// This script will generate transactions between two wallets
// in a random time interval between 1 and 5 minutes. to simulate
// a real network.
import { Wallet, ethers } from 'ethers';
import { getDelay } from './utils/getDelay';

const eth_provider = new ethers.providers.JsonRpcProvider(
    process.env.ETHEREUM_RPC || 'http://localhost:8545'
);
console.log('[ETH] provider url:', eth_provider.connection.url);
const HARDHAT_WALLET_18 = new Wallet("0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0", eth_provider);
const HARDHAT_WALLET_19 = new Wallet("0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e", eth_provider);

async function createTransaction(from: Wallet, to: Wallet) {
    console.log('[ETH] Create transaction from', from.address, 'to', to.address);
    const delayToNext = getDelay();

    try {
        const resp = await from.sendTransaction({
            to: to.address,
            value: ethers.utils.parseEther('0.00001'),
        });    
        await resp.wait();
    } catch (err) {
        console.log(err)
    }

    console.log(`[ETH] Waiting ${delayToNext / 1000}s to next transaction`);
    setTimeout(() => {
        createTransaction(to, from);
    }, delayToNext);
}

// Starting sending transactions
console.log('[ETH] Starting generating transactions');
createTransaction(HARDHAT_WALLET_18, HARDHAT_WALLET_19);
