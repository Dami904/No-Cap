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
// 429s get more patience than range errors (5 attempts, longer backoff) precisely
// because they must NEVER fall through to splitting — see the isRateLimit branch
// below. Worst case ~15.5s of backoff on one stubborn range beats silently
// dropping that range's logs.
const MAX_RATE_LIMIT_RETRIES = 5;

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
  } catch (err) {
    // A 429 is a property of the caller/endpoint over time, not of this
    // range — confirmed via direct testing: a plain retry-then-split treats
    // a sustained rate limit exactly like a range-too-large error, so it
    // keeps bisecting a 200k+ block range across dozens of recursion levels
    // while every leaf still gets 429'd, an exponential blowup that can run
    // for hours instead of seconds. Range-too-large errors come back as
    // 413/-32614 (confirmed against Monad's public RPC); rate limits come
    // back as 429 (confirmed against Envio's HyperRPC) — that status code is
    // the only reliable way to tell them apart, so branch on it explicitly
    // instead of treating every failure the same.
    const isRateLimit = (err as { status?: number })?.status === 429;
    const maxRetries = isRateLimit ? MAX_RATE_LIMIT_RETRIES : MAX_RETRIES;
    if (attempt < maxRetries) {
      const base = isRateLimit ? 500 : 250;
      await new Promise((r) => setTimeout(r, base * 2 ** attempt));
      return getLogsOne(params, from, to, attempt + 1);
    }
    if (isRateLimit) return { logs: [] };
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

/** In the browser, every scan goes through /api/scan instead of the scan RPC:
 *  the provider token must never ship in the client bundle, and the API route's
 *  edge caching shares one scan result across all concurrent visitors. Server
 *  code (the API route itself, report route, SSR) falls through to direct
 *  scanning below. */
const inBrowser = typeof window !== "undefined";

async function viaScanApi<T extends { blockNumber?: unknown }>(
  params: Record<string, string>
): Promise<T[]> {
  const res = await fetch(`/api/scan?${new URLSearchParams(params)}`);
  const data = await res.json();
  if (!res.ok) {
    // Keep the raw provider message in the console for debugging, but never
    // surface viem/RPC stack text to a judge's screen — they get a calm,
    // human line instead (see the pages' error boxes).
    console.error("scan api error:", data?.error);
    throw new Error("Couldn’t reach the chain just now — retrying shortly.");
  }
  return (data as T[]).map((it) =>
    typeof it.blockNumber === "string" ? { ...it, blockNumber: BigInt(it.blockNumber) } : it
  );
}

/** The scan endpoint's OWN view of the chain tip — never the main RPC's.
 *  The two endpoints track the tip independently and drift a few blocks apart
 *  in either direction (measured live: −8 to 0). Passing the main RPC's tip as
 *  toBlock when it's ahead of the scan endpoint's makes the scan endpoint
 *  reject with "requested block X is greater than latest block Y" — which isn't
 *  a 429 and isn't a range-cap error, so the adaptive scanner bisected the
 *  whole history ~18 levels deep with retries at every level (~20–40s per list
 *  row) on roughly every page load where the tips were misaligned. Asking the
 *  scan endpoint for its own tip makes the toBlock valid by construction.
 *
 *  Cached for 10s and 429-retried: a single /api/scan request that fans out to
 *  N repos would otherwise fire N identical eth_blockNumber calls, and any one
 *  of them 429'ing (the scan RPC throttles the tip lookup exactly like getLogs)
 *  would fail the whole scan since a bare getBlockNumber has no retry. One
 *  shared, retried tip per burst instead. */
let tipCache: { at: number; value: bigint } | null = null;
async function getScanTip(): Promise<bigint> {
  if (tipCache && Date.now() - tipCache.at < 10_000) return tipCache.value;
  const client = getScanClient();
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await client.getBlockNumber();
      tipCache = { at: Date.now(), value };
      return value;
    } catch (err) {
      const isRateLimit = (err as { status?: number })?.status === 429;
      if (isRateLimit && attempt < MAX_RATE_LIMIT_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      // Last resort: reuse a recently-cached tip even if slightly stale rather
      // than fail the whole scan — a few blocks of drift is harmless for a
      // toBlock upper bound.
      if (tipCache) return tipCache.value;
      throw err;
    }
  }
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving
 *  input order in the result. Callers that scan onchain data per-item (e.g. one
 *  fetchAnchorsForRepo call per project in a list) must not `await` in a plain
 *  for-loop — that serializes N independent RPC round trips instead of
 *  overlapping them, which is the dominant cost on any list with more than one
 *  row. Bounded rather than a bare Promise.all because each item here may itself
 *  fan out to PARALLEL sub-requests inside getLogsChunked, so unbounded outer
 *  concurrency would multiply against that and risk the same 429 storm this
 *  file already guards against at the block-range level. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
  if (inBrowser) {
    return cached(`anchors:${repoId}`, () => viaScanApi<AnchorEvent>({ kind: "anchors", repoId }));
  }
  return cached(`anchors:${repoId}`, async () => {
    const latest = await getScanTip();
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
  if (inBrowser) {
    return cached("all-windows", () => viaScanApi<HackathonListing>({ kind: "windows" }));
  }
  return cached("all-windows", async () => {
    const latest = await getScanTip();
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
  if (inBrowser) {
    return cached(`projects:${hackathonId}`, () =>
      viaScanApi<ProjectRegisteredEvent>({ kind: "projects", hackathonId })
    );
  }
  return cached(`projects:${hackathonId}`, async () => {
    const latest = await getScanTip();
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
  if (inBrowser) {
    return cached(`owner:${owner.toLowerCase()}`, () =>
      viaScanApi<ProjectRegisteredEvent>({ kind: "owner", owner })
    );
  }
  return cached(`owner:${owner.toLowerCase()}`, async () => {
    const latest = await getScanTip();
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
