import { Wallet } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';

task('withdrawalPause', 'pauses all l2 > l1 messages')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .setAction(async (taskArgs, hre) => {
    let signer: Signer;

    if (taskArgs.env) {
      signer = new Wallet(process.env.PRIVATE_KEY!, hre.ethers.provider);
    } else {
      const signers = await hre.ethers.getSigners();
      signer = signers[0];
    }

    const contract = await hre.ethers.getContractAt(
      'FuelMessagePortalV3',
      (
        await hre.deployments.get('FuelMessagePortal')
      ).address,
      signer
    );

    const hasRole = await contract
      .PAUSER_ROLE()
      .then((role) => contract.hasRole(role, signer));

    if (!hasRole) {
      console.log(`Loaded signer ${await signer.getAddress()} unauthorized`);
    }

    const tx = await contract.pauseWithdrawals();
    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
