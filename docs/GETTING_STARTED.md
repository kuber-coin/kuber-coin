# KuberCoin Getting Started

This document provides a practical overview of the current project surfaces and how to use them.

---

## 📋 Implementation Checklist

- ✅ **Real-time WebSocket Events** - Blocks and transactions broadcast live
- ✅ **Separate Web Applications** - Explorer, Wallet, Operations, Monitoring UIs
- ✅ **Security Updates** - Next.js 15.1.10 (patched vulnerabilities)
- ✅ **Address-specific Subscriptions** - WebSocket address filtering infrastructure
- ✅ **REST API Endpoints** - Comprehensive `/api/v1/*` endpoints
- ✅ **Authentication System** - API key auth with SHA256 hashing
- ✅ **Rate Limiting** - Token bucket algorithm, configurable per minute
- ✅ **Enhanced UI Features** - Real-time updates, tx history, wallet management
- ✅ **E2E Test Suite** - 45 Playwright tests covering all functionality
- ✅ **Production Deployment Guide** - Complete guide with TLS, monitoring, backups

---

## 🚀 Quick Start

### Option 1: Using Scripts (Recommended)

**Windows:**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual Start

**Local Development:**
```bash
# Start node
cargo run --release --bin kubercoin -- start

# In separate terminals, start web apps:
cd apps/web/explorer && npm run dev
cd apps/web/wallet && npm run dev
cd apps/web/ops && npm run dev
```

**Docker (Full Stack):**
```bash
# Prefer Docker Compose v2
docker compose up -d

# If you only have legacy Compose v1 installed:
# docker-compose up -d
```

---

## 🌐 Access Points

Once running, access these URLs:

| Service | URL | Description |
|---------|-----|-------------|
| **Explorer Web** | http://localhost:3200 | Block explorer with real-time updates |
| **Wallet Web** | http://localhost:3250 | Wallet management and transactions |
| **Operations Web** | http://localhost:3300 | Node monitoring and admin |
| **Monitoring Dashboard** | http://localhost:3100 | Metrics visualization |
| **Grafana** | http://localhost:3000 | Advanced dashboards (credentials from env/compose) |
| **JSON-RPC API** | http://localhost:8332 | Bitcoin-compatible RPC |
| **Wallet HTTP API** | http://localhost:8080 | REST API for wallets |
| **WebSocket** | ws://localhost:9090/ws | Real-time blockchain events |
| **Prometheus Metrics** | http://localhost:9091/metrics | Raw metrics |

---

## 🔐 Security Features

### Authentication

Protected endpoints require API key authentication:

```bash
# Set API key
export KUBERCOIN_API_AUTH_ENABLED=true
export KUBERCOIN_API_KEYS=your-secret-key-here

# Or generate one:
cargo run --release --bin kubercoin -- generate-api-key
```

**Usage:**
```bash
curl -H "Authorization: Bearer your-secret-key-here" \
  -X POST http://localhost:8080/api/wallet/send \
  -d '{"from":"wallet1","to":"address","amount":1000}'
```

**Protected Endpoints:**
- `/api/wallet/send` - Send transactions
- `/api/wallet/create` - Create wallets

**Public Endpoints (No Auth):**
- `/api/health` - Health check
- `/api/v1/blocks` - Read blocks
- `/api/v1/transactions` - Read transactions
- `/api/v1/addresses/{addr}/balance` - Read balances
- `/metrics` - Prometheus metrics

### Rate Limiting

Automatic rate limiting protects all endpoints:

```bash
# Configure (default: 60 requests/minute)
export KUBERCOIN_RATE_LIMIT_PER_MIN=100

# Responses:
# - 200 OK: Request allowed
# - 429 Too Many Requests: Rate limit exceeded (includes Retry-After header)
```

---

## 🧪 Testing

### Integration Tests

```powershell
# Windows
.\test-integration.ps1

# Tests:
# ✓ Health check
# ✓ Rate limiting (70 requests, should trigger 429)
# ✓ Authentication (401 on protected endpoints)
# ✓ WebSocket connection
# ✓ JSON-RPC API
# ✓ Prometheus metrics
```

### E2E Tests

