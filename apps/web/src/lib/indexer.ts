/**
 * Lightweight event indexer — direct eth_getLogs with optional in-memory cache.
 * Phase 2.5: swap public RPC for a provisioned provider via NEXT_PUBLIC_RPC_URL.
 */
import {
  decodeEventLog,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  hackathonRegistryAbi,
  noCapRegistryAbi,
  type AnchorEvent,
  type ProjectRegisteredEvent,
} from "@nocap/shared";
import { getPublicClient, getScanClient } from "./publicClient";
import { ADDRESSES } from "./config";

type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 30_000;

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Promise.resolve(hit.data as T);
  }
  return fn().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

// Adaptive range scanning: try the full requested range in one call first, and
// only split into smaller windows when the RPC actually rejects it. This is
// near-instant on a provider that can span huge ranges in one shot when scoped
// to a single contract address (Envio's HyperRPC verified to cover this app's
// entire chain history in ~200ms), and still safely degrades on a hard-capped
// RPC (Monad's public endpoint hard-caps eth_getLogs at 100 blocks).
//
// Two failure modes need OPPOSITE responses, and conflating them is a real bug
// this scanner hit twice: a hard range-limit error (e.g. "limited to a 100
// range") means the request can never succeed as-is, so splitting is correct.
// A rate-limit error (e.g. HyperRPC's 429 under concurrent load — confirmed:
// 11 of 15 simultaneous requests got 429'd in testing) means the request is
// fine, just throttled — splitting it makes things WORSE, doubling requests
// against the same limit and amplifying into a retry storm. So every failure
// retries on the SAME range first; only after retries are exhausted does it
// fall back to splitting, which naturally routes rate limits to backoff+retry
// (resolves without ever splitting) and genuine range errors to split (every
// retry of an oversized range fails identically and fast, so the wasted
// retries cost little before falling through).
//
// A bounded-concurrency work queue caps how many requests are ever in flight,
// so — regardless of provider or failure mode — this can't runaway into an
// unthrottled fan-out (the original version of this bug: naive recursive
// Promise.all bisection over a 100-block cap on tens of thousands of blocks
// meant hundreds of thousands of concurrent requests fired at once).
const PARALLEL = 5;
const MAX_RETRIES = 3;

async function getLogsOne(
  params: {
    address: Address;
    event: (typeof noCapRegistryAbi)[number];
    args?: Record<string, unknown>;
  },
  from: bigint,
  to: bigint,
  attempt = 0
): Promise<{ logs: Log[]; splitInto?: [bigint, bigint][] }> {
  const client = getScanClient();
  try {
    const logs = (await client.getLogs({
      address: params.address,
      event: params.event as never,
      args: params.args as never,
      fromBlock: from,
      toBlock: to,
    })) as Log[];
    return { logs };
  } catch {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      return getLogsOne(params, from, to, attempt + 1);
    }
    if (to > from) {
      const mid = from + (to - from) / 2n;
      return { logs: [], splitInto: [[from, mid], [mid + 1n, to]] };
    }
    return { logs: [] };
  }
}

async function getLogsChunked(params: {
  address: Address;
  event: (typeof noCapRegistryAbi)[number];
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<Log[]> {
  const { fromBlock, toBlock, ...rest } = params;
  if (fromBlock > toBlock) return [];

  const allLogs: Log[] = [];
  const queue: [bigint, bigint][] = [[fromBlock, toBlock]];
  const inFlight = new Set<Promise<void>>();

  function launch(from: bigint, to: bigint) {
    const p = getLogsOne(rest, from, to).then((result) => {
      allLogs.push(...result.logs);
      if (result.splitInto) queue.push(...result.splitInto);
    });
    const tracked = p.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  }

  while (queue.length > 0 || inFlight.size > 0) {
    while (queue.length > 0 && inFlight.size < PARALLEL) {
      const next = queue.shift()!;
      launch(next[0], next[1]);
    }
    if (inFlight.size > 0) await Promise.race(inFlight);
  }
  return allLogs;
}

function decodeAnchored(log: Log): AnchorEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: noCapRegistryAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "Anchored") return null;
    const args = decoded.args as {
      builder: Address;
      repoId: Hex;
      commitHash: Hex;
      label: string;
      timestamp: bigint;
    };
    return {
      builder: args.builder,
      repoId: args.repoId,
      commitHash: args.commitHash,
      label: args.label,
      timestamp: Number(args.timestamp),
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber ?? 0n,
    };
  } catch {
    return null;
  }
}

