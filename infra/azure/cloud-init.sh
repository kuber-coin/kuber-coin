#!/bin/bash
# cloud-init.sh — Example startup script for KuberCoin seed1 (P2P seed node, East US)
# This file is base64-encoded and passed as VM customData via Bicep.
# Cloud-init runs it once on first boot as root.
#
# This script is an example testnet bootstrap, not a production-hardened setup.
#
# What this does:
#   1. Installs Docker + Compose plugin
#   2. Writes docker-compose.seed.yml for seed1
#   3. Starts the node as a systemd service via Docker Compose

set -euo pipefail

# ── System baseline ───────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# ── Docker ────────────────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

systemctl enable docker
systemctl start docker

# ── Directories ───────────────────────────────────────────────────────────────
mkdir -p /opt/kubercoin
mkdir -p /data/kubercoin/seed1

# ── Clone repo and build Docker image ────────────────────────────────────────
apt-get install -y --no-install-recommends git
git clone --depth 1 https://github.com/kuber-coin/kuber-coin.git /opt/kubercoin/src 2>/dev/null || true
# If no git repo yet, we copy the Dockerfile inline and build from the release binary
# For now build the image using the simple Dockerfile from the cloned repo
cd /opt/kubercoin/src && docker build -f Dockerfile.simple -t kubercoin-node:testnet . || true

# ── docker-compose.seed.yml (seed1, no monitoring) ────────────────────────────
cat > /opt/kubercoin/docker-compose.yml << 'COMPOSE'
version: "3.9"

services:
  seed1:
    image: kubercoin-node:testnet
    container_name: kubercoin-seed1
    restart: unless-stopped
    ports:
      - "18633:18633"   # P2P (public)
      - "8332:8332"     # RPC + Prometheus metrics (/metrics)
    volumes:
      - /data/kubercoin/seed1:/data/kubercoin
    environment:
      RUST_LOG: info
      KUBERCOIN_NETWORK: testnet
      KUBERCOIN_P2P_ADDR: "0.0.0.0:18633"
      KUBERCOIN_RPC_ADDR: "0.0.0.0:8332"
      KUBERCOIN_API_AUTH_ENABLED: "false"
      # connect seed1 to the example secondary seed placeholder
      KUBERCOIN_INITIAL_PEERS: "198.51.100.20:18633"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8332/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
COMPOSE

# ── systemd unit ──────────────────────────────────────────────────────────────
cat > /etc/systemd/system/kubercoin-seed1.service << 'UNIT'
[Unit]
Description=KuberCoin Testnet Seed Node 1
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/kubercoin
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable kubercoin-seed1
systemctl start kubercoin-seed1
