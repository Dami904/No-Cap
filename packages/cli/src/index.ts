#!/usr/bin/env node
/**
 * NoCap CLI — manual/offline anchor fallback (model b teammates or pre-push).
 *
 * Usage:
 *   npx tsx packages/cli/src/index.ts anchor --repo owner/name --sha <fullsha> --message "msg"
 *
 * Env:
 *   NOCAP_PRIVATE_KEY   — attester wallet (burner or personal)
 *   NOCAP_REGISTRY      — NoCapRegistry address
 *   NOCAP_RPC_URL       — default https://testnet-rpc.monad.xyz
 *   NOCAP_MIN_BALANCE_WEI — optional; fail if balance below this (default 0.01 MON)
 */
import { Command } from "commander";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MONAD_TESTNET,
  computeRepoId,
  makeLabel,
  commitHashToBytes32,
  noCapRegistryAbi,
} from "@nocap/shared";

const program = new Command();
program.name("nocap").description("NoCap build-provenance CLI").version("0.1.0");

program
  .command("repo-id")
  .description("Compute canonical repoId for owner/repo")
  .argument("<repo>", "owner/repo")
  .action((repo: string) => {
    console.log(computeRepoId(repo));
  });

program
  .command("anchor")
  .description("Anchor a commit hash on Monad (manual fallback)")
  .requiredOption("--repo <owner/repo>", "GitHub repository full name")
  .requiredOption("--sha <sha>", "Full git commit SHA")
  .option("--message <msg>", "Commit message for label", "manual anchor")
  .option("--rpc <url>", "RPC URL", process.env.NOCAP_RPC_URL ?? MONAD_TESTNET.rpcUrls.default.http[0])
  .option("--registry <address>", "NoCapRegistry address", process.env.NOCAP_REGISTRY)
  .action(async (opts: {
    repo: string;
    sha: string;
    message: string;
    rpc: string;
    registry?: string;
  }) => {
    const pk = process.env.NOCAP_PRIVATE_KEY as Hex | undefined;
    if (!pk) {
      console.error("NOCAP_PRIVATE_KEY is required");
      process.exit(1);
    }
    if (!opts.registry) {
      console.error("NOCAP_REGISTRY or --registry is required");
      process.exit(1);
    }

    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const publicClient = createPublicClient({
      chain: {
        id: MONAD_TESTNET.id,
        name: MONAD_TESTNET.name,
        nativeCurrency: MONAD_TESTNET.nativeCurrency,
        rpcUrls: MONAD_TESTNET.rpcUrls,
      },
      transport: http(opts.rpc),
    });
    const walletClient = createWalletClient({
      account,
      chain: {
        id: MONAD_TESTNET.id,
        name: MONAD_TESTNET.name,
        nativeCurrency: MONAD_TESTNET.nativeCurrency,
        rpcUrls: MONAD_TESTNET.rpcUrls,
      },
      transport: http(opts.rpc),
    });

    const minBal = BigInt(process.env.NOCAP_MIN_BALANCE_WEI ?? parseEther("0.01").toString());
    const bal = await publicClient.getBalance({ address: account.address });
    if (bal < minBal) {
      console.error(
        `Balance ${bal} wei below threshold ${minBal}. Refill nocap-deployer from the Monad testnet faucet.`
      );
      process.exit(1);
    }

    const repoId = computeRepoId(opts.repo);
    // Git SHA-1 is 20 bytes; anchor() takes bytes32 — right-pad, don't just 0x-prefix
    // (viem throws a size-mismatch error on a raw 20-byte value here, uncaught before now).
    const shaHex = commitHashToBytes32(opts.sha);
    const label = makeLabel(opts.sha, opts.message);

    console.log("Attester:", account.address);
    console.log("repoId:", repoId);
    console.log("commit:", shaHex);
    console.log("label:", label);

    // Monad charges on gas_limit (monskills gas/) — keep tight, not wallet-default inflated.
    // anchor() is event-only + one mapping SLOAD; 120k is ample with small buffer.
    const gasLimit = 120_000n;

    const hash = await walletClient.writeContract({
      address: opts.registry as Address,
      abi: noCapRegistryAbi,
      functionName: "anchor",
      args: [repoId, shaHex, label],
      gas: gasLimit,
    });

    console.log("tx:", hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("status:", receipt.status, "block:", receipt.blockNumber.toString());
  });

program.parse();
