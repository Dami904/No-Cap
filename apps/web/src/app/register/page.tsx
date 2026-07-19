"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Hex } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  computeRepoId,
  noCapRegistryAbi,
  ZERO_ADDRESS,
} from "@nocap/shared";
import { ADDRESSES } from "@/lib/config";
import { fetchAllWindows, type HackathonListing } from "@/lib/indexer";
import { formatTs } from "@/lib/format";
import { ConnectButton } from "@/components/ConnectButton";
import { RepoPicker, type InstalledRepo } from "@/components/RepoPicker";

function windowStatus(w: HackathonListing, now: number): "live" | "upcoming" | "ended" {
  if (now < w.startTime) return "upcoming";
  if (now > w.endTime) return "ended";
  return "live";
}

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";
const installUrl = GITHUB_APP_SLUG
  ? `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`
  : null;

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const ghStatus = searchParams.get("gh"); // "connected" | "pending" | null

  const [ghRepos, setGhRepos] = useState<InstalledRepo[] | null>(null);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghLoading, setGhLoading] = useState(true);
  const [ghError, setGhError] = useState<string | null>(null);

  const [repo, setRepo] = useState("");
  const [windows, setWindows] = useState<HackathonListing[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<Hex | "">("");
  const [done, setDone] = useState(false);

  const repoId = useMemo(() => (repo.trim() ? computeRepoId(repo) : null), [repo]);
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const canRegister = ghConnected && !!ghRepos && ghRepos.length > 0;

  useEffect(() => {
    fetch("/api/github/installations/repos")
      .then(async (r) => ({ status: r.status, data: await r.json() }))
      .then(({ status, data }: { status: number; data: { connected: boolean; repos: InstalledRepo[]; error?: string } }) => {
        setGhConnected(data.connected);
        setGhRepos(data.repos);
        if (data.repos.length === 1) setRepo(data.repos[0]!.fullName);
        if (status !== 200 && data.error) setGhError(data.error);
        else if (data.connected && data.repos.length === 0) {
          setGhError(
            "Connected, but GitHub returned zero repos. This usually means the app was installed with access limited to specific repos, and the one you want wasn't selected — go to github.com/settings/installations → nocap-provenance → Configure, and add it."
          );
        }
      })
      .catch(() => {
        setGhConnected(false);
        setGhRepos([]);
        setGhError("Couldn't reach the installations API — try refreshing.");
      })
      .finally(() => setGhLoading(false));
  }, []);

  async function disconnectGithub() {
    await fetch("/api/github/disconnect", { method: "POST" }).catch(() => {});
    setGhConnected(false);
    setGhRepos([]);
    setGhError(null);
    setRepo("");
  }

  useEffect(() => {
    let cancelled = false;
    fetchAllWindows()
      .then((all) => {
        if (cancelled) return;
        setWindows(all);
        const live = all.find((w) => windowStatus(w, now) === "live");
        const upcoming = all
          .filter((w) => windowStatus(w, now) === "upcoming")
          .sort((a, b) => a.startTime - b.startTime)[0];
        const pick = live ?? upcoming ?? all[0];
        if (pick) setSelectedId(pick.hackathonId);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWindowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [now]);

  const hackWin = useMemo(
    () => windows.find((w) => w.hackathonId === selectedId) ?? null,
    [windows, selectedId]
  );

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const registryReady = ADDRESSES.registry !== ZERO_ADDRESS;

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!repoId || !hackWin) return;
    const url = `https://github.com/${repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "")}`;
    // One signature: registers AND opts this repo into the hosted relayer, which is
    // already watching this exact repo because GitHub only let us see it after
    // verifying the connected account administers it.
    await writeContractAsync({
      address: ADDRESSES.registry,
      abi: noCapRegistryAbi,
      functionName: "registerAndAuthorize",
      args: [repoId, url, hackWin.hackathonId],
      gas: 220_000n,
    });
    setDone(true);
  }

  return (
    <div className="page-narrow">
      <div className="kicker">builders</div>
      <h1 className="page-title">Register project</h1>
      <p className="muted">
        Connect GitHub, pick your repo, sign once. NoCap anchors every push automatically —
        no secrets to paste, no workflow file to babysit.
      </p>

      {!registryReady && (
        <div className="error-box">
          <code>NEXT_PUBLIC_NOCAP_REGISTRY</code> is not set. Deploy contracts and fill{" "}
          <code>apps/web/.env.local</code>.
        </div>
      )}

      {ghStatus === "pending" && (
        <div className="error-box">
          GitHub install is waiting on approval from your org — nothing to connect yet.
        </div>
      )}

      <div className="card">
        {!isConnected ? (
          <>
            <p className="muted">Connect a wallet to register (becomes repoOwner).</p>
            <ConnectButton />
          </>
        ) : (
          <>
            <p className="dim" style={{ fontSize: "0.9rem" }}>
              Connected as <span className="mono">{address}</span>
            </p>

            {!done && !isSuccess && (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  {ghLoading ? (
                    <p className="muted">Checking GitHub connection…</p>
                  ) : canRegister ? (
                    <div
                      className="success-box"
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                      }}
                    >
                      <span>
                        GitHub connected — {ghRepos!.length} repo
                        {ghRepos!.length === 1 ? "" : "s"} available.
                      </span>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem" }}
                        onClick={disconnectGithub}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="card" style={{ textAlign: "center" }}>
                      <p className="muted" style={{ marginTop: 0 }}>
                        Connect GitHub so NoCap can anchor your pushes automatically.
                        Installing only grants access to repos you choose.
                      </p>
                      {installUrl ? (
                        <a className="btn btn-primary" href={installUrl}>
                          Connect GitHub →
                        </a>
                      ) : (
                        <p className="dim" style={{ fontSize: "0.85rem" }}>
                          GitHub App isn&apos;t configured on this deployment yet.
                        </p>
                      )}
                    </div>
                  )}
                  {ghError && <div className="error-box">{ghError}</div>}
                </div>

                {canRegister && (
                  <form onSubmit={onRegister}>
                    <label className="field">
                      Repo
                      <RepoPicker repos={ghRepos!} value={repo} onChange={setRepo} />
                    </label>

                    {repoId && (
                      <p className="mono dim" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                        repoId {repoId}
                      </p>
                    )}

                    <label className="field">
                      Hackathon
                      {windowsLoading ? (
                        <select disabled>
                          <option>Loading hackathons from chain…</option>
                        </select>
                      ) : windows.length === 0 ? (
                        <select disabled>
                          <option>No hackathons seeded yet</option>
                        </select>
                      ) : (
                        <select
                          value={selectedId}
                          onChange={(e) => setSelectedId(e.target.value as Hex)}
                          required
                        >
                          {windows.map((w) => {
                            const s = windowStatus(w, now);
                            return (
                              <option key={w.hackathonId} value={w.hackathonId}>
                                {w.name} {s === "live" ? "(live)" : s === "upcoming" ? "(upcoming)" : "(ended)"}
                              </option>
                            );
                          })}
                        </select>
                      )}
                      {hackWin && (
                        <span className="dim" style={{ fontSize: "0.8rem" }}>
                          {formatTs(hackWin.startTime)} → {formatTs(hackWin.endTime)}
                        </span>
                      )}
                      {!windowsLoading && windows.length === 0 && (
                        <span className="dim" style={{ fontSize: "0.8rem" }}>
                          Ask your organizer to <Link href="/organizer">seed a window</Link> first.
                        </span>
                      )}
                    </label>

                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!registryReady || !hackWin || !repoId || isPending || confirming}
                    >
                      {isPending || confirming ? "Submitting…" : "Register + enable auto-anchor"}
                    </button>
                  </form>
                )}
              </>
            )}

            {(done || isSuccess) && repoId && address && (
              <p style={{ marginTop: "1.25rem" }}>
                <Link className="btn btn-primary" href={`/verify/${address}/${repoId}`}>
                  Open verify page →
                </Link>
              </p>
            )}

            {error && <div className="error-box">{error.message}</div>}
            {hash && (
              <p className="mono dim" style={{ fontSize: "0.8rem" }}>
                tx {hash}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
