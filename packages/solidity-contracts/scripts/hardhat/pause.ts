import { Wallet } from 'ethers';
import type { Signer, TransactionResponse } from 'ethers';
import { task } from 'hardhat/config';

import { enterPrivateKey, getDeploymentByName } from './utils';

task('pause', 'pauses a contract that implements the Pausable interface')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('contract', 'Contract name')
  .setAction(async (taskArgs, hre) => {
    const { contract: contractName } = taskArgs;

    let signer: Signer;

    if (taskArgs.i) {
      const privateKey = await enterPrivateKey();
      signer = new Wallet(privateKey, hre.ethers.provider);
    } else if (taskArgs.env) {
      signer = new Wallet(process.env.PRIVATE_KEY!, hre.ethers.provider);
    } else {
      const signers = await hre.ethers.getSigners();
      signer = signers[0];
    }

    const contract = await getDeploymentByName(hre, contractName, signer);
    if (!contract) return;

    const role = await contract.PAUSER_ROLE();
    const hasRole = await contract.hasRole(role, signer);
    if (!hasRole) {
      throw new Error(
        `Signer ${await signer.getAddress()} does not have pauser role`
      );
    }

    console.log('Sending transaction...');
    const tx: TransactionResponse = await contract.pause();
    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
