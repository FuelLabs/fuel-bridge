import {
  impersonateAccount as hardhatImpersonate,
  setBalance,
} from '@nomicfoundation/hardhat-network-helpers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function impersonateAccount(
  addressable: string | { address: string },
  hre: HardhatRuntimeEnvironment
) {
  if (typeof addressable !== 'string') addressable = addressable.address;

  await hardhatImpersonate(addressable);
  const balance = await hre.ethers.provider.getBalance(addressable);
  const newBalance = balance.add(hre.ethers.utils.parseEther('0.1')); // Add a little amount to transact;
  await setBalance(addressable, newBalance);

  return await hre.ethers.getSigner(addressable);
}