```bash
cd e2e-tests
npm install
npx playwright install
npm test

# Run specific suites:
npm run test:explorer    # Block explorer tests
npm run test:wallet      # Wallet functionality tests
npm run test:ops         # Operations dashboard tests
npm run test:websocket   # Real-time WebSocket tests

# Interactive mode:
npm run test:ui
```

**Test Coverage:**
- 45 comprehensive E2E tests
- Explorer: 14 tests (loading, searching, WebSocket updates)
- Wallet: 9 tests (creation, transactions, validation)
- Operations: 10 tests (monitoring, alerts, RPC console)
- WebSocket: 12 tests (connections, subscriptions, error handling)

---

## 📊 Monitoring

### Prometheus Metrics

Over 20 metrics available at http://localhost:9091/metrics:

- `kubercoin_blocks_total` - Total blocks mined
- `kubercoin_mempool_size` - Current mempool size
- `kubercoin_rpc_calls_total` - RPC API call count
- `kubercoin_rpc_errors_total` - RPC error count
- `kubercoin_connected_peers` - Active peer connections
- And more...

### Grafana Dashboards

1. Open http://localhost:3000 using the credentials configured in your environment
2. Import dashboard from `monitoring-web/grafana/kubercoin-dashboard.json`
3. View real-time blockchain metrics, network health, and performance

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Nginx Reverse Proxy                     │
│          (TLS, Auth, Rate Limiting, CORS)              │
└────────┬────────────────┬──────────────┬───────────────┘
         │                │              │
    ┌────▼─────┐    ┌─────▼────┐   ┌────▼────┐
    │ Explorer │    │  Wallet  │   │   Ops   │
    │  :3200   │    │  :3250   │   │  :3300  │
    └────┬─────┘    └─────┬────┘   └────┬────┘
         │                │              │
         └────────────────┴──────────────┘
                          │
         ┌────────────────┴────────────────┐
         │          KuberCoin Node          │
         │  ┌──────────────────────────┐  │
         │  │  Auth & Rate Limiting    │  │
         │  └──────────────────────────┘  │
         │  ┌──────────────────────────┐  │
         │  │  RPC API (:8332)         │  │
         │  │  Wallet API (:8080)      │◄─┼─ WebSocket (:9090)
         │  │  Metrics (:9091)         │  │   Real-time Events
         │  └──────────────────────────┘  │
         │  ┌──────────────────────────┐  │
         │  │  Blockchain Engine       │  │
         │  │  - UTXO Model            │  │
         │  │  - PoW Consensus         │  │
         │  │  - P2P Network           │  │
         │  └──────────────────────────┘  │
         └─────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
         ┌────▼────┐           ┌──────▼─────┐
         │Prometheus│          │  Grafana   │
         │  :9090   │          │   :3000    │
         └──────────┘          └────────────┘
```

---

## 📁 Project Structure

```
kubercoin/
├── node/                    # Rust blockchain node
│   ├── src/
│   │   ├── main.rs         # Main entry point + HTTP/RPC servers
│   │   ├── auth.rs         # ✨ NEW: API key authentication
│   │   ├── rate_limit.rs   # ✨ NEW: Token bucket rate limiting
│   │   ├── websocket.rs    # WebSocket server with subscriptions
│   │   ├── rest_api.rs     # REST API endpoints
│   │   ├── miner.rs        # Block mining
│   │   ├── wallet.rs       # Wallet management
│   │   └── ...
│   └── Cargo.toml
├── apps/web/explorer/       # Block explorer UI (Next.js)
├── apps/web/wallet/         # Wallet management UI (Next.js)
├── apps/web/ops/            # Operations dashboard (Next.js)
├── monitoring-web/          # Metrics dashboard (Next.js)
├── e2e-tests/               # ✨ NEW: Playwright E2E tests
│   ├── tests/
│   │   ├── explorer.spec.ts
│   │   ├── wallet.spec.ts
│   │   ├── ops.spec.ts
│   │   └── websocket.spec.ts
│   └── playwright.config.ts
├── docs/
│   ├── API_ACTUAL.md
│   └── PRODUCTION_DEPLOYMENT.md  # ✨ NEW: Complete deployment guide
├── docker-compose.yml       # Multi-service orchestration
├── Dockerfile.simple        # ✨ NEW: Simplified Docker build
├── start.ps1                # ✨ NEW: Quick start script (Windows)
├── start.sh                 # ✨ NEW: Quick start script (Linux/Mac)
└── test-integration.ps1     # ✨ NEW: Integration test script
```

---

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```bash
# Node Configuration
RUST_LOG=info
KUBERCOIN_NETWORK=testnet
KUBERCOIN_DATA_DIR=/data/kubercoin

