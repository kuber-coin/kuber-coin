# KuberCoin Performance Tuning Guide

**Optimize your KuberCoin node for maximum performance**

---

## Table of Contents

1. [Hardware Optimization](#hardware-optimization)
2. [Operating System Tuning](#operating-system-tuning)
3. [Node Configuration](#node-configuration)
4. [Database Optimization](#database-optimization)
5. [Network Optimization](#network-optimization)
6. [Memory Management](#memory-management)
7. [CPU Optimization](#cpu-optimization)
8. [Monitoring Performance](#monitoring-performance)
9. [Benchmarking](#benchmarking)
10. [Troubleshooting Performance Issues](#troubleshooting)

---

## Hardware Optimization

### Storage

**NVMe SSD (Best)**
```
Read: 7000 MB/s
Write: 5000 MB/s
IOPS: 1,000,000+
Latency: <100μs

Recommended: Samsung 980 PRO, WD Black SN850
```

**SATA SSD (Good)**
```
Read: 550 MB/s
Write: 520 MB/s
IOPS: 100,000
Latency: <1ms

Recommended: Samsung 870 EVO, Crucial MX500
```

**HDD (Not Recommended)**
```
Read: 150 MB/s
Write: 150 MB/s
IOPS: 200
Latency: 10-15ms

Avoid for blockchain nodes!
```

### Filesystem

**Best: XFS**
```bash
# Create XFS filesystem
sudo mkfs.xfs -f /dev/nvme0n1p1

# Mount with optimizations
sudo mount -o noatime,nodiratime,logbsize=256k /dev/nvme0n1p1 /var/lib/kubercoin
```

**Good: ext4**
```bash
# Create ext4 with optimizations
sudo mkfs.ext4 -O ^has_journal /dev/nvme0n1p1

# Mount options
sudo mount -o noatime,nodiratime,data=writeback,barrier=0 /dev/nvme0n1p1 /var/lib/kubercoin
```

**Permanent Mount:**
```bash
# /etc/fstab
/dev/nvme0n1p1 /var/lib/kubercoin xfs noatime,nodiratime,logbsize=256k 0 2
```

---

## Operating System Tuning

### Kernel Parameters

```bash
# Edit sysctl
sudo nano /etc/sysctl.conf
```

Add:
```ini
# File descriptors (for many peers)
fs.file-max = 2097152

# Network buffer sizes
net.core.rmem_default = 1048576
net.core.rmem_max = 16777216
net.core.wmem_default = 1048576
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 1048576 16777216
net.ipv4.tcp_wmem = 4096 1048576 16777216

# TCP optimization
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_notsent_lowat = 16384
net.ipv4.tcp_slow_start_after_idle = 0

# Connection tracking
net.netfilter.nf_conntrack_max = 1000000
net.netfilter.nf_conntrack_tcp_timeout_established = 600

# VM (memory) tuning
vm.swappiness = 1
vm.dirty_ratio = 80
vm.dirty_background_ratio = 5
vm.vfs_cache_pressure = 50

# Huge pages
vm.nr_hugepages = 1024
```

```bash
# Apply settings
sudo sysctl -p
```

### Transparent Huge Pages

```bash
# Enable THP
echo always > /sys/kernel/mm/transparent_hugepage/enabled
echo always > /sys/kernel/mm/transparent_hugepage/defrag

# Make permanent
sudo nano /etc/rc.local
```

Add:
```bash
echo always > /sys/kernel/mm/transparent_hugepage/enabled
echo always > /sys/kernel/mm/transparent_hugepage/defrag
```

### CPU Governor

```bash
# Set to performance mode
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Make permanent
sudo apt install cpufrequtils
sudo nano /etc/default/cpufrequtils
```

Add:
```
GOVERNOR="performance"
```

### File Descriptor Limits

```bash
# Edit limits
sudo nano /etc/security/limits.conf
```

Add:
```
kubercoin soft nofile 65536
kubercoin hard nofile 65536
kubercoin soft nproc 4096
kubercoin hard nproc 4096
```

---

## Node Configuration

### Optimal kubercoin.conf

```ini
# ===== PERFORMANCE TUNING =====

# Database cache (use 50-75% of available RAM)
# Example: 32GB RAM = dbcache=24000
dbcache=16000

# Max mempool size (MB)
maxmempool=300

# Mempool expiry (hours)
mempoolexpiry=72

# Max orphan transactions
maxorphantx=100

# Enable parallel script verification
par=8  # Number of CPU cores for signature verification

# RPC threads
rpcthreads=8  # Number of CPU cores for RPC

# Max connections
maxconnections=125

# Upload target (MB/day, 0 = unlimited)
maxuploadtarget=5000

# ===== NETWORK OPTIMIZATION =====

# Enable bloom filters (faster SPV)
peerbloomfilters=1

# Enable compact blocks (BIP 152)
blocksonly=0

# Network buffer sizes
maxreceivebuffer=10000
maxsendbuffer=10000

# ===== BLOCK VALIDATION =====

# Assume valid (skip sig verification before this block)
# Only use for known-good blocks!
assumevalid=<latest_block_hash>

# Check blocks (0 = all, 6 = skip old)
checkblocks=6

# Check level (0-4, higher = slower but safer)
checklevel=3

# ===== PRUNING (Optional) =====

# Prune old blocks (keep last 550MB = ~1 month)
# Comment out to keep full chain
# prune=550

# ===== INDEXING =====

# Transaction index (required for some RPC calls)
txindex=1

# Address index (faster wallet operations)
addressindex=1

# Timestamp index
timestampindex=1

# Spent index
spentindex=1
```

### Profile-Specific Configs

**High Performance (Mining/Exchange):**
```ini
dbcache=32000
maxmempool=500
par=16
rpcthreads=16
maxconnections=200
```

**Low Resource (Raspberry Pi):**
```ini
dbcache=512
maxmempool=50
par=2
rpcthreads=2
maxconnections=20
prune=2000
```

**Privacy Focused:**
```ini
dbcache=4000
proxy=127.0.0.1:9050
onlynet=onion
listen=1
maxconnections=50
```

---

## Database Optimization

### sled Configuration

**Tuning:**
```rust
// In code
let config = sled::Config::default()
    .cache_capacity(16_000_000_000)  // 16GB cache
    .flush_every_ms(Some(5000))       // Flush every 5s
    .mode(sled::Mode::HighThroughput)
    .use_compression(true)
    .compression_factor(5);

let db = config.open("/var/lib/kubercoin/.kubercoin/chainstate")?;
```

### Periodic Maintenance

```bash
# Create maintenance script
sudo nano /usr/local/bin/kubercoin-db-optimize.sh
```

```bash
#!/bin/bash

# Stop node
systemctl stop kubercoind

# Compact database
sled-cli compact /var/lib/kubercoin/.kubercoin/chainstate

# Rebuild indexes
sudo -u kubercoin kubercoin-cli reindex

# Start node
systemctl start kubercoind
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/kubercoin-db-optimize.sh

# Run monthly
sudo crontab -e
```

Add:
```
0 2 1 * * /usr/local/bin/kubercoin-db-optimize.sh
```

---

## Network Optimization

### Connection Quality

**Prioritize Fast Peers:**
```ini
# In kubercoin.conf
# Manually add known fast peers
addnode=fast-node1.kubercoin.org:8633
addnode=fast-node2.kubercoin.org:8633
addnode=fast-node3.kubercoin.org:8633
```

### Bandwidth Management

**Limit Bandwidth:**
```bash
# Install wondershaper
sudo apt install wondershaper

# Limit to 50Mbps up, 50Mbps down
sudo wondershaper eth0 50000 50000
```

**Remove Limit:**
```bash
sudo wondershaper clear eth0
```

### Firewall Optimization

```bash
# Optimize iptables for performance
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8633 -m conntrack --ctstate NEW -j ACCEPT

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Memory Management

### Swap Configuration

**Disable Swap (if you have enough RAM):**
```bash
# Temporary
sudo swapoff -a

# Permanent
sudo nano /etc/fstab
# Comment out swap line
```

**Or Reduce Swappiness:**
```bash
# Set to 1 (only swap if desperate)
sudo sysctl vm.swappiness=1
```

### Memory Allocation

**Monitor Memory:**
```bash
# Check memory usage
free -h

# Watch memory in real-time
watch -n 1 free -h

# Check kubercoin memory usage
ps aux | grep kubercoind
```

**Increase dbcache if you have spare RAM:**
```ini
# Rule of thumb: 50-75% of total RAM
# 64GB RAM = dbcache=48000
dbcache=48000
```

---

## CPU Optimization

### Core Affinity

**Pin to Specific Cores:**
```bash
# Pin kubercoin to cores 0-7
sudo taskset -c 0-7 kubercoind
```

**Permanent (systemd):**
```ini
# /etc/systemd/system/kubercoind.service
[Service]
CPUAffinity=0-7
```

### Priority

**Increase Priority:**
```bash
# Run with higher priority (-20 = highest, 19 = lowest)
sudo nice -n -10 kubercoind
```

**Permanent (systemd):**
```ini
[Service]
Nice=-10
```

### Parallel Verification

```ini
# Use all CPU cores for signature verification
# In kubercoin.conf
par=-1  # Auto-detect cores
```

---

## Monitoring Performance

### Install Monitoring Tools

```bash
# Install tools
sudo apt install sysstat iotop htop iftop nethogs
```

### CPU Monitoring

```bash
# Real-time CPU usage
htop

# Per-process CPU
top -p $(pgrep kubercoind)

# CPU stats every 1 second
mpstat 1
```

### Disk I/O Monitoring

```bash
# Real-time disk I/O
sudo iotop -o

# Disk stats
iostat -x 1

# Per-process disk I/O
sudo iotop -P -p $(pgrep kubercoind)
```

### Network Monitoring

```bash
# Real-time network usage
sudo iftop

# Per-process network
sudo nethogs

# Network stats
netstat -s
```

### Database Monitoring

```bash
# Watch database size
watch -n 60 du -sh /var/lib/kubercoin/.kubercoin/chainstate

# Database stats
sled-cli stats /var/lib/kubercoin/.kubercoin/chainstate
```

---

## Benchmarking

### Initial Sync Benchmark

```bash
# Record start time
date > /tmp/sync-start.txt

# Start node
sudo systemctl start kubercoind

# Monitor progress
watch -n 10 'kubercoin-cli getblockchaininfo | grep -E "(blocks|verificationprogress)"'

# When done, record end time
date > /tmp/sync-end.txt

# Calculate duration
echo "Start: $(cat /tmp/sync-start.txt)"
echo "End: $(cat /tmp/sync-end.txt)"
```

### Transaction Validation Benchmark

```bash
# Measure block validation time
kubercoin-cli getblock <block_hash> 0 | kubercoin-cli validateblock

# Benchmark signature verification
time kubercoin-cli verifychain 4 1000
```

### RPC Benchmark

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Benchmark getblockchaininfo RPC
ab -n 1000 -c 10 -A kubercoin_rpc:password \
  -p request.json -T 'application/json' \
  http://127.0.0.1:8332/
```

**request.json:**
```json
{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}
```

---

## Troubleshooting

### Slow Initial Sync

**Symptoms:**
- Sync taking > 24 hours
- verificationprogress stuck

**Solutions:**
```ini
# Increase dbcache
dbcache=16000

# Enable assumevalid
assumevalid=<recent_block_hash>

# Reduce checkpoints
checkblocks=6
checklevel=2

# Faster storage
# Move to NVMe SSD
```

### High CPU Usage

**Symptoms:**
- CPU at 100%
- System unresponsive

**Solutions:**
```ini
# Reduce parallel verification
par=4  # Reduce from 8

# Reduce RPC threads
rpcthreads=4

# Lower priority
nice=10
```

### High Memory Usage

**Symptoms:**
- Out of memory errors
- Swapping heavily

**Solutions:**
```ini
# Reduce dbcache
dbcache=4000

# Reduce mempool
maxmempool=150

# Enable pruning
prune=2000
```

### Slow Database Queries

**Symptoms:**
- RPC calls taking > 1 second
- Wallet operations slow

**Solutions:**
```bash
# Reindex database
kubercoin-cli stop
kubercoind -reindex

# Compact database
sled-cli compact /var/lib/kubercoin/.kubercoin/chainstate

# Enable indexes
txindex=1
addressindex=1
```

### Network Congestion

**Symptoms:**
- Slow block propagation
- High bandwidth usage

**Solutions:**
```ini
# Reduce connections
maxconnections=50

# Limit upload
maxuploadtarget=500

# Enable compact blocks
blocksonly=0
```

---

## Performance Metrics

### Target Metrics

**Initial Sync:**
- Fast: < 6 hours
- Normal: 12-24 hours
- Slow: > 24 hours

**Block Validation:**
- Fast: < 10ms/block
- Normal: 10-50ms/block
- Slow: > 50ms/block

**RPC Latency:**
- Fast: < 10ms
- Normal: 10-50ms
- Slow: > 50ms

**Memory Usage:**
- Low: < 4GB
- Normal: 4-8GB
- High: 8-16GB
- Very High: > 16GB

**Disk I/O:**
- Fast: > 1000 IOPS
- Normal: 100-1000 IOPS
- Slow: < 100 IOPS

---

## Optimization Checklist

Performance Tuning Checklist:

- [ ] NVMe SSD storage
- [ ] XFS or ext4 filesystem
- [ ] noatime mount option
- [ ] Kernel parameters tuned
- [ ] Transparent huge pages enabled
- [ ] CPU governor set to performance
- [ ] File descriptor limits increased
- [ ] dbcache optimized for RAM
- [ ] par set to CPU core count
- [ ] Swap disabled or swappiness=1
- [ ] Network buffers increased
- [ ] Indexes enabled
- [ ] assumevalid configured
- [ ] Monitoring set up
- [ ] Benchmarks run

---

**Last Updated:** March 13, 2026  
**Version:** 1.0
