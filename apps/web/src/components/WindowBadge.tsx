"use client";

import { checkWindowCompliance } from "@nocap/shared";

export function WindowBadge({
  firstTs,
  lastTs,
  window,
}: {
  firstTs?: number;
  lastTs?: number;
  window: { startTime: number; endTime: number };
}) {
  const result = checkWindowCompliance(firstTs, lastTs, window);
  if (result.ok) {
    return <div className="badge-ok">✅ {result.reason}</div>;
  }
  return <div className="badge-bad">⛔ {result.reason}</div>;
}
