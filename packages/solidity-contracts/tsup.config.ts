export default {
  sourcemap: true,
  shims: true,
  dts: true,
  treeshake: true,
  format: ['cjs', 'esm'],
  minify: false,
  entry: ['./exports/index.ts'],
};
