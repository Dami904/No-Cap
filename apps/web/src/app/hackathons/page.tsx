"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchAllWindows, type HackathonListing } from "@/lib/indexer";
import { formatTs, shorten } from "@/lib/format";

type Status = "live" | "upcoming" | "ended";

function statusOf(w: HackathonListing, now: number): Status {
  if (now < w.startTime) return "upcoming";
  if (now > w.endTime) return "ended";
  return "live";
}

function StatusPill({ status }: { status: Status }) {
  if (status === "live") {
    return (
      <span className="badge-ok" style={{ fontSize: "0.75rem" }}>
        ● live
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="badge-warn" style={{ fontSize: "0.75rem" }}>
        upcoming
      </span>
    );
  }
  return <span className="pill">ended</span>;
}

export default function HackathonsPage() {
  const [windows, setWindows] = useState<HackathonListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const all = await fetchAllWindows();
        if (!cancelled) setWindows(all);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const g: Record<Status, HackathonListing[]> = { live: [], upcoming: [], ended: [] };
    for (const w of windows) g[statusOf(w, now)].push(w);
    // live: soonest-ending first; upcoming: soonest-starting; ended: most-recent first
    g.live.sort((a, b) => a.endTime - b.endTime);
    g.upcoming.sort((a, b) => a.startTime - b.startTime);
    g.ended.sort((a, b) => b.endTime - a.endTime);
    return g;
  }, [windows, now]);

  return (
    <div>
      <div className="kicker">judge board · public directory</div>
      <h1 className="page-title">Hackathons on NoCap</h1>
      <p className="muted">
        Every window running on the protocol. Open one to browse its projects and verified
        timelines — no wallet needed.{" "}
        <Link href="/organizer">Hosting one? Seed a window →</Link>
      </p>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Scanning Monad for hackathon windows — first load on the public RPC can take up to a
            minute.
          </p>
        </div>
      ) : windows.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            No hackathons seeded yet.
          </p>
          <Link className="btn btn-primary" href="/organizer">
            Host the first one
          </Link>
        </div>
      ) : (
        (["live", "upcoming", "ended"] as const).map((status) =>
          groups[status].length === 0 ? null : (
            <section key={status} style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
                {status === "live" ? "Live now" : status === "upcoming" ? "Upcoming" : "Ended"}
              </h2>
              <div className="stack">
                {groups[status].map((w) => (
                  <Link
                    key={w.hackathonId}
                    href={`/hackathon/${w.hackathonId}`}
                    className="card"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: "0.5rem 1rem",
                      }}
                    >
                      <h3 style={{ margin: 0, letterSpacing: "-0.02em", fontSize: "1.15rem" }}>
                        {w.name}
                      </h3>
                      <StatusPill status={status} />
                    </div>
                    <p className="muted mono" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                      {formatTs(w.startTime)} → {formatTs(w.endTime)}
                    </p>
                    <p className="dim" style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>
                      organizer <span className="mono">{shorten(w.organizer, 6)}</span> · open
                      board →
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )
        )
      )}
    </div>
  );
}
