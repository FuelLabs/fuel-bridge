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

      const grantRoleEvenABI = [
        'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
      ];

      const contract = new hre.ethers.Contract(
        taskArgs.contract,
        grantRoleEvenABI,
        provider
      );

      const eventPayload: any = [];

      try {
        const events = await contract.queryFilter(
          contract.filters.RoleGranted()
        );

        events.forEach((event: any) => {
          // Typing bug in the `event` type
          const eventArgs: any = {};
          eventArgs.role = event.args[0];
          eventArgs.account = event.args[1];
          eventArgs.sender = event.args[2];

          eventPayload.push(eventArgs);
        });

        writeFileSync('grantedRoles.json', JSON.stringify(eventPayload));
      } catch (error) {
        throw new Error(`Unable to filter and query events: ${error}`);
      }
    }
  );
