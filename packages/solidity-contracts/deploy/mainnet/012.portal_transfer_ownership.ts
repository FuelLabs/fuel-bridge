import { ZeroHash as DEFAULT_ADMIN_ROLE } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';
import { FuelMessagePortalV3__factory } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: portalAddress } = await deployments.get('FuelMessagePortal');
  const portal = FuelMessagePortalV3__factory.connect(
    portalAddress,
    ethers.provider
  );

  const PAUSER_ROLE = await portal.PAUSER_ROLE();
  const RATE_LIMITER_ROLE = await portal.SET_RATE_LIMITER_ROLE();

  // Give admin role to multisig
  await deployments.execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'grantRole',
    DEFAULT_ADMIN_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  // Give pauser role to multisig
  await deployments.execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'grantRole',
    PAUSER_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  // Give rate limit role to multisig
  await deployments.execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'grantRole',
    RATE_LIMITER_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  return true;
};

func.tags = ['portal_ownership'];
func.id = 'portal_ownership';
export default func;
