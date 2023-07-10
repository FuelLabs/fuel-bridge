import { TestEnvironment } from '../../setup';

export async function waitNextBlock(env: TestEnvironment): Promise<string> {
  const fuelAccount = env.fuel.signers[0];
  // Build a new block to commit the message
  // TODO: we need to wait for the next block in another way when deploying to sepolia
  const resp = await fuelAccount.transfer(fuelAccount.address, 1);
  const result2 = await resp.waitForResult();

  return result2.blockId;
}
