# Vaultbreaker

A fast, free-play risk-and-reward vault game built with Next.js 16.4.6, React 19, and TypeScript.

## Play

Each run has six chambers. Every chamber has three doors: one trap, one cache, and one relic. A cache earns the chamber's base points; a relic earns double. After a safe reveal, bank the accumulated points or go deeper. A trap loses the unbanked haul. One scanner per run exposes a trap door before choosing.

Best banked score is saved on the current device.

## Develop

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm run build` checks TypeScript and produces a static export in `out/`.

## Release boundary

This first release is **free play**. Outcomes use browser cryptographic randomness. Scores are local and are not tamper-resistant. There are no wallets, entry fees, payouts, or smart contract interactions. The UI makes that boundary visible.

A future value-transfer version requires a separate game contract or authoritative service to lock player choices and a future drand round before that round's scheduled publication, settle using the verified output of [EqualFi Drand Registry](https://github.com/EqualFiLabs/drand-registry), and account for any supported ERC-20 revenue before routing an agreed share through [Operator Fee Router](https://github.com/EqualFiLabs/operator-fee-router). Those features are not implied by this release.

## Paid testnet work

`contracts/Vaultbreaker.sol` and `app/testnet` prepare a paid test-token flow on Robinhood Testnet. The route remains gated until verified contract addresses are configured. See [the proposed economics and deployment dependencies](docs/paid-testnet.md). Run `forge test --offline` for the contract's focused tests.
