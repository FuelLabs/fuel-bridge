import { bn } from 'fuels';

import { getConfigs } from './config';
import { saveData } from './utils/data';

async function registerBridge() {
    const { data, provider, tknContract } = await getConfigs();
    const { transactionId } = data;
 
    if (transactionId) {
        console.log('Bridge already registered!');
        return;
    }
    console.log('Register bridge!');
    const { minGasPrice } = provider.getNode();
    const result = await tknContract.functions
        .register_bridge()
        .txParams({
            gasPrice: minGasPrice,
            gasLimit: bn(100_000),
        })
        .call();
    
    if (result.transactionResult.status === 'success') {
        console.log('Wait for block to be finalized. TxId:', result.transactionId);
        saveData({
            transactionId: result.transactionId,
        });
    }
}

registerBridge()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })