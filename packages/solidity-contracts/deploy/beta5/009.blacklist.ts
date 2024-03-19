import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortalV3 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    deployments: { get },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address } = await get('FuelMessagePortal');

  const portal = FuelMessagePortalV3.connect(address, deployer);

  const ids = [
    '0xbcd10505135317db748919fbe2e6661e25b7b8e422bc4b0fc78795ef8317596e',
    '0x8a1f8ad4405b65bb4d55fd17146d8616bd2e69406279f7b1efc10025a98a3e1f',
    '0x051f300b313f97aedf2a6cad11cb28dde974e87cfeb010380d5b38c529ca9fd6',
    '0x9188f3ca9d4859d29921d7bbec8e67facfdb777baf38580af0ba148cb06789b9',
    '0xa7e52bff50165d231782737151bacf825733d05b5549d18d15a130e42309aa03',
    '0x27c8678303ccf8bec16a56ddb36f99863a9eb50eab02ede6e742d323d1ab137d',
    '0x3398c3bf8e64c50d6db9c8c08fc3962f7bcedaedd74fe631a5d285e2ba36b74b',
    '0x7362bbfe6c06eb79b2c95bd18b96ae62abd6cb1b0acd5c944e73e5a9eddb77a2',
    '0x2b963f3d9be31cb11cf4c90cd2718aa0755826127f33109d6d841078dd77e67d',
    '0xf0bede8b897a07fec1d41767060c5cd43478c157a777190e1fa0898cf8be0608',
    '0x8cb5a6007e72e896fe245dc888fbaccde5e5aac3380566d03fa3f14cb392c622',
    '0x67131ba7e45ebe53550322b61e18e20ebfb17a846d91bc7b64fb0c04d4f23006',
    '0xe7396ff778ceca390d936fc904d11f712e465fbf77cad9f22fe3521298bb3087',
    '0x08673a0337453179c9567c8ee789ef3315f215c48a152dd6c104cb131a1f6675',
  ];

  for (const id of ids) {
    const isBlacklisted = await portal.messageIsBlacklisted(id);
    if (isBlacklisted) {
      console.log('id', id, 'already blacklisted, skipping');
      continue;
    }
    console.log('Blacklisting', id);
    await portal
      .setMessageBlacklist(id, true)
      .then((tx) => {
        console.log('Sending tx', tx.hash);
        return tx.wait();
      })
      .then(() => console.log('Confirmed'));
  }

  return true;
};

func.tags = ['blacklist'];
func.id = 'blacklist';
export default func;
