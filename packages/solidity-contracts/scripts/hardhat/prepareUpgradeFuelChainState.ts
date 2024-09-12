import { Wallet } from 'ethers';
import type { Signer } from 'ethers';
import { task } from 'hardhat/config';
import { ethers, upgrades } from 'hardhat';

import { enterPrivateKey } from './utils';

import fs from 'fs';

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

    const contract = await ethers.getContractFactory('FuelChainState');
    if (!contract) {
      return;
    }

    console.log('Preparing upgrade');

    const deploymentsFile = `deployments/${hre.network.name}/${hre.network.name}.json`;
    let deployments = [];
    if (fs.existsSync(deploymentsFile)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
    }

    const implementationAddress = await upgrades.prepareUpgrade(
      taskArgs.proxyAddress,
      contract,
      { kind: 'uups' }
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
