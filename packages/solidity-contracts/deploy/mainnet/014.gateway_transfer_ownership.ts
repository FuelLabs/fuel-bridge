import { ZeroHash as DEFAULT_ADMIN_ROLE } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { FuelERC20GatewayV4__factory } from '../../typechain';
import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: gatewayAddress } = await deployments.get(
    'FuelERC20GatewayV4'
  );
  const portal = FuelERC20GatewayV4__factory.connect(
    gatewayAddress,
    ethers.provider
  );

  const PAUSER_ROLE = await portal.PAUSER_ROLE();
  const RATE_LIMITER_ROLE = await portal.SET_RATE_LIMITER_ROLE();

  // Give admin role to multisig
  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'grantRole',
    DEFAULT_ADMIN_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  // Give pauser role to multisig
  await deployments.execute(
    'FuelERC20GatewayV4',
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

func.tags = ['gateway_ownership'];
func.id = 'gateway_ownership';
export default func;
