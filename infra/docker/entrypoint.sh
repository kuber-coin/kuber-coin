#!/bin/bash
# Docker entrypoint script for KuberCoin node

set -e

# Default configuration
export KUBERCOIN_DATA_DIR=${KUBERCOIN_DATA_DIR:-/var/lib/kubercoin}
export KUBERCOIN_LOG_LEVEL=${KUBERCOIN_LOG_LEVEL:-info}
export KUBERCOIN_NETWORK=${KUBERCOIN_NETWORK:-mainnet}
export KUBERCOIN_RPC_BIND=${KUBERCOIN_RPC_BIND:-0.0.0.0:8080}
export KUBERCOIN_P2P_BIND=${KUBERCOIN_P2P_BIND:-0.0.0.0:8633}

echo "=========================================="
echo "KuberCoin Node Starting"
echo "Network: $KUBERCOIN_NETWORK"
echo "Data Directory: $KUBERCOIN_DATA_DIR"
echo "Log Level: $KUBERCOIN_LOG_LEVEL"
echo "=========================================="

# Ensure data directory exists
mkdir -p "$KUBERCOIN_DATA_DIR"/{blocks,utxo,config}

# Generate configuration file if it doesn't exist
if [ ! -f "$KUBERCOIN_DATA_DIR/config/kubercoin.toml" ]; then
    echo "Generating default configuration..."
    cat > "$KUBERCOIN_DATA_DIR/config/kubercoin.toml" <<EOF
[network]
network = "$KUBERCOIN_NETWORK"
p2p_bind = "$KUBERCOIN_P2P_BIND"
rpc_bind = "$KUBERCOIN_RPC_BIND"
max_peers = 125

[logging]
level = "$KUBERCOIN_LOG_LEVEL"
format = "json"

[storage]
data_dir = "$KUBERCOIN_DATA_DIR"
blocks_dir = "$KUBERCOIN_DATA_DIR/blocks"
utxo_dir = "$KUBERCOIN_DATA_DIR/utxo"

[mining]
enabled = false
threads = 1
EOF
fi

# Handle signals gracefully
trap 'echo "Shutting down gracefully..."; kill -TERM $PID' TERM INT

# Start the node
exec "$@" &
PID=$!
wait $PID
