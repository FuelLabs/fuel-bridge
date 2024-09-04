import { Wallet, parseEther, parseUnits } from 'ethers';
import type { Signer } from 'ethers';
import { isB256, isBech32, toB256 } from 'fuels';
import { task } from 'hardhat/config';
import { enterPrivateKey } from './utils';

task('depositToken', 'deposits a token to Fuel')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('token', 'address of the Token')
  .addParam('amount', 'amount of token to send (e.g. 1.0123456...')
  .addParam('recipient', 'fuel address that will receive the deposit')
  .setAction(async (taskArgs, hre) => {
    let recipient: string;

    if (isB256(taskArgs.recipient)) {
      recipient = taskArgs.recipient;
    } else if (isBech32(taskArgs.recipient)) {
      recipient = toB256(taskArgs.recipient);
    } else {
      console.log(
        `--recipient ${taskArgs.recipient} is not a valid FuelVM address`
      );
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

    const value = parseUnits(taskArgs.amount, decimals);

    const contract = await hre.ethers.getContractAt(
      'FuelERC20GatewayV4',
      (
        await hre.deployments.get('FuelERC20GatewayV4')
      ).address,
      signer
    );

    await token.approve(contract, value).then((tx) => tx.wait());

    const tx = await contract.deposit(recipient, taskArgs.token, value);

    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );
  });
