import { defineChain } from "viem";
import { MONAD_TESTNET } from "@nocap/shared";

export const monadTestnet = defineChain({
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? MONAD_TESTNET.rpcUrls.default.http[0]!],
    },
  },
  blockExplorers: {
    default: MONAD_TESTNET.blockExplorers.default,
  },
});
