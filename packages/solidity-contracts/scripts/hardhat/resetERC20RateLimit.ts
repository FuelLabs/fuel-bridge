import { Wallet, parseUnits } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';
import { enterPrivateKey } from './utils';

task('resetERC20RateLimit', 'sets/resets erc20 token rate limit')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('token', 'address of the Token')
  .addParam('rateLimitAmount', 'rate limit amount for the Token')
  .addParam('rateLimitDuration', 'rate limit duration for the Token')
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

    const token = await hre.ethers.getContractAt(
      'Token',
      taskArgs.token,
      signer
    );

    let decimals: bigint;

    try {
      decimals = await token.decimals();
    } catch (e) {
      decimals = 18n;
    }

    const value = parseUnits(taskArgs.rateLimitAmount, decimals);

    const contract = await hre.ethers.getContractAt(
      'FuelERC20GatewayV4',
      (
        await hre.deployments.get('FuelERC20Gateway')
      ).address,
      signer
    );

    const tx = await contract.resetRateLimitAmount(
      taskArgs.token,
      value,
      taskArgs.rateLimitDuration
    );

    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
