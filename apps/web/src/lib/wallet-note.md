# Wallet integration path

## Plan + monskills

`wallet-integration/` skill specifies **Para** (`@getpara/cli` → `para init` + `ParaProvider` + Monad wiring).

## What ships now

Injected browser wallets via **wagmi** + `monadTestnet` (chain id 10143). Viewers need **no** wallet; only builders registering / claiming badges do.

## Upgrade to Para (user-driven)

monskills forbids agents from installing/logging in for you:

```bash
npm install -g @getpara/cli
para login
cd apps/web
para init
# then apply skills/monskill/wallet-integration/references/para-monad-wiring.md
para doctor
```

Keep `NEXT_PUBLIC_*` registry addresses unchanged — Para only changes how users authenticate.
