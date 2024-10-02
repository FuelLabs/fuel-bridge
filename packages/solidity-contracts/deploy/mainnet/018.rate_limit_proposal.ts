import type {
  HardhatRuntimeEnvironment,
  HttpNetworkConfig,
} from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import Safe from '@safe-global/protocol-kit';
import { MetaTransactionData } from '@safe-global/safe-core-sdk-types';

import { password } from '@inquirer/prompts';
import { FuelERC20GatewayV4__factory } from '../../typechain';
import { MAINNET_MULTISIG_ADDRESS } from '../../protocol/constants';

const MAINNET_TOKENS = [
  '0x4041381e947CFD3D483d67a25C6aa9Dc924250c5',
  '0x8CdF550C04Bc9B9F10938368349C9c8051A772b6',
  '0x3f24E1d7a973867fC2A03fE199E5502514E0e11E',
  '0x83f20f44975d03b1b09e64809b757c47f942beea',
  '0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa',
  '0xf469fbd2abcd6b9de8e169d128226c0fc90a012e',
  '0xc96de26018a54d51c097160568752c4e3bd6c364',
  '0x7a56e1c57c7475ccf742a1832b028f0456652f97',
  '0xd9d920aa40f578ab794426f5c90f6c731d159def',
  '0x5fD13359Ba15A84B76f7F87568309040176167cd',
  '0x7a4EffD87C2f3C55CA251080b1343b605f327E3a',
  '0xBEEF69Ac7870777598A04B2bd4771c71212E6aBc',
  '0x84631c0d0081FDe56DeB72F6DE77abBbF6A9f93a',
  '0x8c9532a60e0e7c6bbd2b2c1303f63ace1c3e9811',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee', //weETH
  '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
  '0xae78736cd615f374d3085123a210448e74fc6393',
  '0xa2E3356610840701BDf5611a53974510Ae27E2e1',
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
  '0x9d39a5de30e57443bff2a8307a4256c8797a3497',
  '0x82f5104b23FF2FA54C2345F821dAc9369e9E0B26',
  '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', //wstETH
  '0xbf5495Efe5DB9ce00f80364C8B423567e58d2110',
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const privateKey = await password({ message: 'Enter private key' });
  const provider = (hre.config.networks['mainnet'] as HttpNetworkConfig).url;

  const { address: gatewayAddress, implementation: newGatewayImplementation } =
    await hre.deployments.get('FuelERC20GatewayV4');

  const protocolKit = await Safe.init({
    signer: privateKey,
    provider,
    safeAddress: MAINNET_MULTISIG_ADDRESS,
  });

  const gateway = FuelERC20GatewayV4__factory.connect(
    gatewayAddress,
    hre.ethers.provider
  );

  const transactions: MetaTransactionData[] = [];

  for (const token of MAINNET_TOKENS) {
    const { data } = await gateway.updateRateLimitStatus(token, true);
    transactions.push({
      to: gatewayAddress,
      data,
      value: '0',
    });
  }

  const safeTransaction = await protocolKit.createTransaction({
    transactions,
  });

  const hash = await protocolKit.getTransactionHash(safeTransaction);
  console.log('Created safe transaction', hash);

  return true;
};

func.tags = ['multisig_proposal'];
func.id = 'multisig_proposal';
export default func;
