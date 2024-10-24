import { confirm } from '@inquirer/prompts';

export async function requireConfirmation() {
  await confirm({ message: 'Confirm' });
}
