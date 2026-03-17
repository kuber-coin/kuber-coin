# KuberCoin Disaster Recovery Guide

**Critical procedures for emergency situations**

---

## Table of Contents

1. [Emergency Contacts](#emergency-contacts)
2. [Node Failure Recovery](#node-failure-recovery)
3. [Data Corruption Recovery](#data-corruption-recovery)
4. [Wallet Recovery](#wallet-recovery)
5. [Network Partition Recovery](#network-partition-recovery)
6. [Security Breach Response](#security-breach-response)
7. [Hardware Failure](#hardware-failure)
8. [Testing Recovery Procedures](#testing-recovery-procedures)

---

## Emergency Contacts

**Internal Team:**
- On-Call Engineer: +1-XXX-XXX-XXXX
- Security Lead: connect@kuber-coin.com
- Infrastructure Lead: connect@kuber-coin.com

**External Support:**
- Discord: https://discord.gg/kubercoin (#emergency)
- Community Forum: https://forum.kubercoin.org
- GitHub Issues: https://github.com/kubercoin/kubercoin/issues

**Service Providers:**
- AWS Support: +1-XXX-XXX-XXXX
- Hetzner Support: support@hetzner.com
- Cloudflare: support@cloudflare.com

---

## Node Failure Recovery

### Scenario 1: Node Won't Start

**Symptoms:**
- kubercoind fails to start
- Immediate crash on startup
- Error messages in logs

**Recovery Steps:**

1. **Check Logs**
```bash
sudo journalctl -u kubercoind -n 100 --no-pager
```

2. **Common Issues & Fixes**

**Port Already in Use:**
```bash
# Find process using port 8633
sudo lsof -i :8633

# Kill process
sudo kill -9 <PID>

# Restart node
sudo systemctl start kubercoind
```

**Corrupted Lock File:**
```bash
# Remove lock file
sudo rm /var/lib/kubercoin/.kubercoin/.lock

# Restart node
sudo systemctl start kubercoind
```

**Disk Full:**
```bash
# Check disk space
df -h /var/lib/kubercoin

# Free up space
sudo apt autoremove
sudo apt autoclean

# Or enable pruning
echo "prune=2000" >> /var/lib/kubercoin/.kubercoin/kubercoin.conf

# Restart
sudo systemctl start kubercoind
```

**Permission Issues:**
```bash
# Fix permissions
sudo chown -R kubercoin:kubercoin /var/lib/kubercoin

# Restart
sudo systemctl start kubercoind
```

---

## Data Corruption Recovery

### Scenario 2: Blockchain Database Corrupted

**Symptoms:**
- "Database corrupted" errors
- Verification failures
- Random crashes during sync

**Recovery Steps:**

**Step 1: Stop Node**
```bash
sudo systemctl stop kubercoind
```

**Step 2: Backup Current State**
```bash
# Even if corrupted, backup for forensics
sudo tar -czf /backup/corrupted-$(date +%Y%m%d-%H%M%S).tar.gz \
  /var/lib/kubercoin/.kubercoin/chainstate
```

**Step 3: Option A - Reindex (Faster)**
```bash
# Reindex from existing blocks
sudo -u kubercoin kubercoind -reindex

# Monitor progress
sudo journalctl -u kubercoind -f
```

**Step 4: Option B - Full Resync (Slower but Safer)**
```bash
# Remove corrupted data
sudo rm -rf /var/lib/kubercoin/.kubercoin/chainstate
sudo rm -rf /var/lib/kubercoin/.kubercoin/blocks

# Restart (will resync from scratch)
sudo systemctl start kubercoind
```

**Step 5: Option C - Restore from Backup**
```bash
# Stop node
sudo systemctl stop kubercoind

# Restore from known-good backup
sudo tar -xzf /backup/chainstate-20260125.tar.gz \
  -C /var/lib/kubercoin/.kubercoin/

# Fix permissions
sudo chown -R kubercoin:kubercoin /var/lib/kubercoin

# Start node
sudo systemctl start kubercoind
```

---

## Wallet Recovery

### Scenario 3: Wallet Corrupted or Lost

**Critical: DO NOT PANIC!**

**Step 1: Stop Node**
```bash
sudo systemctl stop kubercoind
```

**Step 2: Locate Wallet Backups**
```bash
# Check backup locations
ls -lh /backup/wallet-*.dat
ls -lh /var/lib/kubercoin/.kubercoin/wallets/

# Check remote backups
ssh backup-server "ls -lh /backups/kubercoin/"
```

**Step 3: Restore Wallet from Backup**
```bash
# Copy backup to wallet directory
sudo cp /backup/wallet-20260125.dat \
  /var/lib/kubercoin/.kubercoin/wallets/wallet.dat

# Fix permissions
sudo chown kubercoin:kubercoin \
  /var/lib/kubercoin/.kubercoin/wallets/wallet.dat

# Set restrictive permissions
sudo chmod 600 /var/lib/kubercoin/.kubercoin/wallets/wallet.dat
```

**Step 4: Verify Wallet**
```bash
# Start node
sudo systemctl start kubercoind

# Wait for node to sync
# Then check wallet
sudo -u kubercoin kubercoin-cli getwalletinfo

# Check balance
sudo -u kubercoin kubercoin-cli getbalance

# If balance is zero, rescan
sudo -u kubercoin kubercoin-cli rescanblockchain
```

### Scenario 4: Wallet Password Forgotten

**If you have seed phrase:**
```bash
# Stop node
sudo systemctl stop kubercoind

# Remove old wallet
sudo mv /var/lib/kubercoin/.kubercoin/wallets/wallet.dat \
  /var/lib/kubercoin/.kubercoin/wallets/wallet.dat.old

# Restore from seed phrase
sudo -u kubercoin kubercoind

# In another terminal
sudo -u kubercoin kubercoin-cli restorewallet "recovered" \
  "your twelve word seed phrase here"

# New wallet with new password
sudo -u kubercoin kubercoin-cli encryptwallet "new-strong-password"
```

**If you DON'T have seed phrase:**
- Wallet is **UNRECOVERABLE**
- Funds are **PERMANENTLY LOST**
- This is a feature, not a bug
- See [WALLET_RECOVERY_GUIDE.md](WALLET_RECOVERY_GUIDE.md) for prevention

---

## Network Partition Recovery

### Scenario 5: Node on Wrong Chain Fork

**Symptoms:**
- Different block height than other nodes
- Different latest block hash
- Peers disconnecting

**Step 1: Verify Fork**
```bash
# Get your block hash
sudo -u kubercoin kubercoin-cli getbestblockhash

# Compare with known-good node
curl https://api.kubercoin.org/v1/latest-block

# If different, you're on wrong fork
```

**Step 2: Identify Correct Chain**
```bash
# Check multiple sources
# Explorer: https://explorer.kubercoin.org
# Discord: https://discord.gg/kubercoin
# Twitter: https://twitter.com/kubercoin
```

**Step 3: Recover to Correct Chain**
```bash
# Stop node
sudo systemctl stop kubercoind

# Remove last N blocks (where fork occurred)
# Example: fork at block 100000, current at 100050
sudo -u kubercoin kubercoin-cli invalidateblock <FORK_BLOCK_HASH>

# Restart node (will resync correct chain)
sudo systemctl start kubercoind

# Monitor reorg
sudo journalctl -u kubercoind -f | grep -i reorg
```

**Step 4: Add Correct Peers**
```bash
# Add known-good peers
sudo -u kubercoin kubercoin-cli addnode "trusted-node1.kubercoin.org:8633" add
sudo -u kubercoin kubercoin-cli addnode "trusted-node2.kubercoin.org:8633" add

# Ban bad peers
sudo -u kubercoin kubercoin-cli setban "BAD.IP.ADDRESS" add
```

---

## Security Breach Response

### Scenario 6: Node Compromise Detected

**CRITICAL: Act Immediately!**

**Step 1: Isolate (Within 60 seconds)**
```bash
# Disconnect from network
sudo ufw deny out 8633/tcp
sudo ufw deny in 8633/tcp

# OR pull network cable
# OR disable network interface
sudo ip link set eth0 down

# Stop node
sudo systemctl stop kubercoind
```

**Step 2: Preserve Evidence**
```bash
# DO NOT modify files yet!
# Create forensic copy
sudo dd if=/dev/nvme0n1 of=/forensics/disk-image-$(date +%Y%m%d-%H%M%S).img bs=4M status=progress

# Copy logs
sudo cp -r /var/log /forensics/logs-$(date +%Y%m%d-%H%M%S)

# Copy wallet (if not already stolen)
sudo cp /var/lib/kubercoin/.kubercoin/wallets/wallet.dat \
  /forensics/wallet-$(date +%Y%m%d-%H%M%S).dat
```

**Step 3: Assess Damage**
```bash
# Check for unauthorized transactions
sudo -u kubercoin kubercoin-cli listtransactions | tail -n 50

# Check wallet balance
sudo -u kubercoin kubercoin-cli getbalance

# Check for modified files
sudo find /var/lib/kubercoin -mtime -1 -ls
```

**Step 4: Secure Funds (If Possible)**
```bash
# If wallet not yet drained, move funds NOW
# To pre-prepared cold wallet address
sudo -u kubercoin kubercoin-cli sendtoaddress \
  "COLD_WALLET_ADDRESS" \
  $(sudo -u kubercoin kubercoin-cli getbalance) \
  "" "" true  # Subtract fee from amount

# Confirm transaction broadcast
sudo -u kubercoin kubercoin-cli getrawtransaction <TXID> 1
```

**Step 5: Incident Response**
1. **Notify team** - Alert all relevant personnel
2. **Contact authorities** - If criminal activity suspected
3. **Public disclosure** - Transparent communication with community
4. **Post-mortem** - Document what happened and how

**Step 6: Rebuild from Clean State**
```bash
# DO NOT reuse compromised system!
# Provision new server
# Install fresh OS
# Deploy from scratch
# Restore wallet from offline backup ONLY
```

---

## Hardware Failure

### Scenario 7: Disk Failure

**Step 1: Immediate Actions**
```bash
# Check disk health
sudo smartctl -a /dev/nvme0n1

# If imminent failure predicted, backup NOW
sudo rsync -avz /var/lib/kubercoin/ backup-server:/emergency-backup/
```

**Step 2: Migrate to New Disk**
```bash
# Stop node
sudo systemctl stop kubercoind

# Copy data to new disk
sudo rsync -avz --progress /var/lib/kubercoin/ /mnt/new-disk/

# Update mounts
sudo nano /etc/fstab
# Change /dev/nvme0n1p1 to /dev/nvme1n1p1

# Reboot
sudo reboot

# Verify
df -h /var/lib/kubercoin

# Start node
sudo systemctl start kubercoind
```

### Scenario 8: RAM Failure

**Symptoms:**
- Random crashes
- Memory errors in logs
- Kernel panics

**Recovery:**
```bash
# Test RAM
sudo memtest86+

# If RAM faulty:
# 1. Power down server
# 2. Replace RAM modules
# 3. Boot up
# 4. Start node

# Verify no corruption
sudo -u kubercoin kubercoind -reindex
```

### Scenario 9: Complete Server Failure

**Recovery:**
1. **Provision new server**
2. **Install KuberCoin** (see DEPLOYMENT_GUIDE.md)
3. **Restore from backup:**

```bash
# Restore wallet
scp backup-server:/backups/wallet-latest.dat \
  /var/lib/kubercoin/.kubercoin/wallets/wallet.dat

# Option A: Restore full chainstate (fast)
rsync -avz backup-server:/backups/chainstate-latest/ \
  /var/lib/kubercoin/.kubercoin/chainstate/

# Option B: Resync from scratch (slow but clean)
# Just start node, will sync automatically

# Start node
sudo systemctl start kubercoind

# Monitor
sudo journalctl -u kubercoind -f
```

---

## Testing Recovery Procedures

**Monthly Disaster Recovery Drill**

### Test 1: Wallet Restore
```bash
# Create test wallet
kubercoin-cli -testnet createwallet "test-recovery"

# Backup
kubercoin-cli -testnet backupwallet /tmp/test-backup.dat

# Delete wallet
kubercoin-cli -testnet unloadwallet "test-recovery"
rm ~/.kubercoin/testnet/wallets/test-recovery.dat

# Restore
cp /tmp/test-backup.dat ~/.kubercoin/testnet/wallets/test-recovery.dat
kubercoin-cli -testnet loadwallet "test-recovery"

# Verify
kubercoin-cli -testnet getwalletinfo
```

### Test 2: Network Isolation
```bash
# Disconnect
sudo ufw deny out 8633/tcp

# Verify isolated
kubercoin-cli getpeerinfo
# Should show 0 peers

# Reconnect
sudo ufw allow out 8633/tcp

# Verify reconnected
kubercoin-cli getpeerinfo
# Should show peers again
```

### Test 3: Backup Restore
```bash
# Create backup
tar -czf /tmp/test-backup.tar.gz /var/lib/kubercoin/.kubercoin/chainstate

# Simulate corruption
sudo systemctl stop kubercoind
sudo rm /var/lib/kubercoin/.kubercoin/chainstate/*

# Restore
sudo tar -xzf /tmp/test-backup.tar.gz -C /

# Verify
sudo systemctl start kubercoind
kubercoin-cli getblockchaininfo
```

---

##Recovery Time Objectives (RTO)

| Scenario | Target RTO | Priority |
|----------|-----------|----------|
| Node restart | 5 minutes | P0 |
| Wallet restore from backup | 15 minutes | P0 |
| Database reindex | 2 hours | P1 |
| Full blockchain resync | 24 hours | P2 |
| New server provision | 4 hours | P1 |
| Security breach response | 1 hour | P0 |

## Recovery Point Objectives (RPO)

| Data Type | Backup Frequency | Max Data Loss |
|-----------|------------------|---------------|
| Wallet | Hourly | 1 hour |
| Chainstate | Daily | 1 day |
| Configuration | On change | 0 |
| Monitoring data | 5 minutes | 5 minutes |

---

## Checklist: Disaster Preparedness

Are you prepared for disaster?

- [ ] Backups automated and tested monthly
- [ ] Backup stored in 3 locations (on-site, off-site, cloud)
- [ ] Recovery procedures documented
- [ ] Recovery procedures tested quarterly
- [ ] Emergency contacts list current
- [ ] Monitoring alerts configured
- [ ] On-call rotation established
- [ ] Incident response plan documented
- [ ] Post-mortem template prepared
- [ ] Communication plan for downtime
- [ ] Spare hardware available
- [ ] Vendor support contracts active
- [ ] Security breach playbook ready

---

**Last Updated:** March 13, 2026  
**Version:** 1.0

**REMEMBER: Hope for the best, prepare for the worst!**
