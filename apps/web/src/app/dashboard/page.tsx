"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import type { AnchorEvent, ProjectRegisteredEvent } from "@nocap/shared";
import { activeDayStreak } from "@nocap/shared";
import { fetchProjectsByOwner, fetchAnchorsForRepo } from "@/lib/indexer";
import { VelocityChart } from "@/components/VelocityChart";
import { ConnectButton } from "@/components/ConnectButton";
import { formatTs, shorten } from "@/lib/format";

type ProjectRow = ProjectRegisteredEvent & {
  anchors: AnchorEvent[];
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const projects = await fetchProjectsByOwner(address);
        const withAnchors: ProjectRow[] = [];
        for (const p of projects) {
          const anchors = await fetchAnchorsForRepo(p.repoId);
          withAnchors.push({ ...p, anchors });
        }
        if (!cancelled) setRows(withAnchors);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!isConnected) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="muted">Connect the wallet you used to register projects.</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div>
      <div className="kicker">builder</div>
      <h1 className="page-title">Dashboard</h1>
      <p className="muted">
        Projects owned by <span className="mono">{shorten(address!, 6)}</span>
      </p>
      {loading && <p className="muted">Loading…</p>}
      {error && <div className="error-box">{error}</div>}
      {!loading && rows.length === 0 && (
        <div className="card">
          <p className="muted">No projects yet.</p>
          <Link className="btn btn-primary" href="/register">
            Register a project
          </Link>
        </div>
      )}
      {rows.map((p) => {
        const ts = p.anchors.map((a) => a.timestamp);
        let longestGap = 0;
        const sorted = [...ts].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          longestGap = Math.max(longestGap, sorted[i]! - sorted[i - 1]!);
        }
        return (
          <div className="card" key={p.repoId}>
            <div className="btn-row" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
                <h2 className="page-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                  <a href={p.repoUrl} target="_blank" rel="noreferrer" className="break-all">
                    {p.repoUrl.replace(/^https?:\/\/github\.com\//i, "") || p.repoUrl}
                  </a>
                </h2>
                <p className="dim" style={{ margin: "0.35rem 0", fontSize: "0.85rem" }}>
                  Registered {formatTs(p.registeredAt)}
                </p>
              </div>
              <Link className="btn" href={`/verify/${p.builder}/${p.repoId}`}>
                Verify →
              </Link>
            </div>
            <div className="grid-3" style={{ marginTop: "0.75rem" }}>
              <div className="stat">
                <div className="label">Anchors</div>
                <div className="value">{p.anchors.length}</div>
              </div>
              <div className="stat">
                <div className="label">Streak (days)</div>
                <div className="value">{activeDayStreak(ts)}</div>
              </div>
              <div className="stat">
                <div className="label">Longest gap</div>
                <div className="value" style={{ fontSize: "1.2rem" }}>
                  {sorted.length > 1 ? `${Math.round(longestGap / 3600)}h` : "—"}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <VelocityChart timestamps={ts} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
