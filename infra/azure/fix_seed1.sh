#!/bin/bash
# fix_seed1.sh — Example operator repair script for seed1.
# Review before use in a public deployment.
set -euo pipefail

echo "=== Stopping broken service ==="
systemctl stop kubercoin-seed1 2>/dev/null || true

echo "=== Writing corrected docker-compose.yml ==="
mkdir -p /opt/kubercoin
cat > /opt/kubercoin/docker-compose.yml << 'EOF'
version: "3.9"
services:
  seed1:
    image: kubercoin-node:testnet
    container_name: kubercoin-seed1
    restart: unless-stopped
    ports:
      - "18633:18633"
      - "8332:8332"
      - "8080:8080"
      - "9091:9091"
    volumes:
      - /data/kubercoin/seed1:/data/kubercoin
    environment:
      RUST_LOG: info
      KUBERCOIN_NETWORK: testnet
      KUBERCOIN_P2P_ADDR: "0.0.0.0:18633"
      KUBERCOIN_RPC_ADDR: "0.0.0.0:8332"
      KUBERCOIN_API_AUTH_ENABLED: "false"
      KUBERCOIN_INITIAL_PEERS: "198.51.100.20:18633"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8332/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
EOF

echo "=== Checking if image already exists ==="
docker images --format "{{.Repository}}:{{.Tag}}" | grep "kubercoin" || echo "no kubercoin image yet"

echo "=== Cloning repo and building image ==="
apt-get install -y --no-install-recommends git 2>/dev/null || true
if [ ! -d /opt/kubercoin/src/.git ]; then
  rm -rf /opt/kubercoin/src
  git clone --depth 1 https://github.com/kuber-coin/kuber-coin.git /opt/kubercoin/src
fi

echo "=== Building Docker image (takes 5-10 min) ==="
cd /opt/kubercoin/src
docker build -f Dockerfile.simple -t kubercoin-node:testnet .

echo "=== Starting seed1 service ==="
systemctl daemon-reload
systemctl start kubercoin-seed1
sleep 5
systemctl status kubercoin-seed1 --no-pager | tail -5
echo "DONE"
