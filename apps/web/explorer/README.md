# KuberCoin Explorer Web

Blockchain explorer UI for KuberCoin network with real-time WebSocket updates.

## Features

- **Block Explorer**: Search and view blocks by height or hash
- **Transaction Explorer**: Search and view transactions by ID
- **Real-Time Updates**: WebSocket connection for live blockchain events
- **Mempool Monitoring**: View current mempool size and transactions
- **Latest Blocks**: Live feed of most recent blocks

## Quick Start

```bash
# Install dependencies
npm install

# Create environment configuration
cat > .env <<'EOF'
KUBERCOIN_RPC_URL=http://localhost:8634
# Optional: only set this when a compatible websocket endpoint is running
# KUBERCOIN_WS_URL=ws://localhost:9090/ws
EOF

# Start development server
npm run dev

# Open http://localhost:3200
```

## Configuration

Edit `.env` as needed:

```bash
KUBERCOIN_RPC_URL=http://localhost:8080
# Optional: only set this when a compatible websocket endpoint is running
# KUBERCOIN_WS_URL=ws://localhost:9090/ws
```

## Production Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t kubercoin-explorer-web .
docker run -p 3200:3200 kubercoin-explorer-web
```

## API Routes

- `POST /api/rpc` - Proxy to node JSON-RPC server

## WebSocket Events

When `KUBERCOIN_WS_URL` is configured, the explorer connects to that websocket endpoint for:
- New block notifications
- New transaction notifications

Without a configured websocket endpoint, the explorer falls back to periodic RPC polling.

## Navigation

- Wallet UI: http://localhost:8080
- Monitoring Dashboard: http://localhost:3100
- Operations Dashboard: http://localhost:3300
