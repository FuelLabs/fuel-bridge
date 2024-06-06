import { Wallet, getBytes } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';

task('withdrawalWhitelist', 'pauses all l2 > l1 messages')
  .addParam('id', 'messageId to remove from black list')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .setAction(async (taskArgs, hre) => {
    let signer: Signer;

    if (getBytes(taskArgs.id).length != 32) {
      console.log(`--id ${taskArgs.id} is not a valid message ID`);
      return;
    }

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

    const tx = await contract.removeMessageFromBlacklist(taskArgs.id);
    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
