import { hexlify } from '@fuel-ts/utils';
import { readFileSync } from 'fs';

export const esbuildBinLoader = {
  name: 'bin-loader',
  setup(build) {
    build.onLoad(
      {
        filter: /.bin$/,
      },
      (args) => {
        const fileContent = readFileSync(args.path);
        return {
          contents: hexlify(fileContent),
          loader: 'text',
        };
      }
    );
  },
};
