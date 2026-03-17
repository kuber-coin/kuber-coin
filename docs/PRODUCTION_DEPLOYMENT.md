# KuberCoin Production Deployment Guide

## Overview

This guide covers best practices for deploying KuberCoin in production environments, including security hardening, performance optimization, monitoring, and disaster recovery.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [TLS/SSL Configuration](#tlsssl-configuration)
3. [Reverse Proxy Setup](#reverse-proxy-setup)
4. [Authentication & Authorization](#authentication--authorization)
5. [Rate Limiting](#rate-limiting)
6. [Backup Strategies](#backup-strategies)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Security Hardening](#security-hardening)
9. [Performance Tuning](#performance-tuning)
10. [Disaster Recovery](#disaster-recovery)

## Prerequisites

- Ubuntu 22.04 LTS or similar Linux distribution
- Docker 24.0+ and Docker Compose 2.20+
- Minimum 4GB RAM, 20GB disk space
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)

## TLS/SSL Configuration

### Using Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --standalone -d kubercoin.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/kubercoin.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/kubercoin.yourdomain.com/privkey.pem
```

### Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet --post-hook "docker compose restart nginx"
```

## Reverse Proxy Setup

### Nginx Configuration

Create `/etc/nginx/sites-available/kubercoin`:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=5r/s;

# Upstream definitions
upstream kubercoin_node {
  server localhost:8634;
    keepalive 32;
}

upstream kubercoin_wallet_api {
  server localhost:3250;
    keepalive 32;
}

upstream kubercoin_explorer {
    server localhost:3200;
}

upstream kubercoin_wallet {
    server localhost:3250;
}

upstream kubercoin_ops {
    server localhost:3300;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kubercoin.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/kubercoin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kubercoin.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Explorer Web UI
    location / {
        proxy_pass http://kubercoin_explorer;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Wallet Web UI
    location /wallet {
        proxy_pass http://kubercoin_wallet;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Operations Dashboard
    location /ops {
        # Require basic auth for ops dashboard
        auth_basic "Operations Dashboard";
        auth_basic_user_file /etc/nginx/.htpasswd;
        
        proxy_pass http://kubercoin_ops;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # RPC API
    location /rpc {
        limit_req zone=rpc_limit burst=10 nodelay;
        
        proxy_pass http://kubercoin_node;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Require API key
        if ($http_authorization = "") {
            return 401;
        }
    }

    # REST API
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://kubercoin_wallet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Metrics (internal only)
    location /metrics {
        allow 10.0.0.0/8;    # Private network
        allow 172.16.0.0/12;
        deny all;
        
      proxy_pass http://localhost:8634/metrics;
    }
}

# HTTP redirect
server {
    listen 80;
    listen [::]:80;
    server_name kubercoin.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/kubercoin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Authentication & Authorization

### API Key Generation

```bash
# Generate secure API key
docker exec -it kubercoin-node kubercoin-cli generate-api-key

# Output: Generated API key: abc123...xyz789
# Store securely in password manager
```

### Environment Variables

Create `.env.production`:

```bash
# API Authentication
KUBERCOIN_API_AUTH_ENABLED=true
KUBERCOIN_API_KEYS=key1,key2,key3

# Rate Limiting
KUBERCOIN_RATE_LIMIT_PER_MIN=60
KUBERCOIN_RATE_LIMIT_PER_HOUR=1000

# Database
KUBERCOIN_DATA_DIR=/data/kubercoin
KUBERCOIN_BACKUP_DIR=/backup/kubercoin

# Logging
RUST_LOG=info,kubercoin=debug
KUBERCOIN_LOG_JSON=true

# Security
KUBERCOIN_DISABLE_MINING=true  # Only for pure nodes
```

## Rate Limiting

Rate limiting is implemented at multiple layers:

1. **Nginx Level**: 10 req/s for API, 5 req/s for RPC
2. **Application Level**: Token bucket algorithm (60 req/min default)
3. **Per-IP Tracking**: Automatic cleanup after 1 hour

Configure in your production compose override:

```yaml
environment:
  - KUBERCOIN_RATE_LIMIT_ENABLED=true
  - KUBERCOIN_RATE_LIMIT_PER_MIN=60
```

## Backup Strategies

### Automated Backups

Create `/usr/local/bin/backup-kubercoin.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/backup/kubercoin"
DATA_DIR="/data/kubercoin"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup blockchain data
echo "Backing up blockchain data..."
tar -czf "$BACKUP_DIR/chainstate_$DATE.tar.gz" \
    -C "$DATA_DIR" chain.db utxo.db

# Backup wallets (encrypted)
echo "Backing up wallets..."
tar -czf "$BACKUP_DIR/wallets_$DATE.tar.gz" \
    -C "$DATA_DIR" *.json

# Backup configuration
echo "Backing up configuration..."
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    /opt/kubercoin/docker-compose.yml \
    /opt/kubercoin/.env

# Remove old backups
echo "Cleaning old backups..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Upload to S3 (optional)
if [ ! -z "$AWS_S3_BUCKET" ]; then
    echo "Uploading to S3..."
    aws s3 sync "$BACKUP_DIR" "s3://$AWS_S3_BUCKET/kubercoin/" \
        --storage-class STANDARD_IA
fi

echo "Backup completed: $DATE"
```

Add to crontab:

```bash
# Daily backups at 2 AM
0 2 * * * /usr/local/bin/backup-kubercoin.sh >> /var/log/kubercoin-backup.log 2>&1
```

### Restore Procedure

```bash
# Stop services
docker compose down

# Restore from backup
cd /data/kubercoin
tar -xzf /backup/kubercoin/chainstate_20260130_020000.tar.gz
tar -xzf /backup/kubercoin/wallets_20260130_020000.tar.gz

# Start services
docker compose up -d

# Verify integrity
docker exec kubercoin-node kubercoin-cli getblockchaininfo
```

## Monitoring & Alerting

### Prometheus Configuration

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - "alerts.yml"

scrape_configs:
  - job_name: 'kubercoin-node'
    static_configs:
      - targets: ['node:8634']
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Alert Rules

Create `alerts.yml`:

```yaml
groups:
  - name: kubercoin_alerts
    interval: 30s
    rules:
      - alert: NodeDown
        expr: up{job="kubercoin-node"} == 0
        for: 5m
        annotations:
          summary: "KuberCoin node is down"
          
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes > 3e9
        for: 10m
        annotations:
          summary: "Node using >3GB RAM"
          
      - alert: ChainStalled
        expr: increase(kubercoin_blocks_total[10m]) == 0
        for: 30m
        annotations:
          summary: "No new blocks in 30 minutes"
          
      - alert: HighErrorRate
        expr: rate(kubercoin_rpc_errors_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "RPC error rate >10%"
```

### Grafana Dashboards

Import the included dashboard:

1. Open Grafana at http://yourserver:3000
2. Go to Dashboards → Import
3. Upload `monitoring-web/grafana/kubercoin-dashboard.json`

## Security Hardening

### Firewall Configuration

```bash
# UFW setup
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8633/tcp  # P2P (if public node)
sudo ufw enable
```

### Docker Security

Update your production compose override:

```yaml
services:
  node:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - kubercoin-data:/data/kubercoin:rw
    user: "1000:1000"
```

### Secrets Management

Use Docker secrets instead of environment variables:

```bash
# Create secrets
echo "your-api-key" | docker secret create kubercoin_api_key -
echo "your-rpc-password" | docker secret create kubercoin_rpc_password -

# Update compose file
secrets:
  - kubercoin_api_key
  - kubercoin_rpc_password
```

## Performance Tuning

### System Limits

Add to `/etc/sysctl.conf`:

```conf
# Increase file descriptors
fs.file-max = 100000

# Network tuning
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.ip_local_port_range = 10000 65000

# Memory
vm.swappiness = 10
```

Apply:

```bash
sudo sysctl -p
```

### Resource Limits

Update your production compose override:

```yaml
services:
  node:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
```

## Disaster Recovery

### Recovery Time Objectives

- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 1 day

### Disaster Recovery Plan

1. **Daily backups** to multiple locations (local + cloud)
2. **Hot standby** node syncing in different datacenter
3. **Documented restore procedure** (above)
4. **Regular DR drills** (monthly)

### Monitoring Checklist

- [ ] Prometheus scraping all targets
- [ ] Grafana dashboards accessible
- [ ] Alert rules configured
- [ ] Alertmanager sending notifications
- [ ] Log aggregation working (optional: ELK stack)
- [ ] Backup job running daily
- [ ] Backup verification weekly

### Security Checklist

- [ ] TLS/SSL certificates valid
- [ ] API authentication enabled
- [ ] Rate limiting configured
- [ ] Firewall rules applied
- [ ] Security headers set in nginx
- [ ] Regular security updates scheduled
- [ ] Secrets properly managed
- [ ] Audit logging enabled
- [ ] Intrusion detection configured (optional)

## Maintenance

### Regular Tasks

**Daily:**
- Check monitoring dashboards
- Review error logs
- Verify backup completion

**Weekly:**
- Test backup restoration
- Review security logs
- Check for updates

**Monthly:**
- Disaster recovery drill
- Security audit
- Performance review
- Certificate renewal check

### Update Procedure

```bash
# Pull latest images
docker compose pull

# Backup before update
/usr/local/bin/backup-kubercoin.sh

# Update with rolling restart
docker compose up -d --no-deps --build node
docker compose up -d --no-deps --build explorer-web
docker compose up -d --no-deps --build wallet-web
docker compose up -d --no-deps --build ops-web

# Verify health
docker compose ps
curl -f https://kubercoin.yourdomain.com/api/health
```

## Support & Resources

- Documentation: https://kuber-coin.com/docs
- GitHub: https://github.com/kubercoin/kubercoin
- Discord: https://discord.gg/kubercoin
- Security: connect@kuber-coin.com

## License

MIT License - See LICENSE file for details
