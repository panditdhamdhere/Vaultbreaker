#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RH_TESTNET_RPC:-https://rpc.testnet.chain.robinhood.com}"
actual_chain="$(cast chain-id --rpc-url "$RPC_URL")"
test "$actual_chain" = "46630" || { echo "Wrong chain: $actual_chain" >&2; exit 1; }

check_codehash() {
  local address="$1" expected="$2" actual
  actual="$(cast codehash "$address" --rpc-url "$RPC_URL")"
  test "$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')" || { echo "Code hash mismatch at $address" >&2; exit 1; }
  echo "Verified $address"
}

check_codehash 0x6c9197347161FC140a209175849d443FeaAF509c 0xec224f66ecfa265dd306c54b2b683ba96395cd8f822dd2d51f84a2bac9d62afa
check_codehash 0x8cE462A801726FA030e06264f3423Be2Ae8d6414 0xc4bf24efb6c99c95060186a30200b7ee952604d77b917d0dae2cde87e6419e82
check_codehash 0x8D3a32ddF8bD529EC847457eC79620D2870FFdc4 0x34641b08c85d3dc3e9b94551cb3b7b8d3a664dd773504849aec07499db5bb660
echo "Robinhood Testnet dependencies match the pinned rehearsal hashes."
