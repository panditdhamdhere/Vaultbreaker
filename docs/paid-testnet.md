# Paid testnet design

This design is for Robinhood Testnet (chain ID 46630) and a test ERC-20. It does not authorize a mainnet launch. The existing free-play Site remains the playable release until a testnet Registry, token, Router configuration, funded game reserve, and wallet UI are verified end to end.

## Approved testnet economics

- Entry: **1 test token** per run, supplied as base units to the constructor after token decimals are fixed.
- **10%** of each entry goes immediately to the configured Operator Fee Router through `approve` and `addRewards`. The token must already be registered and deposit-enabled in that Router.
- The remaining entry enters the game bankroll. The bankroll also needs external prefunding. The contract will not accept a run unless it holds at least the maximum possible payout for every active run.
- Six stages. Each stage has one trap, one cache, and one relic. Trap loses the unbanked claim. Cache multiplies the claim by **1.10**; relic by **1.50**. A player can cash out after a safe result or choose a new door for the next stage.
- A full six-relic run pays at most **11.390625×** entry. The contract reserves that amount for *every* active run, a conservative solvency rule.
- The owner can pause new entries during an incident. Existing runs can still resolve, advance, and cash out.
- Each stage's unconditional claim multiplier is `(0 + 1.10 + 1.50) / 3 = 0.8667`. This is the expected payout if the player banks immediately after that stage, before network costs. It is a theoretical value, not an observed return or launch promise.

## Trust and settlement

The player's door and a future Quicknet round are recorded in one transaction. The chosen round is scheduled more than 30 seconds after the transaction timestamp. Once the beacon is available, anyone can submit its signature to the Registry and call `resolve`. The contract uses the Registry's verified, cached randomness to derive the trap and relic doors. It never uses the drand API's separate `randomness` field.

The free-play demo and paid design both omit the scanner: the paid trap does not exist until the future beacon is published. Free play matches the contract's 1.10× cache, 1.50× relic, trap loss, and six-stage claim math, but uses browser randomness and virtual multipliers rather than test tokens.

## Integration requirements

1. Deploy and validate the Drand Registry on Robinhood Testnet. Its repository currently documents a Robinhood **Mainnet** deployment; no testnet deployment manifest was found.
2. Use a test ERC-20 supported by the Router. The historical testnet Router manifest describes a disposable rehearsal, not a production recommendation. Deploy or approve an appropriate testnet Router, bootstrap it, and register the asset before using this game.
3. Fund the game bankroll before opening entries. Use a multisig for the `owner` address. The owner can withdraw only surplus above reserved live-run liabilities.
4. Configure the wallet UI with verified contract addresses and a production-grade RPC provider. Public Robinhood RPC endpoints are rate-limited.
5. Review contract economics and security independently. Testnet transactions and payouts must be demonstrated before considering a mainnet design. Mainnet launch also requires separate legal and operational review.

No signer, token address, testnet Registry address, or live Router approval has been supplied. No contract deployment or wallet transaction has been performed.