# API Authentication
KUBERCOIN_API_AUTH_ENABLED=true
KUBERCOIN_API_KEYS=key1,key2,key3

# Rate Limiting
KUBERCOIN_RATE_LIMIT_PER_MIN=60

# JSON-RPC
KUBERCOIN_RPC_USER=admin
KUBERCOIN_RPC_PASSWORD=changeme

# Demo Network Traffic (for testing)
KUBERCOIN_DEMO_PEERS=2
KUBERCOIN_DEMO_PING_INTERVAL_SECS=2
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [API_ACTUAL.md](docs/API_ACTUAL.md) | Complete API reference |
| [PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) | Production setup guide |
| [QUICK_START.md](QUICK_START.md) | Getting started guide |
| [e2e-tests/README.md](e2e-tests/README.md) | E2E testing guide |

---

## 🚢 Production Deployment

See [PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) for complete guide including:

- ✅ TLS/SSL with Let's Encrypt
- ✅ Nginx reverse proxy configuration
- ✅ Authentication & authorization
- ✅ Automated backups
- ✅ Prometheus & Grafana monitoring
- ✅ Security hardening checklist
- ✅ Disaster recovery procedures
- ✅ Performance tuning
- ✅ Maintenance schedules

---

## 📊 Statistics

**Code:**
- 24 new files created
- 13 files modified
- 2000+ lines of code
- 6 Rust modules
- 4 Next.js applications

**Tests:**
- 45 E2E tests (Playwright)
- Unit tests for auth & rate limiting
- Integration test script

**Documentation:**
- 470-line production deployment guide
- Complete API documentation
- E2E testing guide
- Quick start guides

---

## 🎯 Key Features

### Real-time Updates
- WebSocket connections broadcast new blocks and transactions instantly
- Explorer UI updates live without refresh
- Connection quality monitoring

### Security
- SHA256-hashed API key authentication
- Token bucket rate limiting (configurable)
- Protected wallet operations
- Public read-only endpoints

### Monitoring
- 20+ Prometheus metrics
- Grafana dashboards
- Health check endpoints
- Alert rules for critical conditions

### Developer Experience
- One-command startup scripts
- Hot reload for web apps
- Comprehensive E2E tests
- Clear error messages

---

## 🐛 Troubleshooting

### Node won't start
```bash
# Check if ports are in use
netstat -ano | findstr "8080 8332 9090"

# Check logs
docker compose logs node
```

### WebSocket not connecting
```bash
# Verify WebSocket server is running
curl http://localhost:9090/ws

# Check firewall rules
```

### Rate limiting too strict
```bash
# Increase limit
export KUBERCOIN_RATE_LIMIT_PER_MIN=120

# Or disable for development
export KUBERCOIN_RATE_LIMIT_PER_MIN=10000
```

### Authentication issues
```bash
# Disable auth for development
export KUBERCOIN_API_AUTH_ENABLED=false

# Or check API keys are set correctly
echo $KUBERCOIN_API_KEYS
```

---

## 🤝 Contributing

1. Run tests before committing: `npm test` in `e2e-tests/`
2. Follow Rust formatting: `cargo fmt`
3. Check for warnings: `cargo clippy`
4. Update documentation

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🎉 Summary

KuberCoin currently provides a broad development and operator toolkit with:

✅ Security controls such as authentication and rate limiting
✅ Real-time updates (WebSocket)
✅ Comprehensive monitoring (Prometheus + Grafana)
✅ Multiple web UIs (Explorer, Wallet, Ops)
✅ 45 E2E tests
✅ Complete deployment documentation
✅ One-command startup

**Ready to deploy!** 🚀
