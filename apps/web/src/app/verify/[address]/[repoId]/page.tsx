"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { Hex, Address } from "viem";
import {
  activeDayStreak,
  type AnchorEvent,
} from "@nocap/shared";
import {
  fetchAnchorsForRepo,
  getRepoOwner,
  getRepoUrl,
  getRepoWindow,
  type RepoWindow,
} from "@/lib/indexer";
import { DEFAULT_HACKATHON } from "@/lib/config";
import { Timeline } from "@/components/Timeline";
import { WindowBadge } from "@/components/WindowBadge";
import { AnomalyFlags } from "@/components/AnomalyFlags";
import { VelocityChart } from "@/components/VelocityChart";
import { shorten } from "@/lib/format";
import { ClaimBadgeButton } from "@/components/ClaimBadgeButton";
import { BuildRhythm } from "@/components/BuildRhythm";

export default function VerifyPage({
  params,
}: {
  params: Promise<{ address: string; repoId: string }>;
}) {
  const { address, repoId: rawRepoId } = use(params);
  const repoId = (
    rawRepoId.startsWith("0x") ? rawRepoId : `0x${rawRepoId}`
  ) as Hex;
  const ownerParam = address as Address;

  const [anchors, setAnchors] = useState<AnchorEvent[]>([]);
  const [owner, setOwner] = useState<Address | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoWindow, setRepoWindow] = useState<RepoWindow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [a, o, url, win] = await Promise.all([
          fetchAnchorsForRepo(repoId),
          getRepoOwner(repoId),
          getRepoUrl(repoId),
          getRepoWindow(repoId).catch(() => null),
        ]);
        if (cancelled) return;
        setAnchors(a);
        setOwner(o);
        setRepoUrl(url);
        setRepoWindow(win);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  // The window this repo actually registered under; Spark is only the fallback.
  const activeWindow = repoWindow ?? {
    hackathonId: DEFAULT_HACKATHON.id,
    startTime: DEFAULT_HACKATHON.startTime,
    endTime: DEFAULT_HACKATHON.endTime,
    name: DEFAULT_HACKATHON.name,
  };

  const timestamps = useMemo(() => anchors.map((a) => a.timestamp), [anchors]);
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const streak = activeDayStreak(timestamps);

  const ownerMismatch =
    owner && owner.toLowerCase() !== ownerParam.toLowerCase();

  return (
    <div>
      <div className="kicker">public verifier · no wallet required</div>
      <h1 className="page-title">Build timeline</h1>
      <p className="muted">
        Owner <span className="mono">{shorten(owner ?? ownerParam, 6)}</span>
      </p>
      <p className="dim mono break-all" style={{ fontSize: "0.85rem" }}>
        repoId {repoId}
      </p>
      {repoUrl && (
        <p className="break-all">
          <a href={repoUrl} target="_blank" rel="noreferrer">
            {repoUrl}
          </a>
        </p>
      )}

      {ownerMismatch && (
        <div className="error-box">
          The address in this URL is not the onchain owner of this repo. Showing the full
          onchain timeline anyway.
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card" style={{ marginTop: "1rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Scanning Monad for anchors — first load on the public RPC can take up to a minute.
          </p>
        </div>
      ) : (
        <>
          <div className="card stack" style={{ marginTop: "1rem" }}>
            <WindowBadge
              firstTs={first}
              lastTs={last}
              window={{
                startTime: activeWindow.startTime,
                endTime: activeWindow.endTime,
              }}
            />
            <p className="dim" style={{ margin: "-0.5rem 0 0", fontSize: "0.85rem" }}>
              Checked against <strong>{activeWindow.name}</strong>
            </p>
            <div className="grid-3">
              <div className="stat">
                <div className="label">Anchors</div>
                <div className="value">{anchors.length}</div>
              </div>
              <div className="stat">
                <div className="label">Active-day streak</div>
                <div className="value">{streak}</div>
              </div>
              <div className="stat">
                <div className="label">Contributors seen</div>
                <div className="value">
                  {new Set(anchors.map((a) => a.builder.toLowerCase())).size}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <div className="card">
              <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                Timeline
              </h2>
              <Timeline anchors={anchors} repoUrl={repoUrl} />
            </div>
            <div className="stack">
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Build rhythm
                </h2>
                <p className="dim" style={{ fontSize: "0.85rem", marginTop: 0 }}>
                  The tamper-proof shape of when this was built — from chain, never code.
                </p>
                <BuildRhythm anchors={anchors} />
              </div>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Velocity
                </h2>
                <VelocityChart timestamps={timestamps} />
              </div>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Anomaly signals
                </h2>
                <p className="dim" style={{ fontSize: "0.85rem", marginTop: 0 }}>
                  Timing heuristics only. Surface, don&apos;t adjudicate.
                </p>
                <AnomalyFlags
                  timestamps={timestamps}
                  window={{
                    startTime: activeWindow.startTime,
                    endTime: activeWindow.endTime,
                  }}
                />
              </div>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Certified No Cap
                </h2>
                <p className="dim" style={{ fontSize: "0.85rem" }}>
                  Optimistic claim — publicly re-checkable against logs.
                </p>
                <ClaimBadgeButton
                  repoId={repoId}
                  timestamps={timestamps}
                  hackathonId={activeWindow.hackathonId}
                />
              </div>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Embed
                </h2>
                <p className="dim" style={{ fontSize: "0.85rem" }}>
                  Drop this iframe on a submission page:
                </p>
                <code className="mono break-all" style={{ display: "block", fontSize: "0.78rem" }}>
                  {`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/${ownerParam}/${repoId}" width="100%" height="120" style="border:0;border-radius:12px;max-width:360px"></iframe>`}
                </code>
              </div>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                  Forensic report
                </h2>
                <p className="dim" style={{ fontSize: "0.85rem" }}>
                  Full timeline, anomaly breakdown, and contributor split as JSON.
                </p>
                <a className="btn" href={`/api/report/${ownerParam}/${repoId}`}>
                  Download report JSON
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
