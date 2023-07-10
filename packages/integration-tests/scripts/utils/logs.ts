import { formatEther } from 'ethers/lib/utils';
import { ethers_formatToken, fuels_formatEther, fuels_formatToken } from './parsers';
import { Signer } from 'ethers';
import { WalletUnlocked } from 'fuels';
import { Token } from '../../fuel-v2-contracts/Token';

export const LOG_CONFIG = {
  debug: process.env.DEBUG || true,
};

export async function logETHBalances(ethereumAccount: Signer, fuelAccount: WalletUnlocked) {
  const etherAccountAddress = await ethereumAccount.getAddress();
  const fuelAccountAddress = await fuelAccount.address.toHexString();
  console.log('Account balances:');
  console.log(`  Ethereum - ${formatEther(await ethereumAccount.getBalance())} ETH (${etherAccountAddress})`);
  console.log(`  Fuel - ${fuels_formatEther(await fuelAccount.getBalance())} ETH (${fuelAccountAddress})`);
  console.log('');
}

export async function logTokenBalances(
  ethereumContract: Token,
  ethereumAccount: Signer,
  fuelAccount: WalletUnlocked,
  fuelTestTokenId: string
) {
  const etherAccountAddress = await ethereumAccount.getAddress();
  const fuelAccountAddress = await fuelAccount.address.toHexString();
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${ethers_formatToken(
      await ethereumContract.balanceOf(etherAccountAddress)
    )} Tokens (${etherAccountAddress})`
  );
  console.log(
    `  Fuel - ${fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId))} Tokens (${fuelAccountAddress})`
  );
  console.log('');
}

export function debug(...args: any) {
  if (LOG_CONFIG.debug) {
    console.log(...args);
  }
}
