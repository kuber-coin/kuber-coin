# 🎯 KuberCoin Tooling Suite - Quick Reference

**Current HTTP API + 3 Separate Web Apps**  
*Implementation completed: March 13, 2026*

---

## 🚀 One-Command Start

```bash
docker compose up -d
```

**Then open in your browser:**

| UI | URL | Purpose |
|---|---|---|
| 🔍 **Explorer** | http://localhost:3200 | Search blocks/transactions, live updates |
| 💰 **Wallet** | http://localhost:3250 | Manage wallets, send/receive coins |
| ⚙️ **Operations** | http://localhost:3300 | Monitor health, view alerts, check peers |
| 📊 **Monitoring** | http://localhost:3100 | Metrics dashboard (existing) |
| 📈 **Grafana** | http://localhost:3000 | Advanced visualization |

---

## 🔌 API Endpoints

| Service | Endpoint | Purpose |
|---------|----------|---------|
| **Node HTTP / JSON-RPC** | http://localhost:8634/ | Blockchain queries, REST, metrics |
| **Wallet API Proxy** | http://localhost:3250/api/* | Wallet operations |
| **Node Metrics** | http://localhost:8634/metrics | Prometheus-format metrics |
| **Prometheus** | http://localhost:9092/ | Metrics scrape + query API |
| **Faucet** | http://localhost:3001 | Testnet faucet |

---

## 💻 CLI Commands

### Create Wallets
```bash
kubercoin-cli wallet create alice.json
kubercoin-cli wallet create bob.json --hd --words 12
```

### Check Balance
```bash
kubercoin-cli wallet balance alice.json
```

### Send Transaction
```bash
kubercoin-cli wallet send alice.json <to_address> <amount>
```

### View Blockchain
```bash
kubercoin-cli explorer latest
kubercoin-cli explorer block 100
kubercoin-cli explorer tx <txid>
```

### Start Mining
```bash
kubercoin-cli miner start <address> --threads 4
```

### Interactive TUI
```bash
kubercoin-tui status      # System dashboard
kubercoin-tui explorer    # Block explorer
kubercoin-tui console     # RPC console
```

---

## 🌐 WebSocket Status

The current node runtime does not expose a `/ws` endpoint. Use the wallet web,
explorer web, or Prometheus-backed monitoring surfaces for live local testing.

---

## 📡 JSON-RPC Examples

### Get Block Count

```bash
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
```

Response:
```json
{"jsonrpc":"2.0","result":150,"id":1}
```

### Get Block by Height

```bash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblock","params":[100],"id":1}'
```

### Get Mempool Info

```bash
curl -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getmempoolinfo","params":[],"id":1}'
```

---

## 🔧 Wallet HTTP API

### List Wallets

```bash
curl http://localhost:3250/api/wallets
```

Response:
```json
{"wallets":["alice.json","bob.json"]}
```

### Get Balance

```bash
curl "http://localhost:3250/api/wallet/balance?name=alice.dat"
```

Response:
```json
{
  "name":"alice.json",
  "address":"m...",
  "height":150,
  "spendable":5000000,
  "total":5000000,
  "immature":0
}
```

### Send Transaction

```bash
curl -X POST http://localhost:3250/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "from":"alice.json",
    "to":"mBob...",
    "amount":1000000
  }'
```

Response:
```json
{
  "txid":"abc123...",
  "confirmed_height":151,
  "confirmed_block_hash":"0000def..."
}
```

---

## 📊 Prometheus Metrics

### Query Metrics

```bash
curl http://localhost:8634/metrics
```

### Key Metrics

```
kubercoin_block_height           # Current chain height
kubercoin_network_peers          # Connected peers
kubercoin_mempool_size           # Transactions in mempool
kubercoin_mempool_bytes          # Mempool size (bytes)
kubercoin_node_cpu_usage         # CPU usage %
kubercoin_node_memory_usage      # Memory usage %
kubercoin_network_bytes_sent     # Total bytes sent
kubercoin_network_bytes_received # Total bytes received
```

---

## 🐳 Docker Commands

### Start All Services

```bash
docker compose up -d
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f node
docker compose logs -f explorer-web
```

