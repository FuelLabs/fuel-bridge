import type { JsonRpcProvider, Provider } from '@ethersproject/providers';

export async function isHardhatProvider(provider: Provider) {
  if (!('send' in provider)) return false;

  try {
    const result = await (provider as JsonRpcProvider).send(
      'hardhat_metadata',
      []
    );

    return !!result?.clientVersion;
  } catch (e) {
    return null;
  }
}
