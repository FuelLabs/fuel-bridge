import type { BigNumberish, BytesLike } from 'ethers';
import { zeroPadValue as hexZeroPadLeft, toBeHex } from 'ethers';

import { computeMessageData } from '../../protocol/utils';

/**
 * @description Encodes an erc20 deposit message the same way the FuelERC20Gateway contract does
 */
export function encodeErc20DepositMessage(
  fuelContractId: string,
  token: string | { address: string },
  sender: string | { address: string },
  to: string,
  amount: BigNumberish,
  data?: BytesLike
) {
  return computeMessageData(
    fuelContractId,
    hexZeroPadLeft(typeof token === 'string' ? token : token.address, 32),
    hexZeroPadLeft(toBeHex(BigInt(0)), 32),
    hexZeroPadLeft(typeof sender === 'string' ? sender : sender.address, 32),
    to,
    amount,
    data
  );
}
