#!/usr/bin/env bash
# Deploy a KuberCoin seed node on a fresh Ubuntu/Debian server.
# Usage: ssh root@seed1.kuber-coin.com < scripts/deploy-seed-node.sh

set -euo pipefail

NODE_USER="kubercoin"
DATA_DIR="/var/lib/kubercoin"
BINARY="/usr/local/bin/kubercoin"
NETWORK="${KUBERCOIN_NETWORK:-mainnet}"
PORT="8633"
API_PORT="8634"
VERSION="1.0.0"

echo "=== KuberCoin Seed Node Deployment ==="
echo "Network: $NETWORK"
echo "Port:    $PORT"
echo ""

# ── System Dependencies ──
apt-get update -qq
apt-get install -y -qq curl ufw fail2ban ca-certificates

# ── Firewall ──
ufw allow 22/tcp      # SSH
ufw allow 8633/tcp    # P2P mainnet
ufw allow 18633/tcp   # P2P testnet
ufw allow 8634/tcp    # HTTP API (REST + JSON-RPC + metrics)
ufw --force enable

# ── User ──
if ! id "$NODE_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$NODE_USER"
fi

mkdir -p "$DATA_DIR"
chown -R "$NODE_USER:$NODE_USER" "$DATA_DIR"

# ── Binary ──
# Option A: Download from GitHub releases
RELEASE_URL="https://github.com/kubercoin/kubercoin/releases/download/v${VERSION}/kubercoin-linux-amd64"
echo "Downloading kubercoin v${VERSION}..."
curl -fsSL "$RELEASE_URL" -o "$BINARY" || {
    echo "Download failed. Copy binary manually to $BINARY"
    exit 1
}
chmod +x "$BINARY"

# Verify
$BINARY --version || { echo "Binary verification failed"; exit 1; }

# ── Systemd Service ──
cat > /etc/systemd/system/kubercoin.service <<EOF
[Unit]
Description=KuberCoin Full Node (${NETWORK})
Documentation=https://kuber-coin.com
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${NODE_USER}
Group=${NODE_USER}
WorkingDirectory=${DATA_DIR}

Environment=KUBERCOIN_NETWORK=${NETWORK}
Environment=KUBERCOIN_DATA_DIR=${DATA_DIR}
Environment=KUBERCOIN_P2P_ADDR=0.0.0.0:${PORT}
Environment=KUBERCOIN_RPC_ADDR=0.0.0.0:${API_PORT}

ExecStart=${BINARY}
ExecStop=/bin/kill -SIGTERM \$MAINPID

Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR}
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
MemoryDenyWriteExecute=true
RestrictRealtime=true
RestrictSUIDSGID=true

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096
MemoryMax=4G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kubercoin
systemctl start kubercoin

echo ""
echo "=== Seed Node Deployed ==="
echo "Status:  systemctl status kubercoin"
echo "Logs:    journalctl -u kubercoin -f"
echo "Data:    $DATA_DIR"
echo "API:     http://$(hostname -I | awk '{print $1}'):${API_PORT}/api/health"
echo ""

# Wait and verify
sleep 5
systemctl is-active --quiet kubercoin && echo "✓ Node is running" || echo "✗ Node failed to start"
