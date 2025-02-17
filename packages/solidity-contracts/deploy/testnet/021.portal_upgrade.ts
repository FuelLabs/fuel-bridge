import { MaxUint256, type TransactionResponse } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortalV3 } from '../../typechain';

const RATE_LIMIT_DURATION = 3600 * 24 * 7;
const RATE_LIMIT_AMOUNT = 0n;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, prepareUpgrade },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');
  const constructorArgs = [MaxUint256, RATE_LIMIT_DURATION];
  const tx = (await prepareUpgrade(
    fuelMessagePortal.address,
    new FuelMessagePortalV3(deployer),
    {
      constructorArgs,
      getTxResponse: true,
    }
  )) as TransactionResponse;
  const receipt = await tx.wait();

  const implementation = receipt?.contractAddress;

  if (!implementation) {
    throw new Error('No contract in receipt');
  }

  await upgradeProxy(
    fuelMessagePortal.address,
    new FuelMessagePortalV3(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs,
      call: { fn: 'reinitializeV3', args: [RATE_LIMIT_AMOUNT] },
    }
  );

  console.log('Upgraded FuelMessagePortal to', implementation);
  await save('FuelMessagePortal', {
    address: fuelMessagePortal.address,
    abi: [...FuelMessagePortalV3.abi],
    implementation,
  });

  return true;
};

func.tags = ['021_portal_upgrade'];
func.id = '021_portal_upgrade';
export default func;
