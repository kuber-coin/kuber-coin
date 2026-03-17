# KuberCoin Mining Pool

This directory contains the mining pool implementation.

## Features

- **Stratum Protocol**: Supports standard Stratum mining protocol (port 3334)
- **Fair Rewards**: PPLNS (Pay Per Last N Shares) reward distribution
- **Web Dashboard**: Real-time monitoring at http://localhost:8002/
- **Worker Management**: Track multiple workers and their performance

## Setup

The mining pool server uses the Stratum implementation in `node/src/stratum.rs`.

To start the pool server:

```bash
# Build and run (would need dedicated pool binary)
docker compose up -d mining-pool
```

## Connect a Miner

Use any SHA-256d compatible miner:

```bash
# Example with cpuminer
minerd -a sha256d -o stratum+tcp://localhost:3334 -u worker1 -p x

# Example with cgminer
cgminer -o stratum+tcp://localhost:3334 -u worker1 -p x --btc-address YOUR_ADDRESS
```

## Pool Configuration

- **Port**: 3334 (Stratum)
- **Dashboard**: 8002 (HTTP)
- **Fee**: 1%
- **Reward Model**: PPLNS
- **Minimum Payout**: 100,000,000 units (1 KBC)

## API Endpoints

The pool exposes HTTP endpoints for monitoring:

- `GET /api/stats` - Pool statistics
- `GET /api/workers` - Active workers list
- `GET /api/blocks` - Blocks found by pool
- `GET /api/payments` - Recent payments

## Dashboard

Open http://localhost:8002/ to view:
- Real-time pool hashrate
- Active workers
- Blocks found
- Your worker performance
- Payment history
