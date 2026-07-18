#!/usr/bin/env node
/**
 * monskills-preferred verification: one call → MonadVision + Socialscan + Monadscan.
 * Usage:
 *   node scripts/verify-api.mjs <address> <ContractName> [path/File.sol:ContractName]
 *
 * Requires forge + contracts/ built. Fallback: forge verify-contract --verifier sourcify
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [address, contractName, fqName] = process.argv.slice(2);
if (!address || !contractName) {
  console.error(
    "Usage: node scripts/verify-api.mjs <address> <ContractName> [src/File.sol:ContractName]"
  );
  process.exit(1);
}

const fq = fqName || `src/${contractName}.sol:${contractName}`;
const contractsDir = join(process.cwd(), "contracts");
const tmp = join(contractsDir, ".verify-tmp");
mkdirSync(tmp, { recursive: true });

const standardPath = join(tmp, "standard-input.json");
const metaPath = join(tmp, "metadata.json");
const bodyPath = join(tmp, "verify.json");

execSync(
  `forge verify-contract ${address} ${contractName} --chain 10143 --show-standard-json-input > "${standardPath}"`,
  { cwd: contractsDir, shell: true, stdio: "inherit" }
);

const artifact = JSON.parse(
  readFileSync(join(contractsDir, "out", `${contractName}.sol`, `${contractName}.json`), "utf8")
);
writeFileSync(metaPath, JSON.stringify(artifact.metadata));

const compilerVersion =
  typeof artifact.metadata === "object" && artifact.metadata?.compiler?.version
    ? `v${artifact.metadata.compiler.version}`
    : "v0.8.24";

const body = {
  chainId: 10143,
  contractAddress: address,
  contractName: fq,
  compilerVersion,
  standardJsonInput: JSON.parse(readFileSync(standardPath, "utf8")),
  foundryMetadata: artifact.metadata,
};

writeFileSync(bodyPath, JSON.stringify(body));

const res = await fetch("https://agents.devnads.com/v1/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
