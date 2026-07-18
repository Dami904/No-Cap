# Indexer (Phase 2.5 / monskills `indexer/`)

Phase 1–2 use **direct `eth_getLogs`** with a short in-memory cache (`apps/web/src/lib/indexer.ts`). That is enough for a single-hackathon demo.

When volume justifies it (judge board concurrent traffic), initialize **Envio HyperIndex** per monskills:

## Prereqs (you run these — agent must not login for you)

```bash
npm install -g envio-cloud
envio-cloud login
# gh auth login if deploying from GitHub
```

## After contracts are deployed **and verified**

```bash
cd indexer
pnpx envio@3.0.0-alpha.21 init contract-import explorer \
  -b monad-testnet \
  -c <NOCAP_REGISTRY_ADDRESS> \
  -n NoCapRegistry \
  -l typescript \
  -d ./ -o ./ \
  --all-events --single-contract --api-token ""
```

Add to `config.yaml`:

```yaml
field_selection:
  transaction_fields:
    - hash
```

Then `pnpm codegen`, implement handlers, deploy via Envio Cloud workflows.

Until then, the web app reads logs live — no Envio required for MVP.
