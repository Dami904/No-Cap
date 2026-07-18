"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { noCapBadgeAbi } from "@nocap/shared";
import { ADDRESSES, DEFAULT_HACKATHON } from "@/lib/config";
import Link from "next/link";

export function ClaimBadgeButton({
  repoId,
  timestamps,
  hackathonId = DEFAULT_HACKATHON.id,
}: {
  repoId: Hex;
  timestamps: number[];
  hackathonId?: Hex;
}) {
  const { isConnected } = useAccount();
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash,
  });
  const [localErr, setLocalErr] = useState<string | null>(null);

  const canClaim =
    timestamps.length >= 3 &&
    ADDRESSES.badge !== "0x0000000000000000000000000000000000000000";

  async function claim() {
    setLocalErr(null);
    try {
      await writeContractAsync({
        address: ADDRESSES.badge,
        abi: noCapBadgeAbi,
        functionName: "claimBadge",
        args: [repoId, hackathonId, timestamps.map((t) => BigInt(t))],
        gas: 250_000n,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Claim failed");
    }
  }

  if (!canClaim) {
    return (
      <p className="dim" style={{ fontSize: "0.9rem" }}>
        Needs at least 3 anchors inside the window to claim.
      </p>
    );
  }

  return (
    <div>
      {!isConnected && <p className="muted">Connect wallet to claim (owner/claimer).</p>}
      <button
        className="btn btn-primary"
        type="button"
        disabled={!isConnected || isPending || confirming}
        onClick={claim}
      >
        {isPending || confirming ? "Claiming…" : "Claim soulbound badge"}
      </button>
      {(error || localErr) && (
        <div className="error-box">{localErr || error?.message}</div>
      )}
      {isSuccess && (
        <div className="success-box">
          Claimed.{" "}
          <Link href={`/badge/pending`}>View badge</Link>
          {hash && (
            <span className="mono" style={{ display: "block", fontSize: "0.8rem" }}>
              tx {hash}
            </span>
          )}
          {receipt && (
            <span className="dim" style={{ fontSize: "0.8rem" }}>
              Check tx logs for tokenId, then open /badge/[tokenId]
            </span>
          )}
        </div>
      )}
    </div>
  );
}
