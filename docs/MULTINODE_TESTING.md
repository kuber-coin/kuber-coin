# Multi-Node Synchronization Testing

This guide explains how to set up and test a multi-node KuberCoin testnet to verify network synchronization, chain convergence, and P2P broadcasting.

## Prerequisites

- Rust toolchain installed
- PowerShell (Windows) or bash (Linux/macOS)
- 3 terminal windows
- Sufficient RAM (minimum 2GB)

## Quick Start

### Option 1: Using Test Scripts (Recommended)

**Windows (PowerShell):**
```powershell
.\scripts\test-multinode.ps1
```

**Linux/macOS (bash):**
```bash
./scripts/test-multinode.sh
```

### Option 2: Manual Setup

#### Step 1: Build the Node

```bash
cargo build --release --bin kubercoin
```

#### Step 2: Create Node Directories

**Windows:**
```powershell
mkdir -p data\node1, data\node2, data\node3
```

**Linux/macOS:**
```bash
mkdir -p data/node{1,2,3}
```

#### Step 3: Start Node 1 (Bootstrap Node)

**Terminal 1:**
```bash
# Windows
$env:KUBERCOIN_DATA_DIR="data\node1"
$env:KUBERCOIN_P2P_PORT="8633"
$env:KUBERCOIN_API_PORT="8080"
$env:KUBERCOIN_RPC_PORT="8332"
$env:KUBERCOIN_WS_PORT="9090"
.\target\release\kubercoin.exe

# Linux/macOS
KUBERCOIN_DATA_DIR=data/node1 \
KUBERCOIN_P2P_PORT=8633 \
KUBERCOIN_API_PORT=8080 \
KUBERCOIN_RPC_PORT=8332 \
KUBERCOIN_WS_PORT=9090 \
./target/release/kubercoin
```

Wait for "✓ Node started successfully" message.

#### Step 4: Start Node 2

**Terminal 2:**
```bash
# Windows
$env:KUBERCOIN_DATA_DIR="data\node2"
$env:KUBERCOIN_P2P_PORT="8334"
$env:KUBERCOIN_API_PORT="8081"
$env:KUBERCOIN_RPC_PORT="8633"
$env:KUBERCOIN_WS_PORT="9091"
$env:KUBERCOIN_BOOTSTRAP_PEERS="127.0.0.1:8633"
.\target\release\kubercoin.exe

# Linux/macOS
KUBERCOIN_DATA_DIR=data/node2 \
KUBERCOIN_P2P_PORT=8334 \
KUBERCOIN_API_PORT=8081 \
KUBERCOIN_RPC_PORT=8633 \
KUBERCOIN_WS_PORT=9091 \
KUBERCOIN_BOOTSTRAP_PEERS=127.0.0.1:8633 \
./target/release/kubercoin
```

#### Step 5: Start Node 3

**Terminal 3:**
```bash
# Windows
$env:KUBERCOIN_DATA_DIR="data\node3"
$env:KUBERCOIN_P2P_PORT="8335"
$env:KUBERCOIN_API_PORT="8082"
$env:KUBERCOIN_RPC_PORT="8334"
$env:KUBERCOIN_WS_PORT="9092"
$env:KUBERCOIN_BOOTSTRAP_PEERS="127.0.0.1:8633,127.0.0.1:8334"
.\target\release\kubercoin.exe

# Linux/macOS
KUBERCOIN_DATA_DIR=data/node3 \
KUBERCOIN_P2P_PORT=8335 \
KUBERCOIN_API_PORT=8082 \
KUBERCOIN_RPC_PORT=8334 \
KUBERCOIN_WS_PORT=9092 \
KUBERCOIN_BOOTSTRAP_PEERS=127.0.0.1:8633,127.0.0.1:8334 \
./target/release/kubercoin
```

## Verification Tests

### Test 1: Peer Connectivity

Check that all nodes have connected to each other:

```bash
# Node 1
curl http://localhost:8080/api/peers

# Node 2
curl http://localhost:8081/api/peers

# Node 3
curl http://localhost:8082/api/peers
```

**Expected:** Each node should show 2 connected peers.

### Test 2: Chain Synchronization

Mine a block on Node 1 and verify it propagates to all nodes:

```bash
# Mine on Node 1
curl -X POST http://localhost:8080/api/mine

# Wait 2-3 seconds for propagation

# Check block height on all nodes
curl http://localhost:8080/api/blockchain/height
curl http://localhost:8081/api/blockchain/height
curl http://localhost:8082/api/blockchain/height
```

**Expected:** All nodes should report the same block height.

### Test 3: Transaction Broadcasting

Create a transaction on Node 2 and verify it reaches all nodes:

```bash
# Create wallet on Node 2 (if not exists)
curl -X POST http://localhost:8081/api/wallet

# Send transaction
curl -X POST http://localhost:8081/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "amount": 10000000
  }'

# Check mempool on all nodes
curl http://localhost:8080/api/mempool
curl http://localhost:8081/api/mempool
curl http://localhost:8082/api/mempool
```

**Expected:** Transaction should appear in all mempools within 1-2 seconds.

### Test 4: Network Partition Recovery

Simulate a network partition and verify the nodes recover:

1. **Stop Node 2** (Ctrl+C in Terminal 2)
2. **Mine blocks on Node 1:**
   ```bash
   curl -X POST http://localhost:8080/api/mine
   curl -X POST http://localhost:8080/api/mine
   curl -X POST http://localhost:8080/api/mine
   ```
3. **Verify Node 3 syncs:**
   ```bash
   curl http://localhost:8082/api/blockchain/height
   ```
