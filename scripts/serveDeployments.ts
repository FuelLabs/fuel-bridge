import express, { Express } from 'express';

// Script to serve the local deployment addresses

// For localhost testing:
//    - Spin up a node (http://127.0.0.1:8545/ by default):
//        `npx hardhat node`
//    - Run the deploy script or create valid deployments.local.json file
//        `npx hardhat run --network localhost scripts/deploy.ts`
//    - Run this script:
//        `npx ts-node scripts/serveDeployments.ts`

const port = process.env.SERVE_PORT || 8080;
const app: Express = express();

app.use('/', express.static('deployments'));

app.listen(port, () => {
    console.log(`Server is running at https://localhost:${port}`); // eslint-disable-line no-console
});
