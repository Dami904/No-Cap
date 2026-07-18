import "server-only";
import { createSign } from "node:crypto";

/**
 * Server-only: authenticates as the NoCap GitHub App (not a user) to look up which
 * repos an installation was granted, so /register can offer a real "pick your repo"
 * list instead of free-text — GitHub only lets an app see repos its installer
 * actually administers, which is what makes registration a real ownership proof.
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) throw new Error("GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not set");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  // iat backdated 60s per GitHub's guidance (tolerates minor clock drift); exp capped
  // at 9 minutes — GitHub App JWTs are only ever used to mint short-lived install tokens.
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  // Private keys are often stored with literal "\n" in env vars — normalize.
  const pem = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  const signature = base64url(signer.sign(pem));
  return `${unsigned}.${signature}`;
}

async function githubApiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const data = await githubApiFetch<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    signAppJwt(),
    { method: "POST" }
  );
  return data.token;
}

export type InstalledRepo = { fullName: string; private: boolean };

export async function listInstallationRepos(installationId: number): Promise<InstalledRepo[]> {
  const token = await getInstallationAccessToken(installationId);
  const data = await githubApiFetch<{
    repositories: { full_name: string; private: boolean }[];
  }>("/installation/repositories", token);
  return (data.repositories ?? []).map((r) => ({ fullName: r.full_name, private: r.private }));
}
