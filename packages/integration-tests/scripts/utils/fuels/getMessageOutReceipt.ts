import {
  Receipt,
  ReceiptType,
  TransactionResultMessageOutReceipt,
} from 'fuels';

export function getMessageOutReceipt(receipts: Array<Receipt>) {
  const messageOutReceipt = receipts.find(
    (r) => r.type === ReceiptType.MessageOut
  ) as TransactionResultMessageOutReceipt;

  if (!messageOutReceipt) {
    throw new Error('Failed to get message out receipt');
  }

  return messageOutReceipt;
}
