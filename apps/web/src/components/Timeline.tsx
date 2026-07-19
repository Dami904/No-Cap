"use client";

import { useEffect, useState } from "react";
import type { AnchorEvent } from "@nocap/shared";
import {
  explorerTxUrl,
  githubCommitUrl,
  bytes32ToCommitSha,
} from "@nocap/shared";
import { formatTs, shorten, formatHexShort } from "@/lib/format";
import { getBlockTips } from "@/lib/publicClient";
import { blockLabelCopy, labelForBlock, type BlockLabel } from "@/lib/blockState";

export function Timeline({
  anchors,
  repoUrl,
}: {
  anchors: AnchorEvent[];
  repoUrl?: string;
}) {
  const [tips, setTips] = useState<{ latest: bigint; safe: bigint; finalized: bigint } | null>(
    null
  );

  useEffect(() => {
    getBlockTips().then(setTips).catch(() => setTips(null));
  }, [anchors.length]);

  if (anchors.length === 0) {
    return (
      <p className="muted">
        No anchors yet. Once the repo is registered (Connect GitHub → sign), just push a commit —
        the hosted relayer anchors it to Monad automatically.
      </p>
    );
  }

  const repoName = repoUrl
    ?.replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/$/, "");

  return (
    <ol className="timeline">
      {anchors.map((a) => {
        const sha = bytes32ToCommitSha(a.commitHash);
        const gh = repoName ? githubCommitUrl(repoName, sha) : undefined;
        const label: BlockLabel | null = tips
          ? labelForBlock(a.blockNumber, tips)
          : null;
        return (
          <li key={`${a.txHash}-${a.commitHash}`}>
            <div>
              <strong className="mono">{a.label || formatHexShort(sha, 7)}</strong>
            </div>
            <div className="meta">
              <span>{formatTs(a.timestamp)}</span>
              <span className="pill">attester {shorten(a.builder)}</span>
              {label && <span className="pill">{blockLabelCopy(label)}</span>}
              {gh && (
                <a href={gh} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              )}
              <a href={explorerTxUrl(a.txHash)} target="_blank" rel="noreferrer">
                Explorer
              </a>
              <span className="mono dim">#{a.blockNumber.toString()}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
