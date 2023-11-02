import type BlockHeader from '../../protocol/blockHeader';
import { ZERO, EMPTY } from '../../protocol/constants';

// Create a simple block
export function createBlock(
  prevRoot: string,
  blockHeight: number,
  timestamp?: string,
  outputMessagesCount?: string,
  outputMessagesRoot?: string
): BlockHeader {
  const header: BlockHeader = {
    prevRoot: prevRoot ? prevRoot : ZERO,
    height: blockHeight.toString(),
    timestamp: timestamp ? timestamp : '0',
    daHeight: '0',
    txCount: '0',
    outputMessagesCount: outputMessagesCount ? outputMessagesCount : '0',
    txRoot: EMPTY,
    outputMessagesRoot: outputMessagesRoot ? outputMessagesRoot : ZERO,
  };
  return header;
}
