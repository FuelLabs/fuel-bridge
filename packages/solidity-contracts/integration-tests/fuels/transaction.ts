import type { Resource, TransactionRequestInput } from 'fuels';
import { InputType, ZeroBytes32, isCoin } from 'fuels';

export function resourcesToInputs(resources: Array<Resource>) {
  const inputs: Array<TransactionRequestInput> = resources
    .filter((r) => isCoin(r))
    .map((r: any) => ({
      type: InputType.Coin,
      id: r.id,
      owner: r.owner.toB256(),
      amount: r.amount.toHex(),
      assetId: r.assetId,
      txPointer: ZeroBytes32,
      witnessIndex: 0,
    }));
  return inputs;
}
