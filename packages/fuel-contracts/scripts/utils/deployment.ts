import { promises as fs } from 'fs';

const DEPLOYMENTS_FILE = './deployments/deployments.json';

// Saves the deployed addresses.
export async function saveDeploymentsFile(input: {
  fuelFungibleTokenId: string
}) {
  await fs.writeFile(DEPLOYMENTS_FILE, JSON.stringify(input, null, ' '), 'utf-8');
}