#!/usr/bin/env bash
# KuberCoin Mainnet Genesis Block Ceremony
# Run this ONCE to establish the genesis block and record its hash.
# After this, the genesis hash becomes a fixed protocol constant.

set -euo pipefail

BINARY="${1:-./target/release/kubercoin-node}"
NETWORK="mainnet"
GENESIS_RECORD="genesis_block.json"

echo "============================================="
echo "  KuberCoin Genesis Block Ceremony"
echo "  Network: $NETWORK"
echo "  Binary:  $BINARY"
echo "============================================="
echo ""

# Ensure clean state
if [ -d "chainstate_mainnet" ]; then
    echo "ERROR: chainstate_mainnet/ already exists."
    echo "       Genesis has already been created or you need to remove it."
    exit 1
fi

export KUBERCOIN_NETWORK="$NETWORK"

# Mine the genesis block (block 0)
echo "Mining genesis block with mainnet difficulty (0x1e0fffff)..."
echo "This may take a moment..."
echo ""

RESULT=$($BINARY mine 1 --json 2>&1)

echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

# Extract genesis hash
GENESIS_HASH=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data['blocks'][0]['hash'])
" 2>/dev/null || echo "PARSE_ERROR")

GENESIS_HEIGHT=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data['blocks'][0]['height'])
" 2>/dev/null || echo "0")

GENESIS_NONCE=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data['blocks'][0]['nonce'])
" 2>/dev/null || echo "0")

echo ""
echo "============================================="
echo "  GENESIS BLOCK CREATED"
echo "============================================="
echo "  Hash:   $GENESIS_HASH"
echo "  Height: $GENESIS_HEIGHT"
echo "  Nonce:  $GENESIS_NONCE"
echo "============================================="

# Write formal record
cat > "$GENESIS_RECORD" <<EOF
{
  "network": "$NETWORK",
  "genesis_hash": "$GENESIS_HASH",
  "genesis_height": $GENESIS_HEIGHT,
  "genesis_nonce": $GENESIS_NONCE,
  "genesis_message": "The Times 29/Jan/2026 KuberCoin Genesis",
  "genesis_timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "difficulty_bits": "0x1e0fffff",
  "block_reward_sat": 5000000000,
  "block_reward_kuber": 50,
  "max_supply_kuber": 21000000,
  "halving_interval": 210000,
  "binary_version": "1.0.0",
  "ceremony_host": "$(hostname)",
  "ceremony_operator": "$(whoami)"
}
EOF

echo ""
echo "Genesis record written to: $GENESIS_RECORD"
echo ""
echo "IMPORTANT: Add this hash to node/src/genesis_bootstrap.rs"
echo "           as the mainnet genesis checkpoint."
