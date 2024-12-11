import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelChainState__factory } from '../../typechain';

const BLOCKS_PER_COMMIT_INTERVAL = 30;
const TIME_TO_FINALIZE = 5;
const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

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
      'FuelChainState.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    address = deployment.address;

    const portal = FuelChainState__factory.connect(address, deployer);

    const factory = await hre.ethers.getContractFactory('FuelChainState');

    const newImplementation = await factory.deploy(
      TIME_TO_FINALIZE,
      BLOCKS_PER_COMMIT_INTERVAL,
      COMMIT_COOLDOWN
    );

    const newImplementationAddress = await newImplementation.getAddress();

    const txData = portal.interface.encodeFunctionData('upgradeTo', [
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

    const implementation = await erc1967.getImplementationAddress(address);

    console.log('Upgraded FuelChainState to', implementation);

    return true;
  }
};

func.tags = ['upgrade_chain_state'];
func.id = 'upgrade_chain_state';
export default func;
