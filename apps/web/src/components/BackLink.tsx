"use client";

import { useRouter } from "next/navigation";

/** A subtle "back" control for drill-down pages. Uses the browser history when
 *  there is an in-app entry to return to, and falls back to a sensible parent
 *  route when the page was opened directly (shared link, new tab) so the arrow
 *  never dead-ends or bounces the user off the site. */
export function BackLink({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  function goBack() {
    // history.length > 1 means there's somewhere within this tab to go back to.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button type="button" className="back-link" onClick={goBack} aria-label="Go back">
      <span aria-hidden>←</span> Back
    </button>
  );
}
