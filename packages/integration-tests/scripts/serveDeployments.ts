import express, { Express } from 'express';

const port = process.env.SERVE_PORT || 8080;
const app: Express = express();

app.use('/', express.static('deployments'));

app.listen(port, () => {
  console.log(`Server is running at https://localhost:${port}`); // eslint-disable-line no-console
});
