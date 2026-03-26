# KuberCoin Testnet Deployment Guide

**Target Audience:** Node operators, developers, early testers
**Last Updated:** Session 22 — P1.1 (Run a Public Adversarial Testnet)

---

## Table of Contents

1. [Overview](#overview)
2. [Network Parameters](#network-parameters)
3. [Hardware Requirements](#hardware-requirements)
4. [Quick Start — Docker (local multi-node)](#quick-start--docker-local-multi-node)
5. [Single-Node Docker](#single-node-docker)
6. [Binary — Manual Setup](#binary--manual-setup)
7. [Monitoring](#monitoring)
8. [Wallet & Faucet](#wallet--faucet)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The KuberCoin testnet is a public blockchain network for integration testing,
wallet development, and adversarial experimentation. Testnet coins have no
monetary value. The consensus rules mirror mainnet with minor difficulty
relaxation for faster block discovery during network bootstrap.

---

## Network Parameters

| Parameter | Value |
|---|---|
| **Network name** | `testnet` |
| **Magic bytes** | `0x0B110907` |
| **P2P port** | 18633 |
| **Block time target** | 600 s (10 min) |
| **Difficulty adjustment** | Every 2 016 blocks |
| **Initial reward** | 50 KUBER |
| **Halving interval** | 210 000 blocks |
| **Coinbase maturity** | 100 blocks |
| **Max supply** | 21 000 000 KUBER |
| **Genesis hash** | `00000ca78d72864b61…bddd07de` |
| **Genesis timestamp** | 2026-01-29 00:00 UTC |
| **Address prefix** | `m` / `n` |
| **DNS seeds** | `testnet-seed.kuber-coin.com`, `seed.testnet.kuber-coin.com` |

---

## Hardware Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Network | 50 GB/month | 100 GB/month |

---

## Quick Start — Docker (local multi-node)

This spins up a 5-node local testnet (2 seeds + 3 regular nodes) with
Prometheus and Grafana pre-configured.

### Prerequisites

- Docker Engine ≥ 24 and Docker Compose V2
- Ports 18080–18084 (HTTP), 18332–18336 (RPC), 18633–18637 (P2P),
  19090–19099 (WS/metrics), 3000 (Grafana), 9092 (Prometheus) available.

### Launch

```bash
# Build images and start the cluster
docker compose -f docker-compose.testnet.yml up -d --build

# Watch logs (all nodes)
docker compose -f docker-compose.testnet.yml logs -f

# Check health
curl http://localhost:18080/api/health   # seed1
curl http://localhost:18082/api/health   # node1
```

### Port Map

| Service | P2P | RPC | HTTP | WS | Metrics |
|---|---|---|---|---|---|
| seed1 | 18633 | 18332 | 18080 | 19090 | 19091 |
| seed2 | 18634 | 18333 | 18081 | 19092 | 19093 |
| node1 | 18635 | 18334 | 18082 | 19094 | 19095 |
| node2 | 18636 | 18335 | 18083 | 19096 | 19097 |
| node3 | 18637 | 18336 | 18084 | 19098 | 19099 |

### Tear Down

```bash
docker compose -f docker-compose.testnet.yml down -v   # -v removes data volumes
```

---

## Single-Node Docker

Join the public testnet with a single container:

```bash
docker run -d --name kubercoin-testnet \
  -p 18633:18633 -p 18080:8080 -p 18332:8332 -p 19091:9091 \
  -e KUBERCOIN_NETWORK=testnet \
  -e KUBERCOIN_INITIAL_PEERS=testnet-seed.kuber-coin.com:18633 \
  -e KUBERCOIN_METRICS_BIND=0.0.0.0:9091 \
  -e KUBERCOIN_HTTP_BIND=0.0.0.0:8080 \
  -e KUBERCOIN_RPC_BIND=0.0.0.0:8332 \
  -v kubercoin-testnet-data:/data \
  kubercoin:latest
```

> **Tip:** Create a local `.env.testnet` file and pass `--env-file .env.testnet`
> instead of repeating `-e` flags, for example:
>
> ```text
> KUBERCOIN_NETWORK=testnet
> KUBERCOIN_API_AUTH_ENABLED=true
> KUBERCOIN_TEST_MODE=1
> ```

---

## Binary — Manual Setup

### Build from source

```bash
cargo build --release -p kubercoin-node
```

### Run

```bash
KUBERCOIN_NETWORK=testnet \
KUBERCOIN_INITIAL_PEERS=testnet-seed.kuber-coin.com:18633 \
KUBERCOIN_METRICS_BIND=0.0.0.0:9091 \
./target/release/kubercoin-node
```

### systemd (Linux)

Copy `deploy/kubercoin.service` and adjust `Environment=` lines:

```ini
[Service]
Environment=KUBERCOIN_NETWORK=testnet
Environment=KUBERCOIN_INITIAL_PEERS=testnet-seed.kuber-coin.com:18633
ExecStart=/usr/local/bin/kubercoin-node
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kubercoin-testnet
```

---

## Monitoring

### Prometheus

Each node exposes Prometheus metrics at `:9091/metrics`.

The local cluster includes a pre-configured Prometheus on **http://localhost:9092**
that scrapes all five nodes (see `monitoring/prometheus-testnet.yml`).

Alert rules live in `monitoring/alerts.yml` — they fire for:
- Missing metrics / node down
- Zero peers or low peer count
- Stalled block production
- Mempool backlog > 5 000 txs
- UTXO set growth beyond 50 000 000 entries
- Rapid mempool growth above 50 tx/s

### Grafana

Pre-provisioned at **http://localhost:3000** (admin / admin).
Two dashboards auto-import from `monitoring/grafana/dashboards/`:
- **KuberCoin Overview** — block height, peer count, mempool, hash rate
- **KuberCoin Node** — CPU, memory, storage, RPC latency

---

## Wallet & Faucet

### Create a testnet wallet

```bash
curl -X POST http://localhost:18080/api/wallet/create \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-testnet-wallet"}'
```

### Get a testnet address

```bash
curl http://localhost:18080/api/wallet/my-testnet-wallet/address
```

### Mine testnet blocks (solo)

```bash
curl -X POST http://localhost:18080/api/mining/start \
  -H 'Content-Type: application/json' \
  -d '{"address": "<your-testnet-address>"}'
```

---

## Troubleshooting

### Node won't connect to peers

1. Verify `KUBERCOIN_NETWORK=testnet` is set (not `mainnet`).
2. Ensure port **18633** is reachable (firewall / NAT).
3. Check DNS resolution: `dig testnet-seed.kuber-coin.com`.
4. Override with explicit IPs: `KUBERCOIN_INITIAL_PEERS=1.2.3.4:18633`.

### Block height stuck at 0

- The testnet may need at least one miner. Start mining on your node.
- Confirm peers are connected: `curl http://localhost:18080/api/peers`.

### Health check failing

- The endpoint is `GET /api/health` on the HTTP port (default 8080 inside
  the container, mapped to 18080–18084 externally).
- Allow 30 s startup grace before first probe.

### Prometheus shows no data

- Confirm the metrics endpoint responds: `curl http://localhost:19091/metrics`.
- Check `prometheus-testnet.yml` targets match the running container names.
- If running outside Docker, update `targets` to point at the correct host:port.

### Docker build fails

```bash
# Clean build cache and retry
docker compose -f docker-compose.testnet.yml build --no-cache
```
