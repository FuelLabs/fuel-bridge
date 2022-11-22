import chai from 'chai';
import { uintToBytes32 } from '../utils';
import { calcRoot } from './binaryMerkleTree';

const { expect } = chai;

describe('Binary Merkle Tree', async () => {
	it('Compute root', async () => {
		/// Root from Go implementation : Size = 100; data[i] = bytes32(i)
		const rootAfterLeaves =
			'0x9e59abcd7c89011ba919f9141624acb32b4cc31c24e76c6d4f64b25093ef366c';

		const data = [];
		const size = 100;
		for (let i = 0; i < size; i += 1) {
			data.push(uintToBytes32(i));
		}
		const res = calcRoot(data);

		// Compare results
		expect(res).to.be.equal(rootAfterLeaves);
	});
});
