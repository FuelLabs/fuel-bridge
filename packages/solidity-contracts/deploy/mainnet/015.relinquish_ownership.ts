import { ZeroHash as DEFAULT_ADMIN_ROLE } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  FuelChainState__factory,
  FuelERC20GatewayV4__factory,
} from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: gatewayAddress } = await deployments.get(
    'FuelERC20GatewayV4'
  );
  const { address: stateAddress } = await deployments.get('FuelChainState');
  const gateway = FuelERC20GatewayV4__factory.connect(
    gatewayAddress,
    ethers.provider
  );

  const state = FuelChainState__factory.connect(stateAddress, ethers.provider);

  const COMMITTER_ROLE = await state.COMMITTER_ROLE();

  // This role is shared between the portal and the gateway
  const RATE_LIMITER_ROLE = await gateway.SET_RATE_LIMITER_ROLE();

  /**
   * PORTAL:
   * Renounce roles of current admin:
   * - DEFAULT_ADMIN_ROLE (upgradability)
   * - RATE_LIMITER_ROLE
   */
  await deployments.execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'renounceRole',
    DEFAULT_ADMIN_ROLE,
    deployer.address
  );
  await deployments.execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'renounceRole',
    RATE_LIMITER_ROLE,
    deployer.address
  );

  /**
   * GATEWAY:
   * Renounce roles of current admin:
   * - DEFAULT_ADMIN_ROLE (upgradability)
   * - RATE_LIMITER_ROLE
   */
  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'renounceRole',
    DEFAULT_ADMIN_ROLE,
    deployer.address
  );
  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'renounceRole',
    RATE_LIMITER_ROLE,
    deployer.address
  );

  /**
   * STATE:
   * Renounce roles of current admin:
   * - DEFAULT_ADMIN_ROLE (upgradability)
   * - COMMITTER_ROLE
   */
  await deployments.execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'renounceRole',
    DEFAULT_ADMIN_ROLE,
    deployer.address
  );
  await deployments.execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'renounceRole',
    COMMITTER_ROLE,
    deployer.address
  );

  return true;
};

func.tags = ['relinquish_ownership'];
func.id = 'relinquish_ownership';
func.skip = async () => true;
export default func;
