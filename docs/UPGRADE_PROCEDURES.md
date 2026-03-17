# Upgrade Procedures

## Overview

This document describes procedures for upgrading Kubercoin nodes in various scenarios including hard forks, soft forks, emergency patches, and routine updates.

## Table of Contents

1. [Soft Fork Upgrades](#soft-fork-upgrades)
2. [Hard Fork Upgrades](#hard-fork-upgrades)
3. [Emergency Security Patches](#emergency-security-patches)
4. [Routine Updates](#routine-updates)
5. [Rollback Procedures](#rollback-procedures)
6. [Testing Before Upgrade](#testing-before-upgrade)
7. [Monitoring After Upgrade](#monitoring-after-upgrade)
8. [Troubleshooting](#troubleshooting)

---

## Soft Fork Upgrades

**Definition**: A soft fork is a backward-compatible protocol upgrade. Upgraded nodes can still communicate with non-upgraded nodes.

### Pre-Upgrade Checklist

- [ ] Review the release notes and changelog
- [ ] Check consensus rule changes
- [ ] Verify activation mechanism (height-based or time-based)
- [ ] Test on testnet or regtest
- [ ] Backup wallet and configuration files
- [ ] Note current block height and network status

### Upgrade Procedure

```bash
# 1. Stop the node gracefully
kubercoin-cli stop

# 2. Wait for clean shutdown (check logs)
tail -f ~/.kubercoin/debug.log

# 3. Backup critical data
cp -r ~/.kubercoin/wallet.dat ~/backups/wallet_$(date +%Y%m%d).dat
cp ~/.kubercoin/kubercoin.conf ~/backups/

# 4. Download and verify new binary
wget https://releases.kubercoin.org/v2.1.0/kubercoin-2.1.0-linux-x86_64.tar.gz
wget https://releases.kubercoin.org/v2.1.0/SHA256SUMS
wget https://releases.kubercoin.org/v2.1.0/SHA256SUMS.asc

# 5. Verify signatures
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS 2>&1 | grep kubercoin-2.1.0-linux-x86_64.tar.gz

# 6. Extract and install
tar -xzf kubercoin-2.1.0-linux-x86_64.tar.gz
sudo cp kubercoin-2.1.0/bin/* /usr/local/bin/

# 7. Restart node
kubercoind -daemon

# 8. Monitor synchronization
kubercoin-cli getblockchaininfo
```

### Post-Upgrade Verification

```bash
# Check version
kubercoin-cli --version

# Verify node is syncing
kubercoin-cli getpeerinfo | grep version

# Check soft fork activation status
kubercoin-cli getblockchaininfo | grep softforks

# Monitor logs for warnings
tail -f ~/.kubercoin/debug.log | grep -i "warn\|error"
```

### Activation Timeline

Soft forks typically activate when:
- **95% of last 2016 blocks** signal readiness (BIP9 style)
- **Specific block height** is reached (height-based activation)
- **Specific timestamp** is passed (time-based activation)

Monitor activation progress:
```bash
kubercoin-cli getblockchaininfo | jq .softforks
```

---

## Hard Fork Upgrades

**Definition**: A hard fork is a non-backward-compatible protocol upgrade. All nodes must upgrade or they will fork onto a different chain.

### ⚠️ Critical Warning

Hard forks create two incompatible chains if not all nodes upgrade. Upgrading too early or too late can result in:
- Loss of funds
- Double-spend attempts
- Network isolation

### Pre-Upgrade Checklist

- [ ] **Mandatory**: Read full upgrade guide from developers
- [ ] Identify exact activation block height/timestamp
- [ ] Backup entire data directory
- [ ] Test upgrade on testnet first
- [ ] Coordinate with exchanges/services you interact with
- [ ] Ensure 24-48 hours of monitoring availability post-upgrade
- [ ] Have rollback plan ready

### Timing is Critical

```
Timeline for Hard Fork at Block 500,000:
├─ Block 499,000: Prepare upgrade (test, backup)
├─ Block 499,500: Review community consensus
├─ Block 499,900: Final testing window
├─ Block 499,950: Upgrade window opens
├─ Block 500,000: ⚠️ ACTIVATION BLOCK ⚠️
└─ Block 500,100: Post-upgrade monitoring
```

### Upgrade Procedure

```bash
# 1. Stop node at safe time (1-24 hours before activation)
kubercoin-cli stop

# 2. Full backup
tar -czf ~/backups/kubercoin-backup-$(date +%Y%m%d_%H%M%S).tar.gz \
    ~/.kubercoin/

# 3. Verify activation parameters
cat release_notes.txt | grep "Activation Block"
# Expected: "Activation Block: 500000"

# 4. Download hard fork binary
wget https://releases.kubercoin.org/v3.0.0-hardfork/kubercoin-3.0.0-linux-x86_64.tar.gz

# 5. Verify signatures (CRITICAL for security)
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS

# 6. Install new binary
sudo cp kubercoin-3.0.0/bin/* /usr/local/bin/

# 7. Restart node (must be before activation block)
kubercoind -daemon

# 8. Monitor approaching activation
watch -n 10 'kubercoin-cli getblockchaininfo | grep blocks'
```

### Monitoring Activation

```bash
# Check current height vs activation height
kubercoin-cli getblockchaininfo | jq '{blocks: .blocks, activation: 500000}'

# Watch for activation logs
tail -f ~/.kubercoin/debug.log | grep -i "fork\|activation\|consensus"

# Verify peer versions (all should be upgraded)
kubercoin-cli getpeerinfo | jq '.[].subver' | sort | uniq -c
```

### Post-Activation Verification

```bash
# 1. Verify you're on correct chain
kubercoin-cli getblockhash 500000
# Compare with official announcement

# 2. Check consensus rules are active
kubercoin-cli getblockchaininfo | jq .softforks

# 3. Verify transactions work
kubercoin-cli getbalance
kubercoin-cli listunspent

# 4. Monitor for 24-48 hours
# Watch for reorgs, double spends, or consensus issues
```

---

## Emergency Security Patches

### When to Apply

Emergency patches address:
- **Critical vulnerabilities** (remote code execution, consensus bugs)
- **Network attacks** (DDoS, eclipse attacks)
- **Inflation bugs** (incorrect coin supply)

### Speed vs Safety

Emergency patches require **immediate** action but also **careful verification**.

```
Emergency Timeline:
├─ Hour 0: Vulnerability announced
├─ Hour 0-2: Download and verify patch
├─ Hour 2-3: Test on isolated node (if possible)
├─ Hour 3-4: Apply to production nodes
└─ Hour 4+: Monitor continuously
```

### Rapid Upgrade Procedure

```bash
# 1. Immediate download
wget https://releases.kubercoin.org/emergency/kubercoin-2.0.1-CRITICAL.tar.gz
wget https://releases.kubercoin.org/emergency/SHA256SUMS.asc

# 2. CRITICAL: Verify signatures
# DO NOT skip this even in emergency
gpg --verify SHA256SUMS.asc
sha256sum -c SHA256SUMS

# 3. Quick backup
cp -r ~/.kubercoin/wallet.dat ~/emergency_backup_$(date +%s).dat

# 4. Hot upgrade (node stays running if possible)
kubercoin-cli stop
sleep 10
sudo cp kubercoin-2.0.1/bin/* /usr/local/bin/
kubercoind -daemon

# 5. Verify patch applied
kubercoin-cli --version | grep "2.0.1"
tail -f ~/.kubercoin/debug.log
```

### Emergency Rollback

If patch causes issues:

```bash
# 1. Stop immediately
kubercoin-cli stop

# 2. Restore previous binary
sudo cp ~/backups/old-kubercoind /usr/local/bin/kubercoind

# 3. Restart
kubercoind -daemon

# 4. Report issue to developers
# Include logs and error details
```

---

## Routine Updates

### Types of Routine Updates

- **Performance improvements** (faster sync, lower memory)
- **New features** (RPC endpoints, wallet features)
- **Bug fixes** (non-critical issues)
- **UI improvements** (better logging, error messages)

### When to Upgrade

- During low-traffic periods
- After testing on testnet
- When you have time to monitor for 1-2 hours

### Standard Upgrade Procedure

```bash
# 1. Review release notes
curl https://releases.kubercoin.org/v2.2.0/RELEASE_NOTES.md

# 2. Backup (lightweight for routine updates)
kubercoin-cli backupwallet ~/backups/wallet_$(date +%Y%m%d).dat

# 3. Stop node
kubercoin-cli stop

# 4. Install new version
wget https://releases.kubercoin.org/v2.2.0/kubercoin-2.2.0-linux-x86_64.tar.gz
tar -xzf kubercoin-2.2.0-linux-x86_64.tar.gz
sudo cp kubercoin-2.2.0/bin/* /usr/local/bin/

# 5. Restart
kubercoind -daemon

# 6. Quick verification
kubercoin-cli getblockchaininfo
kubercoin-cli getwalletinfo
```

---

## Rollback Procedures

### When to Rollback

- Node fails to start after upgrade
- Consensus issues (wrong chain)
- Severe performance degradation
- Wallet corruption

### Full Rollback

```bash
# 1. Stop failed node
kubercoin-cli stop
# or if unresponsive:
pkill -9 kubercoind

# 2. Restore backup binary
sudo cp ~/backups/kubercoind-old /usr/local/bin/kubercoind

# 3. Restore data directory (if corrupted)
rm -rf ~/.kubercoin/blocks ~/.kubercoin/chainstate
tar -xzf ~/backups/kubercoin-backup-20260120.tar.gz -C ~/

# 4. Restart with old version
kubercoind -daemon -reindex # if data was restored

# 5. Verify recovery
kubercoin-cli getblockchaininfo
tail -f ~/.kubercoin/debug.log
```

### Partial Rollback (Config Only)

If issue is configuration-related:

```bash
# Restore old config
cp ~/backups/kubercoin.conf ~/.kubercoin/
kubercoin-cli stop
kubercoind -daemon
```

---

## Testing Before Upgrade

### Testnet Testing

Always test major upgrades on testnet first:

```bash
# 1. Start testnet node
kubercoind -testnet -daemon

# 2. Sync testnet
kubercoin-cli -testnet getblockchaininfo

# 3. Test upgrade procedure
kubercoin-cli -testnet stop
# ... perform upgrade ...
kubercoind -testnet -daemon

# 4. Verify functionality
kubercoin-cli -testnet getpeerinfo
kubercoin-cli -testnet sendtoaddress <test_address> 0.1
```

### Regtest Testing (Local)

For quick local testing:

```bash
# 1. Start regtest
kubercoind -regtest -daemon

# 2. Mine some blocks
kubercoin-cli -regtest generatetoaddress 101 <your_address>

# 3. Test upgrade
kubercoin-cli -regtest stop
# ... upgrade binary ...
kubercoind -regtest -daemon

# 4. Verify
kubercoin-cli -regtest getblockchaininfo
```

---

## Monitoring After Upgrade

### First 30 Minutes

```bash
# Watch logs continuously
tail -f ~/.kubercoin/debug.log

# Check peer connections
watch -n 10 'kubercoin-cli getpeerinfo | jq length'

# Verify synchronization
watch -n 10 'kubercoin-cli getblockchaininfo | jq .blocks'
```

### First 24 Hours

```bash
# Automated monitoring script
#!/bin/bash
while true; do
    HEIGHT=$(kubercoin-cli getblockchaininfo | jq .blocks)
    PEERS=$(kubercoin-cli getpeerinfo | jq length)
    echo "$(date): Height=$HEIGHT Peers=$PEERS"
    
    # Alert if issues
    if [ $PEERS -lt 3 ]; then
        echo "WARNING: Low peer count"
    fi
    
    sleep 300 # Check every 5 minutes
done
```

### Metrics to Track

- Block height (should increase steadily)
- Peer count (should be 8+)
- Memory usage (should be stable)
- Disk usage (should grow predictably)
- Error logs (should be minimal)

---

## Troubleshooting

### Node Won't Start After Upgrade

**Symptoms**: `kubercoind` exits immediately or fails to start

**Solutions**:
1. Check logs: `tail -n 100 ~/.kubercoin/debug.log`
2. Verify binary integrity: `sha256sum /usr/local/bin/kubercoind`
3. Check disk space: `df -h ~/.kubercoin`
4. Try clean start: `kubercoind -daemon -reindex`
5. Rollback if necessary

### Wrong Chain After Hard Fork

**Symptoms**: Different block hashes than network

**Solutions**:
```bash
# 1. Check your chain
kubercoin-cli getblockhash <fork_height>

# 2. Compare with official
curl https://explorer.kubercoin.org/api/block-hash/<fork_height>

# 3. If wrong, invalidate and resync
kubercoin-cli invalidateblock <wrong_block_hash>
kubercoin-cli reconsiderblock <correct_block_hash>
```

### Peers Not Connecting

**Symptoms**: `getpeerinfo` shows 0 or few peers

**Solutions**:
```bash
# 1. Check network connectivity
kubercoin-cli getnetworkinfo

# 2. Manually add known peers
kubercoin-cli addnode "peer.kubercoin.org:9333" "onetry"

# 3. Check firewall
sudo ufw status | grep 9333

# 4. Restart with connection debugging
kubercoind -daemon -debug=net
```

### Wallet Issues After Upgrade

**Symptoms**: Missing balance, can't send transactions

**Solutions**:
```bash
# 1. Rescan blockchain
kubercoin-cli stop
kubercoind -daemon -rescan

# 2. If still issues, restore backup
kubercoin-cli stop
cp ~/backups/wallet_20260120.dat ~/.kubercoin/wallet.dat
kubercoind -daemon -rescan

# 3. Verify wallet
kubercoin-cli getwalletinfo
kubercoin-cli listunspent
```

---

## Best Practices Summary

### Before Any Upgrade

✅ **ALWAYS** backup wallet
✅ **ALWAYS** verify signatures  
✅ **ALWAYS** read release notes  
✅ Test on testnet for major upgrades  
✅ Choose low-traffic time  

### During Upgrade

✅ Follow procedure exactly  
✅ Don't skip verification steps  
✅ Monitor logs during process  
✅ Have rollback plan ready  

### After Upgrade

✅ Verify version upgraded  
✅ Check synchronization  
✅ Monitor for 24-48 hours  
✅ Test wallet functionality  
✅ Watch for community issues  

---

## Version-Specific Procedures

### Upgrading from v1.x to v2.x

```bash
# Major version upgrade - extra caution
# 1. Full node reindex required
kubercoin-cli stop
mv ~/.kubercoin/chainstate ~/.kubercoin/chainstate.old
# ... install v2.x binary ...
kubercoind -daemon -reindex

# 2. Database migration (automatic but slow)
# Allow 4-8 hours for reindexing
watch -n 60 'kubercoin-cli getblockchaininfo | jq .verificationprogress'
```

### Upgrading from v2.x to v2.y (minor)

```bash
# Minor version - simple upgrade
kubercoin-cli stop
# ... install v2.y binary ...
kubercoind -daemon
# Should sync immediately
```

---

## Emergency Contacts

**Security Issues**: connect@kuber-coin.com  
**Upgrade Support**: connect@kuber-coin.com  
**Community Chat**: https://chat.kubercoin.org  
**Status Page**: https://status.kubercoin.org  

---

## Appendix: Useful Commands

```bash
# Check version
kubercoin-cli --version
kubercoind --version

# Check block height
kubercoin-cli getblockcount

# Check sync status
kubercoin-cli getblockchaininfo | jq .verificationprogress

# List all peers
kubercoin-cli getpeerinfo | jq '.[].addr'

# Check wallet balance
kubercoin-cli getbalance

# Emergency stop (if RPC not responding)
pkill -TERM kubercoind
# Wait 30 seconds, then force:
pkill -KILL kubercoind

# Disk usage
du -sh ~/.kubercoin/blocks ~/.kubercoin/chainstate

# Log monitoring
tail -f ~/.kubercoin/debug.log | grep -i "error\|warning\|fork"
```

---

**Document Version**: 1.0  
**Last Updated**: March 13, 2026  
**Network**: Kubercoin Mainnet  
**Applies to**: Kubercoin Core v2.0+
