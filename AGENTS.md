# Agent instructions — NoCap

This project was scaffolded for **Monad testnet** with **monskills** + **Impeccable**.

Canonical, tracked skills live in `skills/` (see `skills-lock.json`). The `npx skills add` installer
also mirrors the same content into every other agent-tool folder (`.agents/`, `.claude/`, `.aider-desk/`,
etc.) so whichever harness runs this repo finds it locally — those mirrors are gitignored duplicates,
not the source of truth.

## Always start here

1. Read `skills/monskill/SKILL.md` (router).
2. Fetch only the skills you need (also mirrored per-harness under e.g. `.claude/skills/`):
   - `scaffold/` — structure, verify API, OZ
   - `wallet/` — agent keystore / Safe deploys
   - `wallet-integration/` — Para wallet UI (requires user `para login`)
   - `gas/` — gas_limit charging on Monad
   - `addresses/` — never invent addresses
   - `concepts/` — block states, async execution
   - `indexer/` — Envio HyperIndex after deploy+verify
   - `tooling-and-infra/` — RPC providers
   - `why-monad/` — chain rationale

3. Design: **`skills/impeccable/`** — read `PRODUCT.md` + `DESIGN.md` before UI work. Run detect before submission.


## Do not

- Fetch skills.devnads.com during the build if local `skills/monskill` exists.
- Hallucinate token/contract addresses — use `addresses/`.
- Use inflated gas limits (Monad charges on limit, not gas used).
- Skip registering a repo (`registerAndAuthorize`) before expecting the hosted relayer to anchor its pushes.

## Product

See `nocap-monad-build-plan.md` and `PRODUCT.md`.
