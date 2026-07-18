"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Hex } from "viem";
import {
  computeHackathonId,
  checkWindowCompliance,
  type ProjectRegisteredEvent,
  type AnchorEvent,
} from "@nocap/shared";
import {
  fetchProjectsForHackathon,
  fetchAnchorsForRepo,
  getWindowById,
  type RepoWindow,
} from "@/lib/indexer";
import { DEFAULT_HACKATHON } from "@/lib/config";
import { formatTs, shorten } from "@/lib/format";
import { HackathonStats } from "@/components/HackathonStats";

type Row = ProjectRegisteredEvent & {
  anchors: AnchorEvent[];
  firstTs?: number;
  ok?: boolean;
};

type SortKey = "first" | "count" | "registered";

function projectName(url: string) {
  return url.replace(/^https?:\/\/github\.com\//i, "") || "repo";
}

function WindowPill({ row }: { row: Row }) {
  if (row.anchors.length === 0) return <span className="pill">no data</span>;
  if (row.ok === undefined) return <span className="pill">no window</span>;
  if (row.ok) {
    return (
      <span className="badge-ok" style={{ fontSize: "0.75rem" }}>
        ✅ No Cap
      </span>
    );
  }
  return (
    <span className="badge-bad" style={{ fontSize: "0.75rem" }}>
      ⛔
    </span>
  );
}

export default function HackathonBoardPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId: raw } = use(params);
  const hackathonId = useMemo(() => {
    if (raw.startsWith("0x") && raw.length === 66) return raw as Hex;
    if (raw === "spark" || raw === DEFAULT_HACKATHON.idString) return DEFAULT_HACKATHON.id;
    return computeHackathonId(raw);
  }, [raw]);

  const [rows, setRows] = useState<Row[]>([]);
  const [win, setWin] = useState<RepoWindow | null>(null);
  const [sort, setSort] = useState<SortKey>("first");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWindowById(hackathonId)
      .then((w) => {
        if (!cancelled) setWin(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [projects, window] = await Promise.all([
          fetchProjectsForHackathon(hackathonId),
          getWindowById(hackathonId).catch(() => null),
        ]);
        if (cancelled) return;
        const built: Row[] = [];
        for (const p of projects) {
          const anchors = await fetchAnchorsForRepo(p.repoId);
          const firstTs = anchors[0]?.timestamp;
          const lastTs = anchors[anchors.length - 1]?.timestamp;
          const ok = window
            ? checkWindowCompliance(firstTs, lastTs, {
                startTime: window.startTime,
                endTime: window.endTime,
              }).ok
            : undefined;
          built.push({ ...p, anchors, firstTs, ok });
        }
        if (!cancelled) setRows(built);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "count") copy.sort((a, b) => b.anchors.length - a.anchors.length);
    else if (sort === "registered") copy.sort((a, b) => a.registeredAt - b.registeredAt);
    else copy.sort((a, b) => (a.firstTs ?? Infinity) - (b.firstTs ?? Infinity));
    return copy;
  }, [rows, sort]);

  return (
    <div>
      <div className="kicker">judge board · public</div>
      <h1 className="page-title">{win ? win.name : raw}</h1>
      {win ? (
        <p className="muted mono" style={{ fontSize: "0.9rem" }}>
          {formatTs(win.startTime)}
          {" → "}
          {formatTs(win.endTime)}
        </p>
      ) : (
        !loading && (
          <p className="muted">
            No onchain window registered under this id — showing registrations without a
            compliance check.
          </p>
        )
      )}
      <p className="muted">
        Every project registered under this window. No wallet needed.
      </p>

      {!loading && rows.length > 0 && (
        <div style={{ margin: "1.25rem 0" }}>
          <HackathonStats
            rows={rows}
            window={win ? { startTime: win.startTime, endTime: win.endTime } : undefined}
          />
        </div>
      )}

      <div className="sort-row">
        {(
          [
            ["first", "First anchor"],
            ["count", "Commit count"],
            ["registered", "Registered"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={sort === k ? "btn btn-primary" : "btn"}
            onClick={() => setSort(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Scanning Monad for registered projects — first load on the public RPC can take up
            to a minute.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="project-cards project-cards-mobile-only">
            {sorted.length === 0 && (
              <div className="card muted">No projects registered for this hackathon yet.</div>
            )}
            {sorted.map((r) => (
              <article className="project-card" key={r.repoId}>
                <h3>
                  <a href={r.repoUrl} target="_blank" rel="noreferrer">
                    {projectName(r.repoUrl)}
                  </a>
                </h3>
                <div className="pc-meta">
                  <span className="mono">{shorten(r.builder)}</span>
                  <span>{r.anchors.length} anchors</span>
                  <span>{r.firstTs ? formatTs(r.firstTs) : "no anchors"}</span>
                </div>
                <div className="pc-actions">
                  <WindowPill row={r} />
                  <Link className="btn" href={`/verify/${r.builder}/${r.repoId}`}>
                    Verify →
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table */}
          {sorted.length === 0 ? (
            <div className="card table-desktop-only muted">
              No projects registered for this hackathon yet.
            </div>
          ) : (
            <div className="card table-desktop-only table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Owner</th>
                    <th>Anchors</th>
                    <th>First anchor</th>
                    <th>Window</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.repoId}>
                      <td>
                        <a href={r.repoUrl} target="_blank" rel="noreferrer">
                          {projectName(r.repoUrl)}
                        </a>
                      </td>
                      <td className="mono">{shorten(r.builder)}</td>
                      <td className="mono">{r.anchors.length}</td>
                      <td className="mono" style={{ fontSize: "0.85rem" }}>
                        {r.firstTs ? formatTs(r.firstTs) : "—"}
                      </td>
                      <td>
                        <WindowPill row={r} />
                      </td>
                      <td>
                        <Link href={`/verify/${r.builder}/${r.repoId}`}>Verify</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
