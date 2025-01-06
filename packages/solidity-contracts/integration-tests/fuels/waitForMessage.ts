/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import type { BN, AbstractAddress } from 'fuels';
import { type Provider as FuelProvider, type Message, hexlify } from 'fuels';

import {debug} from '../utils/debug';

// Simple async delay function
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait until a message is present in the fuel client
export async function waitForMessage(
  provider: FuelProvider,
  recipient: AbstractAddress,
  nonce: BN,
  timeout: number
): Promise<Message | null> {
  const FUEL_MESSAGE_POLL_MS: number = 300;
  const startTime = new Date().getTime();
  while (new Date().getTime() - startTime < timeout) {
    const gqlMessage = await provider.getMessageByNonce(
      hexlify(nonce.toBytes())
    );

    if (gqlMessage) {
      if (gqlMessage.recipient.toB256() !== recipient.toB256()) {
        return null;
      }

      const message: Message = {
        messageId: gqlMessage.messageId,
        sender: gqlMessage.sender,
        recipient: gqlMessage.recipient,
        nonce: hexlify(nonce.toBytes(32)),
        amount: gqlMessage.amount,
        data: gqlMessage.data,
        daHeight: gqlMessage.daHeight,
      };

      return message;
    }

    debug(`Waiting for message with nonce ${nonce}`);
    await delay(FUEL_MESSAGE_POLL_MS);
  }
  return null;
}
