# Kubercoin Docker Deployment Guide

This guide explains how to run Kubercoin using Docker and Docker Compose for easy deployment and management.

## Prerequisites

- Docker 20.10+ installed
- Docker Compose v2 installed (`docker compose`)
- At least 4GB RAM available
- 50GB+ disk space (for blockchain data)

## Quick Start

### 1. Environment Setup

Copy the example environment file and customize it:

```bash
cp .env.example .env
nano .env  # Edit with your secure passwords
```

### 2. Start the Node

Start all services (node + monitoring):

```bash
docker compose up -d
```

Start only the node (without monitoring):

```bash
docker compose up -d node
```

### 3. Check Status

View logs:

```bash
docker compose logs -f node
```

Check node health:

```bash
docker exec kubercoin-node kubercoin status
```

### 4. Access Services

- **Kubercoin Node**: http://localhost:8332 (RPC)
- **Web UI + HTTP API**: http://localhost:8080/
- **Grafana Dashboard**: http://localhost:3000 (credentials from env/compose)
- **Prometheus**: http://localhost:9092
- **Metrics**: http://localhost:9091/metrics

## Production Mode (Recommended)

The default `docker-compose.yml` is optimized for local development and demos. For production, use the production override which reduces exposed control-plane ports and requires real secrets.

1) Create a production env file:

```bash
cp .env.production.example .env.production
```

2) Start with the production override:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d
```

Key differences in production override:
- Exposes only P2P publicly from the node (RPC/REST/WS/Metrics stay internal)
- Keeps Prometheus/Grafana/Postgres/Redis off public ports
- Requires secrets (no `changeme` defaults)

Important: If you expose `ops-web` publicly, put it behind a VPN/allowlist/reverse-proxy auth.

## Edge Proxy (HTTPS + Routing)

For an internet-facing deployment, run the optional edge proxy overlay. This exposes only:
- `80`/`443` (HTTPS) for the web UIs + public API routing
- `8633` for P2P (permissionless node participation)

1) Create env files:

```bash
cp .env.production.example .env.production
cp .env.edge.example .env.edge
```

2) Generate a password hash for ops basic auth (replace password):

```bash
docker run --rm caddy:2.8-alpine caddy hash-password --plaintext "your-strong-password"
```

Put the result into `OPS_AUTH_HASH` in `.env.edge`.

3) Start with the edge overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.edge.yml \
  --env-file .env.production --env-file .env.edge up -d
```

Notes:
- Subdomains route as follows:
  - `explorer.<domain>` → explorer web UI
  - `wallet.<domain>` → wallet web UI
  - `ops.<domain>` → ops web UI (basic-auth protected)
  - `api.<domain>` → node REST API
  - `ws.<domain>` → node WebSocket endpoint
  - `rpc.<domain>` → node RPC (disabled unless you set `RPC_AUTH_USER`/`RPC_AUTH_HASH`)

## Configuration

### Network Selection

Edit `.env` to choose network:

```bash
KUBERCOIN_NETWORK=testnet  # Options: mainnet, testnet, regtest
```

### Custom Configuration

Mount a custom config file:

```yaml
volumes:
  - ./config/kubercoin.toml:/home/kubercoin/.kubercoin/config.toml:ro
```

### Port Mappings

Default ports:
- `8633`: P2P network (required for peers)
- `8332`: RPC API (authentication required)
- `8080`: Web UI + HTTP API (public)
- `9090`: WebSocket (real-time updates)
- `9091`: Prometheus metrics (monitoring)

### Web UI (Docker)

Open the browser UI:

- http://localhost:8080/

PowerShell examples (Windows):

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/wallets | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing "http://localhost:8080/api/wallet/balance?name=alice.json" | Select-Object -ExpandProperty Content
```

Change ports in `docker-compose.yml` if needed:

```yaml
ports:
  - "18633:8633"  # Use port 18633 instead of 8633
```

## Management Commands

### Start Services

```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d node

# Start with indexer and cache
docker compose --profile indexer --profile cache up -d
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes blockchain data)
docker compose down -v
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f node

# Last 100 lines
docker compose logs --tail=100 node
```

### Execute Commands

```bash
# Check node status
docker exec kubercoin-node kubercoin status

# Get blockchain info
docker exec kubercoin-node kubercoin getblockchaininfo

# Access shell
docker exec -it kubercoin-node bash
```

### Restart Services

```bash
# Restart node
docker compose restart node

