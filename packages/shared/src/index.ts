import { keccak256, pad, stringToBytes, type Address, type Hex, type Abi } from "viem";

/** Monad testnet (chain id 10143). */
export const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadexplorer.com" },
  },
} as const;

/** Spark 2026 window — double-check against hackathon page before deploy. */
export const SPARK_HACKATHON = {
  idString: "spark-2026",
  name: "Monad Spark 2026",
  startTime: 1_783_947_600, // 2026-07-13 13:00 UTC
  endTime: 1_784_505_599, // 2026-07-19 23:59:59 UTC
} as const;

/**
 * Canonical repoId — ONE helper used by Action, CLI, frontend, tests.
 * keccak256(utf8(lowercase("owner/repo"))) — no protocol, no trailing slash.
 */
export function computeRepoId(ownerSlashRepo: string): Hex {
  const normalized = ownerSlashRepo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
  return keccak256(stringToBytes(normalized));
}

export function computeHackathonId(idString: string): Hex {
  return keccak256(stringToBytes(idString));
}

export const SPARK_HACKATHON_ID = computeHackathonId(SPARK_HACKATHON.idString);

export function shortSha(sha: string): string {
  return sha.replace(/^0x/, "").slice(0, 7);
}

/**
 * Git SHA-1 is 20 bytes; the contract's `anchor()` takes `bytes32`. Solidity
 * right-pads fixed bytesN types when widening (`bytes32(bytes20(x))`), so this
 * matches that convention exactly — the real 20 bytes sit in the front, the
 * trailing 12 bytes are zero. viem does NOT auto-pad a mismatched-size bytes
 * value; passing a raw 20-byte hex where bytes32 is expected throws at encode
 * time, so every anchor() caller (CLI, webhook relayer) MUST go through this.
 */
export function commitHashToBytes32(sha: string): Hex {
  const hex = sha.startsWith("0x") ? sha : `0x${sha}`;
  return pad(hex as Hex, { size: 32, dir: "right" });
}

/** Inverse of commitHashToBytes32 — recovers the original 40-char git SHA
 *  (no 0x prefix) from a right-padded bytes32 anchor value. */
export function bytes32ToCommitSha(commitHash: string): string {
  return commitHash.replace(/^0x/, "").slice(0, 40);
}

export function makeLabel(commitSha: string, message: string, maxLen = 80): string {
  const short = shortSha(commitSha);
  const msg = message.replace(/\s+/g, " ").trim().slice(0, maxLen - short.length - 1);
  return `${short} ${msg}`.trim();
}

export function explorerTxUrl(txHash: string): string {
  return `${MONAD_TESTNET.blockExplorers.default.url}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${MONAD_TESTNET.blockExplorers.default.url}/address/${address}`;
}

/** `commitHash` may be a plain 40-char SHA or a right-padded onchain bytes32 —
 *  either way this recovers the real 40-char SHA for the GitHub URL. */
export function githubCommitUrl(repoFullName: string, commitHash: string): string {
  const repo = repoFullName.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
  const sha = bytes32ToCommitSha(commitHash);
  return `https://github.com/${repo}/commit/${sha}`;
}

/** Window compliance for the green "No Cap" badge. */
export function checkWindowCompliance(
  firstAnchorTs: number | undefined,
  lastAnchorTs: number | undefined,
  window: { startTime: number; endTime: number }
): {
  ok: boolean;
  reason: string;
} {
  if (firstAnchorTs == null) {
    return { ok: false, reason: "No anchors yet — nothing to prove." };
  }
  if (firstAnchorTs < window.startTime) {
    return {
      ok: false,
      reason: "First anchor is before registration opened.",
    };
  }
  if (firstAnchorTs > window.endTime) {
    return {
      ok: false,
      reason: "First anchor is after the window closed.",
    };
  }
  if (lastAnchorTs != null && lastAnchorTs > window.endTime) {
    return {
      ok: false,
      reason: "Last anchor is after the window closed.",
    };
  }
  return {
    ok: true,
    reason: "No Cap: build started after registration opened",
  };
}

export type AnomalyFlag = {
  id: string;
  severity: "info" | "warn";
  message: string;
};

