/**
 * Monad block states (monskills concepts/block-states):
 * Proposed → latest | Voted → safe | Finalized → finalized
 * 400ms blocks / ~800ms finality — labels help judges trust recency.
 */
export type BlockLabel = "pending" | "safe" | "finalized";

export function labelForBlock(
  blockNumber: bigint,
  tips: { latest: bigint; safe: bigint; finalized: bigint }
): BlockLabel {
  if (blockNumber <= tips.finalized) return "finalized";
  if (blockNumber <= tips.safe) return "safe";
  return "pending";
}

export function blockLabelCopy(label: BlockLabel): string {
  switch (label) {
    case "finalized":
      return "finalized";
    case "safe":
      return "safe (QC)";
    default:
      return "pending (proposed)";
  }
}
