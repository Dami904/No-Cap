# NoCap — Full Build Plan (Monad Spark Hackathon)

> **How to use this doc:** Sections 1–10 are the handoff spec — paste them into your coding agent (Claude Code, Grok/Cline, Cursor, etc.) as-is, in order, one phase at a time. Section 11 is for you, not the agent — submission mapping and pitfalls to dodge.

---

## 0. What this is

**NoCap** is an onchain build-provenance protocol. It anchors a cryptographic fingerprint of every commit to Monad, automatically, via a GitHub Action — producing an immutable, judge-verifiable timeline that proves *when* a project was actually built, not just what a README claims.

Tagline: **your build, no cap.**

**Problem it solves:** Spark's own rules say the judging agent checks "if you started your project before the hackathon start time" and flags "suspicious commits." GitHub timestamps are editable and history can be rebased. There's currently no trustless way to prove a build's real timeline — to a judge, or to yourself.

**Self-referential proof:** the finished tool is run against its own repo. The submission literally shows NoCap verifying that NoCap was built inside the registration window.

---

## 1. Prerequisites — install these before writing any app code

Do not hand-roll wallet connect, deployment scripts, or frontend styling from scratch. This ecosystem has verified skills for all of it. Install and route through them first.

**MONSKILLS** (Monad-specific agent skills — scaffolding, wallet integration, gas, addresses, indexing):
```
npx skills add therealharpaljadeja/monskills
```
Claude Code users can instead run:
```
/plugin marketplace add therealharpaljadeja/monskills
/plugin install monskills@monskills
```
If you're driving this with a different model (Grok 4.5 via Cline/OpenRouter, etc.), use the universal `npx skills add` install above rather than the Claude Code plugin path — it works regardless of which model is executing.

After install, **always** start with the local `monskill` routing skill — it routes to the specific topic skill needed (`scaffold`, `wallet-integration`, `wallet`, `gas`, `concepts`, `addresses`, `tooling-and-infra`, `indexer`). Do not fetch skills.devnads.com during the build — use the locally installed files. Only fall back to the website if local install is unavailable.

**Impeccable** (frontend design skill — kills default AI-slop UI patterns):
```
npx impeccable install
```
Then run `/impeccable init` once at project start to capture `PRODUCT.md` (who the user is, brand voice, anti-references — for NoCap: direct, a little irreverent, crypto-native, zero corporate-dashboard energy). Use `/impeccable polish`, `/impeccable typeset`, `/impeccable colorize` etc. during frontend work, and `npx impeccable detect src/` before final submission as a slop-check gate. Note: Impeccable auto-detects and tunes to the harness it runs in (Claude Code, Cursor, Gemini CLI, Codex CLI); if the driving model/harness isn't one of those, it falls back to a general-purpose build — still functional.

**Foundry**, via Monad's official template rather than a bare `forge init`:
```
git clone https://github.com/monad-developers/foundry-monad
```
This template ships with `foundry.toml` already pointed at Monad testnet (`eth-rpc-url = "https://testnet-rpc.monad.xyz"`, `chain_id = 10143`).

---

## 2. Repo & environment setup

1. Fresh repository, fresh commit history — do not fork or import history from any prior project. First commit timestamp must be after **Jul 13, 2026 13:00 UTC** (Spark registration open).
2. Fetch `scaffold/` from MONSKILLS first for the monorepo layout (contracts + frontend + Action scripts).
3. Create a **deployer wallet via keystore, not a raw private key**:
   ```
   cast wallet import nocap-deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')
   ```
   Fund it from the Monad testnet faucet immediately — do this before anything else so gas is never a blocker later.
4. Fetch `wallet/` from MONSKILLS for how the agent's own deployer/admin wallet should be handled through the build (keystore usage, any Safe-controlled admin actions).

---

## 3. Onchain architecture

### 3.1 Core contract — `NoCapRegistry.sol`

