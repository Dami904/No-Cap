"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Address, Hex } from "viem";
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

function windowStatus(w: HackathonListing, now: number): "live" | "upcoming" | "ended" {
  if (now < w.startTime) return "upcoming";
  if (now > w.endTime) return "ended";
  return "live";
}

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";
const installUrl = GITHUB_APP_SLUG
  ? `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`
  : null;

type InstalledRepo = { fullName: string; private: boolean };

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

  const [repo, setRepo] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [contributor, setContributor] = useState("");
  const [windows, setWindows] = useState<HackathonListing[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<Hex | "">("");
  const [step, setStep] = useState<"register" | "contributor" | "done">("register");

  const repoId = useMemo(() => (repo.trim() ? computeRepoId(repo) : null), [repo]);
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const usingHostedRelayer = !manualMode && ghConnected;

  useEffect(() => {
    fetch("/api/github/installations/repos")
      .then((r) => r.json())
      .then((data: { connected: boolean; repos: InstalledRepo[] }) => {
        setGhConnected(data.connected);
        setGhRepos(data.repos);
        if (data.repos.length === 1) setRepo(data.repos[0]!.fullName);
      })
      .catch(() => {
        setGhConnected(false);
        setGhRepos([]);
      })
      .finally(() => setGhLoading(false));
  }, []);

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
    const url =
      repoUrl.trim() ||
      `https://github.com/${repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "")}`;
    // Explicit gas limits — Monad charges gas_limit (monskills gas/), not gas used.
    if (usingHostedRelayer) {
      // One signature: registers AND opts this repo into the hosted relayer, which
      // is already watching this exact repo because GitHub only let us see it after
      // verifying the connected account administers it.
      await writeContractAsync({
        address: ADDRESSES.registry,
        abi: noCapRegistryAbi,
        functionName: "registerAndAuthorize",
        args: [repoId, url, hackWin.hackathonId],
        gas: 220_000n,
      });
      setStep("done");
    } else {
      await writeContractAsync({
        address: ADDRESSES.registry,
        abi: noCapRegistryAbi,
        functionName: "registerProject",
        args: [repoId, url, hackWin.hackathonId],
        gas: 180_000n,
      });
      setStep("contributor");
    }
  }

  async function onAddContributor(e: React.FormEvent) {
    e.preventDefault();
    if (!repoId || !contributor) return;
    await writeContractAsync({
      address: ADDRESSES.registry,
      abi: noCapRegistryAbi,
      functionName: "addContributor",
      args: [repoId, contributor as Address],
      gas: 80_000n,
    });
    setStep("done");
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

            {step === "register" && (
              <>
                {!manualMode && (
                  <div style={{ marginBottom: "1rem" }}>
                    {ghLoading ? (
                      <p className="muted">Checking GitHub connection…</p>
                    ) : ghConnected && ghRepos && ghRepos.length > 0 ? (
                      <div className="success-box">
                        GitHub connected — {ghRepos.length} repo
                        {ghRepos.length === 1 ? "" : "s"} available.
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
                            GitHub App not configured yet — use manual registration below.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={onRegister}>
                  {usingHostedRelayer && ghRepos && ghRepos.length > 0 ? (
                    <label className="field">
                      Repo
                      <select value={repo} onChange={(e) => setRepo(e.target.value)} required>
                        <option value="" disabled>
                          Select a repo…
                        </option>
                        {ghRepos.map((r) => (
                          <option key={r.fullName} value={r.fullName}>
                            {r.fullName}
                            {r.private ? " (private)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        GitHub repo (owner/name)
                        <input
                          value={repo}
                          onChange={(e) => setRepo(e.target.value)}
                          placeholder="you/nocap-demo"
                          required
                        />
                      </label>
                      <label className="field">
                        Repo URL (optional)
                        <input
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          placeholder="https://github.com/you/nocap-demo"
                        />
                      </label>
                    </>
                  )}

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
                    {isPending || confirming
                      ? "Submitting…"
                      : usingHostedRelayer
                        ? "Register + enable auto-anchor"
                        : "Register on Monad"}
                  </button>
                </form>

                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}
                  onClick={() => setManualMode((v) => !v)}
                >
                  {manualMode ? "Use GitHub connection instead" : "I'll run my own CI burner instead"}
                </button>
              </>
            )}

            {step === "contributor" && repoId && (
              <div style={{ marginTop: "1.25rem" }}>
                <div className="success-box">
                  Project registered. Now authorize your CI burner as a contributor.
                </div>
                <form onSubmit={onAddContributor}>
                  <label className="field">
                    Action / attester address
                    <input
                      value={contributor}
                      onChange={(e) => setContributor(e.target.value)}
                      placeholder="0x… burner from GitHub secret"
                      required
                    />
                  </label>
                  <button className="btn" type="submit" disabled={isPending || confirming}>
                    Add contributor
                  </button>
                </form>
              </div>
            )}

            {(step === "done" || isSuccess) && repoId && address && (
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

      {(manualMode || !ghConnected) && !ghLoading && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Self-hosted CI path</h2>
          <ol className="muted" style={{ paddingLeft: "1.2rem", marginBottom: 0 }}>
            <li>
              Add secrets <code>NOCAP_PRIVATE_KEY</code> (your own burner) and{" "}
              <code>NOCAP_REGISTRY</code>
            </li>
            <li>
              Keep <code>.github/workflows/nocap-anchor.yml</code>
            </li>
            <li>Add the burner address as contributor (form above)</li>
            <li>Push a commit — your Action anchors it</li>
          </ol>
        </div>
      )}
    </div>
  );
}
