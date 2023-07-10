/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import { Provider as FuelProvider, BN, AbstractAddress, Message } from 'fuels';
import { FUEL_MESSAGE_POLL_MS } from '../constants';
import { delay } from '../delay';

// Wait until a message is present in the fuel client
export async function waitForMessage(
  provider: FuelProvider,
  recipient: AbstractAddress,
  nonce: BN,
  timeout: number
): Promise<Message> {
  let startTime = new Date().getTime();
  while (new Date().getTime() - startTime < timeout) {
    let messages = await provider.getMessages(recipient, { first: 1000 });
    for (let message of messages) {
      if (message.nonce.toString() === nonce.toHex(32).toString()) {
        return message;
      }
    }
    await delay(FUEL_MESSAGE_POLL_MS);
  }
  return null;
}
