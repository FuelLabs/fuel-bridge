import { Wallet } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';

import { enterPrivateKey } from './utils';

import fs from 'fs';

const BLOCKS_PER_COMMIT_INTERVAL = 30;
const TIME_TO_FINALIZE = 5;
const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

task(
  'prepareUpgradeFuelChainState',
  'validates and deploys a new implementation for FuelChainState before ci upgrade verification'
)
  .addFlag('env', 'use this flag to send transactions from env var PRIVATE_KEY')
  .addFlag('i', 'use this flag to input a private key')
  .addParam('proxyAddress', 'address that will receive the role')
  .setAction(async (taskArgs, hre) => {
    let signer: Signer;

    if (taskArgs.i) {
      const privateKey = await enterPrivateKey();
      signer = new Wallet(privateKey, hre.ethers.provider);
    } else if (taskArgs.env) {
      signer = new Wallet(process.env.PRIVATE_KEY!, hre.ethers.provider);
    } else {
      const signers = await hre.ethers.getSigners();
      signer = signers[0];
    }

    const contract = await hre.ethers.getContractFactory('FuelChainState');
    if (!contract) {
      return;
    }

    console.log('Preparing upgrade');

    const deploymentsFile = `deployments/${hre.network.name}/${hre.network.name}.json`;
    let deployments = [];
    if (fs.existsSync(deploymentsFile)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
    }

    console.log('ddddds');
    const implementationAddress = await hre.upgrades.prepareUpgrade(
      taskArgs.proxyAddress,
      contract,
      {
        kind: 'uups',
        constructorArgs: [
          TIME_TO_FINALIZE,
          BLOCKS_PER_COMMIT_INTERVAL,
          COMMIT_COOLDOWN,
        ],
      }
    );
    console.log('Implementation deployed to:', implementationAddress);

    for (const deployment of deployments) {
      if ((deployment.address = taskArgs.proxyAddress)) {
        deployment.address = implementationAddress;
        deployment.proxyAddress = taskArgs.proxyAddress;
        deployment.isProxy = false;
        deployment.isImplementation = true;
      }
    }
    fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  });
