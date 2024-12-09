import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelERC20GatewayV4__factory } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { erc1967 },
  } = hre;

  const [deployer] = await ethers.getSigners();

  const isForking = hre.config.networks[hre.network.name]?.forking?.enabled;
  let address;

  if (isForking) {
    const deploymentPath = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'mainnet',
      'FuelERC20GatewayV4.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    address = deployment.address;

    const portal = FuelERC20GatewayV4__factory.connect(address, deployer);

    const factory = await hre.ethers.getContractFactory('FuelERC20GatewayV4');

    const newImplementation = await factory.deploy();

    const newImplementationAddress = await newImplementation.getAddress();

    const txData = portal.interface.encodeFunctionData('upgradeTo', [
      newImplementationAddress,
    ]);

    await deployer.sendTransaction({
      to: '0x32da601374b38154f05904B16F44A1911Aa6f314',
      value: ethers.parseEther('1'), // Send 0.1 ETH
    });

    const impersonatedSigner = await ethers.getImpersonatedSigner(
      '0x32da601374b38154f05904B16F44A1911Aa6f314'
    );
    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    const implementation = await erc1967.getImplementationAddress(address);

    console.log('Upgraded FuelGateway to', implementation);

    return true;
  }
};

func.tags = ['upgrade_gateway'];
func.id = 'upgrade_gateway';
export default func;
