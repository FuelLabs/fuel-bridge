module.exports = {
  plugins: ['@fuels/prettier-config', 'prettier-plugin-solidity'],
  singleQuote: true,
  semi: true,
  overrides: [
    {
      files: '*.sol',
      options: {
        printWidth: 120,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
        bracketSpacing: false,
      },
    },
  ],
};
