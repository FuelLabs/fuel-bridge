import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC721GatewayV2__factory as FuelERC721GatewayV2 } from '../../typechain';

import fs from 'fs';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const contract = await deployProxy(
    new FuelERC721GatewayV2(deployer),
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC721GatewayV2 at', address);
  await save('FuelERC721Gateway', {
    address,
    abi: [],
    implementation,
  });

  // storing the contract info in a common file so the verification script can read and process all deployments/upgrades together during ci workflow
  const deployment = {
    address: address,
    contractName: 'FuelERC721Gateway',
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

func.tags = ['erc721', 'erc721_gateway', 'FuelERC721GatewayV2'];
func.id = 'fuel_erc721_gateway_v2';
export default func;
