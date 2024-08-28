import { esbuildBinLoader } from '@fuel-bridge/esbuild-bin-loader';

export default {
  sourcemap: true,
  shims: true,
  dts: true,
  treeshake: true,
  esbuildPlugins: [esbuildBinLoader],
  format: ['cjs', 'esm'],
  minify: false,
  external: [
    "bn.js",
    "bech32",
    "webidl-conversions",
    "whatwg-url",
    "tr46"
  ],
  entry: ['./exports/index.ts'],
};
