# KuberCoin Mining Guide

## Overview

KuberCoin uses SHA-256d Proof-of-Work, the same algorithm as Bitcoin. Anyone with
a CPU can mine blocks and earn KUBER rewards.

## Reward Schedule

| Era | Block Range | Reward per Block | Cumulative Supply |
|-----|-------------|-----------------|-------------------|
| 1 | 0 – 209,999 | 50 KUBER | 10,500,000 |
| 2 | 210,000 – 419,999 | 25 KUBER | 15,750,000 |
| 3 | 420,000 – 629,999 | 12.5 KUBER | 18,375,000 |
| 4 | 630,000 – 839,999 | 6.25 KUBER | 19,687,500 |
| ... | ... | halves every 210,000 | max 21,000,000 |

## Quick Start

### 1. Download or Build

**Download a release binary:**
```bash
# Linux
curl -LO https://github.com/kubercoin/kubercoin/releases/latest/download/kubercoin-linux-amd64
chmod +x kubercoin-linux-amd64
sudo mv kubercoin-linux-amd64 /usr/local/bin/kubercoin
```

**Build from source:**
```bash
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin
cargo build --release --bin kubercoin
# Binary at target/release/kubercoin
```

### 2. Create a Wallet

```bash
kubercoin create-wallet miner_wallet.json
# Output: Created wallet: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

Save the wallet file securely — it contains your private keys.

### 3. Start the Node

```bash
kubercoin node
```

The node will sync with the network and begin accepting connections on port 8633.

### 4. Mine Blocks

```bash
kubercoin mine miner_wallet.json
```

This starts the mining loop. When a valid block is found, the coinbase reward is
credited to your wallet address.

## Solo Mining vs Pool Mining

### Solo Mining

You compete independently to find blocks. When you succeed, you receive the full
50 KUBER block reward (plus transaction fees). This is the default mode.

```bash
kubercoin mine miner_wallet.json
```

### Pool Mining (Coming Soon)

Pool mining distributes work among participants and shares rewards proportionally.
The `mining-pool/` directory contains the pool implementation.

## Mining Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KUBERCOIN_NETWORK` | `mainnet` | Network: mainnet, testnet, regtest |
| `KUBERCOIN_TEST_MODE` | `0` | Set `1` to disable rate limits |
| `KUBERCOIN_API_KEYS` | (none) | API key for authenticated endpoints |

### Regtest Mode (Development)

For testing, use regtest which has low difficulty:

```bash
KUBERCOIN_NETWORK=regtest kubercoin node --port 18744
# In another terminal:
KUBERCOIN_NETWORK=regtest kubercoin mine miner_wallet.json
```

Regtest difficulty is set to `0x207fffff`, allowing instant block generation.

## Mining Scripts

### Windows (PowerShell)

```powershell
# Mine 50 blocks
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1

# Mine 100 blocks to a specific wallet
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1 -Wallet my_wallet.json -Blocks 100
```

### Linux / macOS (Bash)

```bash
# Mine 50 blocks
bash scripts/mine_now.sh

# Mine 100 blocks to a specific wallet
bash scripts/mine_now.sh my_wallet.json 100
```

## Hardware Requirements

### Minimum
- CPU: Any modern x86_64 or ARM64 processor
- RAM: 512 MB
- Disk: 1 GB (grows with chain)
- Network: Broadband connection

### Recommended
- CPU: 4+ cores (mining is CPU-bound)
- RAM: 2 GB
- Disk: 10 GB SSD
- Network: Low-latency broadband

## Monitoring Mining

### Check Block Height

```bash
curl http://localhost:8080/api/blocks | jq '.height'
```

### Check Your Balance

```bash
kubercoin balance miner_wallet.json
```

### Supply Information

```bash
curl http://localhost:8080/api/supply
```

Returns:
```json
{
  "max_supply": 21000000.0,
  "current_supply": 550.0,
  "block_height": 11,
  "block_reward": 50.0,
  "halving_interval": 210000,
  "next_halving_block": 210000,
  "blocks_until_halving": 209989,
  "halvings_completed": 0
}
```

## Difficulty Adjustment

KuberCoin adjusts mining difficulty every 2,016 blocks (approximately every 2
weeks) to maintain a 10-minute target block time. The adjuster enforces:

- Maximum 4x increase per period
- Maximum 4x decrease per period
- Minimum difficulty floor to prevent stalls

## Troubleshooting

### "Port already in use"

Another process is using port 8633. Either stop it or specify a different port:
```bash
kubercoin node --port 18633
```

### "Connection refused" when mining

Ensure the node is running and the HTTP API port is accessible:
```bash
curl http://localhost:8080/api/blocks
```

### Low hash rate

Mining is CPU-bound. Close other CPU-intensive applications or consider running
on a dedicated machine.
