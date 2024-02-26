import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import type { Signer } from 'ethers';
import { formatEther } from 'ethers';
import type { WalletUnlocked } from 'fuels';

import {
  ethers_formatToken,
  fuels_formatEther,
  fuels_formatToken,
} from './parsers';

export async function logETHBalances(
  ethereumAccount: Signer,
  fuelAccount: WalletUnlocked
) {
  const ethersProvider = ethereumAccount.provider;
  const etherAccountAddress = await ethereumAccount.getAddress();
  const fuelAccountAddress = await fuelAccount.address.toHexString();
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${formatEther(
      await ethersProvider.getBalance(ethereumAccount)
    )} ETH (${etherAccountAddress})`
  );
  console.log(
    `  Fuel - ${fuels_formatEther(
      await fuelAccount.getBalance()
    )} ETH (${fuelAccountAddress})`
  );
  console.log('');
}

export async function logTokenBalances(
  ethereumContract: Token,
  ethereumAccount: Signer,
  fuelAccount: WalletUnlocked,
  fuelTestTokenId: string
) {
  const etherAccountAddress = await ethereumAccount.getAddress();
  const fuelAccountAddress = fuelAccount.address.toHexString();
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${ethers_formatToken(
      await ethereumContract.balanceOf(etherAccountAddress)
    )} Tokens (${etherAccountAddress})`
  );
  console.log(
    `  Fuel - ${fuels_formatToken(
      await fuelAccount.getBalance(fuelTestTokenId)
    )} Tokens (${fuelAccountAddress})`
  );
  console.log('');
}

export function debug(...args: any) {
  if (process.env.DEBUG) {
    console.log(...args);
  }
}
