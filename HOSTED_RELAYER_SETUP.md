# Hosted relayer — remaining setup

Everything code-side is built and, where testable without external accounts, proven
working on Monad testnet (see "What's already verified" below). Two things remain
that only a human with a GitHub account and a hosting decision can do — nothing here
can be automated away.

## 1. Register the GitHub App

This is the one-click "Connect GitHub" experience on `/register`. It cannot be
created by an agent — it requires your GitHub login in a browser.

1. Go to **github.com/settings/apps/new** (or your org's equivalent).
2. Fill in:
   - **GitHub App name**: anything unique, e.g. `nocap-provenance` — this becomes
     `NEXT_PUBLIC_GITHUB_APP_SLUG`.
   - **Homepage URL**: your deployed app's URL (see step 2 below).
   - **Setup URL**: `https://<your-domain>/api/github/install/callback`
     — check **"Redirect on update"** too, so re-installs also hit the callback.
   - **Webhook URL**: `https://<your-domain>/api/github/webhook`
   - **Webhook secret**: generate a strong random value (e.g. `openssl rand -hex 32`)
     — this exact string goes in **two** places and must match byte-for-byte:
     the GitHub App's webhook secret field, and `GITHUB_WEBHOOK_SECRET` in your
     deployment's env vars. A mismatch fails signature verification silently (401,
     no other clue) — if webhooks 401, re-check this first.
   - **Permissions**: Repository → **Contents: Read-only**, **Metadata: Read-only**.
     Nothing else — the app never touches code, only push events.
   - **Subscribe to events**: check **Push**.
   - **Where can this GitHub App be installed?**: "Any account" if you want other
     hackathon builders to use it, "Only this account" for personal/testing use.
3. Create the app. On its settings page:
   - Note the **App ID** → `GITHUB_APP_ID`.
   - **Generate a private key** (downloads a `.pem` file) → `GITHUB_APP_PRIVATE_KEY`.
     Paste the full PEM contents (including `-----BEGIN/END-----` lines) into the
     env var — if your hosting platform's env var UI collapses newlines, replace
     real newlines with literal `\n`; `lib/githubApp.ts` already normalizes both forms.

## 2. Deploy the app publicly

GitHub's webhook servers can't reach `localhost` — this needs a real HTTPS URL
before step 1's Webhook URL / Setup URL will resolve.

1. Deploy `apps/web` (Vercel is the path of least resistance for a Next.js app —
   connect the repo, set the root directory to `apps/web`).
2. Set every env var from `apps/web/.env.local` in the hosting platform's env
   settings — **all of them**, including the server-only ones
   (`NOCAP_RELAYER_PRIVATE_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
   `GITHUB_WEBHOOK_SECRET`). Never commit `.env.local` — it's gitignored on purpose.
3. Once deployed, go back to the GitHub App settings and fill in the real Setup URL
   / Webhook URL from step 1 (you likely put placeholders in during creation).
4. **Known gap to be aware of**: `lib/relayerStore.ts` and `lib/installationStore.ts`
   are in-memory by design (see the comment in each file) — they reset on every
   cold start / redeploy / multi-instance scale-out. On a single always-warm
   instance this is fine; on a platform that spins down idle instances (Vercel's
   default), a cold start briefly loses idempotency/rate-limit state (worst case:
   one duplicate anchor after a cold start — harmless, just wasted gas) and
   installation-session mappings (a builder would need to reconnect GitHub). If
   this matters for your deployment, swap both stores for a real KV (Vercel KV /
   Upstash Redis) — the interface is already isolated so only those two files change.

## 3. Fund the relayer wallet

Already done for the current deployment — flagging what to repeat if you rotate it:

- Relayer address: `0x550B5C45439Ebf11fd5B02AF8A970F5c4Ce9B17B` (funded with 1.5 MON
  from the deployer wallet, testnet faucet from there if it runs low).
- To rotate to a new relayer key: generate a fresh wallet, fund it, then call
  `setRelayer(newAddress)` on `NoCapRegistry` as the admin (`0xA600bf7063...`) —
  **one transaction** re-authorizes every repo that opted in via
  `registerAndAuthorize`; no per-repo migration needed. Update
  `NOCAP_RELAYER_PRIVATE_KEY` / `NEXT_PUBLIC_RELAYER_ADDRESS` in env afterward.

## What's already verified (no further action needed)

- Contracts redeployed with the hosted-relayer model, 19/19 tests passing, verified
  on MonadVision + MonadScan.
- A real, previously-undiscovered bug (git SHA never padded to `bytes32`) found and
  fixed — would have broken every anchor attempt, ever.
- The webhook → relayer → anchor pipeline **proven live on testnet**: a simulated
  signed GitHub push with two commits produced two real `Anchored` events on-chain,
  each with correctly padded commit hashes and correctly formatted labels
  (block 46073223–46073224 on `NoCapRegistry`
  `0x4931e958ac49919177E53e88DD4C7cE4D27a36E3`).
- A real nonce-collision bug on multi-commit pushes found and fixed during that
  same test (explicit local nonce management now, not per-call RPC lookups).
- `/register` already renders correctly in the "GitHub not connected yet" state and
  falls back cleanly to the self-hosted CI path — confirmed by screenshot.

## What's still unverified (blocked on steps 1–2 above)

- The actual "Connect GitHub" → install → repo picker flow, end to end with a real
  GitHub App. The code is complete and typechecked but has never run against a real
  App ID/private key, since none exists yet.
