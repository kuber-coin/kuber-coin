#!/bin/bash
# cloud-init-monitoring.sh — Startup script for KuberCoin seed2
# (P2P seed node + Prometheus + Grafana, West Europe)
# This file is base64-encoded and passed as VM customData via Bicep.

set -euo pipefail

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
mkdir -p /data/kubercoin/seed2
mkdir -p /etc/kubercoin/prometheus

# ── Clone repo and build Docker image ────────────────────────────────────────
apt-get install -y --no-install-recommends git
git clone --depth 1 https://github.com/your-org/kubercoin.git /opt/kubercoin/src 2>/dev/null || true
cd /opt/kubercoin/src && docker build -f Dockerfile.simple -t kubercoin-node:testnet . || true

# ── Prometheus configuration ──────────────────────────────────────────────────
cat > /etc/kubercoin/prometheus/prometheus.yml << 'PROM'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kubercoin-seed2'
    metrics_path: /metrics
    static_configs:
      - targets: ['seed2:8332']
        labels:
          node: 'seed2'
          region: 'westeurope'
  - job_name: 'kubercoin-seed1'
    metrics_path: /metrics
    static_configs:
      - targets: ['192.0.2.10:8332']
        labels:
          node: 'seed1'
          region: 'eastus'
PROM

# ── docker-compose (seed2 + monitoring) ───────────────────────────────────────
cat > /opt/kubercoin/docker-compose.yml << 'COMPOSE'
version: "3.9"

services:
  seed2:
    image: kubercoin-node:testnet
    container_name: kubercoin-seed2
    restart: unless-stopped
    ports:
      - "18633:18633"   # P2P (public)
      - "8332:8332"     # RPC + Prometheus metrics (/metrics)
    volumes:
      - /data/kubercoin/seed2:/data/kubercoin
    environment:
      RUST_LOG: info
      KUBERCOIN_NETWORK: testnet
      KUBERCOIN_P2P_ADDR: "0.0.0.0:18633"
      KUBERCOIN_RPC_ADDR: "0.0.0.0:8332"
      KUBERCOIN_API_AUTH_ENABLED: "false"
      KUBERCOIN_ALLOW_INSECURE_NO_AUTH: "true"
      # connect seed2 to the example primary seed placeholder
      KUBERCOIN_INITIAL_PEERS: "192.0.2.10:18633"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8332/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - monitoring

  prometheus:
    image: prom/prometheus:v2.51.2
    container_name: kubercoin-prometheus
    restart: unless-stopped
    ports:
      - "9092:9090"
    volumes:
      - /etc/kubercoin/prometheus:/etc/prometheus:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:10.4.2
    container_name: kubercoin-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: "REPLACE_WITH_STRONG_ADMIN_PASSWORD"
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - monitoring

volumes:
  prometheus-data:
  grafana-data:

networks:
  monitoring:
    driver: bridge
COMPOSE

# ── systemd unit ──────────────────────────────────────────────────────────────
cat > /etc/systemd/system/kubercoin-seed2.service << 'UNIT'
[Unit]
Description=KuberCoin Testnet Seed Node 2 + Monitoring Stack
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
systemctl enable kubercoin-seed2
systemctl start kubercoin-seed2
