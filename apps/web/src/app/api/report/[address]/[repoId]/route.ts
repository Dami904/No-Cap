import { NextResponse } from "next/server";
import type { Hex, Address } from "viem";
import {
  detectAnomalies,
  checkWindowCompliance,
  activeDayStreak,
  velocityByDay,
} from "@nocap/shared";
import { fetchAnchorsForRepo, getRepoUrl } from "@/lib/indexer";
import { DEFAULT_HACKATHON } from "@/lib/config";

/**
 * Forensic report (JSON). Public timeline stays free.
 * x402 paid PDF tier: when payment headers present / facilitator ready,
 * set NOCAP_X402_ENABLED=true and gate with facilitator at
 * https://x402-facilitator.molandak.org — this route returns the full payload free
 * on testnet for demo, with a clear "payment optional" header.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string; repoId: string }> }
) {
  const { address, repoId: raw } = await ctx.params;
  const repoId = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;

  const anchors = await fetchAnchorsForRepo(repoId);
  const repoUrl = await getRepoUrl(repoId);
  const timestamps = anchors.map((a) => a.timestamp);
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const compliance = checkWindowCompliance(first, last, {
    startTime: DEFAULT_HACKATHON.startTime,
    endTime: DEFAULT_HACKATHON.endTime,
  });
  const anomalies = detectAnomalies(timestamps, {
    startTime: DEFAULT_HACKATHON.startTime,
    endTime: DEFAULT_HACKATHON.endTime,
  });

  const byContributor: Record<string, number> = {};
  for (const a of anchors) {
    const k = a.builder.toLowerCase();
    byContributor[k] = (byContributor[k] ?? 0) + 1;
  }

  const report = {
    title: "NoCap Forensic Build Report",
    generatedAt: new Date().toISOString(),
    owner: address as Address,
    repoId,
    repoUrl,
    hackathon: DEFAULT_HACKATHON,
    compliance,
    stats: {
      anchorCount: anchors.length,
      activeDayStreak: activeDayStreak(timestamps),
      velocityByDay: velocityByDay(timestamps),
      contributorSplit: byContributor,
    },
    anomalies,
    anchors: anchors.map((a) => ({
      builder: a.builder,
      commitHash: a.commitHash,
      label: a.label,
      timestamp: a.timestamp,
      txHash: a.txHash,
      blockNumber: a.blockNumber.toString(),
    })),
    trustModel:
      "CI attestation: anchors prove the repo's configured attester key saw this SHA at this block time.",
    paymentNote:
      "Public timeline is free. Optional x402 USDC deep-report tier via Monad facilitator when enabled.",
  };

  return NextResponse.json(report, {
    headers: {
      "X-NoCap-Report": "forensic-v1",
      "X-NoCap-Payment": "optional-x402",
    },
  });
}
