/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import {
  type Provider as FuelProvider,
  type Message,
  BN,
  AbstractAddress,
  Address,
  hexlify,
} from 'fuels';

import { FUEL_MESSAGE_POLL_MS } from '../constants';
import { delay } from '../delay';
import { debug } from '../logs';
import { zeroPadValue } from 'ethers';

// Wait until a message is present in the fuel client
export async function waitForMessage(
  provider: FuelProvider,
  recipient: AbstractAddress,
  nonce: BN,
  timeout: number
): Promise<Message> {
  const startTime = new Date().getTime();
  while (new Date().getTime() - startTime < timeout) {
    const gqlMessage = await provider.getMessageByNonce(
      hexlify(nonce.toBytes())
    );

    if (gqlMessage) {
      if (
        gqlMessage.recipient.replace('0x', '') !==
        recipient.toB256().replace('0x', '')
      ) {
        return null;
      }

      const message: Message = {
        messageId: '0x', // Message ID left uncalculated, unused in test suite
        sender: Address.fromB256(zeroPadValue(gqlMessage.sender, 32)),
        recipient: Address.fromB256(gqlMessage.recipient),
        nonce: hexlify(nonce.toBytes(32)),
        amount: new BN(gqlMessage.amount),
        data: gqlMessage.data,
        daHeight: new BN(gqlMessage.daHeight),
      };

      return message;
    }

    debug(`Waiting for message with nonce ${nonce}`);
    await delay(FUEL_MESSAGE_POLL_MS);
  }
  return null;
}