4. **Restart Node 2** (use Step 4 command)
5. **Verify Node 2 catches up:**
   ```bash
   # Wait 5-10 seconds
   curl http://localhost:8081/api/blockchain/height
   ```

**Expected:** Node 2 should sync to the same height as Node 1 and Node 3.

### Test 5: Concurrent Mining (Chain Reorganization)

Test chain reorganization when nodes mine competing blocks:

1. **Isolate Node 3** temporarily (not implemented in basic test)
2. **Mine on Node 1 and isolated Node 3 simultaneously**
3. **Reconnect Node 3**
4. **Verify chain converges to longest valid chain**

**Expected:** All nodes should agree on the same chain after reorganization.

## Performance Benchmarks

### Block Propagation Time

Measure time from block mined to block received by all peers:

```bash
# Time this command sequence
time {
  curl -X POST http://localhost:8080/api/mine
  Start-Sleep -Seconds 2
  curl http://localhost:8082/api/blockchain/height
}
```

**Target:** < 2 seconds for local testnet

### Transaction Propagation Time

Measure mempool broadcast latency:

```bash
# Create transaction and check immediate propagation
curl -X POST http://localhost:8081/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{"to": "...", "amount": 1000000}'

Start-Sleep -Milliseconds 500
curl http://localhost:8082/api/mempool | Select-String "pending"
```

**Target:** < 500ms for local testnet

### Synchronization Speed

Test initial blockchain download speed:

1. Start Node 1 and mine 100 blocks
2. Start Node 2 and measure sync time

```bash
# On Node 1
for ($i=0; $i -lt 100; $i++) {
    curl -X POST http://localhost:8080/api/mine -UseBasicParsing | Out-Null
}

# Start Node 2 and time sync
Measure-Command {
    # Wait for sync
    do {
        Start-Sleep -Seconds 1
        $height = (curl http://localhost:8081/api/blockchain/height -UseBasicParsing).Content
    } while ($height -lt 100)
}
```

**Target:** > 10 blocks/second for local testnet

## Common Issues

### Nodes Don't Connect

**Symptom:** `curl http://localhost:8080/api/peers` returns empty array

**Solutions:**
- Check firewall settings
- Verify ports are not in use: `netstat -an | findstr "8633"`
- Check bootstrap peer address is correct
- Review node logs for connection errors

### Chain Height Mismatch

**Symptom:** Nodes show different block heights after mining

**Solutions:**
- Check network connectivity between nodes
- Verify P2P ports are accessible
- Review logs for "Invalid block" or "Reorg detected" messages
- Restart nodes to force resync

### Transactions Not Broadcasting

**Symptom:** Transaction in mempool on one node but not others

**Solutions:**
- Verify transaction is valid: check balance and signatures
- Check mempool size limits
- Review transaction validation logs
- Check for network broadcast errors

### Port Already in Use

**Symptom:** "Address already in use" error on startup

**Solutions:**
```bash
# Windows: Find and kill process
netstat -ano | findstr "8633"
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:8633 | xargs kill -9
```

## Automated Testing

### Full Test Suite

The automated test script performs all verification tests:

**Windows:**
```powershell
.\scripts\test-multinode.ps1 -FullTest
```

**Linux/macOS:**
```bash
./scripts/test-multinode.sh --full-test
```

### CI Integration

Add to `.github/workflows/multinode-test.yml`:

```yaml
name: Multi-Node Test

on: [push, pull_request]

jobs:
  multinode-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Build
        run: cargo build --release --bin kubercoin
      - name: Run multi-node test
        run: ./scripts/test-multinode.sh --ci
```

## Docker Compose (Advanced)

For easier multi-node testing with Docker:

```yaml
# docker-compose.multinode.yml
version: '3.8'
services:
  node1:
    build: .
    ports:
      - "8633:8633"
      - "8080:8080"
    environment:
      - KUBERCOIN_P2P_PORT=8633
      - KUBERCOIN_API_PORT=8080
    volumes:
      - ./data/node1:/data/kubercoin

  node2:
    build: .
    ports:
      - "8334:8633"
      - "8081:8080"
    environment:
      - KUBERCOIN_P2P_PORT=8633
      - KUBERCOIN_API_PORT=8080
      - KUBERCOIN_BOOTSTRAP_PEERS=node1:8633
    volumes:
      - ./data/node2:/data/kubercoin
    depends_on:
      - node1

  node3:
    build: .
    ports:
      - "8335:8633"
      - "8082:8080"
    environment:
      - KUBERCOIN_P2P_PORT=8633
      - KUBERCOIN_API_PORT=8080
      - KUBERCOIN_BOOTSTRAP_PEERS=node1:8633,node2:8633
    volumes:
      - ./data/node3:/data/kubercoin
    depends_on:
      - node1
      - node2
```

**Usage:**
```bash
docker-compose -f docker-compose.multinode.yml up
```

## Network Topology

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Node 1 │────▶│  Node 2 │────▶│  Node 3 │
│ :8633   │◀────│ :8334   │◀────│ :8335   │
└─────────┘     └─────────┘     └─────────┘
     │                               │
     └───────────────────────────────┘
        (Direct connection after bootstrap)
```

## Next Steps

- [ ] Test with 10+ nodes
- [ ] Test geographic distribution (cloud VMs)
- [ ] Test under network stress (packet loss, latency)
- [ ] Measure bandwidth usage
- [ ] Test chain reorganization scenarios
- [ ] Performance profiling under load
- [ ] Test NAT traversal on real networks

## References

- [P2P Network Design](./docs/p2p_network.md)
- [Consensus Rules](./docs/consensus.md)
- [API Documentation](./docs/api.md)
- [Troubleshooting Guide](./docs/troubleshooting.md)
