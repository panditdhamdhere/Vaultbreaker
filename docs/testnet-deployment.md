# Robinhood Testnet wallet deployment handoff

This is a test-token rehearsal. No transaction has been broadcast by this project. Keep signing in an encrypted Foundry account or supported hardware wallet; never put a raw private key in a command, environment variable, repository, or chat. The commands below use the public RPC only for the handoff example. It is rate-limited; use a provider endpoint for sustained testing.

Set ACCOUNT to the name of your encrypted Foundry account and WALLET to its public address. Run the read-only preflight first:

    export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
    export ACCOUNT=<encrypted-foundry-account-name>
    export WALLET=<public-wallet-address>
    bash scripts/preflight-testnet.sh
    forge fmt --check
    forge test --offline
    npm run build

The preflight checks chain ID 46630 and three pinned Statics replica code hashes. Those existing contracts supply the Operator collection, activation registry, and vault. They are dependencies, not new Vaultbreaker deployments. The hashes matched the live testnet on 18 November 2026; recheck just before broadcasting.

## Registry

Use EqualFiLabs/drand-registry at a pinned commit, with recursive submodules. Its AGENTS.md requires implementation tests, vectors, adversarial tests, formal rules, and target-chain EIP-2537 validation before deployment. The published manifest covers Mainnet; a testnet deployment needs its own evidence.

    git clone --recurse-submodules https://github.com/EqualFiLabs/drand-registry.git
    cd drand-registry
    forge build
    forge test
    forge create src/EqualFiDrandRegistry.sol:EqualFiDrandRegistry --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT" --broadcast

Record the confirmed REGISTRY address and transaction hash. Post the official Quicknet signature for round 20791007 from docs/quicknet.md. Confirm hasSig and randomnessOf for that round on testnet. This checks the actual chain precompile behavior, which local tests cannot prove.

## Test token

From this Vaultbreaker repo, deploy TestToken. It has six decimals, grants the deployer one million VTEST, and lets each wallet claim 100 VTEST once. VTEST has no monetary value.

    forge create contracts/TestToken.sol:TestToken --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT" --broadcast

Record TOKEN and its transaction receipt.

## Fresh testnet Operator Router

The old testnet Router in the historical manifest was a disposable rehearsal. Deploy a fresh Router bound to the existing Statics replica. The three dependency addresses below were code-hash verified in the preflight:

- Operator collection: 0x6c9197347161FC140a209175849d443FeaAF509c
- Activation registry: 0x8cE462A801726FA030e06264f3423Be2Ae8d6414
- Operator vault: 0x8D3a32ddF8bD529EC847457eC79620D2870FFdc4

Build EqualFiLabs/operator-fee-router with recursive submodules and its required checks. Then deploy its testnet-only admin and Router with your encrypted account:

    git clone --recurse-submodules https://github.com/EqualFiLabs/operator-fee-router.git
    cd operator-fee-router
    forge build
    forge test
    forge create src/testnet/TestnetRouterAdmin.sol:TestnetRouterAdmin --constructor-args "$WALLET" --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT" --broadcast
    forge create src/OperatorFeeRouter.sol:OperatorFeeRouter --constructor-args 0x6c9197347161FC140a209175849d443FeaAF509c 0x8cE462A801726FA030e06264f3423Be2Ae8d6414 0x8D3a32ddF8bD529EC847457eC79620D2870FFdc4 "$ADMIN" --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT" --broadcast
    cast send "$ADMIN" 'bindRouter(address)' "$ROUTER" --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"

Set ADMIN and ROUTER from confirmed deployment receipts before the subsequent commands. Bootstrap all 5,555 Operator IDs in batches of at most 100. The historical rehearsal used 56 transactions. Check each receipt and nextOperatorId before continuing; do not blindly replay after an uncertain transaction.

    cast call "$ROUTER" 'nextOperatorId()(uint256)' --rpc-url "$RH_TESTNET_RPC"
    cast send "$ROUTER" 'bootstrapOperators(uint256)' 100 --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"
    # Repeat until nextOperatorId() is 5556.
    cast send "$ROUTER" 'finalizeBootstrap()' --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"
    cast send "$ADMIN" 'registerRewardAsset(address)' "$TOKEN" --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"

Confirm bootstrapFinalized, isRewardAsset(TOKEN), and rewardAssetEnabled(TOKEN).

## Game and bankroll

Back in the Vaultbreaker repo, deploy with the approved 1 VTEST entry (1000000 base units). The owner should be a multisig if available. The contract allows owner withdrawal only above maximum live-run liabilities.

    forge create contracts/Vaultbreaker.sol:Vaultbreaker --constructor-args "$TOKEN" "$REGISTRY" "$ROUTER" "$WALLET" 1000000 --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT" --broadcast

Record GAME from its confirmed receipt. Fund 10,000 VTEST as an initial test bankroll. At 11.390625 VTEST reserved per active run, this can back at most 877 simultaneous worst-case runs before other liabilities and payouts affect the balance.

    cast send "$TOKEN" 'approve(address,uint256)' "$GAME" 10000000000 --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"
    cast send "$GAME" 'fund(uint256)' 10000000000 --rpc-url "$RH_TESTNET_RPC" --account "$ACCOUNT"

Confirm entryAmount, token, registry, router, reserved, and the game token balance. From a second wallet, claim faucet tokens, approve an entry, start a run, wait for its selected future beacon, resolve using the published signature, and cash out or advance. Verify the Router reward book gained 0.1 VTEST and check the payout receipt. Rehearse safe and trap results across several rounds.

## Site activation

Set NEXT_PUBLIC_VAULTBREAKER_ADDRESS to the verified GAME address and NEXT_PUBLIC_RH_TESTNET_RPC to a production-grade endpoint, then rebuild and publish. The /testnet route is gated until this is done. Do not configure a simulation-only or unverified address.

Before enabling paid entry, record all addresses, runtime code hashes, transaction hashes, source commit, compiler settings, and observed round outcomes in a testnet deployment manifest. Require independent contract review and a separate mainnet decision before any real-value launch.
