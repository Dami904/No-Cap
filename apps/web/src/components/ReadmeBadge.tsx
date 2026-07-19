"use client";

import { useState } from "react";

/** Live preview of a repo's SVG status badge plus the Markdown snippet to drop it
 *  in a README. Anyone who registers a repo gets a badge at a stable URL — this is
 *  how they copy it. */
export function ReadmeBadge({ owner, repoId }: { owner: string; repoId: string }) {
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://nocap-protocol.vercel.app";
  const badgeUrl = `${origin}/api/badge-svg/${owner}/${repoId}`;
  const verifyUrl = `${origin}/verify/${owner}/${repoId}`;
  const markdown = `[![NoCap build provenance](${badgeUrl})](${verifyUrl})`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the snippet is still selectable below */
    }
  }

  return (
    <div>
      <p className="dim" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        A live badge, updated from the chain — it reads <strong>Certified No Cap</strong> once the
        soulbound badge is minted. Paste into any README:
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={badgeUrl}
        alt="NoCap build-provenance badge"
        width={460}
        style={{ maxWidth: "100%", height: "auto", display: "block", marginBottom: "0.75rem" }}
      />

      <div style={{ position: "relative" }}>
        <code
          className="mono break-all"
          style={{ display: "block", fontSize: "0.78rem", paddingRight: "3.5rem" }}
        >
          {markdown}
        </code>
        <button
          type="button"
          className="btn"
          onClick={copy}
          style={{
            position: "absolute",
            top: "0.4rem",
            right: "0.4rem",
            fontSize: "0.72rem",
            padding: "0.3rem 0.6rem",
            minHeight: "auto",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
