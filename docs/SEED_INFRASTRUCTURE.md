# Seed Infrastructure and Observability

This document records the infrastructure operated for testnet and mainnet bootstrap,
the alert rules that guard network health, and the procedure for proving clean bootstrap.

## Seed Nodes

### Mainnet Seeds

| Type | Address | Purpose |
|------|---------|---------|
| DNS | `seed1.kuber-coin.com` | Primary DNS seed |
| DNS | `seed2.kuber-coin.com` | Secondary DNS seed |
| DNS | `seed3.kuber-coin.com` | Tertiary DNS seed |
| DNS | `dnsseed.kuber-coin.com` | Fallback DNS seed |
| Hardcoded | `192.0.2.11:8633` | Bootstrap peer |
| Hardcoded | `198.51.100.21:8633` | Bootstrap peer |
| Hardcoded | `203.0.113.31:8633` | Bootstrap peer |

### Testnet Seeds

| Type | Address | Purpose |
|------|---------|---------|
| DNS | `testnet-seed.kuber-coin.com` | Testnet DNS seed |
| DNS | `testnet2.kuber-coin.com` | Testnet DNS seed |
| Hardcoded | `<TESTNET_SEED_IP_1>:18633` | Bootstrap peer |
| Hardcoded | `<TESTNET_SEED_IP_2>:18633` | Bootstrap peer |

Source: `node/src/discovery.rs`

## Testnet Cluster

Defined in `docker-compose.testnet.yml`:

| Service | Role | P2P Port | HTTP Port | Metrics Port |
|---------|------|----------|-----------|--------------|
| seed1 | Seed | 18633 | 18080 | 19091 |
| seed2 | Seed | 18634 | 18081 | 19093 |
| node1 | Node | 18635 | 18082 | 19095 |
| node2 | Node | 18636 | 18083 | 19097 |
| node3 | Node | 18637 | 18084 | 19099 |
| prometheus | Monitoring | — | 9092 | — |
| grafana | Dashboard | — | 3000 | — |

All nodes auto-restart, include health checks, and connect via the `testnet` Docker network.
Prometheus scrapes all 5 nodes every 10 seconds (`monitoring/prometheus-testnet.yml`).

## Alert Rules

Defined in `monitoring/alerts.yml`. All alerts use metric names matching `node/src/metrics.rs`.

### Node Availability

| Alert | Expression | Severity | Fires After |
|-------|-----------|----------|-------------|
| KubercoinNodeDown | `up{job="kubercoin-node"} == 0` | Critical | 1 min |
| KubercoinMetricsMissing | `absent(kubercoin_block_height)` | Warning | 1 min |

### Mining / Chain Stall

| Alert | Expression | Severity | Fires After |
|-------|-----------|----------|-------------|
| KubercoinNoNewBlocks | `changes(kubercoin_block_height[30m]) == 0` | Warning | 5 min |
| KubercoinHighBlockTime | `increase(kubercoin_block_height[1h]) < 2` | Warning | 10 min |

### Network

| Alert | Expression | Severity | Fires After |
|-------|-----------|----------|-------------|
| KubercoinPeerCountLow | `kubercoin_peers < 3` | Warning | 5 min |
| KubercoinNoPeers | `kubercoin_peers == 0` | Critical | 2 min |
| KubercoinTipDivergence | `max(kubercoin_block_height) - min(kubercoin_block_height) > 2` | Critical | 5 min |

### Mempool / Resources

| Alert | Expression | Severity | Fires After |
|-------|-----------|----------|-------------|
| KubercoinMempoolBacklog | `kubercoin_mempool_size > 5000` | Warning | 10 min |
| KubercoinStorageLarge | `kubercoin_utxo_count > 50M` | Warning | 10 min |
| KubercoinAPISaturation | `rate(kubercoin_mempool_size[5m]) > 50` | Warning | 5 min |

### Coverage Against Required Scenarios

| Scenario | Covered By |
|----------|-----------|
| Chain stall | KubercoinNoNewBlocks, KubercoinHighBlockTime |
| Tip divergence | KubercoinTipDivergence |
| Peer collapse | KubercoinNoPeers, KubercoinPeerCountLow |
| API saturation | KubercoinAPISaturation |

## Exported Metrics

Source: `node/src/metrics.rs`

| Metric | Type | Description |
|--------|------|-------------|
| `kubercoin_mempool_bytes` | Gauge | Total bytes of transactions in mempool |
| `kubercoin_ws_connections` | Gauge | Active WebSocket connections |
| `kubercoin_block_height` | Gauge | Current blockchain height |
| `kubercoin_mempool_size` | Gauge | Pending transactions |
| `kubercoin_peers` | Gauge | Connected peer count |
| `kubercoin_utxo_count` | Gauge | Total unspent outputs |
| `kubercoin_total_value_satoshis` | Gauge | Total value in UTXOs |
| `kubercoin_uptime_seconds` | Gauge | Node uptime |

## Bootstrap Proof Procedure

This procedure verifies that a clean node can sync from genesis to the current tip
using only the seed configuration shipped in the binary.

### Steps

1. **Start a fresh node** with empty data directory:
   ```bash
   mkdir /tmp/bootstrap-test
   kubercoin-node --datadir /tmp/bootstrap-test --testnet
   ```

2. **Verify peer discovery** — within 60 seconds the node should:
   - Resolve DNS seeds and connect to at least one peer
   - Complete version/verack handshake
   - Begin headers-first sync (GetHeaders messages in log)

3. **Verify initial block download** — monitor log:
   ```
   INFO  Syncing headers from peer ...
   INFO  Downloaded block at height ...
   ```

4. **Verify tip reached** — compare `kubercoin_block_height` metric against a known seed node:
   ```bash
   curl -s http://localhost:18080/api/info | jq .height
   curl -s http://seed1:18080/api/info | jq .height
   ```
   Heights should converge within minutes on testnet.

5. **Verify indexes** — the `.indexes` file should exist alongside the state file:
   ```bash
   ls /tmp/bootstrap-test/
   # Should show: state.bin  state.bin.indexes
   ```

6. **Verify metrics** — scrape the metrics endpoint:
   ```bash
   curl -s http://localhost:19091/metrics | grep kubercoin_block_height
   ```

### Expected Outcome

A node started with default configuration and no prior state reaches the current tip
and serves correct chain data through the HTTP API and metrics endpoint.

### Docker Quickstart

```bash
docker compose -f docker-compose.testnet.yml up -d
# Wait 30 seconds, then:
curl http://localhost:18080/api/info
curl http://localhost:18081/api/info
# Heights should be equal and non-zero
```

## Explorer and API Services

The testnet cluster exposes HTTP API endpoints on ports 18080-18084.
These serve as public explorer backends for:

- Block queries: `GET /api/block/:hash`, `GET /api/block/height/:n`
- Transaction queries: `GET /api/tx/:txid`
- Chain info: `GET /api/info`
- Mempool: `GET /api/mempool`
- UTXO lookups: `GET /api/utxo/:txid/:vout`

Full API documentation: `docs/API_DOCUMENTATION.md`
