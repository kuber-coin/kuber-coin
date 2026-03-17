# Kubercoin Node Operator Guide

This guide covers everything needed to build, configure, and run a Kubercoin full node — from
a fresh machine to a production deployment reachable by other peers.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Rust toolchain | 1.88.0 (pinned via `rust-toolchain.toml`) |
| OpenSSL headers | any recent |
| `make` / `cargo` | in `PATH` |
| Outbound TCP | port 8633 (P2P) |
| Inbound TCP | port 8633 (if accepting peers) |

No database engine or external dependencies are required.  The node stores all state as
local binary files (bincode-serialized).

---

## Build

```bash
# Release build — produces target/release/kubercoin-node
cargo build --release -p kubercoin-node

# Quick sanity check
./target/release/kubercoin-node --version
```

The binary is fully self-contained.  Copy it anywhere on the filesystem.

---

## First Run (regtest / local dev)

```bash
# Start a regtest node — no real peers, instant block production, no auth required
KUBERCOIN_NETWORK=regtest ./target/release/kubercoin node 8633
```

The node creates `data/kubercoin/` in the current working directory and writes:
- `chainstate.bin` — UTXO set and block index
- `mempool.bin` — pending transactions
- `fee_estimator.bin` — fee-rate history

---

## First Run (mainnet)

Auth is **mandatory** on mainnet.  Generate a secure random key (minimum 32 characters):

```bash
# Generate a suitable key (Linux/macOS)
openssl rand -hex 32

# Or on Windows (PowerShell)
[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) -replace '-',''
```

Then start the node:

```bash
export KUBERCOIN_API_KEYS="<your-32+-char-key>"

./target/release/kubercoin node 8633
```

The node will refuse to start on mainnet if `KUBERCOIN_API_KEYS` is not set or if any key
is shorter than 32 characters.

---

## Command-Line Interface

```
kubercoin node [PORT] [--no-p2p]
```

| Argument | Default | Description |
|---|---|---|
| `PORT` | `8633` | TCP port for peer-to-peer connections |
| `--no-p2p` | off | Disable P2P listener (useful for RPC-only or wallet nodes) |

All other configuration is via environment variables (see section below).

---

## Environment Variable Reference

### Network

| Variable | Default | Values | Description |
|---|---|---|---|
| `KUBERCOIN_NETWORK` | `mainnet` | `mainnet`, `testnet`/`test`, `regtest`/`dev`/`local` | Which network to join |

### Data Storage

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_DATA_DIR` | `data/kubercoin` (local) or `/data/kubercoin` (container) | Root directory for all on-disk state |
| `KUBERCOIN_CHAIN_STATE_PATH` | `<DATA_DIR>/chainstate.bin` | Override path for chain state file |
| `KUBERCOIN_MEMPOOL_PATH` | `<DATA_DIR>/mempool.bin` | Override path for mempool file |
| `KUBERCOIN_FEE_ESTIMATOR_PATH` | `<DATA_DIR>/fee_estimator.bin` | Override path for fee estimator file |

On Windows, the container `/data/kubercoin` check is skipped; `data\kubercoin` is always used.

### Ports

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_HTTP_PORT` | auto (8080–8095) | HTTP REST API port |
| `KUBERCOIN_RPC_PORT` | `8332` | JSON-RPC port |
| `KUBERCOIN_WS_PORT` | auto (9090–9099) | WebSocket notification port |
| `KUBERCOIN_METRICS_PORT` | `9091` | Prometheus metrics scrape port |
| `KUBERCOIN_METRICS_BIND` | `127.0.0.1` | Interface to bind the metrics server to |
| `KUBERCOIN_P2P_BIND` | `0.0.0.0` | Interface to bind P2P listener to |

For deterministic port assignment (e.g., behind a reverse proxy), set `KUBERCOIN_HTTP_PORT`
and `KUBERCOIN_WS_PORT` explicitly.

