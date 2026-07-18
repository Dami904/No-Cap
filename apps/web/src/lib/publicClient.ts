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

/** Dedicated client for eth_getLogs scans: no request batching (the public RPC
 *  chokes on large JSON-RPC batches of concurrent getLogs) and a low retry count
 *  so transient throttles fail fast instead of stacking backoff. */
export function getScanClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0], {
      batch: false,
      retryCount: 1,
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
