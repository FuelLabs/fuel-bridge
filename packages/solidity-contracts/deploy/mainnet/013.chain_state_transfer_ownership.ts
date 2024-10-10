import { ZeroHash as DEFAULT_ADMIN_ROLE } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { FuelChainState__factory } from '../../typechain';
import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: stateAddress } = await deployments.get('FuelChainState');
  const state = FuelChainState__factory.connect(stateAddress, ethers.provider);

  const PAUSER_ROLE = await state.PAUSER_ROLE();

  // Give admin role to multisig
  await deployments.execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'grantRole',
    DEFAULT_ADMIN_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  // Give pauser role to multisig
  await deployments.execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'grantRole',
    PAUSER_ROLE,
    MAINNET_MULTISIG_ADDRESS
  );

  return true;
};

func.tags = ['state_ownership'];
func.id = 'state_ownership';
export default func;
