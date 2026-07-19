import type { Hex } from "viem";
import { checkWindowCompliance, noCapBadgeAbi } from "@nocap/shared";
import { fetchAnchorsForRepo, getRepoWindow, getRepoUrl } from "@/lib/indexer";
import { getPublicClient } from "@/lib/publicClient";
import { ADDRESSES, DEFAULT_HACKATHON } from "@/lib/config";

/**
 * Branded SVG status badge — the README-embeddable face of a repo's onchain
 * provenance. Works for any repo:
 *   ![NoCap](https://<app>/api/badge-svg/{owner}/{repoId})
 * Reflects the soulbound NoCapBadge NFT: shows "Certified" once the badge has
 * actually been minted onchain (claimed[repoId][hackathonId] == true), and the
 * live verdict otherwise. GitHub renders SVG images, so it displays inline.
 */
export const runtime = "nodejs";

const C = {
  bg0: "#0b0c0f",
  bg1: "#12141a",
  card: "#161922",
  border: "#2a2e3a",
  text: "#eef0f5",
  dim: "#6b7385",
  mint: "#6ee7b7",
  amber: "#f6a94a",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Status = { label: string; color: string; glyph: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string; repoId: string }> }
) {
  const { repoId: raw } = await ctx.params;
  const repoId = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;

  let repoName = "unregistered repo";
  let hackathon = "";
  let anchorCount = 0;
  let status: Status = { label: "Pending", color: C.dim, glyph: "○" };

  try {
    const [anchors, window, repoUrl] = await Promise.all([
      fetchAnchorsForRepo(repoId),
      getRepoWindow(repoId).catch(() => null),
      getRepoUrl(repoId).catch(() => ""),
    ]);

    anchorCount = anchors.length;
    if (repoUrl) {
      repoName = repoUrl.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
    }
    const win = window ?? {
      hackathonId: DEFAULT_HACKATHON.id,
      name: DEFAULT_HACKATHON.name,
      startTime: DEFAULT_HACKATHON.startTime,
      endTime: DEFAULT_HACKATHON.endTime,
    };
    hackathon = win.name;

    // Is the soulbound NFT actually minted for this repo + hackathon?
    let claimed = false;
    if (ADDRESSES.badge !== "0x0000000000000000000000000000000000000000") {
      claimed = (await getPublicClient()
        .readContract({
          address: ADDRESSES.badge,
          abi: noCapBadgeAbi,
          functionName: "claimed",
          args: [repoId, win.hackathonId],
        })
        .catch(() => false)) as boolean;
    }

    if (anchorCount === 0) {
      status = { label: "Pending", color: C.dim, glyph: "○" };
    } else {
      const times = anchors.map((a) => a.timestamp);
      const { ok } = checkWindowCompliance(times[0], times[times.length - 1], {
        startTime: win.startTime,
        endTime: win.endTime,
      });
      if (claimed) status = { label: "Certified No Cap", color: C.mint, glyph: "◆" };
      else if (ok) status = { label: "No Cap", color: C.mint, glyph: "●" };
      else status = { label: "Cap?", color: C.amber, glyph: "▲" };
    }
  } catch {
    status = { label: "unavailable", color: C.dim, glyph: "○" };
  }

  const W = 460;
  const H = 140;
  const pillLabel = status.label;
  const pillW = Math.round(pillLabel.length * 7.0 + 40);
  const pillX = W - 22 - pillW;
  const metaBits = [hackathon, `${anchorCount} anchor${anchorCount === 1 ? "" : "s"}`, "Monad testnet"]
    .filter(Boolean)
    .join("  ·  ");

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NoCap: ${esc(repoName)} — ${esc(pillLabel)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/>
      <stop offset="1" stop-color="${C.bg0}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="1">
      <stop offset="0" stop-color="${status.color}" stop-opacity="0.14"/>
      <stop offset="0.6" stop-color="${status.color}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="card"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="15"/></clipPath>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="url(#bg)" stroke="${C.border}"/>
  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="70" fill="url(#glow)"/>
    <rect x="0" y="0" width="4" height="${H}" fill="${status.color}"/>
  </g>

  <!-- brand mark -->
  <rect x="22" y="22" width="44" height="44" rx="12" fill="${C.card}" stroke="${C.mint}" stroke-opacity="0.55"/>
  <text x="44" y="51" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="19" font-weight="700" fill="${C.mint}" text-anchor="middle">nc</text>

  <!-- wordmark -->
  <text x="80" y="41" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="19" font-weight="700" fill="${C.text}">NoCap</text>
  <text x="80" y="59" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="10.5" fill="${C.dim}" letter-spacing="0.3">onchain build provenance</text>

  <!-- status pill -->
  <rect x="${pillX}" y="27" width="${pillW}" height="26" rx="13" fill="${status.color}" fill-opacity="0.13" stroke="${status.color}" stroke-opacity="0.4"/>
  <text x="${pillX + 15}" y="44" font-family="system-ui, sans-serif" font-size="12" fill="${status.color}">${status.glyph}</text>
  <text x="${pillX + 30}" y="44" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="12.5" font-weight="600" fill="${status.color}">${esc(pillLabel)}</text>

  <!-- divider -->
  <line x1="22" y1="84" x2="${W - 22}" y2="84" stroke="${C.border}"/>

  <!-- repo -->
  <text x="24" y="108" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" font-weight="600" fill="${C.text}">${esc(truncate(repoName, 40))}</text>

  <!-- meta -->
  <text x="24" y="127" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="11.5" fill="${C.dim}">${esc(truncate(metaBits, 62))}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
