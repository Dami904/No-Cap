# NoCap

**your build, no cap.**

Onchain build-provenance protocol for Monad. A GitHub Action anchors every commit fingerprint onchain so hackathon timelines are **verifiable**, not claimed.

Judges open a public timeline and see a green badge: *build started after registration opened.*

---

## What you get (end-to-end)

| Role | Flow |
|------|------|
| **Organizer** | Deploy contracts → seed hackathon window → share judge board |
| **Builder** | Register repo → add CI burner as contributor → push (auto-anchor) |
| **Judge** | `/hackathon/spark-2026` board → `/verify/{owner}/{repoId}` timeline + anomalies |

### Features shipped

- **NoCapRegistry** — register project (+ hackathonId), contributors, event-only anchors  
- **HackathonRegistry** — reusable windows (Spark seeded at deploy)  
- **NoCapBadge** — soulbound “Certified No Cap” NFT (optimistic claim)  
- **GitHub Action** — auto-anchor on push + loud low-balance failure  
- **CLI** — `nocap anchor` manual fallback  
- **Web** — `/`, `/register`, `/verify`, `/dashboard`, `/hackathon`, `/badge`, `/embed`  
- **Anomaly signals** — timing-only heuristics (not DQ)  
- **Embed widget** — `apps/web/public/widget.js`, served at `/widget.js`  
- **Forensic report API** — `GET /api/report/{owner}/{repoId}`  

**Trust model:** default attester is a **per-repo CI burner key**, not the human author’s personal wallet. State that in every demo.

---

## Monorepo layout

```
NoCap/
  contracts/          # Foundry — NoCapRegistry, HackathonRegistry, NoCapBadge
  packages/shared/    # computeRepoId + ABIs + window heuristics
  packages/cli/       # nocap CLI
  apps/web/           # Next.js frontend (public/widget.js = embed script)
  .github/workflows/  # auto-anchor Action
  PRODUCT.md
  nocap-monad-build-plan.md
```

---

## Phase map (all implemented)

| Phase | Status |
|-------|--------|
| 0 Setup | Foundry + monorepo + PRODUCT.md |
| 1 MVP | Registry, Action, `/` + `/verify`, window badge |
| 2 Expansion | HackathonRegistry, multi-contributor, `/register`, `/dashboard`, CLI |
| 2.5 Discovery | `/hackathon/[id]`, log cache, chunked RPC |
| 3 Stretch | Embed widget, soulbound badge, anomalies, report API (x402-ready) |

---

## Prerequisites (plan §1) — installed / documented

| Skill | Status |
|-------|--------|
| **MONSKILLS** (`npx skills add therealharpaljadeja/monskills`) | Installed → canonical copy at `skills/monskill/`; mirrored per-harness (gitignored) at `.agents/`, `.claude/`, etc. |
| Router | `AGENTS.md` points agents at monskill first |
| Nested skills used | scaffold, wallet, gas, addresses, concepts, indexer, wallet-integration |
| **Impeccable** | Installed → `skills/impeccable/`; `PRODUCT.md` + `DESIGN.md` are brand/visual source |
| **Foundry** | `contracts/` with Monad testnet `chain_id=10143`, RPC in `foundry.toml` |
| **`.monskills`** | `built-with=monskills` / `chain=monad-testnet` |

Wallet UI: **injected wagmi** works out of the box. Full **Para** path needs you to `para login` (monskills forbids agents doing that for you) — see `apps/web/src/lib/wallet-note.md`.

Indexer: live `eth_getLogs` for MVP; Envio scaffold notes in `indexer/README.md` after deploy+verify.

---

## Quick start

### 0. Skills (if cloning fresh)

```bash
npx skills add therealharpaljadeja/monskills --all --copy
# optional design gate
npx impeccable install
```

### 1. Contracts

```bash
# Foundry on PATH
cd contracts
forge test
```

Deploy to Monad testnet (account `nocap-deployer` funded from faucet):

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet-rpc.monad.xyz --account nocap-deployer --broadcast
```

Verify (Sourcify):

```bash
forge verify-contract <address> NoCapRegistry --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```

Record addresses → `apps/web/.env.local` (see `.env.example`).

### 2. Web

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
# fill addresses
npm run dev
```

Open http://localhost:3000

### 3. Register + anchor (builder path)

**Hosted (default, zero secrets):** Connect wallet → **Register** → **Connect GitHub**
→ pick your repo → sign once (`registerAndAuthorize`). A hosted relayer watches
pushes via a GitHub webhook and anchors every commit automatically — no CI secrets,
no workflow file. Requires the GitHub App to be set up first; see
[`HOSTED_RELAYER_SETUP.md`](HOSTED_RELAYER_SETUP.md) for the one-time setup and what's
already verified working on testnet.

**Self-hosted (DIY, always available):** on `/register`, click *"I'll run my own CI
burner instead"*.
1. Connect wallet → **Register** → enter `owner/repo`
2. **Add contributor** = Action burner address
3. Repo secrets: `NOCAP_PRIVATE_KEY`, `NOCAP_REGISTRY`
4. Push → Action anchors → open `/verify/{yourAddress}/{repoId}`

### 4. CLI fallback

```bash
cd packages/cli && npm install
export NOCAP_PRIVATE_KEY=0x...
export NOCAP_REGISTRY=0x...
npx tsx src/index.ts anchor --repo you/repo --sha <fullsha> --message "ship it"
```

---

## Canonical `repoId`

**One helper everywhere** (`packages/shared`):

```ts
repoId = keccak256(utf8(lowercase("owner/repo")))
```

No `https://`, no trailing slash. Mismatch = empty verify page forever.

---

## Spark window (seeded)

- Start: `1783947600` — 2026-07-13 13:00 UTC  
- End: `1784505599` — 2026-07-19 23:59:59 UTC  
- Id string: `spark-2026` → `keccak256("spark-2026")`

Re-check against the live hackathon page before submission.

---

## Security rails

- Burner wallet only for Action/deployer — never reuse  
- Key only in GitHub Secrets / env — never frontend  
- `anchor` gated by `isContributor`  
- No source code / PII onchain — hashes + short labels only  
- Badge eligibility is **optimistic + publicly checkable**, not fully trustless re-derivation  

---

## Demo video script (&lt; 3 min)

1. Register project on UI  
2. Add CI address as contributor  
3. Push a commit on camera  
4. Show Action green  
5. Open `/verify` — timeline updates  
6. Point at green **No Cap** badge  
7. Flash judge board  

Post line: *I built a tool that proves hackathon submissions aren’t backdated, then used it to prove this one isn’t — no cap.*

---

## License

MIT
