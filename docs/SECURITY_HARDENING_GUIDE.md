# KuberCoin Security Hardening Guide

**CRITICAL: Follow this guide before deploying to production!**

## Table of Contents
1. [System Hardening](#system-hardening)
2. [Network Security](#network-security)
3. [Node Security](#node-security)
4. [Wallet Security](#wallet-security)
5. [Key Management](#key-management)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Incident Response](#incident-response)
8. [Security Checklist](#security-checklist)

---

## System Hardening

### Operating System Security

#### Linux (Recommended)

**1. Update System**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# RHEL/CentOS
sudo yum update -y

# Arch
sudo pacman -Syu
```

**2. Configure Firewall**
```bash
# Install UFW
sudo apt install ufw

# Default deny incoming
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (change port if not 22)
sudo ufw allow 22/tcp

# Allow KuberCoin P2P
sudo ufw allow 8633/tcp

# Allow KuberCoin RPC (only from localhost!)
sudo ufw allow from 127.0.0.1 to any port 8332

# Enable firewall
sudo ufw enable
```

**3. Disable Unnecessary Services**
```bash
# List running services
systemctl list-units --type=service --state=running

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable cups
sudo systemctl disable avahi-daemon
```

**4. Configure Fail2Ban (Brute Force Protection)**
```bash
# Install
sudo apt install fail2ban

# Configure
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600
```

```bash
# Start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

**5. Secure SSH**
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config
```

Set:
```
# Disable root login
PermitRootLogin no

# Disable password authentication (use keys only)
PasswordAuthentication no
PubkeyAuthentication yes

# Change default port (optional but recommended)
Port 2222

# Limit users
AllowUsers youruser

# Disable X11 forwarding
X11Forwarding no
```

```bash
# Restart SSH
sudo systemctl restart sshd
```

### User & Permission Management

**1. Create Dedicated User**
```bash
# Never run as root!
sudo useradd -m -s /bin/bash kubercoin
sudo passwd kubercoin

# Add to necessary groups
sudo usermod -aG sudo kubercoin
```

**2. File Permissions**
```bash
# Secure node directory
chmod 700 ~/.kubercoin

# Secure wallet
chmod 600 ~/.kubercoin/wallets/wallet.dat

# Secure config
chmod 600 ~/.kubercoin/kubercoin.conf
```

### Kernel Hardening

```bash
# Edit sysctl
sudo nano /etc/sysctl.conf
```

Add:
```ini
# Disable IP forwarding
net.ipv4.ip_forward = 0

# Enable SYN cookies (DDoS protection)
net.ipv4.tcp_syncookies = 1

# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Enable reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP ping requests (optional)
net.ipv4.icmp_echo_ignore_all = 1
```

```bash
# Apply changes
sudo sysctl -p
```

---

## Network Security

### TLS/SSL Configuration

**1. Generate TLS Certificate**
```bash
# Self-signed (for testing)
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
  -keyout ~/.kubercoin/tls.key \
  -out ~/.kubercoin/tls.crt

# Production: Get certificate from Let's Encrypt
sudo certbot certonly --standalone -d node.yourdomain.com
```

**2. Configure Node for TLS**
```bash
# Edit kubercoin.conf
nano ~/.kubercoin/kubercoin.conf
```

Add:
```ini
# Enable TLS for RPC
rpcssl=1
rpcsslcertificatechainfile=/home/kubercoin/.kubercoin/tls.crt
rpcsslprivatekeyfile=/home/kubercoin/.kubercoin/tls.key

# Require strong ciphers
rpcsslciphers=TLSv1.2+HIGH:!aNULL:!MD5:!RC4
```

### Tor Integration (Privacy)

**1. Install Tor**
```bash
sudo apt install tor
```

**2. Configure Tor**
```bash
sudo nano /etc/tor/torrc
```

Add:
```
# Hidden service for KuberCoin
HiddenServiceDir /var/lib/tor/kubercoin/
HiddenServicePort 8633 127.0.0.1:8633
```

**3. Start Tor**
```bash
sudo systemctl enable tor
sudo systemctl start tor

# Get onion address
sudo cat /var/lib/tor/kubercoin/hostname
```

**4. Configure Node**
```ini
# In kubercoin.conf
proxy=127.0.0.1:9050
listen=1
onlynet=onion
```

### DDoS Protection

**1. Rate Limiting**
```bash
# IPTables rate limiting
sudo iptables -A INPUT -p tcp --dport 8633 -m state --state NEW -m recent --set
sudo iptables -A INPUT -p tcp --dport 8633 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP
```

**2. Connection Limits**
```ini
# In kubercoin.conf
maxconnections=125
maxuploadtarget=500
```

**3. Use Cloudflare (for RPC API)**
- Set up Cloudflare account
- Enable DDoS protection
- Enable rate limiting

---

## Node Security

### Configuration Best Practices

**kubercoin.conf (Production)**
```ini
# Network
listen=1
maxconnections=125
maxuploadtarget=500

# RPC Security
server=1
rpcuser=YOUR_RPC_USER
rpcpassword=STRONG_RANDOM_PASSWORD_HERE
rpcallowip=127.0.0.1
rpcssl=1

# Disable dangerous RPC commands
disablewallet=0

# Tor
proxy=127.0.0.1:9050
onlynet=onion

# Logging
debug=0
logtimestamps=1
logips=0

# Memory pool
maxmempool=300
mempoolexpiry=72

# Performance
dbcache=4000
maxorphantx=10
```

**Generate Strong RPC Password**
```bash
# Generate 32-character random password
openssl rand -base64 32
```

### Disable Dangerous Features

**1. Disable Wallet RPC (if not needed)**
```ini
disablewallet=1
```

**2. Restrict RPC Commands**
Create `rpc-whitelist.conf`:
```ini
# Allow only specific RPC commands
rpcwhitelist=user1:getblockchaininfo,getinfo
rpcwhitelist=user2:getblockchaininfo,getinfo,sendrawtransaction
```

### Monitoring & Logs

**1. Enable Logging**
```ini
# In kubercoin.conf
debug=net,mempool,http,rpc
logtimestamps=1
```

**2. Log Rotation**
```bash
# Create logrotate config
sudo nano /etc/logrotate.d/kubercoin
```

Add:
```
/home/kubercoin/.kubercoin/debug.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

## Wallet Security

### Hot Wallet (Online)

**1. Encrypt Wallet**
```bash
# Encrypt with strong passphrase
kubercoin-cli encryptwallet "your-very-strong-passphrase-here"

# Verify encryption
kubercoin-cli getwalletinfo | grep unlocked
```

**2. Backup Wallet**
```bash
# Backup encrypted wallet
kubercoin-cli backupwallet /secure/location/wallet-backup.dat

# Backup to remote location
scp ~/.kubercoin/wallets/wallet.dat user@backup-server:/backups/
```

**3. Passphrase Best Practices**
- Minimum 20 characters
- Mix of uppercase, lowercase, numbers, symbols
- Use diceware or password manager
- Never store digitally
- Write on paper, store in safe

### Cold Wallet (Offline)

**1. Generate on Air-Gapped Computer**
```bash
# On computer NEVER connected to internet
kubercoin-cli getnewaddress "cold-storage"
kubercoin-cli dumpprivkey "ADDRESS"

# Write down private key and address on paper
# Store in fireproof safe or bank vault
```

**2. Verify Address**
```bash
# On online computer, verify address exists on blockchain
kubercoin-cli validateaddress "COLD_ADDRESS"
```

**3. Sign Transactions Offline**
```bash
# On online computer: create unsigned transaction
kubercoin-cli createrawtransaction '[{"txid":"abc","vout":0}]' '{"address":0.1}'

# Transfer to offline computer (USB)
# On offline computer: sign transaction
kubercoin-cli signrawtransactionwithwallet "UNSIGNED_TX_HEX"

# Transfer signed tx back to online computer
# On online computer: broadcast
kubercoin-cli sendrawtransaction "SIGNED_TX_HEX"
```

### Multi-Signature Wallets

**1. Create 2-of-3 Multisig**
```bash
# Generate 3 addresses on 3 different computers
kubercoin-cli getnewaddress
kubercoin-cli getaddressinfo "ADDRESS" | grep pubkey

# Create multisig address
kubercoin-cli createmultisig 2 '["pubkey1","pubkey2","pubkey3"]'

# Save multisig address and redeem script
```

**2. Spend from Multisig**
```bash
# Create transaction
kubercoin-cli createrawtransaction ...

# Sign on computer 1
kubercoin-cli signrawtransactionwithwallet "TX_HEX"

# Sign on computer 2 (with partially signed tx)
kubercoin-cli signrawtransactionwithwallet "PARTIAL_TX_HEX"

# Broadcast fully signed tx
kubercoin-cli sendrawtransaction "FULLY_SIGNED_TX"
```

---

## Key Management

### Private Key Storage

**❌ NEVER DO:**
- Store in cloud (Google Drive, Dropbox, iCloud)
- Email to yourself
- Save in password manager (controversial)
- Screenshot or photograph
- Store on phone/computer unencrypted

**✅ DO:**
- Write on paper with pencil
- Stamp on metal (fireproof)
- Store in bank safe deposit box
- Use hardware wallet (Ledger/Trezor)
- Encrypt with strong passphrase if digital

### Hardware Security Modules (HSM)

**For Enterprise/High-Value:**

**1. AWS CloudHSM**
```rust
// Use CloudHSM for key storage
use aws_sdk_cloudhsm::Client;

// Store signing key in HSM
// Never expose private key
```

**2. YubiHSM**
```bash
# Generate key in HSM
yubihsm-shell
> generate asymmetrickey 0 <KEY_ID> "KuberCoin Signing Key" all sign-ecdsa secp256k1

# Sign with HSM
kubercoin-cli signrawtransactionwithkey "TX" --hsm --keyid=<KEY_ID>
```

### Key Rotation

**1. Create New Wallet**
```bash
# Generate new wallet
kubercoin-cli createwallet "new-wallet"

# Generate new addresses
kubercoin-cli getnewaddress

# Move funds from old addresses to new
kubercoin-cli sendtoaddress "NEW_ADDRESS" <AMOUNT>
```

**2. Rotate Every Year**
- For high-security: rotate every 3-6 months
- For normal use: rotate every 12 months
- Always keep old wallets for recovery

---

## Monitoring & Alerting

### Prometheus Monitoring

**1. Install Prometheus Exporter**
```bash
# KuberCoin exports metrics on :8334
```

**2. Configure Prometheus**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kubercoin'
    static_configs:
      - targets: ['localhost:8334']
```

**3. Key Metrics to Monitor**
- Node sync status
- Peer count
- Mempool size
- Block height
- Disk usage
- CPU/Memory usage

### Grafana Dashboards

**1. Install Grafana**
```bash
sudo apt install grafana
sudo systemctl start grafana-server
```

**2. Add Datasource**
- Add Prometheus datasource
- Import KuberCoin dashboard template

**3. Configure Alerts**
```yaml
# Alert if node falls behind
- alert: NodeBehind
  expr: kubercoin_block_height < (max(kubercoin_block_height) - 10)
  for: 10m

# Alert if no peers
- alert: NoPeers
  expr: kubercoin_peer_count == 0
  for: 5m

# Alert if mempool full
- alert: MempoolFull
  expr: kubercoin_mempool_size > 300
  for: 15m
```

### Log Monitoring

**1. Install Loki**
```bash
# Collect logs with Promtail
# Send to Loki
# Visualize in Grafana
```

**2. Alert on Errors**
```yaml
# Alert on repeated errors
- alert: FrequentErrors
  expr: rate(kubercoin_log_errors[5m]) > 1
  for: 5m
```

---

## Incident Response

### Security Incident Playbook

**1. Detect**
- Monitor alerts
- Check logs for anomalies
- Watch blockchain for unusual transactions

**2. Contain**
```bash
# If node compromised, stop immediately
kubercoin-cli stop

# Disconnect from network
sudo ufw deny 8633/tcp
```

**3. Investigate**
```bash
# Check logs
tail -f ~/.kubercoin/debug.log

# Check for unauthorized transactions
kubercoin-cli listtransactions

# Check wallet balance
kubercoin-cli getbalance
```

**4. Recover**
```bash
# Restore from backup
cp /backup/wallet.dat ~/.kubercoin/wallets/wallet.dat

# Change RPC password
nano ~/.kubercoin/kubercoin.conf

# Rotate keys
kubercoin-cli getnewaddress
# Move funds to new address
```

**5. Post-Mortem**
- Document what happened
- Identify root cause
- Implement preventive measures
- Update runbooks

### Breach Response

**If Private Keys Compromised:**
1. **ACT IMMEDIATELY**
2. Transfer all funds to new wallet (if possible)
3. Abandon compromised wallet
4. Never reuse those keys
5. Investigate how keys were stolen
6. Implement stronger security

**If Node Compromised:**
1. Stop node
2. Disconnect from network
3. Forensic analysis (preserve logs)
4. Rebuild from clean image
5. Restore wallet from backup
6. Change all passwords

---

## Security Checklist

### Pre-Deployment

- [ ] Operating system updated
- [ ] Firewall configured
- [ ] SSH hardened (keys only, non-standard port)
- [ ] Fail2Ban installed
- [ ] Dedicated user created (not root)
- [ ] TLS/SSL certificates configured
- [ ] Strong RPC password generated
- [ ] Tor configured (optional)
- [ ] Monitoring set up
- [ ] Alerting configured
- [ ] Backup strategy implemented
- [ ] Incident response plan documented

### Node Security

- [ ] RPC only listens on localhost
- [ ] RPC password is 32+ random characters
- [ ] Wallet encrypted with strong passphrase
- [ ] Wallet backed up to multiple locations
- [ ] Unnecessary RPC commands disabled
- [ ] Connection limits configured
- [ ] Upload limits configured
- [ ] Logs enabled and rotated
- [ ] Peer connections over Tor (optional)

### Wallet Security

- [ ] Wallet encrypted
- [ ] Backup in 3 locations (3-2-1 rule)
- [ ] Seed phrase written on paper
- [ ] Seed phrase in fireproof container
- [ ] Cold storage for large amounts
- [ ] Multisig for very large amounts
- [ ] Hardware wallet used (optional)
- [ ] Passphrase never stored digitally

### Operational Security

- [ ] Monitoring dashboard configured
- [ ] Alerts firing correctly
- [ ] On-call rotation established
- [ ] Runbooks documented
- [ ] Backups tested (can restore)
- [ ] Incident response plan tested
- [ ] Security audit completed (for production)
- [ ] Penetration testing completed (for production)

---

## Additional Resources

- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## Emergency Contacts

**Security Issues:**
- Email: connect@kuber-coin.com
- PGP Key: [fingerprint]

**Incident Response:**
- On-call: +1-XXX-XXX-XXXX
- Discord: @security-team

---

**Last Updated:** March 13, 2026  
**Version:** 1.0

**⚠️ REMEMBER: Security is an ongoing process, not a one-time setup!**
