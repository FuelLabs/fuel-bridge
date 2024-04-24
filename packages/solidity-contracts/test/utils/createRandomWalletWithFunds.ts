import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { Wallet, parseEther } from 'ethers';
import hre from 'hardhat';

export async function createRandomWalletWithFunds(funds = parseEther('10')) {
  const wallet = Wallet.createRandom(hre.ethers.provider);

  await setBalance(wallet.address, funds);

  return wallet;
}
