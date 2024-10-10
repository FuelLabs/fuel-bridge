import type {
  HardhatRuntimeEnvironment,
  HttpNetworkConfig,
} from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import SafeProtocolKit from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';

import { MetaTransactionData } from '@safe-global/safe-core-sdk-types';

import { password } from '@inquirer/prompts';
import { FuelMessagePortalV3__factory } from '../../typechain';
import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';

const PAUSERS = [
  '0x958470a2ADe72b7a01A2e160F3286767b9623Ad7',
  '0x81ACA96D4Ae0932d2F3463a043392efcCB1F05b6',
  '0x796C3f536C6bf5CB7661C9A0570da0e1ECD303Dd',
  '0x9F7dfAb2222A473284205cdDF08a677726d786A0',
  '0xC8Bd2Ead61e54C53C5A1836352c29F10383FBad2',
  '0x45aa9fF818Ffaca57CA31b1C624b2a8CBF5B417e',
  '0xf88b0247e611eE5af8Cf98f5303769Cba8e7177C',
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const privateKey = await password({ message: 'Enter private key' });
  const senderAddress = new hre.ethers.Wallet(privateKey).address;
  const provider = (hre.config.networks['mainnet'] as HttpNetworkConfig).url;

  const { address: gatewayAddress } = await hre.deployments.get(
    'FuelERC20GatewayV4'
  );

  const { address: portalAddress } = await hre.deployments.get(
    'FuelMessagePortal'
  );

  const { address: chainStateAddress } = await hre.deployments.get(
    'FuelChainState'
  );

  const contracts = [gatewayAddress, portalAddress, chainStateAddress];

  const safeAddress = MAINNET_MULTISIG_ADDRESS;
  const apiKit = new SafeApiKit({ chainId: 1n });
  const protocolKit = await SafeProtocolKit.init({
    signer: privateKey,
    provider,
    safeAddress,
  });

  const transactions: MetaTransactionData[] = [];

  for (const contractAddress of contracts) {
    const contract = FuelMessagePortalV3__factory.connect(
      contractAddress,
      hre.ethers.provider
    );
    const pauserRole = await contract.PAUSER_ROLE();

    for (const pauser of PAUSERS) {
      const { data } = await contract.grantRole.populateTransaction(
        pauserRole,
        pauser
      );
      transactions.push({
        to: contractAddress,
        data,
        value: '0',
      });
    }
  }

  const safeTransaction = await protocolKit.createTransaction({
    transactions,
  });

  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

  const signature = await protocolKit.signHash(safeTxHash);

  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: signature.data,
  });

  return true;
};

func.tags = ['pausers_proposal'];
func.id = 'pausers_proposal';
export default func;