function decodeRegistered(log: Log): ProjectRegisteredEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: noCapRegistryAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "ProjectRegistered") return null;
    const args = decoded.args as {
      builder: Address;
      repoId: Hex;
      hackathonId: Hex;
      repoUrl: string;
      registeredAt: bigint;
    };
    return {
      builder: args.builder,
      repoId: args.repoId,
      hackathonId: args.hackathonId,
      repoUrl: args.repoUrl,
      registeredAt: Number(args.registeredAt),
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber ?? 0n,
    };
  } catch {
    return null;
  }
}

export async function fetchAnchorsForRepo(repoId: Hex): Promise<AnchorEvent[]> {
  if (ADDRESSES.registry === "0x0000000000000000000000000000000000000000") {
    return [];
  }
  return cached(`anchors:${repoId}`, async () => {
    const client = getPublicClient();
    const latest = await client.getBlockNumber();
    const fromBlock = ADDRESSES.deploymentBlock > 0n ? ADDRESSES.deploymentBlock : 0n;
    const event = noCapRegistryAbi.find((x) => x.type === "event" && x.name === "Anchored")!;
    const logs = await getLogsChunked({
      address: ADDRESSES.registry,
      event,
      args: { repoId },
      fromBlock,
      toBlock: latest,
    });
    return logs
      .map(decodeAnchored)
      .filter((x): x is AnchorEvent => x != null)
      .sort((a, b) => a.timestamp - b.timestamp);
  });
}

export type HackathonListing = RepoWindow & {
  organizer: Address;
  blockNumber: bigint;
};

/** Enumerate every hackathon window ever seeded (WindowRegistered events).
 *  Windows can be updated, so we keep the latest event per hackathonId. */
export async function fetchAllWindows(): Promise<HackathonListing[]> {
  if (ADDRESSES.hackathonRegistry === "0x0000000000000000000000000000000000000000") {
    return [];
  }
  return cached("all-windows", async () => {
    const client = getPublicClient();
    const latest = await client.getBlockNumber();
    const fromBlock =
      ADDRESSES.hackathonDeploymentBlock > 0n ? ADDRESSES.hackathonDeploymentBlock : 0n;
    const event = hackathonRegistryAbi.find(
      (x) => x.type === "event" && x.name === "WindowRegistered"
    )!;
    const logs = await getLogsChunked({
      address: ADDRESSES.hackathonRegistry,
      event: event as never,
      fromBlock,
      toBlock: latest,
    });
    const byId = new Map<string, HackathonListing>();
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: hackathonRegistryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "WindowRegistered") continue;
        const args = decoded.args as {
          hackathonId: Hex;
          organizer: Address;
          name: string;
          startTime: bigint;
          endTime: bigint;
        };
        const blockNumber = log.blockNumber ?? 0n;
        const prev = byId.get(args.hackathonId);
        if (!prev || blockNumber >= prev.blockNumber) {
          byId.set(args.hackathonId, {
            hackathonId: args.hackathonId,
            name: args.name,
            startTime: Number(args.startTime),
            endTime: Number(args.endTime),
            organizer: args.organizer,
            blockNumber,
          });
        }
      } catch {
        // skip undecodable log
      }
    }
    return [...byId.values()].sort((a, b) => a.startTime - b.startTime);
  });
}

export async function fetchProjectsForHackathon(
  hackathonId: Hex
): Promise<ProjectRegisteredEvent[]> {
  if (ADDRESSES.registry === "0x0000000000000000000000000000000000000000") {
    return [];
  }
  return cached(`projects:${hackathonId}`, async () => {
    const client = getPublicClient();
    const latest = await client.getBlockNumber();
    const fromBlock = ADDRESSES.deploymentBlock > 0n ? ADDRESSES.deploymentBlock : 0n;
    const event = noCapRegistryAbi.find(
      (x) => x.type === "event" && x.name === "ProjectRegistered"
    )!;
    const logs = await getLogsChunked({
      address: ADDRESSES.registry,
      event,
      args: { hackathonId },
      fromBlock,
      toBlock: latest,
    });
    return logs
      .map(decodeRegistered)
      .filter((x): x is ProjectRegisteredEvent => x != null)
      .sort((a, b) => a.registeredAt - b.registeredAt);
  });
}

