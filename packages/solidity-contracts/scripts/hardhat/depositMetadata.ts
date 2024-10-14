import { Wallet, hexlify, toBeHex, zeroPadValue } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';
import { enterPrivateKey } from './utils';

task('depositMetadata', 'relays metadata of a token to Fuel')
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('token', 'address of the Token')
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

    const contract = await hre.ethers.getContractAt(
      'FuelERC20GatewayV4',
      (
        await hre.deployments.get('FuelERC20GatewayV4')
      ).address,
      signer
    );

    const portal = await hre.ethers.getContractAt(
      'FuelMessagePortalV3',
      (
        await hre.deployments.get('FuelMessagePortal')
      ).address
    );

    const tx = await contract.sendMetadata(taskArgs.token);

    console.log(`Transaction sent with hash=${tx.hash}`);

    const receipt = await tx.wait();

    const [message] = await portal.queryFilter(
      portal.filters.MessageSent,
      receipt?.blockNumber!,
      receipt?.blockNumber
    );

    console.log(
      `\t> Completed at hash=${receipt!.hash} block=${receipt!.blockNumber}`
    );

    const nonce = message.args.nonce;
    const nonceHex = zeroPadValue(hexlify(toBeHex(nonce)), 32);
    console.log(`\t> Message nonce: ${nonce} (${nonceHex})`);
  });
