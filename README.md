# Fuel Messaging Bridge Integration Tests

Integration tests for the Fuel Messaging Bridge.

## Building From Source

### Dependencies

| dep     | version                                                  |
| ------- | -------------------------------------------------------- |
| Node.js | [>=v14.0.0](https://nodejs.org/en/blog/release/v14.0.0/) |

### Building

Install dependencies:

```sh
npm ci
```

### Running Tests

Before running the integration tests, you need to spin up a full development stack complete with an Ethereum client and Fuel client. You can use the easy docker setup detailed [here](./_fuel_dev_environment).

Run tests:

```sh
npm test
```

## License

The primary license for this repo is `UNLICENSED`, see [`LICENSE`](./LICENSE).
