"use client";

import { use, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { noCapBadgeAbi, explorerAddressUrl } from "@nocap/shared";
import { getPublicClient } from "@/lib/publicClient";
import { ADDRESSES } from "@/lib/config";
import { shorten } from "@/lib/format";
import Link from "next/link";

export default function BadgePage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = use(params);
  const [owner, setOwner] = useState<Address | null>(null);
  const [repoId, setRepoId] = useState<Hex | null>(null);
  const [hackathonId, setHackathonId] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenId === "pending") return;
    let cancelled = false;
    (async () => {
      try {
        if (ADDRESSES.badge === "0x0000000000000000000000000000000000000000") {
          setError("Badge contract not configured");
          return;
        }
        const client = getPublicClient();
        const id = BigInt(tokenId);
        const [o, r, h] = await Promise.all([
          client.readContract({
            address: ADDRESSES.badge,
            abi: noCapBadgeAbi,
            functionName: "ownerOf",
            args: [id],
          }),
          client.readContract({
            address: ADDRESSES.badge,
            abi: noCapBadgeAbi,
            functionName: "tokenRepoId",
            args: [id],
          }),
          client.readContract({
            address: ADDRESSES.badge,
            abi: noCapBadgeAbi,
            functionName: "tokenHackathonId",
            args: [id],
          }),
        ]);
        if (cancelled) return;
        setOwner(o as Address);
        setRepoId(r as Hex);
        setHackathonId(h as Hex);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  if (tokenId === "pending") {
    return (
      <div className="card">
        <h1>Badge claim submitted</h1>
        <p className="muted">
          Your claim went through. Grab the tokenId from the <code>BadgeClaimed</code> event in
          your transaction, then open <code>/badge/&lt;tokenId&gt;</code> to view it.
        </p>
      </div>
    );
  }

  return (
    <div className="page-narrow" style={{ margin: "0 auto" }}>
      <div
        className="card"
        style={{
          textAlign: "center",
          background:
            "radial-gradient(circle at 30% 20%, rgba(110,231,183,0.18), transparent 50%), var(--bg-card)",
          padding: "clamp(1.5rem, 5vw, 2.5rem) clamp(1rem, 4vw, 1.5rem)",
        }}
      >
        <div className="kicker">soulbound · non-transferable</div>
        <h1 className="page-title" style={{ fontSize: "clamp(1.6rem, 6vw, 2rem)", margin: "0.5rem 0" }}>
          Certified No Cap
        </h1>
        <p className="muted">Token #{tokenId}</p>
        {error && <div className="error-box">{error}</div>}
        {owner && (
          <p>
            Holder{" "}
            <a href={explorerAddressUrl(owner)} target="_blank" rel="noreferrer" className="mono">
              {shorten(owner, 6)}
            </a>
          </p>
        )}
        {repoId && owner && (
          <p style={{ marginTop: "1.25rem" }}>
            <Link className="btn btn-primary" href={`/verify/${owner}/${repoId}`}>
              View build timeline
            </Link>
          </p>
        )}
        {hackathonId && (
          <p className="mono dim" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
            hackathon {hackathonId}
          </p>
        )}
        <p className="dim" style={{ fontSize: "0.8rem", marginTop: "1.5rem" }}>
          Optimistic claim — re-verify anchors against chain logs.
        </p>
      </div>
    </div>
  );
}
