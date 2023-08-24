import { FuelMessagePortal, FuelMessagePortal__factory } from "@fuel-bridge/portal-contracts";
import { ethers } from "ethers";
import { Provider } from "fuels";
import { waitForBlockCommit } from "./utils/ethers/waitForBlockCommit";
import { createRelayMessageParams } from "./utils/ethers/createRelayParams";

export async function main() {
  const eth_provider_url = `https://sepolia.infura.io/v3/962ee51fbdbe4c4dbc50dd07670017d2`;
  const eth_provider = new ethers.providers.JsonRpcProvider(
    eth_provider_url
  );
  const pk_eth_deployer = 'e0e5969e73cfcedf54bddcf7bee3cdd8b0ec793da94bc2e1f93e0ed3688b5d8d';
  let eth_wallet = new ethers.Wallet(pk_eth_deployer, eth_provider)
  let eth_fuelMessagePortal: FuelMessagePortal =
    FuelMessagePortal__factory.connect(
      "0x03f2901Db5723639978deBed3aBA66d4EA03aF73",
      eth_wallet
    );

    const withdrawMessageProof = await new Provider('https://beta-4.fuel.network/graphql').getMessageProof(
      '0xbd5cf5918dca306e52219bb2dc634ca1513a197222a19211d8227f213daf1c59',
      '0xb367f53a5bcff82f2e029eab463a4b23bb1ace23fc4c479fdcf5f0816446f595',
      '0xc4e5836991d85f48726d61d83bb7695b764da564b60c36f7f3d86782b22866be',
    );
  
    // commit block to L1
    const blockHashCommited = "0xc86f06126f10050aca71bb53a19bc44d20e6ac209b708c4d39248add3669ff39";
    console.log(`blockHashCommited`, blockHashCommited);
  
    const relayMessageParams = await createRelayMessageParams({ fuel: { provider: {url: 'https://beta-4.fuel.network/graphql' }}} as any, withdrawMessageProof, blockHashCommited);

  // relay message on Ethereum
  console.log('Relaying message on Ethereum...\n');
  const eRelayMessageTx = await eth_fuelMessagePortal.relayMessage(
    relayMessageParams.message,
    relayMessageParams.rootBlockHeader,
    relayMessageParams.blockHeader,
    relayMessageParams.blockInHistoryProof,
    relayMessageParams.messageInBlockProof
  );
  const eRelayMessageTxResult = await eRelayMessageTx.wait();

  console.log(`eRelayMessageTxResult`, eRelayMessageTxResult);
}

main();