Minimal state, event-driven. No source code or file contents ever go onchain — only hashes.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NoCapRegistry {
    event ProjectRegistered(address indexed builder, bytes32 indexed repoId, string repoUrl, uint256 registeredAt);
    event ContributorAdded(bytes32 indexed repoId, address indexed contributor);
    event Anchored(address indexed builder, bytes32 indexed repoId, bytes32 commitHash, string label, uint256 timestamp);

    mapping(bytes32 => address) public repoOwner;
    mapping(bytes32 => mapping(address => bool)) public isContributor;

    function registerProject(bytes32 repoId, string calldata repoUrl) external {
        require(repoOwner[repoId] == address(0), "already registered");
        repoOwner[repoId] = msg.sender;
        isContributor[repoId][msg.sender] = true;
        emit ProjectRegistered(msg.sender, repoId, repoUrl, block.timestamp);
    }

    function addContributor(bytes32 repoId, address contributor) external {
        require(msg.sender == repoOwner[repoId], "not owner");
        isContributor[repoId][contributor] = true;
        emit ContributorAdded(repoId, contributor);
    }

    function anchor(bytes32 repoId, bytes32 commitHash, string calldata label) external {
        require(isContributor[repoId][msg.sender], "not authorized for this project");
        emit Anchored(msg.sender, repoId, commitHash, label, block.timestamp);
    }
}
```

Design notes for the agent:
- **Canonical `repoId` encoding — one shared helper, used everywhere.** `repoId = keccak256(bytes(lowercase("owner/repo")))` — UTF-8, lowercase, no trailing slash, no `https://github.com/` prefix. Write this as a single function (e.g. `computeRepoId()`) and import it in the contract-interaction code, the GitHub Action, the CLI, and the frontend. Do **not** let the Action and the frontend each reimplement this inline — a single casing or whitespace mismatch between them means `/verify` pages stay empty forever with no error to point at.
- **Trust model — state this in the README, don't leave it implicit.** The default anchoring path (GitHub Action) signs with a per-repo CI key, not the human author's personal wallet. So the onchain proof reads as *"this repo's CI attested this SHA existed at this block time,"* not *"Alice personally signed this commit."* That's a legitimate and sufficient trust model for hackathon provenance — but say so explicitly, or a judge will ask "who's the real attester?" and the answer needs to already be in the doc.
- **Pick one contributor model and stick to it for the whole build.** `addContributor` + the CLI fallback exists so a teammate can anchor personally with their own wallet, giving true per-person attribution. But if the default CI Action is what actually fires on every push, most anchors in practice will come from the single shared attester key regardless of who authored the commit. Decide upfront: either (a) CI is the only attester and `addContributor` is unused/Phase-2-only, or (b) every teammate runs the CLI locally with their own wallet and CI is disabled. Don't ship a build where both paths fire inconsistently — the timeline's per-contributor attribution only means something if this is decided, not discovered.
- First-registrant-wins ownership prevents someone else anchoring garbage under your `repoId` and polluting your timeline.
- No `onlyOwner` circuit breaker on `anchor` beyond the contributor check — permissionless trigger, consistent with how Monad-native contracts in this ecosystem are typically designed (public entrypoint, no owner gate).
- No storage array of anchors — full history is reconstructed off-chain via `eth_getLogs` filtered on `repoId`/`builder` topics. Cheaper to call, and you don't need a subgraph for this scale.

### 3.2 Hackathon window registry — `HackathonRegistry.sol`

Makes the tool reusable beyond this one event instead of hardcoding Spark's dates into application logic.

```solidity
contract HackathonRegistry {
    struct Window { uint256 startTime; uint256 endTime; string name; }
    mapping(bytes32 => Window) public windows;
    address public admin;

    constructor() { admin = msg.sender; }

    function registerWindow(bytes32 hackathonId, string calldata name, uint256 startTime, uint256 endTime) external {
        require(msg.sender == admin, "not admin");
        windows[hackathonId] = Window(startTime, endTime, name);
    }
}
```
Seed one entry at deploy time for Spark itself: `startTime = 1815397200` (Jul 13 2026 13:00 UTC), `endTime = 1815955199` (Jul 19 2026 23:59 UTC) — pull the exact epoch values programmatically rather than hand-typing, and double check against the hackathon page before deploying.

### 3.3 Verified Build badge — `NoCapBadge.sol` (Phase 3, non-transferable ERC-721)

Onchain, trustless eligibility check — no offchain oracle needed:

```solidity
function isEligible(bytes32 repoId, bytes32 hackathonId, uint256[] calldata anchorTimestamps) public view returns (bool) {
    // agent implements: >= N anchors, span >= M days, first anchor within window, last anchor within window
}

function claimBadge(bytes32 repoId, bytes32 hackathonId, uint256[] calldata anchorTimestamps) external {
    require(isEligible(repoId, hackathonId, anchorTimestamps), "not eligible");
    _mint(msg.sender, tokenId);
}
```
Override `_update`/`transferFrom` to revert on transfer (soulbound) except mint/burn. Use OpenZeppelin's ERC-721 as the base rather than writing token mechanics from scratch — this is exactly the kind of primitive the MONSKILLS prompt conventions call out ("use existing verified primitives instead of building from scratch").

