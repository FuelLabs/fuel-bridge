import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type { TokenFaucet } from '../typechain';

async function main() {
  let deployer: Signer | undefined = undefined;

  if (process.env.DEPLOYER_KEY) {
    console.log('Deployer key found!');
    deployer = new ethers.Wallet(process.env.DEPLOYER_KEY, ethers.provider);
  } else {
    throw new Error(
      'DEPLOYER_KEY is required to deploy the ERC20 faucet contract'
    );
  }

  // Check that the node is up
  try {
    await ethers.provider.getBlockNumber();
    console.log('done');
  } catch (e) {
    throw new Error(
      `Failed to connect to RPC "${ethers.provider.connection.url}". Make sure your environment variables and configuration are correct.`
    );
  }

  const tokenFactory = await ethers.getContractFactory('TokenFaucet', deployer);
  const token: TokenFaucet = (await tokenFactory.deploy()) as TokenFaucet;
  await token.deployed();
  console.log('Token deployed to: ', token.address.toString());
  const address = await deployer.getAddress();
  const resp = await token.mint(address, 0);
  await resp.wait();
  const balance = await token.balanceOf(address);
  console.log('Current balance: ', balance);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
