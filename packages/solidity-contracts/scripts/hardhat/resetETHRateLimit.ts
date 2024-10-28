import { Wallet, parseEther } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';

import { enterPrivateKey } from './utils';

task('resetETHRateLimit', 'resets eth rate limit')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('rateLimitAmount', 'new rate limit amount')
  .setAction(async (taskArgs, hre) => {
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

    const value = parseEther(taskArgs.rateLimitAmount);

    const contract = await hre.ethers.getContractAt(
      'FuelMessagePortalV3',
      (
        await hre.deployments.get('FuelMessagePortal')
      ).address,
      signer
    );

    const tx = await contract.resetRateLimitAmount(value);
    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
