import type { Contract, Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function getDeploymentByName(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  signer?: Signer
): Promise<Contract | null> {
  const allDeployments = Object.keys(await hre.deployments.all());

  if (!allDeployments.includes(contractName)) {
    console.log(`Cannot find ${contractName}`);
    console.log('Here is the list of available deployments:');
    console.log(allDeployments.map((d) => '- ' + d).join('\n'));
    return null;
  }

  const contract = (await hre.ethers.getContractAt(
    contractName,
    (
      await hre.deployments.get(contractName)
    ).address,
    signer
  )) as unknown as Contract;

  return contract;
}
