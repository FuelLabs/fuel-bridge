import {
  impersonateAccount as hardhatImpersonate,
  setBalance,
} from '@nomicfoundation/hardhat-network-helpers';
import { parseEther, type AddressLike } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function impersonateAccount(
  addressable: AddressLike,
  hre: HardhatRuntimeEnvironment
) {
  if (typeof addressable !== 'string')
    addressable =
      'then' in addressable
        ? await addressable
        : await addressable.getAddress();

  await hardhatImpersonate(addressable);
  const balance = await hre.ethers.provider.getBalance(addressable);
  const newBalance = balance + parseEther('0.1'); // Add a little amount to transact;
  await setBalance(addressable, newBalance);

  return await hre.ethers.getSigner(addressable);
}
