"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  computeHackathonId,
  hackathonRegistryAbi,
  ZERO_ADDRESS,
} from "@nocap/shared";
import { ADDRESSES } from "@/lib/config";
import { getPublicClient } from "@/lib/publicClient";
import { getWindowById, type RepoWindow } from "@/lib/indexer";
import { ConnectButton } from "@/components/ConnectButton";
import { shorten } from "@/lib/format";

/** datetime-local strings are treated as UTC — hackathon windows are announced in UTC. */
function toEpochUtc(local: string): number | null {
  if (!local) return null;
  const ms = Date.parse(`${local}:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export default function OrganizerPage() {
  const { address, isConnected } = useAccount();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [existing, setExisting] = useState<RepoWindow | null>(null);
  const [organizer, setOrganizer] = useState<Address | null>(null);

  const hackathonId = useMemo(
    () => (slug.trim() ? computeHackathonId(slug.trim().toLowerCase()) : null),
    [slug]
  );
  const startTs = toEpochUtc(start);
  const endTs = toEpochUtc(end);

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    setExisting(null);
    setOrganizer(null);
    if (!hackathonId || ADDRESSES.hackathonRegistry === ZERO_ADDRESS) return;
    const t = setTimeout(async () => {
      const win = await getWindowById(hackathonId).catch(() => null);
      setExisting(win);
      if (win) {
        const org = await getPublicClient()
          .readContract({
            address: ADDRESSES.hackathonRegistry,
            abi: hackathonRegistryAbi,
            functionName: "organizerOf",
            args: [hackathonId],
          })
          .catch(() => null);
        setOrganizer((org as Address) ?? null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [hackathonId]);

  const takenByOther =
    !!existing &&
    !!organizer &&
    !!address &&
    organizer.toLowerCase() !== address.toLowerCase();
  const validTimes = startTs != null && endTs != null && endTs > startTs;
  const canSubmit =
    isConnected && !!hackathonId && !!name.trim() && validTimes && !takenByOther;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hackathonId || startTs == null || endTs == null) return;
    await writeContractAsync({
      address: ADDRESSES.hackathonRegistry,
      abi: hackathonRegistryAbi,
      functionName: "registerWindow",
      args: [hackathonId, name.trim(), BigInt(startTs), BigInt(endTs)],
      gas: 220_000n,
    });
  }

  return (
    <div className="page-narrow">
      <div className="kicker">organizers</div>
      <h1 className="page-title">Host a hackathon</h1>
      <p className="muted">
        Seed a time window in the <code>HackathonRegistry</code>. Hosting is permissionless —
        the first wallet to claim a slug owns it. Once it&apos;s onchain, builders register
        projects under it and its judge board goes live at <code>/hackathon/&lt;slug&gt;</code>.
      </p>

      <div className="card">
        {!isConnected ? (
          <>
            <p className="muted">Connect a wallet to seed a window — you become its organizer.</p>
            <ConnectButton />
          </>
        ) : (
          <>
            {takenByOther && (
              <div className="error-box">
                Slug already claimed by{" "}
                <span className="mono">{shorten(organizer!, 6)}</span>. Only that wallet can
                update this window — pick a different slug.
              </div>
            )}
            <form onSubmit={onSubmit}>
              <label className="field">
                Hackathon name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ETH Denver 2027"
                  required
                />
              </label>
              <label className="field">
                Slug (becomes the board URL)
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="eth-denver-2027"
                  required
                />
                {existing && !takenByOther && (
                  <span className="dim" style={{ fontSize: "0.8rem" }}>
                    You own &ldquo;{existing.name}&rdquo; — submitting updates its dates.
                  </span>
                )}
              </label>
              <label className="field">
                Opens (UTC)
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Closes (UTC)
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
                {start && end && !validTimes && (
                  <span className="dim" style={{ fontSize: "0.8rem" }}>
                    Close must be after open.
                  </span>
                )}
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!canSubmit || isPending || confirming}
              >
                {isPending || confirming
                  ? "Seeding…"
                  : existing
                    ? "Update window"
                    : "Seed window on Monad"}
              </button>
            </form>
            {error && <div className="error-box">{error.message}</div>}
            {isSuccess && slug.trim() && (
              <div className="success-box">
                Window live.{" "}
                <Link href={`/hackathon/${slug.trim().toLowerCase()}`}>
                  Open its judge board →
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>What builders do next</h2>
        <ol className="muted" style={{ paddingLeft: "1.2rem", marginBottom: 0 }}>
          <li>
            Open <Link href="/register">Register</Link> and enter your slug as the hackathon
          </li>
          <li>Connect GitHub and pick their repo — no setup in the repo itself</li>
          <li>
            Their timelines appear on <code>/hackathon/&lt;slug&gt;</code> automatically
          </li>
        </ol>
      </div>
    </div>
  );
}
