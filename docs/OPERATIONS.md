# KuberCoin Operations Runbook

## Table of Contents
1. [Node Deployment](#node-deployment)
2. [Configuration](#configuration)
3. [Monitoring & Observability](#monitoring--observability)
4. [Performance Tuning](#performance-tuning)
5. [Disaster Recovery](#disaster-recovery)
6. [Upgrade Procedures](#upgrade-procedures)
7. [Troubleshooting](#troubleshooting)
8. [Security Operations](#security-operations)

---

## Node Deployment

### Prerequisites
- **OS**: Linux (Ubuntu 22.04 LTS recommended), macOS, or Windows
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 100GB SSD (blockchain data grows over time)
- **Network**: Stable connection with open ports 8633 (mainnet) or 18633 (testnet)
- **Rust**: 1.93.0 or later

### Installation Steps

#### 1. Build from Source
```bash
# Clone repository
git clone https://github.com/your-org/kubercoin.git
cd kubercoin

# Build release binary
cargo build --release --bin kubercoin

# Verify build
./target/release/kubercoin --version
```

#### 2. Docker Deployment
```bash
# Build Docker image
docker build -t kubercoin:latest .

# Run node
docker run -d \
  --name kubercoin-node \
  -p 8633:8633 \
  -p 8080:8080 \
  -v /data/kubercoin:/root/.kubercoin \
  kubercoin:latest
```

#### 3. Systemd Service (Linux)
```bash
# Create service file
sudo tee /etc/systemd/system/kubercoin.service > /dev/null <<EOF
[Unit]
Description=KuberCoin Node
After=network.target

[Service]
Type=simple
User=kubercoin
ExecStart=/usr/local/bin/kubercoin --config /etc/kubercoin/config.toml
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable kubercoin
sudo systemctl start kubercoin
```

---

## Configuration

### Core Configuration File (`config.toml`)

```toml
[network]
# Network type: mainnet, testnet, regtest
network = "mainnet"

# Port for P2P connections
port = 8633

# Maximum peer connections
max_peers = 125

# Seeds for initial peer discovery
seeds = [
    "seed1.kubercoin.org:8633",
    "seed2.kubercoin.org:8633",
]

[rpc]
# Enable RPC server
enabled = true

# RPC bind address
bind_address = "127.0.0.1:8080"

# RPC authentication
username = "admin"
password = "changeme_in_production"

[mining]
# Enable mining
enabled = false

# Mining address (receives block rewards)
address = ""

# Mining threads
threads = 4

[storage]
# Data directory
data_dir = "/var/lib/kubercoin"

# Storage backend: memory, rocksdb
backend = "rocksdb"

# Cache size (MB)
cache_size = 1024

[logging]
# Log level: trace, debug, info, warn, error
level = "info"

# Log file path
file = "/var/log/kubercoin/node.log"

[mempool]
# Maximum mempool size (MB)
max_size = 300

# Minimum fee rate (satoshis per byte)
min_fee_rate = 1
```

### Environment Variables
```bash
# Data directory
export KUBERCOIN_DATA_DIR=/data/kubercoin

# Network
export KUBERCOIN_NETWORK=mainnet

# RPC credentials
export KUBERCOIN_RPC_USER=admin
export KUBERCOIN_RPC_PASS=secret

# Log level
export RUST_LOG=kubercoin=info
```

---

## Monitoring & Observability

### Health Checks

#### HTTP Health Endpoint
```bash
# Check node health
curl http://localhost:8080/api/health

# Expected response
{
  "status": "healthy",
  "sync_progress": 99.8,
  "peer_count": 8,
  "block_height": 123456
}
```

#### CLI Status
```bash
kubercoin-cli status
```

### Metrics Collection

#### Prometheus Metrics
Metrics are exposed at `http://localhost:9090/metrics`

Key metrics to monitor:
- `kubercoin_sync_progress`: Sync completion percentage
- `kubercoin_peer_count`: Number of connected peers
- `kubercoin_mempool_size`: Current mempool size (transactions)
- `kubercoin_block_height`: Current blockchain height
- `kubercoin_rpc_requests_total`: Total RPC requests
- `kubercoin_block_processing_duration`: Block validation latency

#### Grafana Dashboard
Import dashboard from `infra/monitoring/grafana/kubercoin-dashboard.json`

### Logging

#### View Logs
```bash
# Systemd journal
sudo journalctl -u kubercoin -f

# Docker logs
docker logs -f kubercoin-node

# File logs
tail -f /var/log/kubercoin/node.log
```

#### Log Rotation
```bash
# Configure logrotate
sudo tee /etc/logrotate.d/kubercoin > /dev/null <<EOF
/var/log/kubercoin/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 kubercoin kubercoin
    sharedscripts
    postrotate
        systemctl reload kubercoin > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## Performance Tuning

### Database Optimization

#### RocksDB Tuning
```toml
[storage.rocksdb]
# Write buffer size (MB)
write_buffer_size = 128

# Max write buffers
max_write_buffer_number = 4

# Block cache size (MB)
block_cache_size = 512

# Enable compression
compression = "lz4"

# Bloom filter bits per key
bloom_filter_bits = 10
```

### Network Optimization

#### Connection Pooling
```toml
[network.pool]
# Connection pool size
pool_size = 50

# Connection timeout (seconds)
timeout = 30

# Keep-alive interval (seconds)
keepalive = 60
```

#### Bandwidth Limiting
```toml
[network.bandwidth]
# Maximum upload rate (KB/s)
max_upload = 500

# Maximum download rate (KB/s)
max_download = 5000
```

### Memory Management

#### Cache Configuration
```toml
[cache]
# UTXO cache size (MB)
utxo_cache = 1024

# Block cache size (MB)
block_cache = 512

# Transaction cache size (entries)
tx_cache = 10000
```

### CPU Optimization

#### Thread Allocation
```toml
[threads]
# Validation threads
validation = 4

# Network threads
network = 2

# RPC threads
rpc = 4
```

---

## Disaster Recovery

### Backup Procedures

#### Full Backup
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/kubercoin"
DATA_DIR="/var/lib/kubercoin"
DATE=$(date +%Y%m%d_%H%M%S)

# Stop node
systemctl stop kubercoin

# Create backup
tar -czf "$BACKUP_DIR/kubercoin_backup_$DATE.tar.gz" \
    -C "$DATA_DIR" \
    blockchain \
    wallet.dat \
    config.toml

# Start node
systemctl start kubercoin

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "kubercoin_backup_*.tar.gz" -mtime +7 -delete
```

#### Wallet Backup
```bash
# Backup wallet file
cp ~/.kubercoin/wallet.dat ~/wallet_backup_$(date +%Y%m%d).dat

# Encrypt backup
gpg -c ~/wallet_backup_$(date +%Y%m%d).dat
```

### Restore Procedures

#### Full Restore
```bash
#!/bin/bash
# restore.sh

BACKUP_FILE="/backup/kubercoin/kubercoin_backup_20260131.tar.gz"
DATA_DIR="/var/lib/kubercoin"

# Stop node
systemctl stop kubercoin

# Clear existing data (CAUTION!)
rm -rf "$DATA_DIR"/*

# Extract backup
tar -xzf "$BACKUP_FILE" -C "$DATA_DIR"

# Set permissions
chown -R kubercoin:kubercoin "$DATA_DIR"

# Start node
systemctl start kubercoin
```

#### Blockchain Resync
```bash
# If blockchain is corrupted, force resync
kubercoin --resync
```

### Chain Reorganization Recovery

```bash
# Check for orphan blocks
kubercoin-cli getorphaninfo

# Invalidate bad block
kubercoin-cli invalidateblock <block_hash>

# Reconsider block
kubercoin-cli reconsiderblock <block_hash>
```

---

## Upgrade Procedures

### Rolling Upgrade (Zero Downtime)

#### 1. Pre-Upgrade Checks
```bash
# Verify current version
kubercoin --version

# Check node health
kubercoin-cli status

# Backup database
./scripts/backup.sh
```

#### 2. Upgrade Binary
```bash
# Download new version
wget https://github.com/your-org/kubercoin/releases/download/v2.0.0/kubercoin-v2.0.0-linux-amd64.tar.gz

# Verify checksum
sha256sum -c kubercoin-v2.0.0-linux-amd64.tar.gz.sha256

# Extract
tar -xzf kubercoin-v2.0.0-linux-amd64.tar.gz

# Replace binary
sudo cp kubercoin /usr/local/bin/kubercoin

# Restart service
sudo systemctl restart kubercoin
```

#### 3. Post-Upgrade Verification
```bash
# Check version
kubercoin --version

# Monitor logs
journalctl -u kubercoin -f

# Verify sync
kubercoin-cli status
```

### Database Migration

```bash
# Run migration tool
kubercoin-migrate --from 1.0 --to 2.0 \
    --data-dir /var/lib/kubercoin \
    --backup-dir /backup/kubercoin
```

---

## Troubleshooting

### Common Issues

#### Node Won't Start

**Symptom**: Service fails to start

**Diagnosis**:
```bash
# Check service status
systemctl status kubercoin

# View error logs
journalctl -u kubercoin -n 100

# Check port availability
sudo netstat -tulpn | grep 8633
```

**Solution**:
```bash
# Fix port conflict
# Edit config to use different port

# Fix permission issues
sudo chown -R kubercoin:kubercoin /var/lib/kubercoin

# Check disk space
df -h /var/lib/kubercoin
```

#### Sync Stuck

**Symptom**: Block height not increasing

**Diagnosis**:
```bash
# Check peer connections
kubercoin-cli getpeerinfo

# Check network connectivity
telnet seed1.kubercoin.org 8633
```

**Solution**:
```bash
# Add more peers manually
kubercoin-cli addnode "node.kuber-coin.com:8633" add

# Clear peer database
rm ~/.kubercoin/peers.dat

# Restart node
systemctl restart kubercoin
```

#### High Memory Usage

**Symptom**: OOM killer terminates process

**Diagnosis**:
```bash
# Check memory usage
ps aux | grep kubercoin

# Check system memory
free -h

# Check database size
du -sh /var/lib/kubercoin/*
```

**Solution**:
```bash
# Reduce cache sizes in config.toml
[cache]
utxo_cache = 512  # Reduce from 1024
block_cache = 256  # Reduce from 512

# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### RPC Connection Refused

**Symptom**: Cannot connect to RPC server

**Diagnosis**:
```bash
# Check RPC is enabled
grep -A 5 "\[rpc\]" /etc/kubercoin/config.toml

# Test connection
curl http://localhost:8080/api/status
```

**Solution**:
```bash
# Enable RPC in config
[rpc]
enabled = true
bind_address = "127.0.0.1:8080"

# Check firewall rules
sudo ufw allow 8080/tcp

# Restart service
systemctl restart kubercoin
```

### Performance Issues

#### Slow Block Validation

**Diagnosis**:
```bash
# Profile CPU usage
perf record -F 99 -p $(pidof kubercoin) -g -- sleep 30
perf report

# Check block processing time
kubercoin-cli getblockstats
```

**Solution**:
- Increase validation threads
- Upgrade to faster SSD
- Increase CPU cache size

#### Slow Transaction Propagation

**Diagnosis**:
```bash
# Check mempool size
kubercoin-cli getmempoolinfo

# Check peer latency
kubercoin-cli getpeerinfo | grep pingtime
```

**Solution**:
- Increase network threads
- Optimize mempool settings
- Add low-latency peers

---

## Security Operations

### Firewall Configuration

```bash
# Allow P2P port
sudo ufw allow 8633/tcp

# Allow RPC only from localhost
sudo ufw allow from 127.0.0.1 to any port 8080

# Enable firewall
sudo ufw enable
```

### SSL/TLS Configuration

```toml
[rpc.tls]
enabled = true
cert_file = "/etc/kubercoin/ssl/cert.pem"
key_file = "/etc/kubercoin/ssl/key.pem"
```

### Regular Security Audits

```bash
# Run vulnerability scan
cargo audit

# Check dependency licenses
cargo deny check

# Update dependencies
cargo outdated
```

### Intrusion Detection

```bash
# Monitor failed authentication attempts
grep "authentication failed" /var/log/kubercoin/node.log

# Check for DDoS patterns
netstat -an | grep :8633 | wc -l

# Monitor resource usage
top -p $(pidof kubercoin)
```

---

## Maintenance Schedule

### Daily
- Monitor sync status
- Check peer count
- Review error logs
- Verify disk space

### Weekly
- Backup wallet
- Review performance metrics
- Check for software updates
- Clean up old logs

### Monthly
- Full database backup
- Security audit
- Performance optimization review
- Dependency updates

### Quarterly
- Disaster recovery drill
- Upgrade to latest version
- Capacity planning review
- Security penetration testing

---

## Emergency Contacts

- **Technical Lead**: connect@kuber-coin.com
- **On-Call Rotation**: connect@kuber-coin.com
- **Security Issues**: connect@kuber-coin.com
- **Community Support**: Discord #operations

---

## Additional Resources

- [GitHub Repository](https://github.com/your-org/kubercoin)
- [Documentation](https://docs.kubercoin.org)
- [API Reference](https://docs.kubercoin.org/api)
- [Community Forum](https://forum.kubercoin.org)
- [Security Policy](https://github.com/your-org/kubercoin/security/policy)
