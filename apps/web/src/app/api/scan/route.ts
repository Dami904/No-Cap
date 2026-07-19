import "server-only";
import { NextResponse } from "next/server";
import type { Hex, Address } from "viem";
import {
  fetchAllWindows,
  fetchAnchorsForRepo,
  fetchProjectsForHackathon,
  fetchProjectsByOwner,
} from "@/lib/indexer";

export const runtime = "nodejs";

/**
 * Server-side proxy for every event scan the frontend needs. Browsers must never
 * talk to the scan RPC directly: the provider token would ship inside the public
 * JS bundle (anyone — including every stale open tab — could drain the shared
 * per-minute quota, which took the whole site down in practice), and each visitor
 * would pay the full scan cost themselves. Routing through here means the token
 * stays server-side and the s-maxage header lets Vercel's edge serve one scan
 * result to every concurrent visitor for 15s instead of one scan per visitor.
 */
const CACHE_CONTROL = "public, s-maxage=15, stale-while-revalidate=120";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_ADDR = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");

  try {
    let data: unknown;
    if (kind === "windows") {
      data = await fetchAllWindows();
    } else if (kind === "anchors") {
      const repoId = url.searchParams.get("repoId") ?? "";
      if (!HEX32.test(repoId)) return NextResponse.json({ error: "bad repoId" }, { status: 400 });
      data = await fetchAnchorsForRepo(repoId as Hex);
    } else if (kind === "projects") {
      const hackathonId = url.searchParams.get("hackathonId") ?? "";
      if (!HEX32.test(hackathonId)) return NextResponse.json({ error: "bad hackathonId" }, { status: 400 });
      data = await fetchProjectsForHackathon(hackathonId as Hex);
    } else if (kind === "owner") {
      const owner = url.searchParams.get("owner") ?? "";
      if (!HEX_ADDR.test(owner)) return NextResponse.json({ error: "bad owner" }, { status: 400 });
      data = await fetchProjectsByOwner(owner as Address);
    } else {
      return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
    // bigint fields (blockNumber) aren't JSON-serializable — send as strings,
    // the client-side indexer revives them.
    const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    return new NextResponse(body, {
      headers: { "content-type": "application/json", "cache-control": CACHE_CONTROL },
    });
  } catch (e) {
    // Never let an error response get edge-cached — the next request must be
    // free to retry immediately rather than serve a cached failure for 15s.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scan failed" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
