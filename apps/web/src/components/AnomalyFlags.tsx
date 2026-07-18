"use client";

import { detectAnomalies, type AnomalyFlag } from "@nocap/shared";

export function AnomalyFlags({
  timestamps,
  window,
}: {
  timestamps: number[];
  window?: { startTime: number; endTime: number };
}) {
  const flags = detectAnomalies(timestamps, window);
  if (flags.length === 0) {
    return (
      <p className="dim" style={{ fontSize: "0.9rem" }}>
        No timing anomalies flagged. (Signals only — not a verdict.)
      </p>
    );
  }
  return (
    <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
      {flags.map((f: AnomalyFlag) => (
        <li key={f.id} style={{ marginBottom: "0.4rem" }}>
          <span className={f.severity === "warn" ? "badge-warn" : "pill"}>{f.severity}</span>{" "}
          {f.message}
        </li>
      ))}
    </ul>
  );
}
