import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import { JsonRpcProvider, Signer } from 'ethers';

dotenv.config();

type TenderlyFork = {
  block_number?: number;
  network_id: string;
  transaction_index?: number;
  initial_balance?: number;
  chain_config?: {
    chain_id: number;
    homestead_block: number;
    dao_fork_support: boolean;
    eip_150_block: number;
    eip_150_hash: string;
    eip_155_block: number;
    eip_158_block: number;
    byzantium_block: number;
    constantinople_block: number;
    petersburg_block: number;
    istanbul_block: number;
    berlin_block: number;
  };
};

export type EthersOnTenderlyFork = {
  id: number;
  provider: JsonRpcProvider;
  blockNumber: number;
  /**
   * map from address to given address' balance
   */
  accounts: { [key: string]: string };
  signers: Signer[];
  removeFork: () => Promise<AxiosResponse<any, any>>;
};

export const anAxiosOnTenderly = () =>
  axios.create({
    baseURL: 'https://api.tenderly.co/api/v1',
    headers: {
      'X-Access-Key': process.env.TENDERLY_ACCESS_KEY,
      'Content-Type': 'application/json',
    },
  });

export async function forkForTest(
  fork: TenderlyFork
): Promise<EthersOnTenderlyFork> {
  const projectUrl = `account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}`;
  const axiosOnTenderly = anAxiosOnTenderly();

  const forkResponse = await axiosOnTenderly.post(`${projectUrl}/fork`, fork);
  const forkId = forkResponse.data.root_transaction.fork_id;

  const provider = new JsonRpcProvider(
    `https://rpc.tenderly.co/fork/${forkId}`
  );

  const bn = (
    forkResponse.data.root_transaction.receipt.blockNumber as string
  ).replace('0x', '');
  const blockNumber: number = Number.parseInt(bn, 16);

  console.info(
    `\nForked with fork id ${forkId} at block number ${blockNumber}\nhttps://dashboard.tenderly.co/${process.env.TENDERLY_USER}/${process.env.TENDERLY_PROJECT}/fork/${forkId}\n`
  );

  const accounts = forkResponse.data.simulation_fork.accounts;
  const signers = await Promise.all(
    Object.keys(accounts).map(async (address) => provider.getSigner(address))
  );

  return {
    provider,
    accounts,
    signers,
    blockNumber,
    id: forkId,
    removeFork: async () => {
      console.log('Removing test fork', forkId);
      return await axiosOnTenderly.delete(`${projectUrl}/fork/${forkId}`);
    },
  };
}