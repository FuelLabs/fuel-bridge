import { password } from '@inquirer/prompts';

export async function enterPrivateKey() {
  return await password({ message: 'Enter private key' });
}
