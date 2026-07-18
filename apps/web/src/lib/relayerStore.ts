/**
 * State the hosted relayer needs that the chain itself can't answer fast enough to
 * check on every webhook delivery: "have I already anchored this exact SHA?" and
 * "has this repo exceeded its anchor budget for this window?".
 *
 * GitHub webhook delivery is at-least-once, not exactly-once — without idempotency,
 * a retried delivery re-anchors the same commit (wasted gas, not corrupted data,
 * since duplicate Anchored events are harmless — but still worth avoiding).
 *
 * This is deliberately the ONE piece of non-onchain state in the whole project. The
 * in-memory implementation below is correct for a single long-lived server process
 * but resets on cold start / restart / multi-instance deploys — that's a real limit,
 * not an oversight. Swap `relayerStore` for a Vercel KV / Upstash-Redis-backed
 * implementation of the same interface before running this in production; nothing
 * else in the webhook route needs to change.
 */

export interface RelayerStore {
  wasAnchored(repoId: string, commitSha: string): Promise<boolean>;
  markAnchored(repoId: string, commitSha: string): Promise<void>;
  /** Returns true if this repo is still under its per-window anchor budget. */
  checkAndConsumeRateLimit(repoId: string): Promise<boolean>;
}

const MAX_ANCHORS_PER_WINDOW = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

class InMemoryRelayerStore implements RelayerStore {
  private anchored = new Set<string>();
  private rateLog = new Map<string, number[]>();

  async wasAnchored(repoId: string, commitSha: string): Promise<boolean> {
    return this.anchored.has(`${repoId}:${commitSha}`);
  }

  async markAnchored(repoId: string, commitSha: string): Promise<void> {
    this.anchored.add(`${repoId}:${commitSha}`);
  }

  async checkAndConsumeRateLimit(repoId: string): Promise<boolean> {
    const now = Date.now();
    const hits = (this.rateLog.get(repoId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= MAX_ANCHORS_PER_WINDOW) {
      this.rateLog.set(repoId, hits);
      return false;
    }
    hits.push(now);
    this.rateLog.set(repoId, hits);
    return true;
  }
}

let store: RelayerStore | null = null;

export function getRelayerStore(): RelayerStore {
  if (!store) store = new InMemoryRelayerStore();
  return store;
}
