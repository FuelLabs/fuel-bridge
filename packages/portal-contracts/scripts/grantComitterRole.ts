import { Signer, ethers } from "ethers";
import { isAddress } from "ethers/lib/utils";
import {FuelChainState__factory} from '../typechain';
import { StaticJsonRpcProvider } from "@ethersproject/providers";

const main = async () => {
    const {DEPLOYER_KEY, FUEL_CHAIN_STATE_ADDRESS, COMITTER_ADDRESS, RPC_URL} = process.env;

    if(!DEPLOYER_KEY) {
        throw new Error('No DEPLOYER_KER env var');
    }
    
    if(!RPC_URL) {
        throw new Error("No RPC_URL env var");
    }

    if(!FUEL_CHAIN_STATE_ADDRESS || !isAddress(FUEL_CHAIN_STATE_ADDRESS)) {
        throw new Error(`Invalid env var FUEL_CHAIN_STATE_ADDRESS ${FUEL_CHAIN_STATE_ADDRESS}`);
    } 

    if(!COMITTER_ADDRESS || !isAddress(COMITTER_ADDRESS)) {
        throw new Error(`Invalid env var COMITTER_ADDRESS ${FUEL_CHAIN_STATE_ADDRESS}`);
    }


    const provider = new StaticJsonRpcProvider(RPC_URL);

    const admin = new ethers.Wallet(DEPLOYER_KEY, provider);

    const target = FuelChainState__factory.connect(FUEL_CHAIN_STATE_ADDRESS, admin);
    
    const role = await target.callStatic.COMMITTER_ROLE();

    await target.grantRole(role, COMITTER_ADDRESS).then(tx => {
        console.log("\t> Transaction sent with hash", tx.hash, "... waiting confirmation");
        return tx.wait();
    });
}

main().then(() => console.log("\t> Succeeded")).catch((err) => {
    console.error(err);
    process.exit(1);
})
