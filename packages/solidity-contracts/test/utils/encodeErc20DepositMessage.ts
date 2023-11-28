import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { computeMessageData } from '../../protocol/utils';
const { hexZeroPad } = utils;

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
    hexZeroPad(typeof token === 'string' ? token : token.address, 32),
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
    hexZeroPad(typeof sender === 'string' ? sender : sender.address, 32),
    to,
    amount,
    data
  );
}
