#!/bin/bash
# fix_seed2.sh — Run on seed2 to repair the Docker Compose setup (node + monitoring)
set -euo pipefail

echo "=== Stopping broken service ==="
systemctl stop kubercoin-seed2 2>/dev/null || true

echo "=== Writing Prometheus config ==="
mkdir -p /etc/kubercoin/prometheus
cat > /etc/kubercoin/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kubercoin-seed2'
    static_configs:
      - targets: ['seed2:9091']
        labels:
          node: 'seed2'
          region: 'westeurope'
  - job_name: 'kubercoin-seed1'
    static_configs:
      - targets: ['192.0.2.10:9091']
        labels:
          node: 'seed1'
          region: 'eastus'
EOF

echo "=== Writing corrected docker-compose.yml ==="
mkdir -p /opt/kubercoin
mkdir -p /data/kubercoin/seed2
cat > /opt/kubercoin/docker-compose.yml << 'EOF'
version: "3.9"
services:
  seed2:
    image: kubercoin-node:testnet
    container_name: kubercoin-seed2
    restart: unless-stopped
    ports:
      - "18633:18633"
      - "8332:8332"
      - "8080:8080"
      - "9091:9091"
    volumes:
      - /data/kubercoin/seed2:/data/kubercoin
    environment:
      RUST_LOG: info
      KUBERCOIN_NETWORK: testnet
      KUBERCOIN_P2P_ADDR: "0.0.0.0:18633"
      KUBERCOIN_RPC_ADDR: "0.0.0.0:8332"
      KUBERCOIN_API_AUTH_ENABLED: "false"
      KUBERCOIN_ALLOW_INSECURE_NO_AUTH: "true"
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
EOF

echo "=== Cloning repo and building kubercoin image ==="
apt-get install -y --no-install-recommends git 2>/dev/null || true
if [ ! -d /opt/kubercoin/src/.git ]; then
  rm -rf /opt/kubercoin/src
  git clone --depth 1 https://github.com/kubercoin-project/kubercoin.git /opt/kubercoin/src
fi

echo "=== Building Docker image (takes 5-10 min) ==="
cd /opt/kubercoin/src
docker build -f Dockerfile.simple -t kubercoin-node:testnet .

echo "=== Starting seed2 + monitoring ==="
cd /opt/kubercoin
docker compose pull prometheus grafana 2>&1 || true
systemctl daemon-reload
systemctl start kubercoin-seed2
sleep 5
systemctl status kubercoin-seed2 --no-pager | tail -5
echo "DONE"
