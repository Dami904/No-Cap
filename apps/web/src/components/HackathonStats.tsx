"use client";

import { summarizeHackathon, type AnchorEvent } from "@nocap/shared";
import { VelocityChart } from "./VelocityChart";

/** Event-level summary for one hackathon — participation + timing pulse across
 *  every registered project, computed from the anchors the board already loaded
 *  (zero extra RPC cost). Never inspects code. */
export function HackathonStats({
  rows,
  window,
}: {
  rows: { anchors: AnchorEvent[] }[];
  window?: { startTime: number; endTime: number };
}) {
  const perProject = rows.map((r) => r.anchors.map((a) => a.timestamp));
  const s = summarizeHackathon(perProject, window);
  const allTimestamps = perProject.flat();

  const tiles: { label: string; value: string | number }[] = [
    { label: "Projects", value: s.projects },
    { label: "Anchored", value: s.anchoredProjects },
    ...(window ? [{ label: "Compliant", value: `${s.compliantProjects} ✅` }] : []),
    { label: "Total anchors", value: s.totalAnchors },
  ];

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5rem 1rem",
        }}
      >
        <h2 className="page-title" style={{ fontSize: "1.1rem", margin: 0 }}>
          Event pulse
        </h2>
        {window && s.flaggedProjects > 0 && (
          <span className="badge-warn" style={{ fontSize: "0.75rem" }}>
            {s.flaggedProjects} flagged for timing
          </span>
        )}
      </div>
      <p className="dim" style={{ fontSize: "0.85rem", margin: "0.25rem 0 1rem" }}>
        Participation and build timing across the whole window — from chain, never code.
      </p>

      <div className="grid-3" style={{ gap: "0.6rem" }}>
        {tiles.map((t) => (
          <div className="stat" key={t.label} style={{ padding: "0.7rem 0.85rem" }}>
            <div className="label">{t.label}</div>
            <div className="value">{t.value}</div>
          </div>
        ))}
      </div>

      {allTimestamps.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <div className="label" style={{ marginBottom: "0.5rem" }}>
            Anchors per day
          </div>
          <VelocityChart timestamps={allTimestamps} />
        </div>
      )}
    </div>
  );
}