/** Timing-only anomaly signals — surface, don't adjudicate. */
export function detectAnomalies(
  timestamps: number[],
  window?: { startTime: number; endTime: number }
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  if (timestamps.length === 0) return flags;

  const sorted = [...timestamps].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = Math.max(last - first, 1);

  // 80% of anchors in final 2 hours of the team's own span
  const final2h = last - 2 * 3600;
  const late = sorted.filter((t) => t >= final2h).length;
  if (sorted.length >= 5 && late / sorted.length >= 0.8) {
    flags.push({
      id: "late-burst",
      severity: "warn",
      message: `${Math.round((late / sorted.length) * 100)}% of anchors landed in the final 2 hours of activity`,
    });
  }

  // Longest idle gap > 48h mid-build
  let longestGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    longestGap = Math.max(longestGap, sorted[i]! - sorted[i - 1]!);
  }
  if (longestGap >= 48 * 3600 && sorted.length >= 3) {
    flags.push({
      id: "long-gap",
      severity: "info",
      message: `Longest idle gap between anchors: ${Math.round(longestGap / 3600)} hours`,
    });
  }

  // All activity compressed into < 4 hours total span
  if (sorted.length >= 5 && span < 4 * 3600) {
    flags.push({
      id: "compressed",
      severity: "warn",
      message: `All ${sorted.length} anchors span only ${Math.round(span / 60)} minutes`,
    });
  }

  if (window && first < window.startTime) {
    flags.push({
      id: "pre-window",
      severity: "warn",
      message: "First anchor predates the hackathon registration window",
    });
  }

  return flags;
}

export function velocityByDay(timestamps: number[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of timestamps) {
    const day = new Date(t * 1000).toISOString().slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}

export function activeDayStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = [
    ...new Set(timestamps.map((t) => new Date(t * 1000).toISOString().slice(0, 10))),
  ].sort();
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]! + "T00:00:00Z").getTime();
    const now = new Date(days[i]! + "T00:00:00Z").getTime();
    if (now - prev === 86400000) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

/** All timing-only, derived purely from onchain anchor timestamps — the build's
 *  "shape," never its code. */
export type BuildSummary = {
  count: number;
  firstTs?: number;
  lastTs?: number;
  spanSeconds: number;
  activeDays: number;
  activeDayStreak: number;
  longestGapSeconds: number;
  busiestDay?: { day: string; count: number };
  avgPerActiveDay: number;
};

export function summarizeBuild(timestamps: number[]): BuildSummary {
  if (timestamps.length === 0) {
    return {
      count: 0,
      spanSeconds: 0,
      activeDays: 0,
      activeDayStreak: 0,
      longestGapSeconds: 0,
      avgPerActiveDay: 0,
    };
  }
  const sorted = [...timestamps].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  let longestGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    longestGap = Math.max(longestGap, sorted[i]! - sorted[i - 1]!);
  }

  const byDay = new Map<string, number>();
  for (const t of sorted) {
    const d = new Date(t * 1000).toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  let busiestDay: { day: string; count: number } | undefined;
  for (const [day, count] of byDay) {
    if (!busiestDay || count > busiestDay.count) busiestDay = { day, count };
  }

  return {
    count: sorted.length,
    firstTs: first,
    lastTs: last,
    spanSeconds: last - first,
    activeDays: byDay.size,
    activeDayStreak: activeDayStreak(sorted),
    longestGapSeconds: longestGap,
    busiestDay,
    avgPerActiveDay: sorted.length / byDay.size,
  };
}

