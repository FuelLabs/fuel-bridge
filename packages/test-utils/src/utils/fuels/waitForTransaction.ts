/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import type {
  Provider as FuelProvider,
  Message,
  TransactionResponse,
} from 'fuels';

import { FUEL_MESSAGE_POLL_MS } from '../constants';
import { delay } from '../delay';
import { debug } from '../logs';

type Opts = {
  relayedTxId?: string; // This ID will only appear if the tx fails
  timeout?: number;
};

type Result = {
  response: TransactionResponse | null;
  error: string | null;
};

/**
 * @description waits until a transaction has been included. Used mainly in FTI
 * @param provider
 * @param recipient
 * @param nonce
 * @param timeout
 * @returns
 */
export async function waitForTransaction(
  transactionId: string,
  provider: FuelProvider,
  opts: Opts,
  timePassed = 0
): Promise<Result> {
  debug(`Waiting for transaction ${transactionId}`);
  const startTime = new Date().getTime();

  if (opts.relayedTxId) {
    // Note: getRelayedTransactionStatus will only return if the transaction failed
    const relayedTxError = await provider.getRelayedTransactionStatus(
      opts.relayedTxId
    );

    if (relayedTxError) {
      return { response: null, error: relayedTxError.failure };
    }
  }

  const tx = await provider.getTransaction(transactionId);

  if (!tx) {
    if (opts?.timeout && timePassed > opts?.timeout) {
      throw new Error(`Waiting for ${transactionId} timed out`);
    }

    await delay(FUEL_MESSAGE_POLL_MS);

    timePassed += new Date().getTime() - startTime;

    return waitForTransaction(transactionId, provider, opts, timePassed);
  }

  return {
    response: await provider.getTransactionResponse(transactionId),
    error: null,
  };
}
