"use client";

import { use, useEffect, useState } from "react";
import type { Hex } from "viem";
import { checkWindowCompliance, type AnchorEvent } from "@nocap/shared";
import { fetchAnchorsForRepo } from "@/lib/indexer";
import { DEFAULT_HACKATHON } from "@/lib/config";

export default function EmbedBadgePage({
  params,
}: {
  params: Promise<{ address: string; repoId: string }>;
}) {
  const { address, repoId: raw } = use(params);
  const repoId = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const [anchors, setAnchors] = useState<AnchorEvent[]>([]);

  useEffect(() => {
    fetchAnchorsForRepo(repoId).then(setAnchors).catch(() => setAnchors([]));
  }, [repoId]);

  const first = anchors[0]?.timestamp;
  const last = anchors[anchors.length - 1]?.timestamp;
  const { ok, reason } = checkWindowCompliance(first, last, {
    startTime: DEFAULT_HACKATHON.startTime,
    endTime: DEFAULT_HACKATHON.endTime,
  });

  return (
    <div
      style={{
        margin: 0,
        fontFamily: "var(--sans), system-ui, sans-serif",
        background: "transparent",
        color: "var(--text)",
        minHeight: "100%",
      }}
    >
      <a
        href={`/verify/${address}/${repoId}`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.85rem 1rem",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--bg-card)",
          color: "inherit",
          textDecoration: "none",
          minHeight: 88,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, letterSpacing: "-0.02em" }}>NoCap</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {anchors.length} anchors · live on Monad
          </div>
        </div>
        <div
          style={{
            padding: "0.4rem 0.7rem",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: ok ? "var(--accent-bg)" : "var(--danger-bg)",
            color: ok ? "var(--accent)" : "var(--danger)",
            border: `1px solid ${ok ? "rgba(110,231,183,0.35)" : "rgba(248,113,113,0.35)"}`,
            maxWidth: 200,
          }}
        >
          {ok ? "✅ No Cap" : "⛔ Cap?"}
        </div>
      </a>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, padding: "0 4px" }}>
        {reason}
      </div>
    </div>
  );
}
