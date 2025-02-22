import fs from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';

import { FuelChainState__factory } from '../../typechain';

const BLOCKS_PER_COMMIT_INTERVAL = 30;
const TIME_TO_FINALIZE = 5;
const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

const ADMIN = '0x32da601374b38154f05904B16F44A1911Aa6f314';
let COMMITTER_ADDRESS = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

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

    const chainState = FuelChainState__factory.connect(address, deployer);

    const factory = await hre.ethers.getContractFactory('FuelChainState');

    const newImplementation = await factory.deploy(
      TIME_TO_FINALIZE,
      BLOCKS_PER_COMMIT_INTERVAL,
      COMMIT_COOLDOWN
    );

    const newImplementationAddress = await newImplementation.getAddress();

    let txData = chainState.interface.encodeFunctionData('upgradeTo', [
      newImplementationAddress,
    ]);

    await deployer.sendTransaction({
      to: ADMIN,
      value: ethers.parseEther('100'),
    });

    const impersonatedSigner = await ethers.getImpersonatedSigner(ADMIN);
    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    const COMMITTER_ROLE = await chainState.COMMITTER_ROLE();

    txData = await chainState.interface.encodeFunctionData('grantRole', [
      COMMITTER_ROLE,
      COMMITTER_ADDRESS,
    ]);

    await impersonatedSigner.sendTransaction({
      to: address,
      data: txData,
    });

    // hardhat with forking sometimes throws a `nonce too low error` using only one committer, so added another to be used in tests
    COMMITTER_ADDRESS = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

    txData = await chainState.interface.encodeFunctionData('grantRole', [
      COMMITTER_ROLE,
      COMMITTER_ADDRESS,
    ]);

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
