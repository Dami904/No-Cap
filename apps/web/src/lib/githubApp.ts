import "server-only";
import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/**
 * Server-only: authenticates as the NoCap GitHub App (not a user) to look up which
 * repos an installation was granted, so /register can offer a real "pick your repo"
 * list instead of free-text — GitHub only lets an app see repos its installer
 * actually administers, which is what makes registration a real ownership proof.
 */

/**
 * Stateless session cookie: `${installationId}.${hmac}`. The installation id is
 * signed with a server-only secret rather than stored server-side because this
 * runs on serverless — an in-memory session map is wiped on every cold start and
 * isn't shared between instances, which surfaced as "reconnect GitHub every
 * visit." The id itself isn't secret (it's just a pointer; all API access still
 * goes through the App's own credentials) — the signature only stops a visitor
 * from forging a cookie that points at someone else's installation.
 */
export function signInstallationCookie(installationId: number): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET not set");
  const mac = createHmac("sha256", secret).update(String(installationId)).digest("hex");
  return `${installationId}.${mac}`;
}

export function verifyInstallationCookie(value: string | undefined): number | null {
  if (!value) return null;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const idPart = value.slice(0, dot);
  const macPart = value.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(idPart).digest("hex");
  if (macPart.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(macPart), Buffer.from(expected))) return null;
  const id = Number(idPart);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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
