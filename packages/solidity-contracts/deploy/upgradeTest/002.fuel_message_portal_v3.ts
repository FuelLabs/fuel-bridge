import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import {
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
} from '../../protocol/constants';
import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

import fs from 'fs';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainState } = await get('FuelChainState');

  const contract = await deployProxy(
    new FuelMessagePortal(deployer),
    [fuelChainState, RATE_LIMIT_AMOUNT.toString()],
    {
      initializer: 'initializerV3',
      constructorArgs: [MaxUint256, RATE_LIMIT_DURATION],
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelMessagePortal at', address);
  await save('FuelMessagePortal', {
    address,
    abi: [],
    implementation,
  });

  // storing the contract info in a common file so the verification script can read and process all deployments/upgrades together during ci workflow
  const deployment = {
    address: address,
    contractName: 'FuelMessagePortal',
    network: hre.network.name,
    isProxy: true,
    isImplementation: false,
  };

  let deployments = [];
  const deploymentsFile = `deployments/${hre.network.name}/${hre.network.name}.json`;
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
  }

  deployments.push(deployment);

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
};

func.tags = ['portal', 'message_portal', 'FuelMessagePortal'];
func.id = 'fuel_message_portal';
export default func;
