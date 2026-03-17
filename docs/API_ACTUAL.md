# KuberCoin API Documentation (Actual Implementation)
## Version 1.0 - March 13, 2026

Reference for the **currently implemented** KuberCoin APIs.

---

## Table of Contents

1. [Overview](#overview)
2. [Node Ports](#node-ports)
3. [JSON-RPC API](#json-rpc-api)
4. [Wallet HTTP API](#wallet-http-api)
5. [WebSocket Status](#websocket-status)
6. [Prometheus Metrics](#prometheus-metrics)
7. [Web UIs](#web-uis)

---

## Overview

KuberCoin node provides a single HTTP server:

- **JSON-RPC** (port 8634): Core blockchain queries, wallet operations
- **REST API** (port 8634): `/api/health`, `/api/info`, `/api/peers`, `/api/balance/:addr`
- **Metrics** (port 8634): Prometheus-format metrics at `/metrics`
- **P2P**: Peer-to-peer network (the Docker testnet stack commonly exposes `18633`)
- **Wallet API proxy** (port 3250): Next.js wallet routes at `/api/wallets`, `/api/wallet/*`, `/api/stats`

---

## Node Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| P2P Network | 18633 | TCP | Docker testnet peer-to-peer communication |
| Node HTTP (RPC/REST/Metrics) | 8634 | HTTP | JSON-RPC, REST, `/metrics` |
| Wallet Web + API proxy | 3250 | HTTP | Wallet UI plus `/api/wallet*` routes |
| Explorer Web | 3200 | HTTP | Explorer UI |
| Operations Web | 3300 | HTTP | Operations UI |
| Prometheus | 9092 | HTTP | Metrics scrape + query API |

**Web UIs:**
- Explorer: http://localhost:3200
- Wallet: http://localhost:3250
- Operations: http://localhost:3300
- Monitoring (existing): http://localhost:3100
- Grafana: http://localhost:3000

---

## JSON-RPC API

### Endpoint

**URL:** `http://localhost:8634/`  
**Method:** POST  
**Content-Type:** `application/json`

### Request Format

```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": [param1, param2],
  "id": 1
}
```

### Implemented Methods

#### `getblockcount`

Get current block height.

**Parameters:** None

**Returns:** `integer`

```bash
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
```

Response:
```json
{"jsonrpc":"2.0","result":150,"id":1}
```

---

#### `getbestblockhash`

Get hash of the current chain tip.

**Parameters:** None

**Returns:** `string` (hex hash)

```bash
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getbestblockhash","params":[],"id":1}'
```

---

#### `getblock`

Get block by hash or height.

**Parameters:**
- `block_identifier` (string | integer): Block hash (hex) OR block height (number)

**Returns:** Block object

```bash
# By height
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblock","params":[100],"id":1}'

# By hash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblock","params":["00000abc..."],"id":1}'
```

Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "hash": "0000abc...",
    "height": 100,
    "version": 1,
    "prev_hash": "0000def...",
    "merkle_root": "abc123...",
    "timestamp": 1706620800,
    "bits": 486604799,
    "nonce": 12345,
    "transactions": [...]
  },
  "id": 1
}
```

---

#### `gettransaction`

Get transaction by ID.

**Parameters:**
- `txid` (string): Transaction ID (hex)

**Returns:** Transaction object

```bash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"gettransaction","params":["abc123..."],"id":1}'
```

---

#### `sendrawtransaction`

Submit a raw transaction (currently returns "not yet implemented").

**Parameters:**
- `hex` (string): Signed transaction hex

**Returns:** Transaction ID (when implemented)

---

#### `getmempoolinfo`

Get mempool statistics.

**Parameters:** None

**Returns:** Mempool info object

```bash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getmempoolinfo","params":[],"id":1}'
```

Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "size": 42,
    "bytes": 12345
  },
  "id": 1
}
```

---

#### `getpeerinfo`

Get connected peer information.

**Parameters:** None

**Returns:** Array of peer objects

```bash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getpeerinfo","params":[],"id":1}'
```

---

## Wallet HTTP API

### Endpoint

**Base URL:** `http://localhost:3250`

### Wallet UI

**GET /** - Embedded wallet management UI

Access the web interface:
```
http://localhost:3250/
```

---

### API Endpoints

#### `GET /api/health`

Health check endpoint.

**Returns:**
```json
{"ok": true}
```

---

#### `GET /api/wallets`

List available wallet files through the wallet web API proxy.

**Returns:**
```json
{
  "wallets": ["alice.dat", "bob.dat", "miner.dat"]
}
```

**Example:**
```bash
curl http://localhost:3250/api/wallets
```

---

#### `GET /api/wallet/balance`

Get wallet balance.

**Query Parameters:**
- `name` (required): Wallet filename (e.g., `alice.json`)

**Returns:**
```json
{
  "name": "alice.dat",
  "address": "m...",
  "height": 150,
  "spendable": 5000000,
  "total": 5000000,
  "immature": 0
}
```

**Example:**
```bash
curl "http://localhost:3250/api/wallet/balance?name=alice.dat"
```

---

#### `POST /api/wallet/send`

Send transaction and mine confirming block.

**Request Body:**
```json
{
  "from": "alice.json",
  "to": "m...",
  "amount": 1000000
}
```

**Returns:**
```json
{
  "txid": "abc123...",
  "confirmed_height": 151,
  "confirmed_block_hash": "0000def..."
}
```

**Example:**
```bash
curl -X POST http://localhost:3250/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{"from":"alice.dat","to":"mBob...","amount":1000000}'
```

**Related proxy routes currently implemented:**
- `POST /api/wallet/create`
- `GET /api/wallet/history`
- `GET /api/wallet/export`
- `GET /api/stats`

---

## WebSocket Status

The current node runtime does **not** expose a `/ws` endpoint. Existing live
smoke checks treat WebSocket as an unsupported capability and skip it rather
than failing the stack.

---

## Prometheus Metrics

### Endpoint

**URL:** `http://localhost:8634/metrics`

### Available Metrics

```
# Blockchain
kubercoin_block_height               Current chain height

# Network
kubercoin_peers                      Connected peer count
kubercoin_peers_inbound              Inbound connections
kubercoin_peers_outbound             Outbound connections

# Mempool
kubercoin_mempool_size               Transaction count in mempool
kubercoin_mempool_bytes              Mempool size in bytes

# Chain state
kubercoin_utxo_count                 UTXO set size
kubercoin_difficulty                 Current compact difficulty bits
kubercoin_block_reward               Current block reward in satoshis
```

**Example:**
```bash
curl http://localhost:8634/metrics
```

---

## Web UIs

### Explorer (port 3200)

**URL:** `http://localhost:3200`

Features:
- Block search by height or hash
- Transaction search by ID
- Latest blocks feed
- Mempool statistics
- Current chain data via the node HTTP API

---

### Wallet (port 3250)

**URL:** `http://localhost:3250`

Features:
- Select and view wallet balances
- Send transactions
- View wallet addresses
- Automatic transaction confirmation

---

### Operations Dashboard (port 3300)

**URL:** `http://localhost:3300`

Features:
- System health monitoring
- Active alerts
- Peer information
- Metrics visualization
- Quick actions (Grafana, metrics)

---

### Monitoring Dashboard (port 3100)

**URL:** `http://localhost:3100`

Existing Next.js monitoring dashboard with metrics charts.

---

## Future / Not Yet Implemented

The following are documented in other files but **not currently implemented**:

### REST API (`/api/v1/*`)

The `/api/v1/` REST endpoints described in some documentation do not exist in
the current implementation. The current node and wallet surfaces are:
- JSON-RPC on `http://localhost:8634/`
- Node REST endpoints on `http://localhost:8634/api/*`
- Wallet proxy endpoints on `http://localhost:3250/api/*`

### Authentication

The local Docker-backed test flow commonly uses API-key-authenticated node RPC.
The wallet web proxy can pass that configured key through to the node.

### Rate Limiting

No rate limiting is currently implemented.

---

## Creating Wallets

Use the CLI to create wallets that will appear in the Wallet UI:

```bash
# Create standard wallet
kubercoin-cli wallet create mywallet.json

# Create HD wallet
kubercoin-cli wallet create myhd.json --hd --words 12

# Import from mnemonic
kubercoin-cli wallet import-mnemonic imported.json "word1 word2 ..."

# Import from private key
kubercoin-cli wallet import-key fromkey.json "0123456789abcdef..."
```

Wallets are stored in `/data/kubercoin/` and automatically detected.

---

## Docker Compose

Start all services:

```bash
docker compose up -d
```

Services included:
- `node`: KuberCoin node (all APIs)
- `explorer-web`: Blockchain explorer UI
- `wallet-web`: Wallet management UI
- `ops-web`: Operations dashboard
- `prometheus`: Metrics storage
- `grafana`: Metrics visualization

---

## CLI Tools

### Node Operator CLI

```bash
kubercoin-cli node info
kubercoin-cli node peers
```

### Wallet CLI

```bash
kubercoin-cli wallet create mywallet.json
kubercoin-cli wallet balance mywallet.json
kubercoin-cli wallet send mywallet.json <to> <amount>
```

### Miner CLI

```bash
kubercoin-cli miner start <address>
kubercoin-cli miner stop
kubercoin-cli miner status
```

### Block Explorer CLI

```bash
kubercoin-cli explorer block 100
kubercoin-cli explorer tx <txid>
kubercoin-cli explorer latest
```

### Governance CLI

```bash
kubercoin-gov proposals list
kubercoin-gov proposals get <id>
```

### Interactive TUI

```bash
kubercoin-tui status
kubercoin-tui explorer
kubercoin-tui console
```

---

*Last updated: March 13, 2026*
