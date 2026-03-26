# KuberCoin Operations Web

Internal operator dashboard for node administration, metrics, and testnet
operations. This app is not part of the public wallet or explorer trust
surface.

If this repository is published, treat this app as operator-only tooling:

- do not deploy it without authentication in front of it
- do not expose its RPC proxy publicly
- do not treat it as an end-user product

## Features

- **System Health Monitoring**: CPU, memory, peers, block height
- **Active Alerts**: Real-time alerting for critical conditions
- **Peer Information**: Connected peers with version info
- **Metrics Integration**: Prometheus metrics visualization
- **Quick Actions**: One-click access to Grafana and metrics

## Quick Start

```bash
# Install dependencies
npm install

# Create environment configuration
cat > .env <<'EOF'
KUBERCOIN_RPC_URL=http://localhost:8634
KUBERCOIN_METRICS_URL=http://localhost:9091/metrics
EOF

# Start development server
npm run dev

# Open http://localhost:3300
```

This quick start is for local development only.

## Configuration

Edit `.env` as needed:

```bash
KUBERCOIN_RPC_URL=http://localhost:8634
KUBERCOIN_METRICS_URL=http://localhost:9091/metrics
```

## Alerting Rules

Automatically generates alerts for:
- Low peer count (< 3 peers)
- High CPU usage (> 80%)
- High memory usage (> 80%)
- Large mempool (> 1000 transactions)

## Production Build

```bash
npm run build
npm start
```

Production deployments should place this app behind separate operator
authentication and network controls.

## API Routes

- `POST /api/rpc` - Proxy to node JSON-RPC server
- `GET /api/metrics` - Proxy to Prometheus metrics endpoint

## Navigation

- Explorer: http://localhost:3200
- Wallet UI: http://localhost:3250
- Monitoring Dashboard: http://localhost:3100
- Grafana: http://localhost:3000
