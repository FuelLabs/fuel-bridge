import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ContractFactory, ethers } from 'ethers';

const SECURITY_COUNCIL_MULTISIG = '0x32da601374b38154f05904B16F44A1911Aa6f314';
const ETH_BALANCE_TO_SET = '0xDE0B6B3A7640000'; // 1 ether
const GAS_AMOUNT = '0x7a1200';
const GAS_PRICE = '0xF4241';

task('simulate-upgrades', 'Mocks proxy upgrades with tenderly simulation')
  .addParam('vnetid', 'tenderly virtual testnet id')
  .addParam('accesskey', 'tenderly account access key')
  .setAction(
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

      const deployments = await hre.deployments.all();

      const apiUrl = `https://api.tenderly.co/api/v1/account/fuel-network/project/preprod/vnets/${taskArgs.vnetid}/transactions/simulate`;
      const accessKey = taskArgs.accesskey;

      try {
        await fetch(rpc, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(setBalancePayload),
        });

        for (const [contractName, deployment] of Object.entries(deployments)) {
          if (deployment.abi.length == 0) continue;

          // mocking the deployment for the new implementation too.
          // we currently assume that this script will be ran, after the `upgradeVerification` script is executed so we have access to the updated `constructorArgs`, otherwise we can allow the contructor arguments to be entered manually.
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

          const proxyContractInstance = new ethers.Contract(
            deployment.address,
            deployment.abi
          );

          // simulating upgrade enables to impersonate the security council multisig, without the need of signatures
          const encodedUpgradeData =
            proxyContractInstance.interface.encodeFunctionData('upgradeTo', [
              newImplementationAddress,
            ]);

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
      } catch (error) {
        console.log(`❌ Upgrade simulation failed: ${error}`);
      }
    }
  );