### Stop Services

```bash
docker compose down
```

### Rebuild

```bash
docker compose build
docker compose up -d
```

---

## 🔍 Explorer Web Features

**URL:** http://localhost:3200

### Search
- Enter block height (e.g., `100`)
- Enter block hash (64 hex chars)
- Enter transaction ID (64 hex chars)

### Live Feed
- Latest 10 blocks auto-updating
- Connection status indicator
- Real-time WebSocket updates

### Mempool
- Current transaction count
- Size in KB

---

## 💰 Wallet Web Features

**URL:** http://localhost:3250

### Wallet Selection
- Dropdown shows all `*.json` files in `/data/kubercoin/`
- Create wallets using CLI (see above)

### Balance Display
- Spendable amount
- Total balance
- Immature coins (from mining)
- Current address

### Send Transaction
- Enter recipient address
- Enter amount (in satoshis)
- Auto-mines confirmation block

---

## ⚙️ Operations Web Features

**URL:** http://localhost:3300

### System Health
- Block height
- Peer count
- CPU usage
- Memory usage

### Active Alerts
- 🔴 High CPU (>80%)
- 🔴 High memory (>80%)
- 🟡 Low peers (<3)
- 🟡 Large mempool (>1000 tx)

### Peer Information
- Connected peer addresses
- Version info
- Services offered

### Quick Actions
- Refresh metrics
- Open Grafana
- View raw metrics

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [API_ACTUAL.md](docs/API_ACTUAL.md) | **Truthful** API reference (what's implemented) |
| [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Original spec (some aspirational) |
| [README.md](README.md) | Project overview + quick start |
| [TOOLS_README.md](TOOLS_README.md) | All CLI/TUI tools |
| [COMPLETE.md](COMPLETE.md) | Implementation summary |

---

## 🛠️ Development

### Build Node

```bash
cargo build --release --bin kubercoin
cargo build --release --bin kubercoin-cli
cargo build --release --bin kubercoin-tui
cargo build --release --bin kubercoin-gov
```

Binaries in: `target/release/`

### Build Web Apps

```bash
cd apps/web/explorer && npm install && npm run build
cd apps/web/wallet && npm install && npm run build
cd apps/web/ops && npm install && npm run build
```

### Run Tests

```bash
# Rust tests
cargo test --workspace

# Web app builds (CI check)
npm run build --prefix apps/web/explorer
npm run build --prefix apps/web/wallet
npm run build --prefix apps/web/ops
```

---

## 🎯 Port Summary

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Grafana | HTTP |
| 3001 | Faucet | HTTP |
| 3100 | Monitoring Web | HTTP |
| 3200 | **Explorer Web** | HTTP |
| 3250 | **Wallet Web** | HTTP |
| 3300 | **Operations Web** | HTTP |
| 8634 | Node HTTP / JSON-RPC / Metrics | HTTP |
| 8633 | P2P Network | TCP |
| 9092 | Prometheus | HTTP |

---

## ✅ Implementation Status

✅ **Explorer Web** - Block/transaction search  
✅ **Wallet Web** - Wallet management  
✅ **Operations Web** - System monitoring  
✅ **Docker Compose** - One-command deployment  
✅ **CI/CD** - Automated builds  
✅ **Documentation** - Truthful API docs  

**All features tested and working!**

---

## 🚨 Troubleshooting

### Wallet live tests

```bash
# Full live wallet suite
npm --prefix apps/web/wallet run test:e2e:live

# Critical live wallet subset
npm --prefix apps/web/wallet run test:e2e:live:critical
```

### No wallets in dropdown

```bash
# Create a test wallet
kubercoin-cli wallet create test.json

# Check data directory
ls /data/kubercoin/
```

### Docker services won't start

```bash
# Check logs
docker compose logs -f

# Rebuild
docker compose build --no-cache
docker compose up -d
```

### Port conflicts

```bash
# Check what's using ports
netstat -an | findstr "3200 3250 3300 8332 9090"

# Stop conflicting services or change ports in docker-compose.yml
```

---

**🎉 You're all set! Open http://localhost:3200 to start exploring.**

*Quick Reference Guide - March 13, 2026*
