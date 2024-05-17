import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { save, execute, get },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainStateAddress } = await get('FuelChainState');

  console.log('Upgrading FuelChainState...');
  const contract = await upgradeProxy(
    fuelChainStateAddress,
    new FuelChainState(deployer)
  );
  await contract.waitForDeployment();
  const tx = contract.deploymentTransaction();
  await tx.wait();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed new implementation at', implementation);
  await save('FuelChainState', {
    address,
    abi: [...FuelChainState.abi],
    implementation,
  });

  await execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'unpause'
  );

  return true;
};

func.tags = ['state_redeploy'];
func.id = 'state_redeploy';
export default func;
