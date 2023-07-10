const { hexlify } = require('fuels');
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');
// Set paths
const CONTRACT_PATH = join(__dirname, '../out/contract_message_predicate.bin');
const SCRIPT_PATH = join(__dirname, '../out/contract_message_script.bin');
const DIST_FOLDER = join(__dirname, '../dist');
const DIST_FILE = join(DIST_FOLDER, '/index.ts');
// Read files
const contractMessagePredicate = readFileSync(CONTRACT_PATH);
const contractMessageScript = readFileSync(SCRIPT_PATH);
// Create export
function createExport(name, value) {
    return `export const ${name} = "${value}";`;
}
// Write file
mkdirSync(DIST_FOLDER, { recursive: true });
writeFileSync(DIST_FILE, [
    createExport("contractMessagePredicate", hexlify(contractMessagePredicate)),
    createExport("contractMessageScript", hexlify(contractMessageScript)),
].join('\n'));
