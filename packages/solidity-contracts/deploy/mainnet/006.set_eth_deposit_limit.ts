import { parseEther } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

// Rate limit: 10 ETH / week
const RATE_LIMIT_DURATION = 3600 * 24 * 7;

// Global deposit cap: 100 ETH
const ETH_DEPOSIT_CAP = parseEther('100');

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address } = await get('FuelMessagePortal');

  const constructorArgs = [ETH_DEPOSIT_CAP.toString(), RATE_LIMIT_DURATION];

  await upgradeProxy(address, new FuelMessagePortal(deployer), {
    constructorArgs,
  });

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelMessagePortal to implementation', implementation);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortal.abi],
    implementation,
    linkedData: { factory: 'FuelMessagePortalV3', constructorArgs },
  });

  return true;
};

func.tags = ['set_deposit_limit_eth'];
func.id = 'set_deposit_limit_eth';
export default func;
