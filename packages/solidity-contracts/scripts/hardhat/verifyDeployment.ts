import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

task('verify-deployment', 'Verifies the deployed contract bytecode').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;
    console.log(
      `Verifying contract bytecode on ${network}:${hre.network.config.chainId}...`
    );

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      try {
        console.log('--- Fetching deployed bytecode...');
        let deployedBytecode: string;

        if (!deployment.linkedData.isProxy) {
          deployedBytecode = await hre.ethers.provider.getCode(
            deployment.address
          );
        } else continue;

        console.log('--- Creating local Hardhat network...');
        const localHardhat = require('hardhat');
        await localHardhat.run('compile');

        // localHardhat.artifacts.readArtifact(deployment.linkedData.factory)


        // localHardhat.


        const rpcUrl = 'https://rpc.tenderly.co/fork/3fe27079-c302-4397-a43e-602cc4887dca'; // Replace with your custom RPC URL
        localHardhat.ethers.provider = new localHardhat.ethers.JsonRpcProvider(rpcUrl);
        
        // const accounts = await hre.ethers.getSigners()
        // const wallet = localHardhat.ethers.Wallet.fromPhrase('test test test test test test test test test test test junk');
        // console.log(await wallet.getBalance())
      // Create a provider and signer
    // const provider = new localHardhat.ethers.JsonRpcProvider(rpcUrl);

    
    let [signer] = await localHardhat.ethers.getSigners();

    // if (process.env.CONTRACTS_DEPLOYER_KEY) signer = new localHardhat.ethers.Wallet(wallet.privateKey, provider);

    // const balance = await signer.getBalance();
    // console.log(await (await localHardhat.ethers.provider.getBalance(wallet.address).toString()));


        const ContractFactory = await localHardhat.ethers.getContractFactory(
          deployment.linkedData.factory, signer
        );

        

        if (!deployment.linkedData.isProxy) {
          console.log('--- Validating Upgrade...');
          await localHardhat.upgrades.validateUpgrade(
            deployment.address as string,
            ContractFactory,
            {
              kind: 'uups',
              constructorArgs: deployment.linkedData.constructorArgs,
            }
          );

          console.log('--- Upgrade Validated...');
        } else continue;

        console.log('--- Fetching local deployment bytecode...');
        let localBytecode: string;
        let localAddress;
        // if (!deployment.linkedData.isProxy) {

          const proxyfactory = await localHardhat.ethers.getContractFactory(
            contractName, signer
          );
          const proxy = await localHardhat.upgrades.deployProxy(proxyfactory, [], {
            initializer: 'initialize',
            constructorArgs: deployment.linkedData.constructorArgs,
          });

          await proxy.waitForDeployment();


          const contract = await localHardhat.upgrades.upgradeProxy(
            deployment.address,
            ContractFactory,
            {
              kind: 'uups',
              constructorArgs: deployment.linkedData.constructorArgs,
            }
          );

          console.log('--- Upgrade successful');
          await contract.waitForDeployment();
          localAddress = await contract.getAddress();

          localBytecode = await hre.ethers.provider.getCode(
            localAddress
          );

          
          // new hre.ethers.JsonRpcSigner()
          // // const factory = hre.ethers.getContractFactory
          // // localBytecode = 
          // // ContractFactory.bytecode
          // // localBytecode = await (
          // //   await hre.artifacts.readArtifact(deployment.linkedData.factory)
          // // ).deployedBytecode;
          // await hre.tenderlyNetwork.setFork("https://dashboard.tenderly.co/Viraz/vir/fork/3fe27079-c302-4397-a43e-602cc4887dca");
          // await hre.tenderlyNetwork.initializeFork()


        // } else continue;

        console.log('--- Comparing bytecodes...');
        console.log(
          '--- Deployed bytecode: ',
         deployedBytecode
        );
        console.log(
          '--- Local bytecode: ',
          localBytecode
        );

        if (
          hre.ethers.keccak256(deployedBytecode) ===
          hre.ethers.keccak256(localBytecode)
        ) {
          console.log(
            `✅ ${contractName} (${deployment.address}): Bytecode verified successfully`
          );
        } else {
          console.log(
            `❌ ${contractName} (${deployment.address}): Bytecode mismatch`
          );
          throw new Error('Bytecode mismatch');
        }
      } catch (error) {
        console.log(
          `❌ ${contractName} (${deployment.address}): Verification failed`
        );
        console.error(`   Error: ${error.message}`);
      }
    }
  }
);
