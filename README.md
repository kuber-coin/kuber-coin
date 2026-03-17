# KuberCoin

[![CI](https://github.com/kubercoin/kubercoin/actions/workflows/ci.yml/badge.svg)](https://github.com/kubercoin/kubercoin/actions/workflows/ci.yml)
[![Release](https://github.com/kubercoin/kubercoin/actions/workflows/release.yml/badge.svg)](https://github.com/kubercoin/kubercoin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.19-green.svg)](CHANGELOG.md)

A Bitcoin-inspired cryptocurrency built from scratch in Rust. Full UTXO model,
SHA-256d Proof-of-Work, P2PKH addresses, halving schedule, and 21 million coin
hard cap.

## Current Status Snapshot

Verified locally as of 2026-03-16:

- Testnet remains live with multi-node convergence evidence captured in the repo docs.
- Rust workspace validation passed: `cargo check`, `cargo test`, `cargo clippy`, and `cargo deny check`.
- Wallet live E2E coverage is green: `88/88` live tests and `12/12` critical live tests.
- Security review materials are prepared for auditor handoff, but no external audit has been completed yet.
- Release-binary, reproducible-build, and checksum jobs are configured in CI, but this README should not imply they are already publicly proven until green public runs are attached.

See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md), [docs/E2E_COIN_WORKFLOW.md](docs/E2E_COIN_WORKFLOW.md), and [docs/SECURITY.md](docs/SECURITY.md) for the evidence behind these claims.

## Quick Start

### Download

Grab a release binary from [Releases](https://github.com/kubercoin/kubercoin/releases):

```bash
# Linux
curl -LO https://github.com/kubercoin/kubercoin/releases/latest/download/kubercoin-linux-amd64
chmod +x kubercoin-linux-amd64
sudo mv kubercoin-linux-amd64 /usr/local/bin/kubercoin
```

### Build from Source

```bash
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin
cargo build --release --bin kubercoin-node
```

Requires Rust 1.75+ and a C linker.

### Run a Node

```bash
kubercoin-node --network testnet
```

### Create a Wallet

```bash
./kubercoin.exe new-wallet my_wallet.json
```

### Mine Blocks (to wallet address)

```bash
./kubercoin.exe mine-to $(./kubercoin.exe get-address my_wallet.json --json | jq -r .address) 1
```

### Send Coins

```bash
kubercoin send my_wallet.json 1RecipientAddressHere 10.5
```

## Tokenomics

| Parameter | Value |
|-----------|-------|
| Algorithm | SHA-256d (double SHA-256) |
| Max Supply | 21,000,000 KUBER |
| Block Reward | 50 KUBER (era 1) |
| Halving Interval | 210,000 blocks |
| Target Block Time | 10 minutes |
| Difficulty Adjustment | Every 2,016 blocks |
| Address Format | Base58Check, P2PKH |

## Network Modes

| Mode | Port | Use Case |
|------|------|----------|
| Mainnet | 8633 | Production network |
| Testnet | 18633 | Public testing |
| Regtest | 18444 | Local development |

Set via environment variable:

```bash
KUBERCOIN_NETWORK=testnet kubercoin node
```

## Architecture

```
kubercoin/
├── chain/        # Block structure, Merkle trees
├── consensus/    # Consensus rules, validation
├── tx/           # Transactions, signatures, addresses
├── storage/      # Persistent chain storage
├── node/         # P2P networking, mining, REST API, CLI
├── testnet/      # Genesis block, test utilities
├── miner/        # External miner
├── faucet/       # Testnet faucet
├── lightning/    # Payment channels (experimental)
├── apps/web/wallet/     # Next.js web wallet
├── apps/web/explorer/   # Block explorer UI
├── apps/web/ops/        # Operations dashboard
├── apps/web/monitoring/ # Monitoring UI
├── apps/web/site/       # Landing page
├── apps/packages/ui/    # Shared React/Tailwind UI package
├── apps/sdk/packages/js # JavaScript/TypeScript SDK
├── infra/helm/          # Kubernetes Helm chart
├── tools/scripts/       # Build, test, deploy, and launch scripts
└── docs/                # Full documentation suite
```

## REST API

The node exposes a JSON-RPC and REST API (default port **8634**):

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Node health status |
| `GET /api/info` | Node version and network info |
| `GET /api/peers` | Connected peer list |
| `GET /metrics` | Prometheus metrics |
| `POST /` | JSON-RPC endpoint (getblockchaininfo, getblock, etc.) |

## Docker

```bash
# Full stack (node + explorer + wallet + monitoring)
docker compose up -d

# Node only
docker run -p 8633:8633 -p 8634:8634 ghcr.io/kubercoin/kubercoin:latest
```

## Testing

```bash
# Rust unit/integration tests
cargo test --workspace

# Wallet live E2E tests
npm --prefix apps/web/wallet run test:e2e:live

# Wallet live critical subset
npm --prefix apps/web/wallet run test:e2e:live:critical

# End-to-end smoke test
powershell -ExecutionPolicy Bypass -File tools/scripts/e2e_live.ps1

# Full sweep (all tests)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/all_sweep.ps1
```

## Documentation

- [Whitepaper](WHITEPAPER.md) — Technical design
- [Mining Guide](docs/MINING_GUIDE.md) — How to mine
- [Wallet Guide](docs/WALLET_GUIDE.md) — Wallet usage
- [Grant Readiness](docs/GRANT_READINESS.md) — Current funding posture and evidence
- [API Reference](docs/API_DOCUMENTATION.md) — REST API docs
- [CLI Reference](docs/CLI_REFERENCE.md) — Command-line interface
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) — Production deployment
- [Contributing](docs/CONTRIBUTING.md) — Development guidelines
- [Changelog](CHANGELOG.md) — Release history
- [Security](SECURITY.md) — Vulnerability reporting

## Configuration

See [kubercoin.conf.example](kubercoin.conf.example) for all configuration options.

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `KUBERCOIN_NETWORK` | `mainnet` | Network mode |
| `KUBERCOIN_API_KEYS` | (none) | API authentication keys |
| `KUBERCOIN_TEST_MODE` | `0` | Disable rate limits for testing |

## Launch

For a mainnet readiness pass before operator sign-off:

```bash
# Linux/macOS
bash tools/scripts/launch_mainnet.sh --json

# Windows
powershell -ExecutionPolicy Bypass -File .\tools\scripts\launch_mainnet.ps1 -Json
```

These scripts do not create a network or automate genesis. They validate the
current release binary, launch-critical docs, seed configuration, and optional
live seed HTTP endpoints before operators continue with the checklist in
[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for production setup with
TLS, monitoring, and high availability.

## License

MIT
