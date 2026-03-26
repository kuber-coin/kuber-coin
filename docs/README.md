# KuberCoin Documentation

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ╔═══╗                                                   ║
║   ║ K ║   KUBERCOIN                                       ║
║   ╚═══╝                                                   ║
║                                                           ║
║   Privacy Meets Performance                               ║
║   The Fast & Private Blockchain                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

Evidence-backed technical documentation for the current KuberCoin codebase, testnet, and operator workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.88%2B-orange.svg)](https://www.rust-lang.org/)
[![Tests](https://img.shields.io/badge/tests-1334%20passing-brightgreen.svg)](https://github.com/kubercoin/kubercoin)
[![Version](https://img.shields.io/badge/version-1.0.19-blue.svg)](https://github.com/kubercoin/kubercoin/releases)
[![Status](https://img.shields.io/badge/status-testnet-yellow.svg)](https://github.com/kubercoin/kubercoin)

⚠️ **Development Status: Pre-production testnet.** Use for development and evaluation only. External security audit, public release evidence, and launch-readiness closure are still pending.

---

## Reviewer Start Here

Use these documents first if you are assessing project maturity or grant readiness:

- [GRANT_READINESS.md](GRANT_READINESS.md) - current grant-target fit, strengths, blockers, and next steps
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) - operator-grade launch gate with completed and pending items
- [E2E_COIN_WORKFLOW.md](E2E_COIN_WORKFLOW.md) - current real-stack E2E evidence, including validated wallet live coverage
- [SECURITY.md](SECURITY.md) - current public security posture, audit readiness, and reporting policy
- [COVERAGE.md](COVERAGE.md) - current measured coverage numbers and red zones
- [FUZZING.md](FUZZING.md) - local, WSL/Linux, and CI fuzzing workflows
- [GITHUB_ACTIONS_LOCAL.md](GITHUB_ACTIONS_LOCAL.md) - local mirrors for practical GitHub Actions validation
- [GITHUB_ACTIONS_MATRIX.md](GITHUB_ACTIONS_MATRIX.md) - workflow-by-workflow map from GitHub Actions jobs to local tasks and scripts

If any older narrative below conflicts with those evidence documents, treat the evidence documents as authoritative.

## Quick Start

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and build
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin
cargo build --release

# Run a node
cargo run --release --bin kubercoin -- start

# Or use Docker
docker compose up -d
```

Once the stack is up, access the UIs:

**Web Applications:**
- 🔍 **Explorer**: http://localhost:3200 (Block/transaction search, real-time updates)
- 💰 **Wallet**: http://localhost:3250 (Wallet management, send/receive)
- ⚙️ **Operations**: http://localhost:3300 (System health, alerts, peer info)
- 📊 **Monitoring**: http://localhost:3100 (Metrics dashboard)
- 📈 **Grafana**: http://localhost:3000 (Advanced visualization)

**Direct APIs:**
- 🔌 JSON-RPC: http://localhost:8634 (Blockchain queries)
- 🌐 Wallet API proxy: http://localhost:3250/api/* (Wallet operations via wallet web)
- 📡 Node metrics: http://localhost:8634/metrics (Prometheus format)
- 📊 Prometheus: http://localhost:9092 (Scrape + query API)

**Quick Commands:**
```bash
# View latest blocks
kubercoin-cli explorer latest

# Create wallet
kubercoin-cli wallet create mywallet.json

# Start mining
kubercoin-cli miner start <address>

# Interactive TUI
kubercoin-tui status
```

**🚀 [Full Installation Guide](DOCKER_README.md)** | **📖 [Developer Guide](CONTRIBUTING.md)**

---

## ✨ Why Kubercoin?

### The Privacy + Performance Problem

| Blockchain | TPS | Privacy | Problem |
|------------|-----|---------|---------|
| **Bitcoin** | 7 | ❌ Public | Too slow |
| **Ethereum** | 30 | ❌ Public | Too slow |
| **Monero** | 1,700 | ✅ Private | Still slow |
| **Solana** | 65,000 | ❌ Public | No privacy |
| **Kubercoin** | **~7 (base layer)** | **✅ Optional** | **Bitcoin security + privacy** |

### Kubercoin's Solution

✅ **Bitcoin-grade security** - SHA-256d PoW, 10-minute blocks, 21M hard cap
✅ **Optional Privacy** - You choose what to share
✅ **Low Fees** - Designed for efficient on-chain transactions
✅ **100% Open Source** - MIT licensed, fully auditable
✅ **Bitcoin-Compatible** - Same security model (UTXO, halving schedule)

---

## Current Status

### Version 1.0.19 (March 16, 2026)

**Verified today:**
- Rust workspace validation passed locally on 2026-03-16: `cargo check`, `cargo test`, `cargo clippy`, and `cargo deny check`
- Launch checklist evidence is partially complete, with reproducible-build, release artifact publication, DNS/bootstrap proof, and external audit still open
- Current measured Rust coverage is `75.13%` lines and `80.16%` functions; the weakest red zones remain split RPC handler modules
- Wallet real-stack live E2E is green: `88/88` live tests and `12/12` critical live tests
- Security review materials are prepared, but no independent audit has yet been completed

**Current focus:**
- development evaluation
- testnet operation
- launch-readiness hardening

**Not yet supported as a public claim:**
- production launch readiness
- infrastructure-grade operational maturity
- external-audit-complete security posture

**See also:** [ROADMAP_BITCOIN_GRADE.md](ROADMAP_BITCOIN_GRADE.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)

---

## 🚀 Features

### Core Blockchain
- **UTXO Model** - Bitcoin-style unspent outputs
- **SHA-256d PoW** - ASIC-optimized proof-of-work
- **10-Minute Blocks** - Predictable block time
- **21M Max Supply** - Fixed supply like Bitcoin
- **Difficulty Adjustment** - Every 2016 blocks

### Privacy Features
- **Optional Privacy** - Choose per-transaction
- **Dandelion++** - Transaction origin obfuscation
- **Future: zk-SNARKs** - Zero-knowledge proofs
- **Future: Ring Signatures** - Sender anonymity

### Performance
- **Base Layer TPS** - ~7 transactions/second (Bitcoin-equivalent, 10-minute blocks)
- **Layer-2 Target** - Lightning Network planned (future)
- **Parallel Validation** - Multi-core block processing
- **Compact Blocks** - BIP-152 bandwidth optimization
- **Optimized Storage** - RocksDB backend (production target)
- **Bloom Filters** - 99% faster UTXO lookups
- **Efficient P2P** - Optimized block propagation
- **Low Fees** - Fee levels depend on transaction size and network conditions

### Developer APIs
- **JSON-RPC** - Bitcoin-compatible (15+ methods)
- **REST API** - Modern HTTP endpoints (8 endpoints)
- **Wallet live Playwright suite** - Real stack coverage via the wallet web proxy
- **SDKs** - JavaScript, Python, Go (coming soon)

**👉 [Complete API Documentation](API_DOCUMENTATION.md)**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Application Layer                 │
│  Wallet · Mining · Explorer · Smart Contracts       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│                    API Layer                        │
│   JSON-RPC · REST · Metrics                         │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│                   Node Layer                        │
│   Mempool · Chain State · Block Validation          │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│                 Consensus Layer                     │
│   PoW · Difficulty · Merkle Trees                   │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│                 Network Layer                       │
│   P2P · TCP · Dandelion++ · Peer Discovery          │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│                 Storage Layer                       │
│   RocksDB (target) · In-memory (current) · Indexes  │
└─────────────────────────────────────────────────────┘
```

---
## 💻 Usage Examples

### Mining Blocks

```bash
# Mine 5 blocks
cargo run --release --bin kubercoin -- mine 5

# Output:
# ⛏️  Mining block 1...
# ✅ Mined block 1 in 2.3s (hash: 0000a1b2...)
# ⛏️  Mining block 2...
```

### Wallet Operations

```bash
# Create new wallet
cargo run --release -- wallet create

# Check balance
cargo run --release -- wallet balance

# Generate new address
cargo run --release -- wallet newaddress

# Send transaction
cargo run --release -- wallet send <address> <amount>

# Send private transaction
cargo run --release -- wallet send <address> <amount> --private
```

### Running a Node

```bash
# Start node (mainnet)
cargo run --release --bin kubercoin -- start

# Start testnet node
cargo run --release --bin kubercoin -- start --testnet

# Start regtest node (local development)
cargo run --release --bin kubercoin -- start --regtest

# With custom config
cargo run --release --bin kubercoin -- start --config kubercoin.conf
```

### Using the API

```bash
# Get blockchain info (JSON-RPC)
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}'

# Get block by height (REST)
curl http://localhost:8634/api/block-by-height/12345

# Query current metrics
curl http://localhost:8634/metrics
```

**👉 [API Documentation](API_DOCUMENTATION.md)**

---

## 📚 Documentation

### Getting Started
- **[Installation Guide](DOCKER_README.md)** - Docker, Docker Compose, building from source
- **[Quick Start Tutorial](QUICK_START.md)** - Your first transaction in 5 minutes
- **[Configuration Guide](../kubercoin.conf.example)** - Node setup and tuning

### For Developers
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute (12,500 words)
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference (14,000 words)
- **[Consensus Freeze](CONSENSUS_FREEZE.md)** - Consensus-critical parameters and locked assumptions
- **[Code Standards](CONTRIBUTING.md#code-standards)** - Rust style guide

### For Users
- **[FAQ](FAQ.md)** - Frequently asked questions
- **[Security Policy](SECURITY.md)** - Vulnerability reporting and disclosure process
- **[Terms of Service](TERMS_OF_SERVICE.md)** - Legal framework (draft)
- **[Privacy Policy](PRIVACY_POLICY.md)** - Data handling (draft)

### Project Management
- **[Roadmap](ROADMAP.md)** - Feature timeline and priorities
- **[Changelog](CHANGELOG.md)** - Version history and release notes
- **[Grant Readiness](GRANT_READINESS.md)** - Current funding posture and reviewer-safe evidence
- **[Launch Checklist](LAUNCH_CHECKLIST.md)** - Current operational readiness gate

---

## 🛠️ Development

### Prerequisites

- **Rust 1.70+** - [Install via rustup](https://rustup.rs/)
- **Git** - Version control
- **Docker** (optional) - For containerized deployment

### Building from Source

```bash
# Clone the repository
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin

# Build all crates
cargo build --workspace

# Run tests (134 tests)
cargo test --workspace

# Run with optimizations
cargo build --release
```

### Development Tools

```bash
# Install recommended tools
cargo install cargo-watch    # Auto-rebuild on changes
cargo install cargo-audit    # Security vulnerability scanning
cargo install cargo-outdated # Check outdated dependencies

# Format code
cargo fmt

# Run linter
cargo clippy -- -D warnings

# Generate documentation
cargo doc --open
```

### Project Structure

```
kubercoin/
├── node/              # Main node binary and APIs
├── chain/             # Blockchain structures (Block, UTXO)
├── consensus/         # Consensus rules (PoW, validation)
├── tx/                # Transaction logic (scripts, signing)
├── storage/           # Storage backends (RocksDB)
├── testnet/           # Testnet utilities
├── tools/             # CLI tools
├── docs/              # Documentation
├── monitoring/        # Prometheus/Grafana configs
└── .github/           # CI/CD workflows
```

**👉 [Full Developer Guide](CONTRIBUTING.md)**

---

## 🐳 Docker Deployment

### Quick Start with Docker Compose

```bash
# Clone repository
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin

# Start node + monitoring stack
docker compose up -d

# View logs
docker compose logs -f node

# Check status
docker compose ps
```

**Includes:**
- Kubercoin node (P2P + RPC + REST + metrics)
- Prometheus (metrics collection)
- Grafana (dashboards and visualization)
- PostgreSQL (optional, for indexing)
- Redis (optional, for caching)

**Access:**
- Node HTTP API: http://localhost:8634
- Grafana: http://localhost:3000 (credentials from env/compose)
- Prometheus: http://localhost:9092

### Stack-Level E2E (Debug)

On Windows, you can validate the running Compose stack (node `/metrics`, Prometheus scrape + query, Grafana provisioning) using:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\e2e-debug.ps1 -Build
```

Optional flags:
- `-RemoveOrphans` to clean up containers from removed services
- `-TimeoutSeconds <n>` to extend waits for slow machines

**👉 [Complete Docker Guide](DOCKER_README.md)**

---

## 📊 Monitoring

### Grafana Dashboards

Access pre-built dashboards at http://localhost:3000:

- **Overview** - Block height, peers, mempool, hashrate
- **Network** - Bandwidth, peers, sync status
- **Performance** - CPU, memory, disk I/O
- **Blockchain** - Chain growth, UTXO set, storage

### Prometheus Metrics

Primary node metrics are available at http://localhost:8634/metrics:

```
# Blockchain metrics
kubercoin_block_height
kubercoin_difficulty
kubercoin_block_reward

# Network metrics
kubercoin_peers
kubercoin_peers_inbound
kubercoin_peers_outbound

# Mempool metrics
kubercoin_mempool_size
kubercoin_mempool_bytes

# Chain state metrics
kubercoin_utxo_count
```

**👉 [Monitoring Setup Guide](DOCKER_README.md#monitoring)**

---

## 🔐 Security

### Reporting Vulnerabilities

**DO NOT** publicly disclose security vulnerabilities.

**Report to:** connect@kuber-coin.com
**PGP Key:** [Download](https://kuber-coin.com/security-pgp.asc)

### Vulnerability Disclosure

Security researchers should report vulnerabilities privately to
connect@kuber-coin.com. The repository does not publish a standing public
reward schedule in this document.

**👉 [Full Security Policy](SECURITY.md)**

---

## 🤝 Community

### Join Us

- **Discord:** [discord.gg/kubercoin](https://discord.gg/kubercoin) - Chat with developers
- **Twitter:** [@kubercoin](https://twitter.com/kubercoin) - News and updates
- **GitHub:** [github.com/kubercoin](https://github.com/kubercoin/kubercoin) - Code and issues
- **Website:** [kuber-coin.com](https://kuber-coin.com) - Official website
- **Email:** connect@kuber-coin.com - General inquiries

### Discord Channels

- `#general` - General discussion
- `#dev-discussion` - Technical talks
- `#dev-help` - Get help with development
- `#support` - User support
- `#trading` - Price and market discussion
- `#governance` - Community proposals

### Contributing

We welcome all contributions:

- 🐛 **Bug Reports** - Found a bug? Open an issue
- ✨ **Feature Requests** - Have an idea? Share it
- 📝 **Documentation** - Improve our docs
- 💻 **Code** - Submit a pull request
- 🧪 **Testing** - Help test new features
- 🌐 **Translation** - Translate documentation

**👉 [Contributing Guide](CONTRIBUTING.md)** | **👉 [Code of Conduct](CODE_OF_CONDUCT.md)**

---

## 🗺️ Roadmap

### Phase 1: Foundation (✅ Complete - Q4 2025)
- Core blockchain (UTXO, PoW, Merkle trees)
- P2P networking (Dandelion++)
- Basic wallet (HD, BIP32/39/44)
- JSON-RPC API
- Docker deployment

### Phase 2: Infrastructure (✅ Complete - Q1 2026)
- REST APIs and metrics
- CI/CD pipeline
- Monitoring (Prometheus + Grafana)
- Complete documentation
- Security policy + disclosure workflow

### Phase 3: Scaling (Q2 2026 - Requires Funding)
- SegWit support
- Lightning Network
- Lightning Network integration (Layer-2 scaling)
- Hardware wallet support
- Mobile wallets (iOS, Android)

### Phase 4: Privacy (Q3-Q4 2026 - Requires Funding)
- zk-SNARKs integration
- Ring signatures
- Stealth addresses
- Enhanced Dandelion++
- Privacy by default

### Phase 5: Smart Contracts (2027 - Requires Funding)
- Smart contract VM
- Solidity compatibility
- DeFi primitives
- Cross-chain bridges
- dApps ecosystem

**👉 [Full Roadmap](ROADMAP.md)** | **👉 [Grant Readiness](GRANT_READINESS.md)**

---

## Funding Posture

Current repo state is strongest for development-oriented grants and technical review, not for speculative investment or production-readiness claims.

Best near-term funding use cases:

- external security audit and remediation
- public CI and release artifact publication
- operator-readiness and bootstrap validation
- deeper production-path testing and RPC coverage expansion

Use [GRANT_READINESS.md](GRANT_READINESS.md) as the authoritative summary before sharing the repository with funders or reviewers.

---

## 📄 License

Kubercoin is open source software released under the **MIT License**.

```
MIT License

Copyright (c) 2026 Kubercoin Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

### Built With
- [Rust](https://www.rust-lang.org/) - Systems programming language
- [Tokio](https://tokio.rs/) - Async runtime
- [RocksDB](https://rocksdb.org/) - Storage engine
- [secp256k1](https://github.com/rust-bitcoin/rust-secp256k1) - Cryptography
- [Prometheus](https://prometheus.io/) - Metrics
- [Grafana](https://grafana.com/) - Dashboards

### Inspired By
- [Bitcoin](https://bitcoin.org/) - The original cryptocurrency
- [Monero](https://getmonero.org/) - Privacy leader
- [Ethereum](https://ethereum.org/) - Smart contracts
- [Solana](https://solana.com/) - High performance

### Special Thanks
- All contributors and community members
- Security researchers and responsible reporters
- Early testers and feedback providers

---

## 📞 Contact

**General Inquiries:** connect@kuber-coin.com
**Security:** connect@kuber-coin.com
**Investors:** connect@kuber-coin.com
**Press:** connect@kuber-coin.com
**Conduct:** connect@kuber-coin.com

**Website:** [kuber-coin.com](https://kuber-coin.com)
**GitHub:** [github.com/kubercoin/kubercoin](https://github.com/kubercoin/kubercoin)
**Discord:** [discord.gg/kubercoin](https://discord.gg/kubercoin)
**Twitter:** [@kubercoin](https://twitter.com/kubercoin)

---

## ⭐ Star History

If you find Kubercoin useful, please star the repository! It helps us grow the community.

[![Star History Chart](https://api.star-history.com/svg?repos=kubercoin/kubercoin&type=Date)](https://star-history.com/#kubercoin/kubercoin&Date)

---

<div align="center">

**Privacy Meets Performance**

Made with ❤️ by the Kubercoin community

[Download](https://kuber-coin.com/download) · [Documentation](README.md) · [Community](https://discord.gg/kubercoin)

</div>
────────────────────
Total:     134 tests ✅
```

## Educational Value

KuberCoin demonstrates:

- ✅ Blockchain fundamentals (blocks, chains, merkle trees)
- ✅ Proof-of-Work consensus
- ✅ UTXO transaction model
- ✅ Cryptographic signatures (ECDSA)
- ✅ P2P networking protocols
- ✅ Blockchain synchronization
- ✅ Double-spend prevention
- ✅ Fee-based transaction prioritization
- ✅ Wallet key management
- ✅ State persistence

## Future Enhancements

Potential next steps:

- **TCP/Async**: Implement actual TCP sockets with tokio
- **Peer Discovery**: DNS seeds and addr message exchange
- **Headers-First Sync**: Faster initial blockchain sync
- **Compact Blocks**: Bandwidth optimization
- **SPV Support**: Lightweight client capability

## Documentation

- [SPRINT4_PHASE1_COMPLETE.md](SPRINT4_PHASE1_COMPLETE.md) - TCP Transport details ⭐ NEW
- [SPRINT3_COMPLETE.md](SPRINT3_COMPLETE.md) - Complete Sprint 3 documentation
- Comprehensive inline code comments
- Architecture diagrams in sprint documentation

## License

Educational/Learning purposes

---
4 Phase 1 Complete - Real TCP networking operational! 🚀
**Tests**: 1,334 passing ✅
**Lines**: ~5,5passing ✅
**Lines**: ~5,000+ lines of Rust code mining)
│   ├── Wallet (key management)
│   ├── Mempool (transaction pool)
│   ├── ChainState (persistence)
│   ├── Protocol (network messages) ⭐ NEW
│   ├── Peer (connection management) ⭐ NEW
│   ├── Network (P2P coordination) ⭐ NEW
│   └── Sync (blockchain sync) ⭐ NEW
├── testnet/       # Test network (5 tests)
│   └── Ge4 Phase 1: TCP Transport (NEW!)

### TCP Transport Layer
- **TcpPeer**: Async TCP connection wrapper
- **TcpTransport**: TCP listener for incoming connections
- **Message Framing**: Length-prefix protocol (4-byte header + message)
- **Error Handling**: IoError, MessageTooLarge, SerializationError, ConnectionClosed
- **Async Runtime**: tokio for efficient concurrent connections

**Features**:
- Async send/receive with tokio::sync::Mutex
- 10 MB message size limit
- Connection closed detection
- Per-peer async task spawning
- Shared state with Arc<Mutex<>>

See [SPRINT4_PHASE1_COMPLETE.md](SPRINT4_PHASE1_COMPLETE.md) for detailed documentation.

## Sprint 3 Featuresguration
├── tx/            # Transactions (33 tests)
│   ├── Transaction, TxInput, TxOutput
│   ├── ECDSA signatures (secp256k1)
│   └── Address encoding (Base58Check)
└── storage/       # Reserved for future use
```

## Sprint 3 Features (NEW!)

### Network Protocol
- **11 message types**: Version, Verack, Ping, Pong, Inv, GetData, Block, Tx, GetBlocks, GetHeaders, Headers, Reject
- **Binary serialization** with bincode
- **Protocol version**: 1
- **Magic bytes**: [0x0B, 0x11, 0x09, 0x07] (testnet)

### Peer Management
- **State machine**: New → VersionSent → Connected
- **Ping/pong latency** measurement
- **Height tracking** for sync coordination
- **Max peers limit** with duplicate detection
- **Stale peer removal**

### Network Coordination
- **Message routing** and handler dispatch
- **Block/transaction broadcast** with Inv messages
- **Duplicate detection** prevents relay loops
- **Request handling** for GetData messages
- **Sync coordination** with block locators

### Blockchain Synchronization
- **Block locator generation** (exponential backoff)
- **Batch requests** (500 blocks per batch)
- **Pending block tracking**
- **Sync state management**
- **Completion detection**

See [SPRINT3_COMPLETE.md](SPRINT3_COMPLETE.md) for detailed documentation.

## Design Principles

1. **Determinism before scalability** - Identical inputs → identical outputs
2. **Explicit trade-offs** - Security, liveness, and decentralization are chosen, not balanced
3. **Operational realism** - Node requirements and failure handling are first-class concerns
4. **Minimal consensus surface** - Features that expand attack surface are excluded by default

## Sprint 1 Constraints

Sprint 1 is **locked** and includes only:
- Block structures with SHA-256d hashing
- PoW validation with fixed difficulty
- Single coinbase transaction per block
- In-memory storage only
- Single-node mining

**NOT in Sprint 1:**
- Networking / P2P
- RocksDB persistence
- Transaction validation beyond coinbase
- Difficulty retargeting
- Multiple transaction types

## Key Parameters

- **Block time target:** 600 seconds (10 minutes)
- **PoW algorithm:** SHA-256d (double SHA-256)
- **Transaction model:** UTXO (Sprint 2+)
- **Script system:** Limited Bitcoin-style (Sprint 2+)
- **Max supply:** 21,000,000 KUBER (halving every 210,000 blocks)

## Testing

All tests must be deterministic:
```bash
# Run tests 100 times to verify determinism
for i in {1..100}; do cargo test --workspace || break; done
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - Build and contribution guidelines
- Sprint 1 spec - See planning artifacts

## License

MIT

## Warning

This is an **educational project**, not production infrastructure. It has:
- Testnet-grade security expectations
- No formal audits
- Known operational constraints

Do not use for financial applications.
