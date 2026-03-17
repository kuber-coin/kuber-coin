# Testnet Bootstrap Guide

How to join, run, and test on the KuberCoin testnet.

## Overview

Testnet is a public test network with worthless coins. Use it to develop
applications, test integrations, and experiment safely before mainnet.

| Parameter | Testnet Value |
|-----------|---------------|
| Network name | `testnet` |
| P2P port | 18633 |
| Address prefix | `m` or `n` |
| Address version byte | `0x6f` |
| DNS seeds | `testnet-seed1.kuber-coin.com`, `testnet-seed2.kuber-coin.com` |
| Block reward | 50 KUBER (same schedule as mainnet) |
| Difficulty | Lower than mainnet for faster mining |

## Quick Start

### 1. Set Network

```bash
export KUBERCOIN_NETWORK=testnet
```

Or on Windows:
```powershell
$env:KUBERCOIN_NETWORK = "testnet"
```

### 2. Start a Testnet Node

```bash
kubercoin node --port 18633
```

The node will connect to testnet DNS seeds automatically.

### 3. Create a Testnet Wallet

```bash
kubercoin create-wallet testnet_wallet.json
```

The address will start with `m` or `n` (testnet prefix).

### 4. Get Testnet Coins

**Option A: Mine them**
```bash
kubercoin mine testnet_wallet.json
```

**Option B: Use the faucet**
```bash
curl -X POST http://faucet.kuber-coin.com/api/faucet \
  -H "Content-Type: application/json" \
  -d '{"address": "mYourTestnetAddress"}'
```

**Option C: Run a local faucet**
```bash
cd faucet
cargo run --release
```

### 5. Send a Transaction

```bash
kubercoin send testnet_wallet.json mRecipientAddress 100
```

## Docker (Testnet)

```bash
# Start testnet node via Docker
docker run -e KUBERCOIN_NETWORK=testnet \
  -p 18633:18633 -p 8080:8080 \
  ghcr.io/kubercoin/kubercoin:latest

# Or via docker-compose (default is already testnet)
docker compose up -d
```

## Running a Testnet Seed Node

If you want to help the testnet, run a persistent node:

```bash
# Deploy with the seed node script
export KUBERCOIN_NETWORK=testnet
bash scripts/deploy-seed-node.sh
```

Edit `/etc/kubercoin/kubercoin.conf` and set:
```
network = testnet
port = 18633
```

## Regtest (Local Development)

For fully local testing with instant blocks:

```bash
export KUBERCOIN_NETWORK=regtest
kubercoin node --port 18744
# In another terminal:
kubercoin mine my_wallet.json   # Instant blocks
```

Regtest is isolated — no network peers, no DNS seeds, instant difficulty.

## Testnet vs Regtest

| Feature | Testnet | Regtest |
|---------|---------|---------|
| Network | Public | Local only |
| Peers | Yes (DNS seeds) | None |
| Difficulty | Low (real PoW) | Minimal (instant) |
| Use case | Integration testing | Unit testing, CI |
| Coins | Worthless | Worthless |

## Resetting Testnet Data

```bash
# Stop the node first
rm -rf ~/.kubercoin/testnet/

# Or on Windows
Remove-Item -Recurse -Force $env:APPDATA\kubercoin\testnet\
```

## API on Testnet

All REST and RPC APIs work identically on testnet. The only difference is the
port (8080 for REST, 18332 for RPC by convention) and the address format.

```bash
# Check testnet block height
curl http://localhost:8080/api/blocks

# Testnet supply info
curl http://localhost:8080/api/supply
```

## Troubleshooting

### No peers connecting
- Check firewall allows port 18633
- Verify DNS seeds resolve: `nslookup testnet-seed1.kuber-coin.com`
- Try adding a peer manually via the API

### Address rejected
- Ensure you're using a testnet wallet (address starts with `m`/`n`)
- Mainnet addresses (start with `1`) won't work on testnet

### "Network mismatch" error
- Verify `KUBERCOIN_NETWORK=testnet` is set in your environment
- The node and wallet must use the same network setting
