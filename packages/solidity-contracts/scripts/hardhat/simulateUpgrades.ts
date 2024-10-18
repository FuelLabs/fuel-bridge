import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory, ethers } from 'ethers';

const SECURITY_COUNCIL_MULTISIG = '0x32da601374b38154f05904B16F44A1911Aa6f314';
const ETH_BALANCE_TO_SET = '0xDE0B6B3A7640000'; // 1 ether
const GAS_AMOUNT = '0x7a1200';
const GAS_PRICE = '0xF4241';

task(
  'simulate-upgrades',
  'Mocks proxy upgrades with tenderly simulation'
).setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;

    if (network !== 'mainnet') {
      return;
    }

    const {
      upgrades: { prepareUpgrade },
      ethers,
    } = hre;

    console.log(
      `Mocking proxy upgrades on ${network}:${hre.network.config.chainId}...`
    );

    const signer = await ethers.provider.getSigner(0);

    // fund the signer for deploying the new implementation
    const setBalancePayload = {
      jsonrpc: '2.0',
      method: 'tenderly_setBalance',
      params: [[(await signer.getAddress()).toString()], ETH_BALANCE_TO_SET],
    };

    const rpc: string = process.env.RPC_URL!;

    await fetch(rpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(setBalancePayload),
    });

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      if (deployment.abi.length == 0) continue;

      // mocking the deployment for the new implementation too, although this can be optional
      // as we can run this cli after running the `upgradeVerification` script, so we'll have access to the new implementation
      const factory = (await ethers.getContractFactory(
        deployment.linkedData.factory
      )) as ContractFactory; // Typing bug in `getContractFactory`

      const deploymentResponse = (await prepareUpgrade(
        deployment.address,
        factory,
        {
          kind: 'uups',
          constructorArgs: deployment.linkedData.constructorArgs,
          getTxResponse: true,
          redeployImplementation: 'always',
        }
      )) as ethers.TransactionResponse;

      const receipt = await hre.ethers.provider.getTransactionReceipt(
        deploymentResponse.hash
      );

      const newImplementationAddress = receipt?.contractAddress!;

      const proxy = new ethers.Contract(deployment.address, deployment.abi);

      // simulating upgrade enables to impersonate the security council multisig, without the need of signatures
      const encodedUpgradeData = proxy.interface.encodeFunctionData(
        'upgradeTo',
        [newImplementationAddress]
      );
      const apiUrl =
        'https://api.tenderly.co/api/v1/account/fuel-network/project/preprod/vnets/d8f2a557-5b38-4e23-91a4-390bb5bb0750/transactions/simulate';
      const accessKey = 'jFGmjrxi116C8f-ODkCpOcLU6KIoQ04c';

      const upgradeImplementationPayload = {
        callArgs: {
          from: SECURITY_COUNCIL_MULTISIG,
          to: deployment.address,
          gas: GAS_AMOUNT,
          gasPrice: GAS_PRICE,
          value: '0x0',
          data: encodedUpgradeData,
        },
        blockNumber: 'latest',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Access-Key': accessKey,
        },
        body: JSON.stringify(upgradeImplementationPayload),
      });

      // simulations don't result in visible state changes so not checking the new implementation here, so instead we check
      // the event logs that the `Upgraded` event was emitted
      if (response.ok) {
        const responsePayload: any = await response.json();

        if (responsePayload.logs[0].name === 'Upgraded') {
          console.log(
            `✅ Upgrade simulation successful for ${contractName} (${deployment.address})`
          );
        } else {
          console.log(
            `❌ Upgrade simulation failed for ${contractName} (${deployment.address})`
          );
          throw new Error('Upgrade simulation failed');
        }
      } else {
        console.log(
          `❌ Upgrade simulation failed for ${contractName} (${deployment.address})`
        );
        throw new Error('Upgrade simulation failed');
      }
    }
  }
);
