import type BlockHeader from '../../protocol/blockHeader';
import {
  ZERO,
  EMPTY,
  CONSENSUS_PARAMETERS_VERSION,
  STATE_TRANSITION_BYTECODE_VERSION,
} from '../../protocol/constants';

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
    consensusParametersVersion: CONSENSUS_PARAMETERS_VERSION,
    stateTransitionBytecodeVersion: STATE_TRANSITION_BYTECODE_VERSION,
    eventInboxRoot: EMPTY,
  };
  return header;
}