Badge copy/flavor: something like **"Certified No Cap"** as the badge title, since it's a shareable, screenshot-friendly artifact — the naming should carry into the product surface, not just the repo name.

**Honesty check — this is an optimistic claim, not a fully trustless check.** Passing `anchorTimestamps` as calldata and checking them once in `isEligible` does not make eligibility trustless — the contract is trusting the caller's supplied array, not independently re-deriving it from its own event history. True trustlessness needs either the contract iterating its own stored state, or verifying a Merkle root computed over the actual emitted logs — both are more work than a hackathon stretch feature usually justifies. Don't describe this in the pitch as "onchain, trustless eligibility." Describe it accurately as: **"optimistic claim, publicly checkable"** — anyone can independently re-verify a claimed badge against the raw chain logs and call it out if the numbers don't match. That's still a real and useful guarantee, just a different one than "trustless," and judges will trust the honest framing more than an oversold one.

---

## 4. Off-chain components

### 4.1 GitHub Action (the core automation — zero manual effort per commit)
- Trigger: `on: push`
- Steps: checkout → compute `repoId` using the **shared `computeRepoId()` helper from Section 3.1** (not a separate inline hash) and `commitHash = GITHUB_SHA` → call `anchor()` via viem/ethers using the deployer keystore (stored as a **dedicated burner wallet** in repo secrets — never reuse a wallet holding anything else)
- `label` = short SHA + truncated commit message
- Fetch `gas/` from MONSKILLS to set a sane gas limit ceiling on the Action's calls so a bad RPC response can't burn the wallet dry.
- **Add a balance check before the anchor call, and fail loudly, not silently.** If the burner wallet's balance drops below a small threshold, the Action should fail the workflow run with a clear "refill nocap-deployer from the faucet" message rather than let the anchor call revert quietly. A silent Action failure is invisible until someone checks `/verify` and finds a gap — exactly the kind of gap the whole product exists to make suspicious. Document the refill step in the README.

### 4.2 CLI fallback (`nocap anchor`)
For anchoring local/offline commits before push, or for contributors who don't want CI wired up. Same call, run manually.

### 4.3 Indexing layer
Fetch `indexer/` from MONSKILLS to pick a Monad-supported indexing approach rather than hand-rolling a subgraph. For this scale, direct `eth_getLogs` queries scoped by block range are sufficient — only reach for a hosted indexer if query volume becomes a real bottleneck.

**Scaling threshold — this is not hypothetical, it has a concrete trigger.** Direct `eth_getLogs` per page load works fine for a handful of projects and light traffic. It stops working once a hackathon has hundreds of registered projects and many judges hitting `/verify` pages concurrently during a judging window — public RPC rate limits and per-request log-range costs both bite at that point. See **Section 6, Phase 2.5** for what to add when this threshold is actually approached. Don't build the indexer speculatively before there's real volume to justify it.

---

## 5. Frontend — 6 pages

Fetch `wallet-integration/` from MONSKILLS for wallet connect (viewers need **no wallet** — only builders registering a project or anchoring manually need one). Fetch `concepts/` for block-state labels so the UI can show pending / safe / finalized on recent anchors instead of a binary "done."

1. **`/`** — landing page. What NoCap does, the "your build, no cap" tagline, a live example timeline (its own repo — dogfooding the pitch), CTA to connect wallet and register a project.
2. **`/verify/[address]/[repoId]`** — the product itself. No auth required to view. **`address` is the project owner's address — `repoOwner[repoId]` — not an arbitrary filter and not "whichever wallet is connected."** The page loads every `Anchored` event for that `repoId` regardless of which contributor fired it, and renders per-contributor attribution inline (name/address next to each entry) rather than filtering down to one signer. Define this explicitly — left ambiguous, an agent will pick a different interpretation ("owner," "any contributor," "connected wallet") depending on which part of the build it's touching, and the route will behave inconsistently between the landing page's example link and the register flow's generated link. Vertical commit timeline: hash (linked to GitHub), label, human timestamp, block explorer link. A green **"✅ No Cap: build started after registration opened"** badge computed by comparing the first anchor's timestamp against the registered `HackathonRegistry` window — this single visual is the whole pitch.
3. **`/register`** — connect wallet, register a new project, add contributors.
4. **`/dashboard`** — builder's own projects, commit velocity chart, longest gap, active-days streak (this chart doubles as viral-post material).
5. **`/badge/[tokenId]`** — public "Certified No Cap" badge view, shareable link (Phase 3).
6. **`/hackathon/[hackathonId]`** — Phase 2.5 addition, see Section 6. Public browse/leaderboard page listing every project registered under one `HackathonRegistry` window — the page a judge triaging a large batch of submissions actually needs, versus hunting down individual `/verify` links one at a time.

