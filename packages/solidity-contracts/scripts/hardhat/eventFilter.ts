import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { writeFileSync } from 'fs';

task(
  'grant-role-event-filter',
  'Filters grant role event for a specific contract to keep track of assigned roles'
)
  .addParam('contract', 'address of the contract')
  .setAction(
    async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
      const provider = new hre.ethers.JsonRpcProvider(process.env.RPC_URL);

      // fetching the abi from the artifacts would require the contract name as an input so avoiding that
      const grantRoleEvenABI = [
        {
          inputs: [
            {
              internalType: 'bytes32',
              name: 'role',
              type: 'bytes32',
            },
            {
              internalType: 'address',
              name: 'account',
              type: 'address',
            },
          ],
          name: 'hasRole',
          outputs: [
            {
              internalType: 'bool',
              name: '',
              type: 'bool',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
        {
          anonymous: false,
          inputs: [
            {
              indexed: true,
              internalType: 'bytes32',
              name: 'role',
              type: 'bytes32',
            },
            {
              indexed: true,
              internalType: 'address',
              name: 'account',
              type: 'address',
            },
            {
              indexed: true,
              internalType: 'address',
              name: 'sender',
              type: 'address',
            },
          ],
          name: 'RoleGranted',
          type: 'event',
        },
      ];

      // existing roles
      const DEFAULT_ADMIN_ROLE = hre.ethers.ZeroHash;
      const PAUSER_ROLE = hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes('PAUSER_ROLE')
      );
      const COMMITTER_ROLE = hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes('COMMITTER_ROLE')
      );
      const SET_RATE_LIMITER_ROLE = hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes('SET_RATE_LIMITER_ROLE')
      );

      const FROM_BLOCK = 20620432;

      const roles = [
        { name: 'DEFAULT_ADMIN_ROLE', value: DEFAULT_ADMIN_ROLE },
        { name: 'PAUSER_ROLE', value: PAUSER_ROLE },
        { name: 'COMMITTER_ROLE', value: COMMITTER_ROLE },
        { name: 'SET_RATE_LIMITER_ROLE', value: SET_RATE_LIMITER_ROLE },
      ];

      const contract = new hre.ethers.Contract(
        taskArgs.contract,
        grantRoleEvenABI,
        provider
      );

      const eventPayload: any = [];

      try {
        const events = await contract.queryFilter(
          contract.filters.RoleGranted(),
          FROM_BLOCK
        );

        // check for duplicate events (where the role id and the account are the same)
        const filteredEvents = events.reduce((previous, current) => {
          const isDuplicate = previous.find(
            (event) =>
              event.args[0] === current.args[0] &&
              event.args[1] === current.args[1]
          );

          if (!isDuplicate) {
            return previous.concat([current]);
          } else {
            return previous;
          }
        }, []);

        for (const event of filteredEvents) {
          const eventArgs: any = {};

          // only checking for active roles
          const hasRole = await contract.hasRole(event.args[0], event.args[1]);
          if (hasRole) {
            // computing the `role` in a readable format
            eventArgs.role =
              roles.find((role) => role.value === event.args[0])?.name ||
              'UNKNOWN_ROLE';
            eventArgs.account = event.args[1];

            eventPayload.push(eventArgs);
          }
        }

        writeFileSync('grantedRoles.json', JSON.stringify(eventPayload, undefined, 2));
      } catch (error) {
        throw new Error(`Unable to filter and query events: ${error}`);
      }
    }
  );
