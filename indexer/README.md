# NoCap indexer — Envio HyperIndex

Ingests `NoCapRegistry` and `HackathonRegistry` events on Monad testnet into a
GraphQL database, so the web app reads indexed data instead of scanning
`eth_getLogs` on every page load — instant lists, no RPC rate limits, no provider
token in the browser.

## Entities

| Entity | Source event | Keyed by |
|---|---|---|
| `Anchor` | `NoCapRegistry.Anchored` | `chainId_block_logIndex` |
| `Project` | `NoCapRegistry.ProjectRegistered` | `repoId` |
| `HackathonWindow` | `HackathonRegistry.WindowRegistered` | `hackathonId` (upserted, latest wins) |

Addresses are lowercased on ingest so GraphQL equality filters match a checksummed
address from a wallet. Schema in [`schema.graphql`](schema.graphql), config (chains,
contracts, start block, tx-hash field selection) in [`config.yaml`](config.yaml),
handlers in [`src/handlers/`](src/handlers).

## Develop

```bash
pnpm install
pnpm codegen        # after any schema.graphql / config.yaml change
pnpm tsc --noEmit   # after any handler change
```

Requires Node 22. On Windows, run inside WSL — the Envio CLI ships no native
Windows binary.

## Deploy

See [`DEPLOY.md`](DEPLOY.md). Once deployed, set `NEXT_PUBLIC_INDEXER_URL` in the web
app to the GraphQL endpoint.
