import type { HardhatUpgrades } from '@openzeppelin/hardhat-upgrades';
import type { DeployProxyOptions } from '@openzeppelin/hardhat-upgrades/dist/utils';
import type {
  BaseContract,
  ContractFactory,
  ContractRunner,
  Signer,
} from 'ethers';

interface ConstructorWithStatic<T, K> extends Function {
  new (signer: Signer): T; // Instance type
  connect: (address: string, runner?: ContractRunner | null) => K;
}

type DeployProxyResult<K> = [K, { implementation: string; address: string }];

/**
 * @description Helper for openzeppelin 's deployProxy that enforces typings and encapsulates useful deployment information
 * @returns a tuple consisting of [contract, {implementation, address}]
 */
export async function deployProxy<
  T extends ContractFactory,
  K extends BaseContract
>(
  Factory: ConstructorWithStatic<T, K>,
  upgrades: HardhatUpgrades,
  deployer: Signer,
  args: unknown[] = [],
  opts: DeployProxyOptions = {}
): Promise<DeployProxyResult<K>> {
  const initializer = opts?.initializer || 'initialize';
  const factory = new Factory(deployer);
  const contract = await upgrades.deployProxy(factory, args, {
    ...opts,
    initializer,
  });
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await upgrades.erc1967.getImplementationAddress(
    address
  );

  return [
    Factory.connect(await contract.getAddress(), contract.runner),
    { implementation, address },
  ];
}
