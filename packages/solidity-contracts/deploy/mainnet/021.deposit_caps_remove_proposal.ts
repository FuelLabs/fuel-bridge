import { password } from '@inquirer/prompts';
import SafeApiKit from '@safe-global/api-kit';
import SafeProtocolKit from '@safe-global/protocol-kit';
import type { MetaTransactionData } from '@safe-global/safe-core-sdk-types';
import type {
  HardhatRuntimeEnvironment,
  HttpNetworkConfig,
} from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';
import { FuelMessagePortalV3__factory } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const privateKey = await password({ message: 'Enter private key' });
  const senderAddress = new hre.ethers.Wallet(privateKey).address;
  const provider = (hre.config.networks['mainnet'] as HttpNetworkConfig).url;

  const { address: portalAddress, implementation: newPortalImplementation } =
    await hre.deployments.get('FuelMessagePortal');

  if (!newPortalImplementation) {
    throw new Error('No implementations found in artifacts');
  }

  const safeAddress = MAINNET_MULTISIG_ADDRESS;
  const apiKit = new SafeApiKit({ chainId: 1n });
  const protocolKit = await SafeProtocolKit.init({
    signer: privateKey,
    provider,
    safeAddress,
  });

  const transactions: MetaTransactionData[] = [];

  const { data: upgradeTransactionData } =
    await FuelMessagePortalV3__factory.connect(
      portalAddress,
      hre.ethers.provider
    ).upgradeTo.populateTransaction(newPortalImplementation);
  transactions.push({
    to: portalAddress,
    data: upgradeTransactionData,
    value: '0',
  });

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

func.tags = ['21_deposit_caps_removal'];
func.id = '21_deposit_caps_removal';
export default func;
