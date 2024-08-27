/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import type {
  Provider as FuelProvider,
  BN,
  AbstractAddress,
  Message,
} from 'fuels';

import { FUEL_MESSAGE_POLL_MS } from '../constants';
import { delay } from '../delay';
import { debug } from '../logs';

const PAGINATION_LIMIT = 512;

// Wait until a message is present in the fuel client
export async function waitForMessage(
  provider: FuelProvider,
  recipient: AbstractAddress,
  nonce: BN,
  timeout: number
): Promise<Message> {
  const startTime = new Date().getTime();
  while (new Date().getTime() - startTime < timeout) {
    const { messages } = await provider.getMessages(recipient, {
      first: PAGINATION_LIMIT,
    });

    for (const message of messages) {
      if (message.nonce.toString() === nonce.toHex(32).toString()) {
        return message;
      } else {
        debug(`Waiting for message with nonce ${nonce}`);
      }
    }
    await delay(FUEL_MESSAGE_POLL_MS);
  }
  return null;
}
