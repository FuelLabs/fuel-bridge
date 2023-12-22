import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dataPath = join(__dirname, './save.json');

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
