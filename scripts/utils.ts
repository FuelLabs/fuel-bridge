/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import { ethers, BigNumber } from 'ethers';
import {
  Provider as FuelProvider,
  BN,
  AbstractAddress,
  Message,
  WalletUnlocked as FuelWallet,
  ZeroBytes32,
  ScriptTransactionRequest,
  TransactionRequestLike,
  arrayify,
  InputType,
  hexlify,
  OutputType,
  TransactionResponse,
  bn,
} from 'fuels';

// Constants
const ETHEREUM_ETH_DECIMALS: number = 18;
const FUEL_ETH_DECIMALS: number = 9;
const FUEL_MESSAGE_POLL_MS: number = 300;
const MAX_GAS_PER_TX = bn(100000000);

// Parse ETH value as a string
export function fuels_parseEther(ether: string): BN {
  let val = ethers.utils.parseEther(ether);
  val = val.div(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
  return new BN(val.toHexString());
}

// Format ETH value to a string
export function fuels_formatEther(ether: BN): string {
  let val = BigNumber.from(ether.toHex());
  val = val.mul(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
  return ethers.utils.formatEther(val);
}

// Parse any string value using the given decimal amount
export function fuels_parseToken(value: string, decimals: number = 9): BN {
  let val = ethers.utils.parseEther(value);
  val = val.div(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return new BN(val.toHexString());
}

// Format any value to a string using the given decimal amount
export function fuels_formatToken(value: BN, decimals: number = 9): string {
  let val = BigNumber.from(value.toHex());
  val = val.mul(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return ethers.utils.formatEther(val);
}

// Parse any string value using the given decimal amount
export function ethers_parseToken(value: string, decimals: number = 18): BigNumber {
  let val = ethers.utils.parseEther(value);
  return val.div(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
}

// Format any value to a string using the given decimal amount
export function ethers_formatToken(value: BigNumber, decimals: number = 18): string {
  value = value.mul(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return ethers.utils.formatEther(value);
}

// Wait until a message is present in the fuel client
export async function fuels_waitForMessage(
  provider: FuelProvider,
  recipient: AbstractAddress,
  nonce: BN,
  timeout: number
): Promise<Message> {
  let startTime = new Date().getTime();
  while (new Date().getTime() - startTime < timeout) {
    let messages = await provider.getMessages(recipient, { first: 1000 });
    for (let message of messages) {
      if (message.nonce.eq(nonce)) {
        return message;
      }
    }
    await delay(FUEL_MESSAGE_POLL_MS);
  }
  return null;
}

// Relay commonly used messages with predicates spendable by anyone
export async function fuels_relayCommonMessage(
  relayer: FuelWallet,
  message: Message,
  txParams: Pick<TransactionRequestLike, 'gasLimit' | 'gasPrice' | 'maturity'> = {}
): Promise<TransactionResponse> {
  // find the relay details for the specified message
  let messageRelayDetails: CommonMessageDetails = null;
  for (let details of COMMON_RELAYABLE_MESSAGES) {
    if (details.predicateRoot == message.recipient.toHexString()) {
      messageRelayDetails = details;
      break;
    }
  }
  if (messageRelayDetails == null) throw new Error('message is not a common relayable message');

  // build and send transaction
  let transaction = await messageRelayDetails.buildTx(relayer, message, messageRelayDetails, txParams);
  return relayer.sendTransaction(transaction);
}

// Simple async delay function
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Details for relaying common messages with certain predicate roots
const COMMON_RELAYABLE_MESSAGES: CommonMessageDetails[] = [
  {
    name: 'Message To Contract v1.2',
    predicateRoot: '0x4df15e4a7c602404e353b7766db23a0d067960c201eb2d7a695a166548c4d80a',
    predicate:
      '0x900000044700000000000000000002805DFCC00110FFF3001A585000910000E8504D60A0504160C85D47F00F10451300504160C860411020504160C86148000B614400054041244072440020284D04405D47F010104513005040002029413450134100007340009E614400075D43F00813411400134100007340009C6140010113410040134100007340009A614411015D43F0091341140013410000734000985D43F0096141010113410000134100007340009650556020614401137240002028551400505160406144111A5D43F00A15411400734000385D43F00A134114001341000073400094504D60606148111D5D43F00B124404005D43F00B1B4104401045240050496080724000202849140072400020284D2400724000202851340050400020294155101341000073400092504960005D43F0096145010672400020284914005D47F00F1045130050400020294124501341000073400090614400085D43F00813411400134100007340008E6140020113410040134100007340008C614412015D43F00813411400134100007340008A5D43F009614502015D43F00C134114001341000073400088614002051341000013410000734000865D43F00961490105614400025D43F00D1B4514001541244073400077134124401341000073400084614400035D43F00D154114007340007F5D43F00D134114001341000073400082240400005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E364000005D43F00E36400000000000000000000000000000000000000000000000000000000000000000000094DE8159A7879EDADA9B0837456A917D4BA4F1EB68CAE2D63AD3DC080BB4B372000000000000000300000000000000020000000000000020000000000000000800000000000000040000000000124F80FFFFFFFFFFFF0004000000000000028000000000000002A0',
    script:
      '0x900000044700000000000000000000605DFCC00110FFF3001A40500091000050504D00005049003061440113724000202849140050413000604120205D43F0005F4D00045F4C1005614411171A40A0005D4BF005104923002D4D149024040000000000009532D7AE00000000000000000000000000000000000000000000000000000000000000000000000000000068',
    buildTx: async (
      relayer: FuelWallet,
      message: Message,
      details: CommonMessageDetails,
      txParams: Pick<TransactionRequestLike, 'gasLimit' | 'gasPrice' | 'maturity'>
    ): Promise<ScriptTransactionRequest> => {
      //TODO: minGas should be much lower and more in line with what the predicate actually verifies (currently 1200000)
      const minGas: number = 500000000000;
      const script = arrayify(details.script);
      const predicate = arrayify(details.predicate);

      // find a UTXO that can cover gas costs
      let coins = (await relayer.getCoins()).filter((coin) => coin.assetId == ZeroBytes32 && coin.status == "UNSPENT" && coin.amount.gt(minGas));
      if (coins.length == 0) throw new Error('wallet has no single UTXO that can cover gas costs');
      let gas_coin = coins[0];

      // get contract id
      const data = arrayify(message.data);
      if (data.length < 32) throw new Error('cannot find contract ID in message data');
      const contractId = hexlify(data.slice(0, 32));

      // build the transaction
      const transaction = new ScriptTransactionRequest({ script, gasLimit: minGas, ...txParams });
      transaction.inputs.push({
        type: InputType.Contract,
        txPointer: ZeroBytes32,
        contractId: contractId,
      });
      transaction.inputs.push({
        type: InputType.Message,
        amount: message.amount,
        sender: message.sender.toHexString(),
        recipient: message.recipient.toHexString(),
        witnessIndex: 0,
        data: message.data,
        nonce: message.nonce,
        predicate: predicate,
      });
      transaction.inputs.push({
        type: InputType.Coin,
        id: gas_coin.id,
        owner: hexlify(gas_coin.owner.toBytes()),
        amount: gas_coin.amount,
        assetId: ZeroBytes32,
        txPointer: ZeroBytes32,
        witnessIndex: 0,
      });
      transaction.outputs.push({
        type: OutputType.Contract,
        inputIndex: 0,
      });
      transaction.outputs.push({
        type: OutputType.Change,
        to: hexlify(gas_coin.owner.toBytes()),
        assetId: ZeroBytes32,
      });
      transaction.outputs.push({
        type: OutputType.Variable,
      });
      transaction.witnesses.push('0x');

      return transaction;
    },
  },
];
type CommonMessageDetails = {
  name: string;
  predicateRoot: string;
  predicate: string;
  script: string;
  buildTx: (
    relayer: FuelWallet,
    message: Message,
    details: CommonMessageDetails,
    txParams: Pick<TransactionRequestLike, 'gasLimit' | 'gasPrice' | 'maturity'>
  ) => Promise<ScriptTransactionRequest>;
};
