import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelERC721GatewayV2__factory as FuelERC721GatewayV2 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;

  const isForking = hre.config.networks[hre.network.name]?.forking?.enabled;

  const [deployer] = await ethers.getSigners();

  let portlAddress;
  if (isForking) {
    const deploymentPath = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'mainnet',
      'FuelMessagePortal.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    portlAddress = deployment.address;
  } else {
    const fuelMessagePortal = await get('FuelMessagePortal');
    portlAddress = fuelMessagePortal.address;
  }

  const contract = await deployProxy(
    new FuelERC721GatewayV2(deployer),
    [portlAddress],
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
};

func.tags = ['erc721', 'erc721_gateway', 'FuelERC721GatewayV2'];
func.id = 'fuel_erc721_gateway_v2';
export default func;
