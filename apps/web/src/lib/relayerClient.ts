import "server-only";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MONAD_TESTNET,
  computeRepoId,
  commitHashToBytes32,
  makeLabel,
  noCapRegistryAbi,
} from "@nocap/shared";
import { getRelayerStore } from "./relayerStore";

/**
 * Server-only: signs anchor() calls with the hosted relayer key. Never import this
 * from a client component — `server-only` makes that a build-time error, not just a
 * convention, so the private key can never end up in a browser bundle.
 */

const chainDef = {
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: MONAD_TESTNET.rpcUrls,
} as const;

function getRegistry(): Address {
  const addr = process.env.NEXT_PUBLIC_NOCAP_REGISTRY;
  if (!addr) throw new Error("NEXT_PUBLIC_NOCAP_REGISTRY not set");
  return addr as Address;
}

function getRelayerAccount() {
  const pk = process.env.NOCAP_RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error("NOCAP_RELAYER_PRIVATE_KEY not set");
  return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
}

export type PushCommit = { id: string; message: string; distinct?: boolean };

export type ProcessPushResult = {
  repoId: Hex;
  anchored: string[];
  skipped: { sha: string; reason: string }[];
};

/** Anchor every eligible commit from one GitHub push payload. Called from `after()`
 *  in the webhook route, i.e. runs after the HTTP response has already been sent. */
export async function processPush(
  fullName: string,
  commits: PushCommit[]
): Promise<ProcessPushResult> {
  const repoId = computeRepoId(fullName);
  const registry = getRegistry();
  const publicClient = createPublicClient({ chain: chainDef, transport: http() });

  const anchored: string[] = [];
  const skipped: { sha: string; reason: string }[] = [];

  const enabled = (await publicClient.readContract({
    address: registry,
    abi: noCapRegistryAbi,
    functionName: "relayerEnabled",
    args: [repoId],
  })) as boolean;

  if (!enabled) {
    // Not an error — a webhook can fire for a repo that never opted into hosted
    // anchoring (or was later opted out). Silently ignore rather than spend gas
    // on a transaction the contract would revert anyway.
    return { repoId, anchored, skipped: commits.map((c) => ({ sha: c.id, reason: "not opted in" })) };
  }

  const account = getRelayerAccount();
  const walletClient = createWalletClient({ account, chain: chainDef, transport: http() });
  const store = getRelayerStore();

  // Explicit, locally-incremented nonce. A push can carry several commits, so this
  // function fires multiple sequential writeContract calls from the same account —
  // letting each call independently ask the RPC "what's the next nonce" is unsafe:
  // a public node's pending-nonce view can lag its own mempool by enough that two
  // rapid calls both get told the same nonce, and the second one is silently
  // dropped. Fetching it once and incrementing in memory avoids that race entirely.
  let nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  for (const c of commits) {
    if (c.distinct === false) {
      skipped.push({ sha: c.id, reason: "non-distinct (already on another ref)" });
      continue;
    }
    if (await store.wasAnchored(repoId, c.id)) {
      skipped.push({ sha: c.id, reason: "already anchored" });
      continue;
    }
    const underLimit = await store.checkAndConsumeRateLimit(repoId);
    if (!underLimit) {
      skipped.push({ sha: c.id, reason: "rate limited" });
      continue;
    }

    try {
      const commitHash = commitHashToBytes32(c.id);
      const label = makeLabel(c.id, c.message);
      await walletClient.writeContract({
        address: registry,
        abi: noCapRegistryAbi,
        functionName: "anchor",
        args: [repoId, commitHash, label],
        gas: 120_000n,
        nonce: nonce++,
      });
      await store.markAnchored(repoId, c.id);
      anchored.push(c.id);
    } catch (e) {
      skipped.push({ sha: c.id, reason: e instanceof Error ? e.message : "anchor failed" });
    }
  }

  return { repoId, anchored, skipped };
}
