/**
 * Read layer for onchain provenance data.
 *
 * Event history (anchors, projects, hackathon windows) is served by the Envio
 * HyperIndex GraphQL database via NEXT_PUBLIC_INDEXER_URL — indexed queries, no
 * eth_getLogs scanning, no provider token in the browser. Point reads of live
 * contract state (repoOwner, a window's times, a repo's URL) go straight to the
 * RPC, since those aren't event history the indexer stores.
 */
import type { Address, Hex } from "viem";
import {
  hackathonRegistryAbi,
  noCapRegistryAbi,
  ZERO_ADDRESS,
  type AnchorEvent,
  type ProjectRegisteredEvent,
} from "@nocap/shared";
import { getPublicClient } from "./publicClient";
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

// --- Envio HyperIndex GraphQL ----------------------------------------------
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "";

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  if (!json.data) throw new Error("indexer returned no data");
  return json.data;
}

type GqlAnchor = {
  builder: string;
  repoId: string;
  commitHash: string;
  label: string;
  timestamp: string;
  txHash: string;
  blockNumber: string;
};
type GqlProject = {
  builder: string;
  repoId: string;
  hackathonId: string;
  repoUrl: string;
  registeredAt: string;
  txHash: string;
  blockNumber: string;
};
type GqlWindow = {
  hackathonId: string;
  organizer: string;
  name: string;
  startTime: string;
  endTime: string;
  blockNumber: string;
};

function toAnchor(a: GqlAnchor): AnchorEvent {
  return {
    builder: a.builder as Address,
    repoId: a.repoId as Hex,
    commitHash: a.commitHash as Hex,
    label: a.label,
    timestamp: Number(a.timestamp),
    txHash: a.txHash as Hex,
    blockNumber: BigInt(a.blockNumber),
  };
}
function toProject(p: GqlProject): ProjectRegisteredEvent {
  return {
    builder: p.builder as Address,
    repoId: p.repoId as Hex,
    hackathonId: p.hackathonId as Hex,
    repoUrl: p.repoUrl,
    registeredAt: Number(p.registeredAt),
    txHash: p.txHash as Hex,
    blockNumber: BigInt(p.blockNumber),
  };
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving
 *  input order. Callers that fetch per-item onchain data in a list (one
 *  fetchAnchorsForRepo per project) use this instead of awaiting in a for-loop,
 *  so the N independent queries overlap rather than run strictly one after another. */
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

export async function fetchAnchorsForRepo(repoId: Hex): Promise<AnchorEvent[]> {
  if (!INDEXER_URL || ADDRESSES.registry === ZERO_ADDRESS) return [];
  return cached(`anchors:${repoId}`, async () => {
    const data = await gql<{ Anchor: GqlAnchor[] }>(
      `query($repoId: String!) {
        Anchor(where: { repoId: { _eq: $repoId } }, order_by: { timestamp: asc }) {
          builder repoId commitHash label timestamp txHash blockNumber
        }
      }`,
      { repoId: repoId.toLowerCase() }
    );
    return data.Anchor.map(toAnchor);
  });
}

export type HackathonListing = RepoWindow & {
  organizer: Address;
  blockNumber: bigint;
};

/** Every hackathon window ever seeded, sorted by start time. */
export async function fetchAllWindows(): Promise<HackathonListing[]> {
  if (!INDEXER_URL || ADDRESSES.hackathonRegistry === ZERO_ADDRESS) return [];
  return cached("all-windows", async () => {
    const data = await gql<{ HackathonWindow: GqlWindow[] }>(
      `query {
        HackathonWindow(order_by: { startTime: asc }) {
          hackathonId organizer name startTime endTime blockNumber
        }
      }`,
      {}
    );
    return data.HackathonWindow.map((w) => ({
      hackathonId: w.hackathonId as Hex,
      name: w.name,
      startTime: Number(w.startTime),
      endTime: Number(w.endTime),
      organizer: w.organizer as Address,
      blockNumber: BigInt(w.blockNumber),
    }));
  });
}

export async function fetchProjectsForHackathon(
  hackathonId: Hex
): Promise<ProjectRegisteredEvent[]> {
  if (!INDEXER_URL || ADDRESSES.registry === ZERO_ADDRESS) return [];
  return cached(`projects:${hackathonId}`, async () => {
    const data = await gql<{ Project: GqlProject[] }>(
      `query($h: String!) {
        Project(where: { hackathonId: { _eq: $h } }, order_by: { registeredAt: asc }) {
          builder repoId hackathonId repoUrl registeredAt txHash blockNumber
        }
      }`,
      { h: hackathonId.toLowerCase() }
    );
    return data.Project.map(toProject);
  });
}

export async function fetchProjectsByOwner(owner: Address): Promise<ProjectRegisteredEvent[]> {
  if (!INDEXER_URL || ADDRESSES.registry === ZERO_ADDRESS) return [];
  return cached(`owner:${owner.toLowerCase()}`, async () => {
    const data = await gql<{ Project: GqlProject[] }>(
      `query($b: String!) {
        Project(where: { builder: { _eq: $b } }, order_by: { registeredAt: asc }) {
          builder repoId hackathonId repoUrl registeredAt txHash blockNumber
        }
      }`,
      { b: owner.toLowerCase() }
    );
    return data.Project.map(toProject);
  });
}

// --- Contract point reads (live state, straight from the RPC) ---------------
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
  if (ADDRESSES.hackathonRegistry === ZERO_ADDRESS) return null;
  return cached(`window-id:${hackathonId}`, async () => {
    const client = getPublicClient();
    const [startTime, endTime, name, exists] = (await client.readContract({
      address: ADDRESSES.hackathonRegistry,
      abi: hackathonRegistryAbi,
      functionName: "getWindow",
      args: [hackathonId],
    })) as [bigint, bigint, string, boolean];
    if (!exists) return null;
    return { hackathonId, startTime: Number(startTime), endTime: Number(endTime), name };
  });
}

/** The hackathon window this repo registered under (multi-hackathon support).
 *  Returns null when the repo has no association or the window doesn't exist —
 *  callers fall back to the default window. */
export async function getRepoWindow(repoId: Hex): Promise<RepoWindow | null> {
  if (ADDRESSES.registry === ZERO_ADDRESS || ADDRESSES.hackathonRegistry === ZERO_ADDRESS) {
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
    return { hackathonId, startTime: Number(startTime), endTime: Number(endTime), name };
  });
}

export async function getRepoOwner(repoId: Hex): Promise<Address | null> {
  if (ADDRESSES.registry === ZERO_ADDRESS) return null;
  const client = getPublicClient();
  const owner = await client.readContract({
    address: ADDRESSES.registry,
    abi: noCapRegistryAbi,
    functionName: "repoOwner",
    args: [repoId],
  });
  if (owner === ZERO_ADDRESS) return null;
  return owner as Address;
}

export async function getRepoUrl(repoId: Hex): Promise<string> {
  if (ADDRESSES.registry === ZERO_ADDRESS) return "";
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
