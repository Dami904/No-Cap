"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chain";
import { shorten } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (isConnected && address) {
    const wrong = chainId !== monadTestnet.id;
    return (
      <div className="connect-wrap">
        {wrong && (
          <button
            className="btn"
            type="button"
            onClick={() => switchChain?.({ chainId: monadTestnet.id })}
          >
            Switch to Monad
          </button>
        )}
        <button className="btn" type="button" onClick={() => disconnect()}>
          {shorten(address)}
        </button>
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <button
      className="btn btn-primary"
      type="button"
      disabled={!connector || isPending}
      onClick={() => connector && connect({ connector, chainId: monadTestnet.id })}
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
