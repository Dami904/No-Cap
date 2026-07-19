import { createPublicClient, http } from "viem";
import { monadTestnet } from "./chain";

export function getPublicClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0], {
      batch: true,
      retryCount: 3,
    }),
  });
}

/** Tips for Monad block-state labels (concepts/). */
export async function getBlockTips() {
  const client = getPublicClient();
  const [latest, safe, finalized] = await Promise.all([
    client.getBlockNumber({ cacheTime: 0 }),
    client.getBlock({ blockTag: "safe" }).then((b) => b.number).catch(() => 0n),
    client.getBlock({ blockTag: "finalized" }).then((b) => b.number).catch(() => 0n),
  ]);
  return {
    latest,
    safe: safe || latest,
    finalized: finalized || latest,
  };
}
