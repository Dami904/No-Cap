# Deploy (Phase 0–1) — follow plan + monskills `wallet/`

## 1. Create deployer keystore (plan §2)

```bash
# Option A — plan: foundry account named nocap-deployer
cast wallet new
cast wallet import nocap-deployer --interactive

# Option B — monskills agent keystore
mkdir -p ~/.monskills/keystore
cast wallet new ~/.monskills/keystore --unsafe-password ""
cast wallet list --dir ~/.monskills/keystore
```

Fund from Monad testnet faucet **before** any deploys.

## 2. Deploy full stack

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --account nocap-deployer \
  --broadcast
```

Copy printed addresses into `apps/web/.env.local`.

## 3. Verify (prefer monskills API)

```bash
node scripts/verify-api.mjs <NoCapRegistry> NoCapRegistry src/NoCapRegistry.sol:NoCapRegistry
node scripts/verify-api.mjs <HackathonRegistry> HackathonRegistry src/HackathonRegistry.sol:HackathonRegistry
node scripts/verify-api.mjs <NoCapBadge> NoCapBadge src/NoCapBadge.sol:NoCapBadge
```

Fallback (plan §7):

```bash
forge verify-contract <addr> NoCapRegistry --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

## 4. GitHub Action secrets

- `NOCAP_PRIVATE_KEY` — dedicated burner (can be same as deployer for solo MVP, model a)
- `NOCAP_REGISTRY` — registry address

After `registerProject`, call `addContributor(repoId, burnerAddress)` or anchors revert.