### Authentication

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_API_KEYS` | *(required on mainnet)* | Comma-separated list of API keys; each must be ≥ 32 characters |
| `KUBERCOIN_API_AUTH_ENABLED` | `true` (mainnet), `false` (other) | Set to `false` to disable auth on mainnet (not recommended) |

Clients must pass the key in the `X-API-Key` HTTP header:

```http
GET /api/v1/blocks/tip HTTP/1.1
X-API-Key: <your-api-key>
```

### Peer Discovery and Limits

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_INITIAL_PEERS` | *(none)* | Comma-separated `host:port` peers to connect to at startup |
| `KUBERCOIN_MAX_CONNECTIONS` | `125` (mainnet), `10` (testnet), `5` (regtest) | Maximum concurrent peer connections |

Example with bootstrap peers:

```bash
KUBERCOIN_INITIAL_PEERS="1.2.3.4:8633,5.6.7.8:8633" ./target/release/kubercoin node 8633
```

### Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_RATE_LIMIT_PER_MIN` | `60` | Maximum HTTP/RPC requests per minute per IP |
| `KUBERCOIN_TEST_MODE` | `0` | Set to `1` to relax rate limits (testnet/regtest only; ignored on mainnet) |

### Security Flags

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_STRICT_SECURITY` | `0` | Set to `1` to enable stricter security posture |

### Demo / Development Helpers

| Variable | Default | Description |
|---|---|---|
| `KUBERCOIN_DEMO_PEERS` | `0` | Number of loopback demo peers to spawn (UI demos) |
| `KUBERCOIN_DEMO_PING_INTERVAL_SECS` | `2` | Ping interval for demo peers (minimum 1s) |

---

## Persistent State

The node auto-saves every **5 minutes**:
- Chain state (UTXO set + block index)
- Mempool
- Fee estimator

Mempool entries are expired on a 60-second cycle.

On clean shutdown (SIGTERM), the node saves state before exiting.  If the process is killed
with SIGKILL, the last 0–5 minutes of mempool data may be lost (chain state is the same as
the last periodic save).

---

## Running as a Linux Service

Create `/etc/systemd/system/kubercoin.service`:

```ini
[Unit]
Description=Kubercoin full node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kubercoin
WorkingDirectory=/var/lib/kubercoin
ExecStart=/usr/local/bin/kubercoin-node --data-dir /var/lib/kubercoin
Restart=on-failure
RestartSec=5

# Required on mainnet
Environment=KUBERCOIN_API_KEYS=<your-key-here>
Environment=KUBERCOIN_HTTP_PORT=8080
Environment=KUBERCOIN_WS_PORT=9090
Environment=KUBERCOIN_METRICS_BIND=127.0.0.1

# Hardening
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/kubercoin
NoNewPrivileges=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kubercoin
sudo journalctl -u kubercoin -f
```

---

## Docker

A deployment-oriented `Dockerfile` is in the repository root. The container image exposes:
- `8633/tcp` — P2P
- `8080/tcp` — HTTP API
- `9090/tcp` — WebSocket
- `9091/tcp` — Metrics (bind to `127.0.0.1`; proxy rather than expose publicly)

```bash
docker run -d \
  --name kubercoin \
  -p 8633:8633 \
  -p 8080:8080 \
  -p 9090:9090 \
  -v kubercoin-data:/data/kubercoin \
  -e KUBERCOIN_API_KEYS="<your-key>" \
  -e KUBERCOIN_HTTP_PORT=8080 \
  -e KUBERCOIN_WS_PORT=9090 \
  kubercoin:latest
```

The container uses `/data/kubercoin` as the data directory automatically.

---

## Monitoring (Prometheus + Grafana)

The node exposes Prometheus metrics at `http://127.0.0.1:8332/metrics` by default.

Sample `prometheus.yml` scrape config:

```yaml
scrape_configs:
  - job_name: kubercoin
    static_configs:
      - targets: ['localhost:8332']
    metrics_path: /metrics
```

A pre-built Grafana dashboard is in `monitoring/`.

---

## Joining the Network

### Public Testnet (recommended starting point)

The testnet uses different ports and binary flags from mainnet:

| Parameter | Testnet | Mainnet |
|---|---|---|
| Binary | `kubercoin-node` | `kubercoin-node` |
| P2P port | 18633 | 8633 |
| RPC port | 8332 | 8634 |
| Network flag | `--network testnet` | *(default)* |

