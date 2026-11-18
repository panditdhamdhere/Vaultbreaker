# Testnet release readiness

Vaultbreaker is a playable free-play game. Paid test-token entry remains gated. This record separates local and read-only chain evidence from mined deployments and an independent audit.

## Verified on 18 November 2026

| Scope | Evidence | Limit |
| --- | --- | --- |
| Web build | Next.js static export and TypeScript passed with npm run build | No configured wallet transaction was exercised |
| Game accounting | Foundry tests with forge test --offline cover exact cache and relic claims, Operator fee totals, trap loss, concurrent reserve rejection, the six-relic maximum, and emergency entry pause | Local mocks, not a deployed Router or Registry |
| Existing testnet dependencies | scripts/preflight-testnet.sh matched chain ID 46630 and three pinned Statics replica code hashes | Contracts may change; repeat immediately before signing |
| Robinhood Testnet cryptography | A read-only eth_call to EIP-2537 pairing precompile 0x0f with the pinned Quicknet round 20791007 vector returned 1. A read-only creation simulation using the pinned Registry's hashMessageToPoint implementation returned the official 128-byte ABI-encoded point. Observed near testnet block 155061712. | No Registry deployment or mined signature post; these checks cover the tested vector, not all client behavior |
| Upstream local suites | Pinned Registry commit fdab8c3: 37 tests passed. Pinned Operator Router commit 168c4a2: 92 passed, 1 skipped. | The current Registry helper extraction has no fresh formal release gate in its published record |

## Gates before wallet deployment

1. Obtain fresh formal and release evidence for the exact Registry source and bytecode selected for testnet. The Registry's own release-gate document marks the earlier proof as historical after its helper extraction.
2. Complete independent review of the Vaultbreaker escrow, Router integration, and deployment configuration. The local review and tests above are not independent assurance.
3. Rebuild the exact source with pinned compiler settings and compare bytecode with the browser-wallet deployment candidate. Recheck dependency hashes.
4. Have the wallet owner confirm each testnet transaction in the browser wallet. Record receipts, addresses, source revisions, runtime hashes, and Router bootstrap state in a deployment manifest.
5. Rehearse a complete run from a second wallet: faucet, approval, entry, future beacon, permissionless resolution, cache and relic payouts, trap loss, 10% Operator routing, and recovery after a closed browser session.
6. Configure the verified GAME address and runtime code hash on the hosted testnet UI. Confirm the UI rejects a wrong chain, wrong code hash, and reverted receipt before opening entries.

The candidate artifacts in the separate browser-wallet ZIP are review inputs, not approval to broadcast. Real-value launch requires another decision after testnet evidence and operational review.
