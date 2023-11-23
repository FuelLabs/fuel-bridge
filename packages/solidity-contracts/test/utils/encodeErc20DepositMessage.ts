// This is the messageData encoding, for reference:
// bytes memory messageData = abi.encodePacked(
//     fuelContractId,
//     bytes32(uint256(uint160(tokenAddress))), // OFFSET_TOKEN_ADDRESS = 32
//     bytes32(0), // OFFSET_TOKEN_ID = 64
//     bytes32(uint256(uint160(msg.sender))), //from, OFFSET_FROM = 96
//     to, // OFFSET_TO = 128
//     amount // OFFSET_AMOUNT = 160
// );

import { BigNumberish, BigNumber, utils, BytesLike } from 'ethers';
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
