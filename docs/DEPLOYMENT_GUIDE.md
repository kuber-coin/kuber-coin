# KuberCoin Deployment Guide

**Target Audience:** DevOps Engineers, System Administrators  
**Prerequisites:** Linux system administration, basic blockchain knowledge  
**Deployment Type:** Self-hosted full node reference deployment

---

## Table of Contents

1. [Pre-Deployment Planning](#pre-deployment-planning)
2. [Hardware Requirements](#hardware-requirements)
3. [Software Requirements](#software-requirements)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Initial Sync](#initial-sync)
7. [Service Management](#service-management)
8. [Monitoring](#monitoring)
9. [Backup & Recovery](#backup--recovery)
10. [Scaling](#scaling)
11. [Troubleshooting](#troubleshooting)
12. [Maintenance](#maintenance)

---

## Pre-Deployment Planning

### Capacity Planning

**Full Node Requirements:**
- **Storage**: 500GB (current) + 100GB/year growth
- **RAM**: 8GB minimum, 16GB recommended
- **CPU**: 4 cores minimum, 8 cores recommended
- **Network**: 500GB/month bandwidth (250GB up, 250GB down)
- **IOPS**: 1000+ recommended (SSD required)

**Mining Node Additional:**
- **CPU**: 64 cores (for CPU mining)
- **GPU**: NVIDIA RTX 4090 or AMD RX 7900 XTX (if GPU mining enabled)
- **Power**: 2000W+ PSU

### Architecture Decisions

**Deployment Models:**

1. **Single Node** (Testing/Small Operations)
   - 1 server
   - Simplest setup
   - Single point of failure

2. **High Availability** (Production)
   - 3+ nodes in different regions
   - Load balancer for RPC
   - Shared storage or replication

3. **Enterprise** (Exchange/Large Operation)
   - 5+ full nodes
   - Dedicated mining nodes
   - Separate RPC/API tier
   - Monitoring cluster
   - Backup cluster

### Network Planning

**Ports:**
- `8633` - P2P (must be publicly accessible)
- `8634` - RPC / REST / Metrics (localhost only or VPN)

**DNS:**
- `node1.yourdomain.com` - Primary node
- `node2.yourdomain.com` - Secondary node
- `api.yourdomain.com` - Load balanced RPC

---

## Hardware Requirements

### Recommended Specifications

**Production Full Node:**
```
CPU: AMD EPYC 7443P (24 cores) or Intel Xeon E-2388G (8 cores)
RAM: 32GB ECC
Storage: 2TB NVMe SSD (Samsung 980 PRO)
Network: 10 Gbps
OS: Ubuntu 22.04 LTS
```

**Budget Full Node:**
```
CPU: AMD Ryzen 5 5600 (6 cores)
RAM: 16GB
Storage: 1TB SATA SSD
Network: 1 Gbps
OS: Ubuntu 22.04 LTS
```

### Cloud Providers

**AWS:**
```
Instance: c6i.2xlarge (8 vCPU, 16 GB RAM)
Storage: 1TB gp3 (3000 IOPS, 125 MB/s)
Network: 10 Gbps
```

**DigitalOcean:**
```
Droplet: CPU-Optimized (8 vCPU, 16 GB RAM)
Storage: 1TB SSD
Network: 10 Gbps
```

**Hetzner:**
```
Server: AX52 (AMD Ryzen 9, 128GB RAM, 2x 3.84TB NVMe)
Network: 1 Gbps
```

---

## Software Requirements

### Operating System

**Supported:**
- ✅ Ubuntu 22.04 LTS (Recommended)
- ✅ Debian 12
- ✅ RHEL 9 / Rocky Linux 9
- ✅ Arch Linux (latest)

**Not Recommended:**
- ❌ Windows Server (poor performance)
- ❌ CentOS 7 (EOL)
- ❌ Ubuntu 18.04 (EOL)

### Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  curl \
  git \
  ufw \
  fail2ban \
  prometheus \
  grafana

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

---

## Installation

### Method 1: Binary Installation (Recommended)

```bash
# Download latest release
wget https://github.com/kubercoin/kubercoin/releases/download/v1.0.0/kubercoin-1.0.0-x86_64-linux.tar.gz

# Verify signature
wget https://github.com/kubercoin/kubercoin/releases/download/v1.0.0/SHA256SUMS
wget https://github.com/kubercoin/kubercoin/releases/download/v1.0.0/SHA256SUMS.asc
gpg --verify SHA256SUMS.asc
sha256sum --check SHA256SUMS

# Extract
tar -xzf kubercoin-1.0.0-x86_64-linux.tar.gz
cd kubercoin-1.0.0

# Install
sudo install -m 0755 -o root -g root -t /usr/local/bin kubercoin-node

# Verify installation
kubercoin-node --version
```

### Method 2: Build from Source

```bash
# Clone repository
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin

# Checkout stable release
git checkout v1.0.0

# Build
cd node
cargo build --release

# Install
sudo cp target/release/kubercoin-node /usr/local/bin/

# Verify
kubercoin-node --version
```

### Create System User

```bash
# Create dedicated user
sudo useradd -r -m -s /bin/bash -d /var/lib/kubercoin kubercoin

# Create directories
sudo mkdir -p /var/lib/kubercoin/.kubercoin
sudo mkdir -p /var/log/kubercoin
sudo chown -R kubercoin:kubercoin /var/lib/kubercoin
sudo chown -R kubercoin:kubercoin /var/log/kubercoin
```

---

## Configuration

### Basic Configuration

```bash
# Create config file
sudo -u kubercoin nano /var/lib/kubercoin/.kubercoin/kubercoin.conf
```

**kubercoin.conf (Production — TOML):**
```toml
# Network
network = "mainnet"
p2p_addr = "0.0.0.0:8633"
max_connections = 125

# RPC Server
rpc_addr = "127.0.0.1:8634"
# Set API key via environment variable instead:
# KUBERCOIN_API_KEYS=<comma-separated-keys>

# Performance
max_mempool_size_bytes = 314572800

# Data directory
data_dir = "/var/lib/kubercoin/.kubercoin"
```

**Generate RPC Password:**
```bash
openssl rand -base64 64
```

### Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/kubercoin-node.service
```

**kubercoin-node.service:**
```ini
[Unit]
Description=KuberCoin Node
After=network.target
Wants=network-online.target

[Service]
Type=notify
User=kubercoin
Group=kubercoin

# Runtime directory
RuntimeDirectory=kubercoin
RuntimeDirectoryMode=0710

# Working directory
WorkingDirectory=/var/lib/kubercoin

# Execute
ExecStart=/usr/local/bin/kubercoin-node \
  --config /var/lib/kubercoin/.kubercoin/kubercoin.conf \
  --data-dir /var/lib/kubercoin/.kubercoin

# Process management
Restart=on-failure
RestartSec=30s
TimeoutStartSec=infinity
TimeoutStopSec=600

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/var/lib/kubercoin

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable kubercoin-node

# Start service
sudo systemctl start kubercoin-node

# Check status
sudo systemctl status kubercoin-node
```

---

## Initial Sync

### Start Initial Blockchain Download (IBD)

```bash
# Start node
sudo systemctl start kubercoin-node

# Monitor progress
sudo -u kubercoin kubercoin-cli getblockchaininfo

# Watch logs
sudo journalctl -u kubercoin-node -f
```

**Expected Sync Times:**
- Fast server (NVMe SSD, 32GB RAM): 4-6 hours
- Standard server (SATA SSD, 16GB RAM): 12-24 hours
- Slow server (HDD, 8GB RAM): 2-3 days

### Verify Sync

```bash
# Check if fully synced
sudo -u kubercoin kubercoin-cli getblockchaininfo | grep verificationprogress

# verificationprogress should be 0.9999+ when synced

# Check peer count
sudo -u kubercoin kubercoin-cli getpeerinfo | grep addr

# Should have 8-125 peers
```

### Bootstrap from Snapshot (Optional)

**WARNING: Only use snapshots from trusted sources!**

```bash
# Download snapshot (hypothetical example)
wget https://snapshots.kubercoin.org/kubercoin-snapshot-latest.tar.gz
wget https://snapshots.kubercoin.org/kubercoin-snapshot-latest.tar.gz.sha256

# Verify
sha256sum --check kubercoin-snapshot-latest.tar.gz.sha256

# Stop node
sudo systemctl stop kubercoin-node

# Extract
sudo -u kubercoin tar -xzf kubercoin-snapshot-latest.tar.gz -C /var/lib/kubercoin/.kubercoin

# Start node
sudo systemctl start kubercoin-node
```

---

## Service Management

### Start/Stop/Restart

```bash
# Start
sudo systemctl start kubercoin-node

# Stop
sudo systemctl stop kubercoin-node

# Restart
sudo systemctl restart kubercoin-node

# Status
sudo systemctl status kubercoin-node

# Enable auto-start
sudo systemctl enable kubercoin-node

# Disable auto-start
sudo systemctl disable kubercoin-node
```

### Logs

```bash
# View real-time logs
sudo journalctl -u kubercoin-node -f

# View last 100 lines
sudo journalctl -u kubercoin-node -n 100

# View logs since yesterday
sudo journalctl -u kubercoin-node --since yesterday

# View logs for specific time
sudo journalctl -u kubercoin-node --since "2026-01-01 00:00:00"
```

### RPC Commands

```bash
# Get blockchain info
sudo -u kubercoin kubercoin-cli getblockchaininfo

# Get network info
sudo -u kubercoin kubercoin-cli getnetworkinfo

# Get peer info
sudo -u kubercoin kubercoin-cli getpeerinfo

# Get mempool info
sudo -u kubercoin kubercoin-cli getmempoolinfo

# Get wallet info
sudo -u kubercoin kubercoin-cli getwalletinfo

# Get balance
sudo -u kubercoin kubercoin-cli getbalance

# Send transaction
sudo -u kubercoin kubercoin-cli sendtoaddress "kube1address" 1.0

# Get new address
sudo -u kubercoin kubercoin-cli getnewaddress
```

---

## Monitoring

### Prometheus Metrics

**Install Prometheus:**
```bash
sudo apt install prometheus
```

**Configure Prometheus:**
```bash
sudo nano /etc/prometheus/prometheus.yml
```

Add:
```yaml
scrape_configs:
  - job_name: 'kubercoin'
    static_configs:
      - targets: ['localhost:8334']
    scrape_interval: 15s
```

```bash
# Restart Prometheus
sudo systemctl restart prometheus
```

### Grafana Dashboard

```bash
# Install Grafana
sudo apt install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# Access at http://localhost:3000
# Login with the Grafana credentials configured for your deployment
```

**Add Datasource:**
1. Settings → Data Sources
2. Add Prometheus
3. URL: http://localhost:9092

**Import Dashboard:**
1. Create → Import
2. Upload `kubercoin-dashboard.json`

### Health Checks

```bash
# Create health check script
sudo nano /usr/local/bin/kubercoin-healthcheck.sh
```

```bash
#!/bin/bash

# Check if process running
if ! pgrep -x "kubercoin-node" > /dev/null; then
    echo "ERROR: kubercoin-node not running"
    exit 1
fi

# Check if synced
PROGRESS=$(sudo -u kubercoin kubercoin-cli getblockchaininfo | jq -r '.verificationprogress')
if (( $(echo "$PROGRESS < 0.999" | bc -l) )); then
    echo "WARNING: Node still syncing ($PROGRESS)"
    exit 1
fi

# Check peer count
PEERS=$(sudo -u kubercoin kubercoin-cli getpeerinfo | jq length)
if [ "$PEERS" -lt 3 ]; then
    echo "WARNING: Low peer count ($PEERS)"
    exit 1
fi

echo "OK: Node healthy"
exit 0
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/kubercoin-healthcheck.sh

# Add to cron (every 5 minutes)
sudo crontab -e
```

Add:
```
*/5 * * * * /usr/local/bin/kubercoin-healthcheck.sh || /usr/local/bin/alert.sh
```

---

## Backup & Recovery

### Wallet Backup

```bash
# Backup wallet
sudo -u kubercoin kubercoin-cli backupwallet /backup/wallet-$(date +%Y%m%d).dat

# Encrypted backup to remote server
sudo -u kubercoin kubercoin-cli backupwallet - | \
  gpg --encrypt --recipient backup@example.com | \
  ssh backup-server "cat > /backups/kubercoin/wallet-$(date +%Y%m%d).dat.gpg"
```

### Chainstate Backup

```bash
# Stop node
sudo systemctl stop kubercoin-node

# Backup chainstate
sudo tar -czf /backup/chainstate-$(date +%Y%m%d).tar.gz \
  -C /var/lib/kubercoin/.kubercoin chainstate

# Start node
sudo systemctl start kubercoin-node
```

### Restore from Backup

```bash
# Stop node
sudo systemctl stop kubercoin-node

# Restore wallet
sudo cp /backup/wallet-20260130.dat /var/lib/kubercoin/.kubercoin/wallets/wallet.dat
sudo chown kubercoin:kubercoin /var/lib/kubercoin/.kubercoin/wallets/wallet.dat

# Restore chainstate (optional)
sudo tar -xzf /backup/chainstate-20260130.tar.gz -C /var/lib/kubercoin/.kubercoin

# Start node
sudo systemctl start kubercoin-node

# Rescan blockchain for wallet transactions
sudo -u kubercoin kubercoin-cli rescanblockchain
```

---

## Scaling

### Vertical Scaling (Upgrade Hardware)

**Add More RAM:**
```ini
# In kubercoin.conf, increase cache
dbcache=8000  # Use 50-75% of available RAM
```

**Faster Storage:**
- Migrate to NVMe SSD
- Use RAID 0 for performance (NOT for redundancy!)

### Horizontal Scaling (Multiple Nodes)

**Load Balanced RPC:**
```nginx
# /etc/nginx/sites-available/kubercoin-rpc
upstream kubercoin_rpc {
  server node1.internal:8634;
  server node2.internal:8634;
  server node3.internal:8634;
}

server {
  listen 8634 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/kubercoin.crt;
    ssl_certificate_key /etc/ssl/private/kubercoin.key;

    location / {
        proxy_pass http://kubercoin_rpc;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Troubleshooting

### Node Won't Start

```bash
# Check logs
sudo journalctl -u kubercoin-node -n 100

# Check if port is in use
sudo netstat -tulpn | grep 8633

# Check disk space
df -h /var/lib/kubercoin

# Check permissions
ls -la /var/lib/kubercoin/.kubercoin
```

### Sync Stalled

```bash
# Check peers
sudo -u kubercoin kubercoin-cli getpeerinfo

# Add known good peers
sudo -u kubercoin kubercoin-cli addnode "seed1.kubercoin.org:8633" add

# Restart node
sudo systemctl restart kubercoin-node
```

### High Memory Usage

```ini
# Reduce cache in kubercoin.conf
dbcache=2000  # Lower value

# Reduce max mempool
maxmempool=150
```

### Can't Connect to RPC

```bash
# Test RPC
curl --user kubercoin_rpc:password \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:8634/

# Check if listening
sudo netstat -tulpn | grep 8634

# Check config
sudo -u kubercoin cat /var/lib/kubercoin/.kubercoin/kubercoin.conf | grep rpc
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Check node health
- Monitor disk space
- Check peer count

**Weekly:**
- Review logs for errors
- Update security patches
- Test backups

**Monthly:**
- Full backup
- Review monitoring dashboards
- Capacity planning

**Quarterly:**
- Update KuberCoin software
- Security audit
- Disaster recovery test

### Software Updates

```bash
# Download new version
wget https://github.com/kubercoin/kubercoin/releases/download/v1.1.0/kubercoin-1.1.0-x86_64-linux.tar.gz

# Verify signature
gpg --verify SHA256SUMS.asc
sha256sum --check SHA256SUMS

# Stop node
sudo systemctl stop kubercoin-node

# Backup current version
sudo cp /usr/local/bin/kubercoin-node /usr/local/bin/kubercoin-node.bak

# Install new version
sudo install -m 0755 -o root -g root -t /usr/local/bin kubercoin-node kubercoin-cli

# Start node
sudo systemctl start kubercoin-node

# Verify version
kubercoin-node --version

# Monitor logs
sudo journalctl -u kubercoin-node -f
```

---

## Security Best Practices

1. **Never expose RPC to public internet**
2. **Use strong RPC passwords (64+ characters)**
3. **Keep OS and software updated**
4. **Enable firewall (UFW)**
5. **Use fail2ban for SSH protection**
6. **Encrypt wallet with strong passphrase**
7. **Backup wallet to multiple locations**
8. **Use Tor for privacy (optional)**
9. **Monitor for anomalies**
10. **Have incident response plan**

---

## Support

- Documentation: https://docs.kubercoin.org
- Discord: https://discord.gg/kubercoin
- Forum: https://forum.kubercoin.org
- Email: connect@kuber-coin.com

---

**Last Updated:** March 13, 2026  
**Version:** 1.0
