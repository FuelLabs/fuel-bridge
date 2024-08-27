import { Wallet, isAddress } from 'ethers';
import type { Signer, TransactionResponse } from 'ethers';
import { task } from 'hardhat/config';

import {
  enterPrivateKey,
  getDeploymentByName,
  requireConfirmation,
} from './utils';

task('grantRole', 'grants a given role to a given adress')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('contract', 'name of the contract')
  .addParam('role', 'name of the role')
  .addParam('address', 'address that will receive the role')
  .setAction(async (taskArgs, hre) => {
    if (!isAddress(taskArgs.address)) {
      console.log(`--address ${taskArgs.address} is not a valid EVM address`);
      return;
    }

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

    const contract = await getDeploymentByName(hre, taskArgs.contract, signer);

    if (!contract) {
      return;
    }

    if (!contract[taskArgs.role]) {
      console.log(
        `${taskArgs.role} does not seem to exist on ${taskArgs.name}`
      );
      return;
    }

    const role = await contract[taskArgs.role].staticCall();
    await contract['grantRole'].staticCall(role, taskArgs.address);

    console.log(`Address ${taskArgs.address}`);
    console.log(`is going to receive role ${taskArgs.role}`);
    console.log(`on ${taskArgs.contract} (${await contract.getAddress()})`);
    await requireConfirmation();

    const tx: TransactionResponse = await contract['grantRole'](
      role,
      taskArgs.address
    );
    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