export async function fetchProjectsByOwner(owner: Address): Promise<ProjectRegisteredEvent[]> {
  if (ADDRESSES.registry === "0x0000000000000000000000000000000000000000") {
    return [];
  }
  return cached(`owner:${owner.toLowerCase()}`, async () => {
    const client = getPublicClient();
    const latest = await client.getBlockNumber();
    const fromBlock = ADDRESSES.deploymentBlock > 0n ? ADDRESSES.deploymentBlock : 0n;
    const event = noCapRegistryAbi.find(
      (x) => x.type === "event" && x.name === "ProjectRegistered"
    )!;
    const logs = await getLogsChunked({
      address: ADDRESSES.registry,
      event,
      args: { builder: owner },
      fromBlock,
      toBlock: latest,
    });
    return logs
      .map(decodeRegistered)
      .filter((x): x is ProjectRegisteredEvent => x != null)
      .sort((a, b) => a.registeredAt - b.registeredAt);
  });
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export type RepoWindow = {
  hackathonId: Hex;
  startTime: number;
  endTime: number;
  name: string;
};

/** Resolve a hackathon window straight from the HackathonRegistry contract.
 *  Returns null when the window was never seeded. */
export async function getWindowById(hackathonId: Hex): Promise<RepoWindow | null> {
  if (ADDRESSES.hackathonRegistry === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return cached(`window-id:${hackathonId}`, async () => {
    const client = getPublicClient();
    const [startTime, endTime, name, exists] = (await client.readContract({
      address: ADDRESSES.hackathonRegistry,
      abi: hackathonRegistryAbi,
      functionName: "getWindow",
      args: [hackathonId],
    })) as [bigint, bigint, string, boolean];
    if (!exists) return null;
    return {
      hackathonId,
      startTime: Number(startTime),
      endTime: Number(endTime),
      name,
    };
  });
}

/** The hackathon window this repo registered under (multi-hackathon support).
 *  Returns null when the repo has no hackathon association or the window
 *  doesn't exist — callers fall back to the default window. */
export async function getRepoWindow(repoId: Hex): Promise<RepoWindow | null> {
  if (
    ADDRESSES.registry === "0x0000000000000000000000000000000000000000" ||
    ADDRESSES.hackathonRegistry === "0x0000000000000000000000000000000000000000"
  ) {
    return null;
  }
  return cached(`window:${repoId}`, async () => {
    const client = getPublicClient();
    const hackathonId = (await client.readContract({
      address: ADDRESSES.registry,
      abi: noCapRegistryAbi,
      functionName: "repoHackathon",
      args: [repoId],
    })) as Hex;
    if (!hackathonId || hackathonId === ZERO_BYTES32) return null;
    const [startTime, endTime, name, exists] = (await client.readContract({
      address: ADDRESSES.hackathonRegistry,
      abi: hackathonRegistryAbi,
      functionName: "getWindow",
      args: [hackathonId],
    })) as [bigint, bigint, string, boolean];
    if (!exists) return null;
    return {
      hackathonId,
      startTime: Number(startTime),
      endTime: Number(endTime),
      name,
    };
  });
}

export async function getRepoOwner(repoId: Hex): Promise<Address | null> {
  if (ADDRESSES.registry === "0x0000000000000000000000000000000000000000") return null;
  const client = getPublicClient();
  const owner = await client.readContract({
    address: ADDRESSES.registry,
    abi: noCapRegistryAbi,
    functionName: "repoOwner",
    args: [repoId],
  });
  if (owner === "0x0000000000000000000000000000000000000000") return null;
  return owner as Address;
}

export async function getRepoUrl(repoId: Hex): Promise<string> {
  if (ADDRESSES.registry === "0x0000000000000000000000000000000000000000") return "";
  const client = getPublicClient();
  try {
    return (await client.readContract({
      address: ADDRESSES.registry,
      abi: noCapRegistryAbi,
      functionName: "repoUrlOf",
      args: [repoId],
    })) as string;
  } catch {
    return "";
  }
}