/** Per-attester anchor share — genuine multi-contributor attribution from chain. */
export function contributorSplit(
  builders: string[]
): { builder: string; count: number; share: number }[] {
  const m = new Map<string, number>();
  for (const b of builders) {
    const k = b.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const total = builders.length || 1;
  return [...m.entries()]
    .map(([builder, count]) => ({ builder, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

/** Event-level rollup across every project in one hackathon — participation and
 *  timing only, aggregated from onchain anchors. `perProjectTimestamps` is one
 *  array of anchor timestamps per registered project. */
export type HackathonSummary = {
  projects: number;
  anchoredProjects: number;
  compliantProjects: number;
  flaggedProjects: number;
  totalAnchors: number;
  pulse: { day: string; count: number }[];
};

export function summarizeHackathon(
  perProjectTimestamps: number[][],
  window?: { startTime: number; endTime: number }
): HackathonSummary {
  let anchoredProjects = 0;
  let compliantProjects = 0;
  let flaggedProjects = 0;
  let totalAnchors = 0;
  const all: number[] = [];

  for (const ts of perProjectTimestamps) {
    if (ts.length > 0) anchoredProjects += 1;
    totalAnchors += ts.length;
    all.push(...ts);
    if (window && ts.length > 0) {
      const sorted = [...ts].sort((a, b) => a - b);
      const { ok } = checkWindowCompliance(sorted[0], sorted[sorted.length - 1], window);
      if (ok) compliantProjects += 1;
      if (detectAnomalies(ts, window).some((f) => f.severity === "warn")) {
        flaggedProjects += 1;
      }
    }
  }

  return {
    projects: perProjectTimestamps.length,
    anchoredProjects,
    compliantProjects,
    flaggedProjects,
    totalAnchors,
    pulse: velocityByDay(all),
  };
}

/** Human duration from seconds — coarse, two-unit ("2d 4h", "3h 20m", "18m"). */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export const noCapRegistryAbi = [
  {
    type: "event",
    name: "ProjectRegistered",
    inputs: [
      { name: "builder", type: "address", indexed: true },
      { name: "repoId", type: "bytes32", indexed: true },
      { name: "hackathonId", type: "bytes32", indexed: true },
      { name: "repoUrl", type: "string", indexed: false },
      { name: "registeredAt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ContributorAdded",
    inputs: [
      { name: "repoId", type: "bytes32", indexed: true },
      { name: "contributor", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "builder", type: "address", indexed: true },
      { name: "repoId", type: "bytes32", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: false },
      { name: "label", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RelayerUpdated",
    inputs: [
      { name: "previousRelayer", type: "address", indexed: true },
      { name: "newRelayer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RelayerEnabledForRepo",
    inputs: [
      { name: "repoId", type: "bytes32", indexed: true },
      { name: "enabled", type: "bool", indexed: false },
    ],
  },
  {
    type: "function",
    name: "registerProject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "repoUrl", type: "string" },
      { name: "hackathonId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "registerAndAuthorize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "repoUrl", type: "string" },
      { name: "hackathonId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addContributor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "contributor", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setRelayerEnabled",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "enabled", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setRelayer",
    stateMutability: "nonpayable",
    inputs: [{ name: "newRelayer", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "commitHash", type: "bytes32" },
      { name: "label", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repoOwner",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isContributor",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "relayerEnabled",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "relayer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "repoHackathon",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "repoUrlOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

export const hackathonRegistryAbi = [
  {
    type: "event",
    name: "WindowRegistered",
    inputs: [
      { name: "hackathonId", type: "bytes32", indexed: true },
      { name: "organizer", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "registerWindow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hackathonId", type: "bytes32" },
      { name: "name", type: "string" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getWindow",
    stateMutability: "view",
    inputs: [{ name: "hackathonId", type: "bytes32" }],
    outputs: [
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "name", type: "string" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "windows",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "name", type: "string" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "organizerOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const satisfies Abi;

export const noCapBadgeAbi = [
  {
    type: "event",
    name: "BadgeClaimed",
    inputs: [
      { name: "claimer", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "repoId", type: "bytes32", indexed: true },
      { name: "hackathonId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "hackathonId", type: "bytes32" },
      { name: "anchorTimestamps", type: "uint256[]" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "claimBadge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoId", type: "bytes32" },
      { name: "hackathonId", type: "bytes32" },
      { name: "anchorTimestamps", type: "uint256[]" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenRepoId",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "tokenHackathonId",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

export type AnchorEvent = {
  builder: Address;
  repoId: Hex;
  commitHash: Hex;
  label: string;
  timestamp: number;
  txHash: Hex;
  blockNumber: bigint;
};

export type ProjectRegisteredEvent = {
  builder: Address;
  repoId: Hex;
  hackathonId: Hex;
  repoUrl: string;
  registeredAt: number;
  txHash: Hex;
  blockNumber: bigint;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
