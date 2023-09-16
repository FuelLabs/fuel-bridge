export default {
  sourcemap: true,
  shims: true,
  dts: true,
  treeshake: true,
  format: ['cjs', 'esm'],
  minify: true,
  entry: ['./exports/abi.ts'],
};
