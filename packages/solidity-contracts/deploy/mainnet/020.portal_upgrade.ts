import { password } from '@inquirer/prompts';
import type { TransactionResponse } from 'ethers';
import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const RATE_LIMIT_DURATION = 3600 * 24 * 7;

// Deprecated constructor argument: does not have any effect
const ETH_DEPOSIT_CAP = MaxUint256;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { prepareUpgrade },
    deployments: { get, save },
  } = hre;

  const privateKey = await password({ message: 'Enter private key' });
  const deployer = new ethers.Wallet(privateKey, ethers.provider);

  const { address } = await get('FuelMessagePortal');

  const constructorArgs = [ETH_DEPOSIT_CAP.toString(), RATE_LIMIT_DURATION];

  const tx = (await prepareUpgrade(address, new FuelMessagePortal(deployer), {
    constructorArgs,
    getTxResponse: true,
  })) as TransactionResponse;
  const receipt = await tx.wait();

  const implementation = receipt?.contractAddress;

  if (!implementation) {
    throw new Error('No contract in receipt');
  }

  console.log('Proposed FuelMessagePortal upgrade to', implementation);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortal.abi],
    implementation,
    linkedData: { factory: 'FuelMessagePortalV3', constructorArgs },
  });

  return true;
};

func.tags = ['20_upgrade_portal'];
func.id = '20_upgrade_portal';
export default func;
