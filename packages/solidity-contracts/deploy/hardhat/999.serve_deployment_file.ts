import fs, { writeFile } from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import path from 'path';
import { promisify } from 'util';

import { FuelChainState__factory } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;

  let address: any;
  const isForking = hre.config.networks[hre.network.name]?.forking?.enabled;
  const deploymentsFile: { [name: string]: string } = {};

  if (isForking) {
    let deploymentDir = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'mainnet'
    );

    fs.readdirSync(deploymentDir)
      .filter((file) => path.extname(file) === '.json')
      .forEach((file) => {
        const filePath = path.join(deploymentDir, file);
        try {
          const deployment = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          // Use filename (without .json) as the key
          const contractName = path.basename(file, '.json');
          deploymentsFile[contractName] = deployment.address;
        } catch (error) {
          console.error(`Error reading deployment file ${file}:`, error);
        }
      });

    deploymentDir = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'localhost',
      'FuelERC721Gateway.json'
    );

    const deployment = JSON.parse(fs.readFileSync(deploymentDir, 'utf8'));
    deploymentsFile['FuelERC721Gateway'] = deployment.address;

    deploymentDir = path.join(
      __dirname,
      '..',
      '..',
      '/',
      'deployments',
      'mainnet',
      'FuelChainState.json'
    );

    const chainStateDeployment = JSON.parse(
      fs.readFileSync(deploymentDir, 'utf8')
    );
    address = chainStateDeployment.address;
  } else {
    const allDeployments = await deployments.all();
    for (const key of Object.keys(allDeployments)) {
      deploymentsFile[key] = allDeployments[key].address;
    }

    ({ address } = await deployments.get('FuelChainState'));
  }

  const state = FuelChainState__factory.connect(address, ethers.provider);

  deploymentsFile['BLOCKS_PER_COMMIT_INTERVAL'] = (
    await state.BLOCKS_PER_COMMIT_INTERVAL()
  ).toString();
  deploymentsFile['NUM_COMMIT_SLOTS'] = (
    await state.NUM_COMMIT_SLOTS()
  ).toString();
  deploymentsFile['TIME_TO_FINALIZE'] = (
    await state.TIME_TO_FINALIZE()
  ).toString();

  const writeFileAsync = promisify(writeFile);

  await writeFileAsync(
    'deployments/deployments.local.json',
    JSON.stringify(deploymentsFile, null, 2),
    'utf8'
  );
};

func.tags = ['all'];
func.id = 'all';
func.runAtTheEnd = true;
export default func;