MVP only strictly needs pages 1 and 2 demo-ready; `/register` becomes necessary once anchoring real (non-hardcoded) data; `/dashboard`, `/badge`, and `/hackathon` are Phase 2/2.5/3.

Run `npx impeccable detect src/` before considering the frontend done — zero tolerance for gradient-text heroes, generic dashboard-template layouts, or default shadcn styling left unadapted.

---

## 6. Build phases — what to build, in order

**Phase 0 — Setup** (Section 1–2 of this doc)

**Phase 1 — MVP core (must be demo-ready before touching anything below)**
- `NoCapRegistry.sol`, deployed + verified on Monad testnet
- GitHub Action auto-anchoring on push, tested end-to-end with a real commit
- `/` and `/verify/[address]/[repoId]` pages rendering a real, live timeline from chain data
- Registration-window badge logic (hardcode Spark's window if `HackathonRegistry` isn't done yet — the badge visual matters more than the generality)

**Phase 2 — Expansion (do these if Phase 1 is solid)**
- `HackathonRegistry.sol` — makes the window check reusable/configurable instead of hardcoded
- Multi-contributor support (`addContributor`, per-builder attribution in the timeline UI)
- `/register` and `/dashboard` with velocity chart and streak stats
- CLI fallback tool

**Phase 2.5 — Hackathon-scale discovery (only build this once there's real volume to justify it — see the threshold note in Section 4.3)**

This phase exists because the write path (Action → contract) scales fine on its own — independent repos, independent transactions, Monad's throughput easily absorbs hundreds of concurrent hackathon participants anchoring commits. What doesn't scale without changes is the *read/discovery* side: as currently spec'd, `/verify/[address]/[repoId]` only works if someone already has the specific link, and every page load hits `eth_getLogs` directly. Fine for one hackathon's worth of judges checking a handful of links; not fine for a judge triaging hundreds of submissions, or for concurrent traffic during a judging window hitting public RPC rate limits.

Build, in this order:
1. **`/hackathon/[hackathonId]` browse/leaderboard page** — lists every project registered under one `HackathonRegistry` window, pulled from `ProjectRegistered` events filtered by hackathon association (add a `hackathonId` parameter to `registerProject`, or track the association off-chain at registration time — decide which and be consistent). Sortable by first-anchor time, commit count, or verified-badge status. This is the single highest-value addition for a large hackathon — it turns "a judge needs your link" into "a judge browses one page."
2. **Cached event indexing layer** — swap raw per-page-load `eth_getLogs` for a lightweight indexer that ingests `Anchored`/`ProjectRegistered` events into a queryable store (Postgres + a polling worker is enough; doesn't need to be a full subgraph). Fetch `indexer/` from MONSKILLS to pick a Monad-supported approach rather than hand-rolling event ingestion from scratch. This is what actually fixes the RPC-rate-limit problem — pages read from the cache, the cache polls the chain on its own schedule.
3. **Provisioned RPC provider** — swap the public Monad testnet RPC endpoint for a properly rate-limited provider sized for concurrent judge traffic. Fetch `tooling-and-infra/` from MONSKILLS to pick a Monad-supported option rather than guessing at a provider.

None of this touches the contracts — it's purely an off-chain read-path addition on top of an already-working Phase 1/2 core.

**Phase 3 — Stretch (build if everything above is solid and demo-tested, in this priority order)**
1. Embeddable widget — a small script/iframe other hackathon platforms could drop on a submission page to show a live "No Cap" badge. Highest demo ROI of the stretch items: it turns the pitch from "a tool for me" into "infrastructure for the ecosystem," and it's cheap to build on top of the already-working `/verify` route. Build this before the x402 tier below.
2. `NoCapBadge.sol` — soulbound "Certified No Cap" NFT, claimable once eligibility criteria pass (see the honesty note in Section 3.3 — pitch it as an optimistic, publicly-checkable claim), plus the `/badge/[tokenId]` page.
3. Anomaly flags — surface (not hide) patterns like "80% of commits in the final 2 hours" as a self-audit signal, not an accusation. Timing-based heuristics only — **no code-content analysis**, see exclusions.
4. x402-gated deep report tier — lowest priority stretch item, easy to burn a full day on for limited demo payoff. A free public timeline stays free; a downloadable forensic PDF (full anomaly breakdown, contributor split, exportable proof) gated behind a small USDC payment via Monad's official x402 Facilitator at `https://x402-facilitator.molandak.org`. Confirm support with `GET /supported` first, use x402 v2+, Monad testnet network `eip155:10143`, and **fetch the testnet USDC address from MONSKILLS' `addresses/` skill rather than hardcoding it** — never invent or copy-paste a token address from a doc scrape. Skip entirely if Phase 1–2 aren't rock solid, or if 1–3 above already ate the available time.

---

## 7. Deploy & verify (Monad testnet — exact commands)

Deploy:
```
forge create src/NoCapRegistry.sol:NoCapRegistry --account nocap-deployer --broadcast
```

Verify (Sourcify, no API key needed):
```
forge verify-contract <contract_address> NoCapRegistry \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```
Repeat for every deployed contract. Record every deployed + verified address — the hackathon submission form requires the contract address explicitly.

---

## 8. Testing requirements

**Priority note: the integration test below (Action fires on a real push) is the actual critical path for this product.** A perfectly-tested contract with no proof the automation actually fires end-to-end isn't a demo — it's a smart contract with a story attached. Don't let contract unit tests consume the whole testing budget; get one real push-to-anchor-to-render loop working and verified before polishing edge-case coverage.

Foundry unit tests, minimum coverage:
- `anchor()` reverts for a non-contributor
- `Anchored` event fires with correct fields
- Multiple anchors accumulate correctly for one `repoId`
- `registerProject()` reverts on double-registration
- `addContributor()` reverts if caller isn't the owner
- (Phase 3) `isEligible()` returns false for a window-violating timestamp set, true for a valid one
- (Phase 3) badge transfer reverts (soulbound check)

Integration test: push a real commit on a test branch, confirm the Action fires and the tx lands within a reasonable block window.

E2E: load `/verify/[address]/[repoId]` against the live testnet contract and confirm the rendered timeline matches on-chain event data exactly — no seeded/mock data anywhere in the shipped app.

---

## 9. Security & safety rails

- Deployer/Action wallet is a dedicated burner — documented as such in the README, never reused
- Private key lives only in GitHub Actions secrets, never committed, never in frontend code
- `anchor()` is gated by `isContributor` to prevent spam/griefing of someone else's `repoId`
- Rate-consider: since anchoring is cheap on Monad, no additional throttling needed for MVP, but note the theoretical spam vector in the README as a known limitation
- No PII, no source code, no file contents ever touch chain — only hashes and short labels
- If Phase 3 x402 tier is built: reject replayed signatures/nonces, expired quotes, mismatched resource paths, wrong token/network/recipient — per the standard x402 safety checklist

---

## 10. Explicitly NOT included (out of scope — do not build these)

- **Mainnet deployment** — testnet only, no real funds, no compliance surface
- **Code-content or plagiarism analysis** — NoCap verifies *timing*, not *originality* of code. Don't build a similarity-detection engine; state the limitation plainly in the README instead
- **Production-grade key management** (KMS/HSM/multisig for the deployer) — documented burner-wallet approach only, with an explicit "not production-ready custody" warning
- **Mobile app** — web only
- **Custom indexer/subgraph infra** — direct log queries are enough at this scale
- **Cross-chain support** — Monad only
- **A token or any tokenomics** — this is infrastructure, not a financial product
- **Automated dispute resolution for flagged anomalies** — surface signals, don't adjudicate them

---

## 11. For you (not the agent) — mapping to the actual submission form

| Spark field | Answer |
|---|---|
| Name | NoCap |
| Description | Onchain build-provenance protocol — auto-anchors commit fingerprints to Monad so build timelines are verifiable, not claimed. Your build, no cap. |
| Problem | No trustless way to prove a hackathon build's real timeline; judges check for this manually and can be gamed with rewritten git history |
| Solution | GitHub Action anchors every commit hash + timestamp onchain automatically; public verifier page renders a judge-checkable timeline and window-compliance badge |
| Category | Monad Testnet |
| Contract address | (from Section 7, after deploy) |
| Demo video | Record it doing a real anchor live — push a commit on camera, show the Action fire, show the dashboard update, point at the green badge. Under 3 minutes |
| Post URL | Frame it as "I built a tool that proves hackathon submissions aren't backdated, then used it to prove this one isn't — no cap" |

Anti-pattern checklist from the hackathon rules — confirm each before submitting:
- **Not AI slop**: run `impeccable detect` clean, custom `PRODUCT.md`-driven design, not default shadcn
- **Not a tutorial special**: verifiable-provenance protocols aren't a beginner-project search result
- **Not a mystery box**: README with setup instructions, a real demo video, meaningful commit history (which — fittingly — your own tool proves)
- **Not vaporware**: every UI action hits the live testnet contract; no hardcoded strings behind a submit button
