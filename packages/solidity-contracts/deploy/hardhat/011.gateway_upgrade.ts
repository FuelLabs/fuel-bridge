import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelERC20GatewayV4__factory } from '../../typechain';

const ADMIN = '0x32da601374b38154f05904B16F44A1911Aa6f314';

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

    const ADMIN_ROLE = await portal.DEFAULT_ADMIN_ROLE();
    const SET_RATE_LIMITER_ROLE = await portal.SET_RATE_LIMITER_ROLE();

    const factory = await hre.ethers.getContractFactory('FuelERC20GatewayV4');

    const newImplementation = await factory.deploy();

    const newImplementationAddress = await newImplementation.getAddress();

    let txData = portal.interface.encodeFunctionData('upgradeTo', [
      newImplementationAddress,
    ]);

    await deployer.sendTransaction({
      to: ADMIN,
      value: ethers.parseEther('1'), // Send 0.1 ETH
    });

    const impersonatedSigner = await ethers.getImpersonatedSigner(ADMIN);
    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    txData = await portal.interface.encodeFunctionData('grantRole', [
      ADMIN_ROLE,
      await deployer.getAddress(),
    ]);
    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    txData = await portal.interface.encodeFunctionData('grantRole', [
      SET_RATE_LIMITER_ROLE,
      await deployer.getAddress(),
    ]);
    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    txData = await portal.interface.encodeFunctionData('requireWhitelist', [
      false,
    ]);
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
