"use client";

import {
  summarizeBuild,
  contributorSplit,
  formatDuration,
  type AnchorEvent,
} from "@nocap/shared";
import { formatTs, formatDay, shorten } from "@/lib/format";

/** Per-repo build rhythm — the tamper-proof *shape* of when a project was built,
 *  computed entirely from onchain anchor timestamps. No code is ever inspected. */
export function BuildRhythm({ anchors }: { anchors: AnchorEvent[] }) {
  const s = summarizeBuild(anchors.map((a) => a.timestamp));
  if (s.count === 0) {
    return (
      <p className="dim" style={{ fontSize: "0.9rem", margin: 0 }}>
        No anchors yet — nothing to summarize.
      </p>
    );
  }

  const split = contributorSplit(anchors.map((a) => a.builder));
  const metrics: { label: string; value: string }[] = [
    { label: "Span", value: s.count > 1 ? formatDuration(s.spanSeconds) : "single anchor" },
    { label: "Active days", value: `${s.activeDays}` },
    {
      label: "Longest gap",
      value: s.count > 1 ? formatDuration(s.longestGapSeconds) : "—",
    },
    {
      label: "Busiest day",
      value: s.busiestDay ? `${formatDay(s.busiestDay.day)} · ${s.busiestDay.count}` : "—",
    },
  ];

  return (
    <div className="stack" style={{ gap: "0.85rem" }}>
      <p className="dim" style={{ fontSize: "0.85rem", margin: 0 }}>
        First anchor <span className="mono">{s.firstTs ? formatTs(s.firstTs) : "—"}</span>
        {s.count > 1 && (
          <>
            {" · "}
            last <span className="mono">{s.lastTs ? formatTs(s.lastTs) : "—"}</span>
          </>
        )}
      </p>

      <div className="grid-2" style={{ gap: "0.6rem" }}>
        {metrics.map((m) => (
          <div className="stat" key={m.label} style={{ padding: "0.65rem 0.8rem" }}>
            <div className="label">{m.label}</div>
            <div className="value" style={{ fontSize: "1.05rem" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {split.length > 1 && (
        <div>
          <div className="label" style={{ marginBottom: "0.4rem" }}>
            Contributor split
          </div>
          {split.map((c) => (
            <div className="bar-row" key={c.builder}>
              <span className="mono dim">{shorten(c.builder)}</span>
              <div className="bar">
                <i style={{ width: `${Math.round(c.share * 100)}%` }} />
              </div>
              <span className="mono">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
