#!/usr/bin/env bash
set -euo pipefail

# Default values
WALLET="${1:-wallet_mine.json}"
BLOCKS="${2:-50}"

write_section() {
  echo ""
  echo "=== $1 ==="
}

ensure_binary() {
  if [ -f "target/release/kubercoin-node" ]; then
    echo "target/release/kubercoin-node"
  else
    echo "Building release binary..."
    cargo build --release >&2
    echo "target/release/kubercoin-node"
  fi
}

ensure_wallet() {
  local exe="$1"
  local filename="$2"
  if [ ! -f "$filename" ]; then
    "$exe" new-wallet "$filename" >/dev/null
  fi
  "$exe" get-address "$filename"
}

# Set environment defaults
export KUBERCOIN_TEST_MODE="${KUBERCOIN_TEST_MODE:-1}"
export KUBERCOIN_API_KEYS="${KUBERCOIN_API_KEYS:-local-dev-key}"

EXE=$(ensure_binary)

write_section "Preparing wallet"
ADDRESS=$(ensure_wallet "$EXE" "$WALLET")
echo "Mining to address: $ADDRESS"

write_section "Start mining $BLOCKS blocks"
"$EXE" mine-to "$ADDRESS" "$BLOCKS"

write_section "Balance after mining"
"$EXE" get-balance "$WALLET"

echo ""
echo "Mining run complete"
