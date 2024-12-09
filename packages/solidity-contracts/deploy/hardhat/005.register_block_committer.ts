import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelChainState__factory } from '../../typechain';

const COMMITTER_ADDRESS = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const ADMIN = '0x32da601374b38154f05904B16F44A1911Aa6f314';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;

  const isForking = hre.config.networks[hre.network.name]?.forking?.enabled;

  const [deployer] = await ethers.getSigners();

  let address;

  if (isForking) {
    const deploymentPath = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'mainnet',
      'FuelChainState.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    address = deployment.address;
  } else {
    ({ address } = await deployments.get('FuelChainState'));
  }

  const fuelChainState = FuelChainState__factory.connect(address, deployer);
  const COMMITTER_ROLE = await fuelChainState.COMMITTER_ROLE();

  const txData = await fuelChainState.interface.encodeFunctionData(
    'grantRole',
    [COMMITTER_ROLE, COMMITTER_ADDRESS]
  );

  await deployer.sendTransaction({
    to: ADMIN,
    value: ethers.parseEther('1'), // Send 0.1 ETH
  });

  const impersonatedSigner = await ethers.getImpersonatedSigner(ADMIN);
  await impersonatedSigner.sendTransaction({
    to: address,
    data: txData,
  });

  console.log('Granted role COMMITTER_ROLE to', COMMITTER_ADDRESS);
};

func.tags = ['register_committer'];
func.id = 'register_committer';
export default func;
