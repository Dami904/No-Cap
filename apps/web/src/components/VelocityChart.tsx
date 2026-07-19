"use client";

import { velocityByDay } from "@nocap/shared";
import { formatDayShort } from "@/lib/format";

export function VelocityChart({ timestamps }: { timestamps: number[] }) {
  const rows = velocityByDay(timestamps);
  if (rows.length === 0) return <p className="muted">No velocity data yet.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.day}>
          <span className="mono dim" title={r.day}>{formatDayShort(r.day)}</span>
          <div className="bar">
            <i style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="mono">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
