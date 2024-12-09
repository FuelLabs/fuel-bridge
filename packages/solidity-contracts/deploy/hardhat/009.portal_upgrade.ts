import { MaxUint256 } from 'ethers';
import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const RATE_LIMIT_DURATION = 3600 * 24 * 7;

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
      'FuelMessagePortal.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    address = deployment.address;

    const portal = FuelMessagePortal.connect(address, deployer);

    const factory = await hre.ethers.getContractFactory('FuelMessagePortalV3');

    const newImplementation = await factory.deploy(
      MaxUint256,
      RATE_LIMIT_DURATION
    );

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

    console.log('Upgraded FuelMessagePortal to', implementation);

    return true;
  }
};

func.tags = ['upgrade_portal'];
func.id = 'upgrade_portal';
export default func;
