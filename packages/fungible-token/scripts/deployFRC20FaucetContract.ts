import { ContractFactory, Provider, WalletUnlocked } from 'fuels';

import { fungibleTokenBinary, fungibleTokenABI } from '../dist';

async function main() {
  if (
    !(
      process.env.BRIDGED_TOKEN_GATEWAY ||
      process.env.BRIDGED_TOKEN ||
      process.env.DEPLOYER_KEY ||
      process.env.PROVIDER_URL
    )
  ) {
    throw new Error(
      'BRIDGED_TOKEN_GATEWAY, BRIDGED_TOKEN, and DEPLOYER_KEY are required to deploy the FRC20 faucet contract'
    );
  }

  const BRIDGED_TOKEN_GATEWAY =
    `0x000000000000000000000000${process.env.BRIDGED_TOKEN_GATEWAY?.replace(
      '0x',
      ''
    )}`.toLowerCase();
  const BRIDGED_TOKEN =
    `0x000000000000000000000000${process.env.BRIDGED_TOKEN?.replace(
      '0x',
      ''
    )}`.toLowerCase();

  const provider = await Provider.create(process.env.PROVIDER_URL as string);
  const factory = new ContractFactory(
    fungibleTokenBinary,
    fungibleTokenABI,
    new WalletUnlocked(process.env.DEPLOYER_KEY as string, provider)
  );
  const contract = await factory.deployContract({
    configurableConstants: {
      BRIDGED_TOKEN_GATEWAY,
      BRIDGED_TOKEN,
      NAME: 'TokenFaucet                                                     ',
      SYMBOL: 'TKN                             ',
    },
    gasPrice: provider.getGasConfig().minGasPrice,
    storageSlots: [],
  });
  console.log('Contract deployed at', contract.id.toB256());

  const { value: bridge_token } = await contract.functions
    .bridged_token()
    .dryRun();
  const { value: bridge_token_getway } = await contract.functions
    .bridged_token_gateway()
    .dryRun();
  console.log('bridge_token deployed at', bridge_token);
  console.log('bridge_token_getway deployed at', bridge_token_getway);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
