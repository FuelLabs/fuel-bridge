import { esbuildBinLoader } from '@fuel-bridge/esbuild-bin-loader';

export default {
  sourcemap: true,
  shims: true,
  dts: true,
  treeshake: true,
  esbuildPlugins: [esbuildBinLoader],
  format: ['cjs', 'esm'],
  minify: true,
  entry: ['./exports/index.ts'],
};
