# Vaultbreaker

A fast, free-play risk-and-reward vault game built with Next.js 16.4.6, React 19, and TypeScript.

## Play

Each run has six chambers. Every chamber has three doors: one trap, one cache, and one relic. A virtual 1.00× claim starts the run. Cache multiplies it by 1.10×, relic by 1.50×, and trap loses the unbanked claim. After a safe reveal, bank the multiplier or go deeper. Free play uses the same claim math as the testnet contract but awards no tokens.

The best banked multiplier is saved on the current device.

## Develop

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm run build` checks TypeScript and produces a static export in `out/`.

## Deploy on Vercel

Import `panditdhamdhere/Vaultbreaker` as a Next.js project. Leave **Root Directory** at the repository root (`./` or blank) and keep the detected build settings. Free play needs no environment variables. Leave `NEXT_PUBLIC_VAULTBREAKER_ADDRESS` unset so the testnet route stays gated. After contract deployment and verification, set the public contract address, its runtime code hash in `NEXT_PUBLIC_VAULTBREAKER_CODE_HASH`, and a reliable `NEXT_PUBLIC_RH_TESTNET_RPC`, then rebuild. Do not put signing credentials in `NEXT_PUBLIC_` variables.

## Release boundary

This first release is **free play**. Outcomes use browser cryptographic randomness. Scores are local and are not tamper-resistant. There are no wallets, entry fees, payouts, or smart contract interactions on the free-play route. The UI makes that boundary visible.

The testnet value-transfer route uses a separate contract to lock player choices and a future drand round before that round's scheduled publication, settle using the verified output of [EqualFi Drand Registry](https://github.com/EqualFiLabs/drand-registry), and route the agreed entry share through [Operator Fee Router](https://github.com/EqualFiLabs/operator-fee-router). It remains gated until those dependencies and the funded game are deployed and verified.

## Paid testnet work

`contracts/Vaultbreaker.sol` and `app/testnet` prepare a paid test-token flow on Robinhood Testnet. The route remains gated until verified contract addresses are configured. See [the proposed economics and deployment dependencies](docs/paid-testnet.md). Run `forge test --offline` for the contract's focused tests.

The [wallet deployment handoff](docs/testnet-deployment.md) covers a fresh Registry, test token, Operator Router, game contract, bankroll, and testnet validation. It does not broadcast transactions or include signing credentials.

[Testnet release readiness](docs/release-readiness.md) records the completed checks and remaining deployment gates.
