import { writeFileSync } from 'node:fs';

const output = `---\n"@fuel-bridge/fungible-token": patch\n"@fuel-bridge/message-predicates": patch\n"@fuel-bridge/solidity-contracts": patch\n---\n\nincremental\n`;
writeFileSync('.changeset/fuel-labs-ci.md', output);
