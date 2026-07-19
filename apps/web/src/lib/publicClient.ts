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

/** Dedicated client for eth_getLogs scans. Prefers NEXT_PUBLIC_SCAN_RPC_URL (e.g.
 *  Envio's HyperRPC — verified to scan this app's entire chain history in ~200ms
 *  vs. tens of seconds on the public RPC's 100-block eth_getLogs cap) when set,
 *  falling back to the main RPC otherwise. This client is ONLY ever used for
 *  getLogs — a HyperRPC-style endpoint doesn't implement eth_call, eth_estimateGas,
 *  or eth_sendRawTransaction, so it must never back contract reads or wallet writes.
 *  No request batching (some RPCs choke on large batches of concurrent getLogs)
 *  and a low retry count so transient throttles fail fast instead of stacking backoff. */
export function getScanClient() {
  const scanRpc = process.env.NEXT_PUBLIC_SCAN_RPC_URL || monadTestnet.rpcUrls.default.http[0];
  return createPublicClient({
    chain: monadTestnet,
    transport: http(scanRpc, {
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