**Bootstrap is automatic** — seed nodes are compiled into the binary.  No `KUBERCOIN_INITIAL_PEERS` or configuration is needed.

```bash
# Linux / macOS
./target/release/kubercoin-node \
  --network testnet \
  --data-dir /var/lib/kubercoin-testnet
```

```powershell
# Windows
.\target\release\kubercoin-node.exe `
  --network testnet `
  --data-dir C:\kubercoin\data\testnet
```

On first start the node:
1. Connects to the configured seed peers automatically.
2. Starts headers-first IBD to sync the full chain.
3. Serves RPC at `127.0.0.1:8332` — no API key required on testnet with empty auth.

Monitor progress:
```bash
# Block height
curl -s -X POST http://127.0.0.1:8332/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getblockcount","params":[]}'

# Peer count
curl -s -X POST http://127.0.0.1:8332/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getpeerinfo","params":[]}'
```

### Mainnet / Joining an existing network

1. Obtain the genesis block hash to confirm you are on the correct chain (`GET /api/info`).
2. Seed nodes are discovered automatically from built-in `seed_nodes()` and configured DNS seeds. No manual peer configuration is required.
3. Monitor RPC `getblockcount` — height should increase as blocks arrive.
4. If running publicly, ensure your firewall allows inbound TCP on the P2P port so other peers can connect.

---

## Firewall / Port Summary

| Port | Protocol | Direction | Required | Description |
|---|---|---|---|---|
| 8633 | TCP | inbound + outbound | Yes (outbound) | P2P (mainnet) |
| 18633 | TCP | inbound + outbound | Yes (outbound) | P2P (testnet) |
| 8332 | TCP | inbound | No | JSON-RPC + metrics `/metrics` (configure as needed) |
| 8080 | TCP | inbound | No | HTTP REST API (configure as needed) |

Inbound port 8633 is optional — the node can operate with outbound-only connections, though
this reduces its ability to receive new peers and blocks promptly.

---

## Security Checklist

- [ ] `KUBERCOIN_API_KEYS` is set to a random string of ≥ 32 characters
- [ ] Each API key is stored securely (e.g., systemd `EnvironmentFile` with `0600` permissions, not in shell history)
- [ ] Metrics port `9091` is NOT exposed to the public internet
- [ ] JSON-RPC port is firewalled or bound to localhost
- [ ] Data directory is owned by a dedicated non-root user
- [ ] `PrivateTmp` / `NoNewPrivileges` (or equivalent) are set in the service unit
- [ ] Periodic off-host backup of `chainstate.bin` is configured

---

## Troubleshooting

### Node won't start — "API keys required on mainnet"

Set `KUBERCOIN_API_KEYS` to a comma-separated list of keys, each at least 32 characters long.

### "Address already in use" on startup

Another process is using the P2P or HTTP port.  Change the port via the command-line argument
or the corresponding `KUBERCOIN_HTTP_PORT` / `KUBERCOIN_WS_PORT` variable.

### Peers won't connect

- Confirm the P2P port accepts inbound TCP (`nc -zv <your-ip> 18633` for testnet).
- Bootstrap is automatic via built-in seed IPs — no `KUBERCOIN_INITIAL_PEERS` needed.
- Verify `--network testnet` matches the peers' network.

### Node falls behind / stalled sync

- Check whether the known peers are active (`GET /api/v1/peers`).
- Inspect logs for `fork_choice` or `validate_block` errors.
- If chainstate is corrupt, restore from backup (see `docs/UPGRADE_PROCEDURE.md`).

### High memory use

- `KUBERCOIN_MAX_CONNECTIONS` can be reduced on memory-constrained hosts.
- Default 125 connections on mainnet each hold allocated buffers; 32–64 is typical for a
  non-public validator.

---

## See Also

- [docs/UPGRADE_PROCEDURE.md](UPGRADE_PROCEDURE.md) — upgrading the binary and rolling back
- [docs/API_DOCUMENTATION.md](API_DOCUMENTATION.md) — full HTTP/RPC/WS API reference
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development and testing setup
- `kubercoin.conf.example` — annotated configuration reference
