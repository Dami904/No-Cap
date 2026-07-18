"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { computeRepoId } from "@nocap/shared";
import { getRepoOwner, fetchAnchorsForRepo } from "@/lib/indexer";
import { SELF_REPO } from "@/lib/config";

/** Self-referential proof strip: links to NoCap's own live /verify timeline once
 *  this repo has been registered and anchored — the actual "dogfooding" pitch. */
export function SelfProof() {
  const repoId: Hex | null = SELF_REPO ? computeRepoId(SELF_REPO) : null;
  const [owner, setOwner] = useState<Address | null>(null);
  const [anchorCount, setAnchorCount] = useState<number | null>(null);

  useEffect(() => {
    if (!repoId) return;
    let cancelled = false;
    (async () => {
      const [o, anchors] = await Promise.all([
        getRepoOwner(repoId),
        fetchAnchorsForRepo(repoId),
      ]);
      if (!cancelled) {
        setOwner(o);
        setAnchorCount(anchors.length);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  if (!repoId) {
    return (
      <p className="dim" style={{ margin: 0, fontSize: "0.9rem" }}>
        The whole flow: one push, one anchor, one badge.
      </p>
    );
  }

  return (
    <p className="muted" style={{ marginBottom: 0 }}>
      Self-referential demo: <span className="mono">{SELF_REPO}</span> is anchored on
      NoCap itself.{" "}
      {owner ? (
        <Link href={`/verify/${owner}/${repoId}`}>
          Open its live timeline{anchorCount ? ` — ${anchorCount} anchors` : ""} →
        </Link>
      ) : (
        "Not registered onchain yet."
      )}
    </p>
  );
}