# Restart all services
docker compose restart
```

## Building from Source

Build the Docker image locally:

```bash
# Build image
docker build -t kubercoin:latest .

# Build with custom tag
docker build -t kubercoin:v1.0.0 .

# Build with build args
docker build --build-arg RUST_VERSION=1.78 -t kubercoin:latest .
```

## Monitoring

### Grafana Dashboards

1. Open Grafana: http://localhost:3000
2. Login: `admin` / `admin` (change password on first login)
3. Navigate to Dashboards → Kubercoin Overview

Metrics available:
- Block height and sync progress
- Peer connections and geography
- Mempool size and transaction rate
- CPU, memory, and disk usage
- Network bandwidth (inbound/outbound)
- RPC request rate and latency

### Prometheus Queries

Access raw metrics: http://localhost:9091/metrics

Example queries in Prometheus (http://localhost:9092):

```promql
# Block height
kubercoin_block_height

# Peer count
kubercoin_peer_count

# Mempool size
kubercoin_mempool_size

# RPC request rate
rate(kubercoin_rpc_requests_total[5m])
```

## Data Persistence

Blockchain data is stored in Docker volumes:

```bash
# List volumes
docker volume ls | grep kubercoin

# Inspect volume
docker volume inspect kubercoin_kubercoin-data

# Backup data
docker run --rm -v kubercoin_kubercoin-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/kubercoin-backup.tar.gz /data

# Restore data
docker run --rm -v kubercoin_kubercoin-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/kubercoin-backup.tar.gz -C /
```

## Networking

### Connecting Multiple Nodes

Create a custom network:

```bash
docker network create kubercoin-net
```

Start multiple nodes:

```yaml
services:
  node1:
    image: kubercoin:latest
    networks:
      - kubercoin-net
  
  node2:
    image: kubercoin:latest
    networks:
      - kubercoin-net
    command: ["start", "--connect", "node1:8633"]
```

### External Access

Expose node to internet (⚠️ use firewall rules):

```yaml
ports:
  - "0.0.0.0:8633:8633"  # P2P (all interfaces)
  - "127.0.0.1:8332:8332"  # RPC (localhost only)
```

## Troubleshooting

### Node Won't Start

Check logs:

```bash
docker compose logs node
```

Common issues:
- Port already in use: Change port mapping
- Insufficient disk space: Check `df -h`
- Permission denied: Check volume ownership

### Slow Synchronization

Check peer connections:

```bash
docker exec kubercoin-node kubercoin getpeerinfo
```

Add peers manually:

```bash
docker exec kubercoin-node kubercoin addnode "peer.kuber-coin.com:8633" add
```

### High Memory Usage

Limit container memory:

```yaml
services:
  node:
    mem_limit: 4g
    mem_reservation: 2g
```

### Can't Connect to RPC

Check authentication:

```bash
curl -u admin:password http://localhost:8332/
```

Verify credentials in `.env` file.

## Production Deployment

### Security Hardening

1. **Change default passwords** in `.env`
2. **Use secrets management** (Docker Swarm secrets or Kubernetes secrets)
3. **Enable TLS** for RPC endpoints
4. **Restrict network access** with firewall rules
5. **Regular backups** of blockchain data
6. **Update regularly** to latest version

### Resource Limits

Set appropriate limits:

```yaml
services:
  node:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

### Health Monitoring

Configure health checks:

```yaml
healthcheck:
  test: ["CMD", "kubercoin", "status"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 120s
```

### Log Management

Limit log size:

```yaml
services:
  node:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
```

## Advanced Usage

### Using PostgreSQL Indexer

Enable indexer profile:

```bash
docker compose --profile indexer up -d
```

This starts PostgreSQL and indexes blockchain data for faster queries.

### Using Redis Cache

Enable cache profile:

```bash
docker compose --profile cache up -d
```

This caches frequently accessed data (UTXO lookups, block headers).

### Custom Build Arguments

Build with specific Rust version:

```dockerfile
ARG RUST_VERSION=1.78
FROM rust:${RUST_VERSION}-slim AS builder
```

```bash
docker build --build-arg RUST_VERSION=1.78 -t kubercoin:latest .
```

## Support

- **Documentation**: https://kuber-coin.com/docs
- **GitHub Issues**: https://github.com/kubercoin/kubercoin/issues
- **Discord**: https://discord.gg/kubercoin
- **Email**: connect@kuber-coin.com

## License

MIT License - see LICENSE file for details.
