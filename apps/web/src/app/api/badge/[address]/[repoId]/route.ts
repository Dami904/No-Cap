import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { checkWindowCompliance } from "@nocap/shared";
import { fetchAnchorsForRepo, getRepoWindow } from "@/lib/indexer";
import { DEFAULT_HACKATHON } from "@/lib/config";

/**
 * Live status badge as a shields.io "endpoint" payload:
 *   https://img.shields.io/endpoint?url=<this route>
 * Renders the repo's real provenance verdict (No Cap / Cap? / no anchors) as a
 * badge that anyone can drop in a README — including this project dogfooding its
 * own product. Cached at the edge so shields.io polling doesn't hammer the index.
 */
export const runtime = "nodejs";

const LABEL = "build provenance";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string; repoId: string }> }
) {
  const { repoId: raw } = await ctx.params;
  const repoId = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;

  let message = "unknown";
  let color = "lightgrey";
  try {
    const anchors = await fetchAnchorsForRepo(repoId);
    if (anchors.length === 0) {
      message = "no anchors yet";
    } else {
      const window =
        (await getRepoWindow(repoId).catch(() => null)) ?? {
          startTime: DEFAULT_HACKATHON.startTime,
          endTime: DEFAULT_HACKATHON.endTime,
        };
      const timestamps = anchors.map((a) => a.timestamp);
      const { ok } = checkWindowCompliance(
        timestamps[0],
        timestamps[timestamps.length - 1],
        { startTime: window.startTime, endTime: window.endTime }
      );
      message = ok ? "No Cap" : "Cap?";
      color = ok ? "6ee7b7" : "orange";
    }
  } catch {
    message = "unavailable";
  }

  return NextResponse.json(
    { schemaVersion: 1, label: LABEL, message, color },
    {
      headers: {
        // Fresh-ish, but edge-cached so shields.io's polling can't overload us.
        "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
