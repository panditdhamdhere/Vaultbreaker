# Robinhood Testnet browser-wallet deployment handoff

This is a test-token rehearsal. No transaction has been broadcast by this project. The owner signs with a browser wallet. Never put a private key or seed phrase in a command, environment variable, repository, website, or chat.

## Gates before signing

Run the preflight and project checks: bash scripts/preflight-testnet.sh, forge fmt --check, forge test --offline, and npm run build. Preflight checks chain ID 46630 and pinned code hashes for the existing Statics replica dependencies. They matched live testnet on 18 November 2026; recheck immediately before deployment.

The [drand Registry](https://github.com/EqualFiLabs/drand-registry) has a Mainnet manifest but no published Robinhood Testnet deployment. Its repository requires implementation, vector, adversarial, and formal-rule checks plus target-chain EIP-2537 validation. The [Operator Router](https://github.com/EqualFiLabs/operator-fee-router) also needs its release checks. The game contract needs independent review. Resolve these gates before broadcasting a candidate artifact or enabling paid entry.

## Browser wallet and source

Add [Robinhood Testnet](https://docs.robinhood.com/chain/add-network-to-wallet/) to the wallet: chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com. The public RPC is rate-limited. In [Remix Deploy & Run](https://remix-ide.readthedocs.io/en/latest/run.html), choose **Browser Extension** and check both the network and account in Remix and the wallet before every deployment. The expected owner address is in the private candidate bundle.

Use these pinned sources, with recursive submodules where applicable:

| Contract | Repository commit | Source |
| --- | --- | --- |
| EqualFiDrandRegistry | fdab8c3de6828764886f89fe383686864e3c9f8c | src/EqualFiDrandRegistry.sol |
| TestnetRouterAdmin, OperatorFeeRouter | 168c4a234d47a22c8121016ff5e0f3ff83d4e520 | src/testnet/TestnetRouterAdmin.sol, src/OperatorFeeRouter.sol |
| TestToken, Vaultbreaker | Vaultbreaker PR source, pinned in the candidate bundle | contracts/TestToken.sol, contracts/Vaultbreaker.sol |

Compile source and dependencies using each repository's Foundry compiler and optimizer settings. The candidate ZIP records ABI, creation bytecode, source commits, and SHA-256 hashes for review; its JSON files are **not** Remix source imports. Check that Remix produces the same creation bytecode before signing. A different bytecode means the source, compiler, optimizer, or metadata settings differ. Stop and resolve that mismatch.

## Transaction order

Confirm each transaction in the browser wallet, wait for its receipt, and record its hash, deployed address, and runtime code hash before using the address in the next step. This flow needs roughly 60 wallet confirmations because the Router must initialize all 5,555 Operators. Check contract state after any uncertain receipt before resending.

1. Deploy EqualFiDrandRegistry with no arguments. Save REGISTRY. Validate the chain's EIP-2537 behavior by calling postSig(20791007, 0x8d2c8bbc37170dbacc5e280a21d4e195cff5f32a19fd6a58633fa4e4670478b5fb39bc13dd8f8c4372c5a76191198ac5). Confirm hasSig(20791007) is true and randomnessOf(20791007) matches the [official Quicknet vector](https://github.com/EqualFiLabs/drand-registry/blob/fdab8c3de6828764886f89fe383686864e3c9f8c/docs/quicknet.md).
2. Deploy TestToken with no arguments. Save TOKEN. It has six decimals, grants the deployer 1,000,000 VTEST, and permits one 100 VTEST faucet claim per wallet. VTEST has no monetary value.
3. Deploy TestnetRouterAdmin with the wallet's public owner address. Save ADMIN.
4. Deploy OperatorFeeRouter with constructor arguments in this order: Operator collection 0x6c9197347161FC140a209175849d443FeaAF509c; activation registry 0x8cE462A801726FA030e06264f3423Be2Ae8d6414; Operator vault 0x8D3a32ddF8bD529EC847457eC79620D2870FFdc4; ADMIN. Save ROUTER. These three existing dependency addresses are verified by preflight. The old testnet Router was a disposable rehearsal.
5. On ADMIN, call bindRouter(ROUTER).
6. On ROUTER, call bootstrapOperators(100) repeatedly. Check nextOperatorId() after each receipt. Continue until it is 5556, then call finalizeBootstrap(). Use smaller batches if the wallet estimates excessive gas. Do not send a duplicate batch while a prior receipt is uncertain.
7. On ADMIN, call registerRewardAsset(TOKEN). Confirm bootstrapFinalized(), isRewardAsset(TOKEN), and rewardAssetEnabled(TOKEN) on the Router.
8. Deploy Vaultbreaker with arguments TOKEN, REGISTRY, ROUTER, owner address, and 1000000 (1 VTEST). Save GAME. Use a multisig owner if available. The game reserves maximum live-run liabilities before accepting a run.
9. On TOKEN, call approve(GAME, 10000000000); then on GAME, call fund(10000000000). This is 10,000 VTEST. At 11.390625 VTEST reserved per active run, the initial bankroll backs at most 877 simultaneous worst-case runs before other liabilities and payouts affect the balance.

Confirm game configuration, reserved(), and its token balance. From a second wallet, claim faucet tokens, approve an entry, start a run, wait for its selected future beacon, resolve with the published signature, and cash out or advance. Verify 0.1 VTEST entered the Router reward book and check the payout receipt. Rehearse cache, relic, and trap outcomes over several rounds.

## Site activation

Record all addresses, runtime code hashes, transaction hashes, source commits, compiler settings, and observed outcomes in a testnet deployment manifest. Set NEXT_PUBLIC_VAULTBREAKER_ADDRESS to the verified GAME address and NEXT_PUBLIC_RH_TESTNET_RPC to a reliable endpoint, then rebuild and publish. The /testnet route remains gated until then. Require a separate decision before any real-value launch.
