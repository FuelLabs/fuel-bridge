import { BigNumber as BN } from 'ethers';

// The MessageOutput structure.
class MessageOutput {
	constructor(
		public sender: string,
		public recipient: string,
		public amount: BN,
		public nonce: string,
		public data: string
	) {}
}

export default MessageOutput;
