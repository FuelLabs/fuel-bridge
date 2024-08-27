import { Wallet, parseEther } from 'ethers';
import type { Signer } from 'ethers';
import { isB256, isBech32, toB256 } from 'fuels';
import { task } from 'hardhat/config';

task('depositETH', 'deposits ETH to Fuel')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addParam('amount', 'amount of ETH to send (e.g. 1.0123456...')
  .addParam('recipient', 'fuel address that will receive the deposit')
  .setAction(async (taskArgs, hre) => {
    let recipient: string;

    if (isB256(taskArgs.recipient)) {
      recipient = taskArgs.recipient;
    } else if (isBech32(taskArgs.recipient)) {
      recipient = toB256(taskArgs.recipient);
    } else {
      console.log(
        `--address ${taskArgs.address} is not a valid FuelVM address`
      );
      return;
    }

    const value = parseEther(taskArgs.amount);

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

    const tx = await contract.depositETH(recipient, { value });

    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
