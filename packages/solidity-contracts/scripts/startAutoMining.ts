import { JsonRpcProvider } from 'ethers';

export async function startAutoMining() {
  console.log('Start auto mining...');
  console.log('evm_setAutomine...');

  const provider = new JsonRpcProvider(process.env.RPC_URL);

  await provider.send('evm_setAutomine', [true]);
  console.log('evm_setIntervalMining...');
  await provider.send('evm_setIntervalMining', [30000]);
  console.log('finish...');
}

startAutoMining()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
