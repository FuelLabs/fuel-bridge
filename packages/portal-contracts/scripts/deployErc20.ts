import { ethers } from 'hardhat';

import { Token } from '../typechain/Token.d';
import { Signer } from 'ethers';

export async function deployERC20(deployer?: Signer) {
  // Deploy erc20 token
  const tokenFactory = await ethers.getContractFactory('Token', deployer);
  const erc20: Token = (await tokenFactory.deploy()) as Token;
  await erc20.deployed();

  // Mint some dummy token for signers
  const signers = (await ethers.getSigners()).slice(1);
  const initialTokenAmount = ethers.utils.parseEther('1000000');
  for (let i = 0; i < signers.length; i += 1) {
    await erc20.mint(await signers[i].getAddress(), initialTokenAmount);
  }

  return erc20;
}