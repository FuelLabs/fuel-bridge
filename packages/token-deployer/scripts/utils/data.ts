import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { bridgeFungibleToken } from '../types/contract-ids.json';

export const dataPath = join(__dirname, `./files/${bridgeFungibleToken}.json`);

export const getData = () => {
  if (existsSync(dataPath)) {
    try {
      const data = JSON.parse(readFileSync(dataPath, 'utf8'));
      return data;
    } catch {
      return {};
    }
  } else {
    return {};
  }
}

export function saveData(data: any) {
  writeFileSync(dataPath, JSON.stringify(data, null, 2));
}
