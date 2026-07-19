"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { explorerAddressUrl, ZERO_ADDRESS } from "@nocap/shared";
import { ADDRESSES, SITE } from "@/lib/config";
import { shorten } from "@/lib/format";
import { Nav } from "./Nav";
import { BackLink } from "./BackLink";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || "";
  const embed = path.startsWith("/embed");
  if (embed) {
    return <>{children}</>;
  }
  // Show a back control on every page except the landing page — these are the
  // drill-down destinations (register, dashboard, a hackathon board, a verify
  // timeline, a badge) a user reaches from somewhere else.
  const showBack = path !== "/";
  return (
    <div className="shell">
      <Nav />
      <main>
        {showBack && <BackLink />}
        {children}
      </main>
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="nav-brand">
              NoCap <span>// your build, no cap.</span>
            </Link>
            <p>
              {SITE.description} It proves <em>when</em> a build happened — not who wrote it
              or whether it&apos;s original.
            </p>
          </div>
          <div>
            <h4>Protocol</h4>
            <ul>
              <li>
                <Link href="/register">Register a project</Link>
              </li>
              <li>
                <Link href="/hackathons">Hackathons</Link>
              </li>
              <li>
                <Link href="/dashboard">Dashboard</Link>
              </li>
              <li>
                <Link href="/organizer">Host a hackathon</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Onchain</h4>
            <ul>
              {ADDRESSES.registry !== ZERO_ADDRESS && (
                <li>
                  <a
                    href={explorerAddressUrl(ADDRESSES.registry)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Registry <span className="mono">{shorten(ADDRESSES.registry)}</span> ↗
                  </a>
                </li>
              )}
              {ADDRESSES.badge !== ZERO_ADDRESS && (
                <li>
                  <a
                    href={explorerAddressUrl(ADDRESSES.badge)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Badge <span className="mono">{shorten(ADDRESSES.badge)}</span> ↗
                  </a>
                </li>
              )}
              <li>
                <a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">
                  Monad explorer ↗
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Trust model</h4>
            <ul>
              <li>Anchored by a hosted relayer, opt-in per repo</li>
              <li>Timing proofs only — never code content</li>
              <li>Anomalies surfaced, never auto-DQ&apos;d</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>NoCap · Monad testnet · chain id 10143</span>
          <span>MIT licensed</span>
        </div>
      </footer>
    </div>
  );
}
