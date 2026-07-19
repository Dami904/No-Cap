# Configuration & deployment guide

How to stand up your own NoCap instance: the GitHub App, the relayer, the web app,
and the indexer. The reference deployment is live at
**https://nocap-protocol.vercel.app** — these are the steps that produced it.

Most of this is one-time setup. The only parts that can't be scripted are the GitHub
App registration and the Envio login, both of which need a browser.

---

## 1. Register the GitHub App

This powers the one-click "Connect GitHub" flow on `/register`.

1. Go to **github.com/settings/apps/new** (or your org's equivalent).
2. Fill in:
   - **GitHub App name** — anything unique, e.g. `nocap-provenance`. The URL-friendly
     slug becomes `NEXT_PUBLIC_GITHUB_APP_SLUG`.
   - **Homepage URL** — `https://<your-app>`
   - **Setup URL** — `https://<your-app>/api/github/install/callback`; also check
     **"Redirect on update"** so re-installs hit the callback.
   - **Webhook URL** — `https://<your-app>/api/github/webhook`
   - **Webhook secret** — a strong random value (`openssl rand -hex 32`). This exact
     string must match **byte-for-byte** in two places: the App's webhook-secret
     field and `GITHUB_WEBHOOK_SECRET` in your deployment env. A mismatch fails
     signature verification silently (HTTP 401) — check this first if webhooks 401.
   - **Permissions** — Repository → **Contents: Read-only** and **Metadata:
     Read-only**. Nothing else; the app reads push events, never code.
   - **Subscribe to events** — check **Push**.
   - **Where can this be installed?** — "Any account" to let other builders use it,
     "Only this account" for personal use.
3. On the created app's settings page:
   - Note the **App ID** → `GITHUB_APP_ID`.
   - **Generate a private key** (downloads a `.pem`) → `GITHUB_APP_PRIVATE_KEY`. Paste
     the full PEM including the `-----BEGIN/END-----` lines. If your host's env UI
     collapses newlines, replace them with literal `\n` — `lib/githubApp.ts` handles
     both forms.

The install session is a stateless, HMAC-signed cookie (signed with
`GITHUB_WEBHOOK_SECRET`), so it survives serverless cold starts with no session store.

---

## 2. Deploy the web app

Deployed on Vercel as project `nocap`, **linked from the monorepo root** with Root
Directory set to `apps/web`. This matters: the shared `packages/` workspace must ship
with the upload, so linking from inside `apps/web` alone breaks the build with
`Module not found: Can't resolve '@nocap/shared'`. Vercel deployment protection (the
default SSO gate) is disabled — the app must be reachable by GitHub's webhook servers
and by judges with no Vercel login.

Set env vars (`vercel env add <name> production`), then `vercel --prod`:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_*` | contract addresses, RPC, relayer address, GitHub App slug, indexer URL |
| `NOCAP_RELAYER_PRIVATE_KEY` | relayer signing key (server-only) |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` | from step 1 |

See [`apps/web/.env.example`](apps/web/.env.example) for the full list.

> **State note.** `lib/relayerStore.ts` keeps webhook idempotency + rate-limit state
> in memory by design (see its comment). On a warm instance this is fine; on a
> platform that spins idle instances down, a cold start can at worst re-anchor one
> commit (harmless, just gas). Swap it for a KV (Vercel KV / Upstash) if that matters
> — the interface is isolated to that one file.

---

## 3. Fund and rotate the relayer

- Reference relayer: `0x550B5C45439Ebf11fd5B02AF8A970F5c4Ce9B17B`, funded with testnet
  MON. Keep a small balance; each anchor costs gas.
- **To rotate:** generate a fresh wallet, fund it, and call `setRelayer(newAddress)`
  on `NoCapRegistry` as admin. That **one transaction** re-authorizes every repo that
  opted in — no per-repo migration. Then update `NOCAP_RELAYER_PRIVATE_KEY` and
  `NEXT_PUBLIC_RELAYER_ADDRESS` in the env.

---

## 4. Deploy the indexer

The web app reads event history from an Envio HyperIndex GraphQL database. Deploy it
and set `NEXT_PUBLIC_INDEXER_URL` to its endpoint — see
[`indexer/DEPLOY.md`](indexer/DEPLOY.md). Without it, the read functions return empty
rather than erroring, so the app still boots for local development.
