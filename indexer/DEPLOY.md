# Deploying the NoCap indexer to Envio Cloud

The indexer ingests `NoCapRegistry` and `HackathonRegistry` events into a GraphQL
database so the web app queries an index instead of scanning `eth_getLogs` on
every page load. This removes the RPC rate-limit problem entirely.

## What's already done

- `config.yaml` — both contracts, chain 10143, start block 45945564, tx-hash field selection
- `schema.graphql` — `Anchor`, `Project`, `HackathonWindow` entities (indexed on the fields the app filters by)
- `src/handlers/*.ts` — event → entity mappers (addresses lowercased for case-insensitive filters)
- Validated locally: `pnpm codegen` + `tsc` clean on Node 22

## Steps only you can do (need your logins)

1. **Install the deploy CLI and log in** (opens a browser, ~30-day session):
   ```bash
   npm install -g envio-cloud
   envio-cloud login
   ```
2. Tell me when that's done. GitHub is already authorized as `Dami904`, and the
   indexer source is committed under `indexer/` — I'll drive the deployment from
   there and report the GraphQL API URL it returns.

## After deploy (I do these)

- Set `NEXT_PUBLIC_INDEXER_URL=<graphql url>` on Vercel (production) and locally.
- The web app already prefers the GraphQL path whenever that var is set, and
  falls back to the current scan path when it isn't — so there's no downtime
  gap. Once the var is live, lists come from the index (instant, no rate limits).
- Verify the indexer has caught up to chain tip and the hackathon/dashboard/
  verify pages load from GraphQL.
