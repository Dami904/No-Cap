"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Import injected from wagmi/core path — NOT "wagmi/connectors".
// The connectors barrel pulls baseAccount → @base-org/account → @x402/* which
// breaks Next.js resolution (@x402/evm/upto/client missing).
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { useState, type ReactNode } from "react";
import { monadTestnet } from "@/lib/chain";

const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
