# TLS/HTTPS Configuration for KuberCoin Node

This document describes how to configure TLS/HTTPS for secure communication.

## Development (Self-Signed Certificates)

For local development, the node automatically generates self-signed certificates on first startup.

Certificates are stored in:
- `/data/kubercoin/certs/cert.pem` - Certificate
- `/data/kubercoin/certs/key.pem` - Private key

### Using Self-Signed Certificates

When connecting to a development node with self-signed certs:

**Browser:** Accept the security warning (unsafe for production!)

**curl:**
```bash
curl --insecure https://localhost:8080/api/health
# or
curl -k https://localhost:8080/api/health
```

**Web Apps:** Configure to accept self-signed certificates in development mode.

## Production (Let's Encrypt)

For production deployments, use Let's Encrypt for free, trusted certificates.

### Option 1: Standalone Mode (Node handles ACME)

Set environment variables:
```bash
export KUBERCOIN_TLS_DOMAIN="node.kuber-coin.com"
export KUBERCOIN_TLS_EMAIL="connect@kuber-coin.com"
export KUBERCOIN_TLS_MODE="letsencrypt"
```

The node will:
1. Request certificates from Let's Encrypt
2. Automatically renew before expiration
3. Store certificates in `/data/kubercoin/certs/`

**Requirements:**
- Domain must point to your server's public IP
- Port 443 must be accessible from internet
- Valid email for certificate notifications

### Option 2: Reverse Proxy (Recommended)

Use nginx or Caddy as a reverse proxy:

**Caddy (automatic HTTPS):**
```
node.kuber-coin.com {
    reverse_proxy localhost:8080
}
```

**nginx + certbot:**
```nginx
server {
    listen 443 ssl http2;
    server_name node.kuber-coin.com;
    
    ssl_certificate /etc/letsencrypt/live/node.kuber-coin.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/node.kuber-coin.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:9090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Run certbot:
```bash
sudo certbot --nginx -d node.kuber-coin.com
```

## Disabling TLS (Not Recommended)

To disable TLS for development only:
```bash
export KUBERCOIN_TLS_ENABLED="false"
```

## Web Application Configuration

Update web apps to use secure protocols:

**Explorer Web (Next.js):**
```javascript
// .env.production
NEXT_PUBLIC_API_URL=https://node.kuber-coin.com
NEXT_PUBLIC_WS_URL=wss://node.kuber-coin.com/ws
```

**Wallet Web:**
```javascript
// config.js
const config = {
  apiUrl: process.env.NODE_ENV === 'production' 
    ? 'https://wallet-api.kuber-coin.com'
    : 'http://localhost:8080',
  wsUrl: process.env.NODE_ENV === 'production'
    ? 'wss://wallet-api.kuber-coin.com/ws'
    : 'ws://localhost:9090'
};
```

## Certificate Rotation

Certificates are automatically rotated:
- Let's Encrypt: Auto-renewed 30 days before expiration
- Self-signed: Regenerated on node restart if expired

## Troubleshooting

**Certificate expired:**
```bash
# Remove old certificates
rm -rf /data/kubercoin/certs/
# Restart node (will generate new certs)
systemctl restart kubercoin
```

**Port already in use:**
```bash
# Check what's using port 443
sudo lsof -i :443
# Stop conflicting service
sudo systemctl stop nginx  # or apache2, etc.
```

**Let's Encrypt rate limit:**
- Limit: 50 certificates per domain per week
- Use staging server for testing: `export KUBERCOIN_TLS_STAGING="true"`

## Security Best Practices

1. **Never commit private keys** to git
2. **Use strong cipher suites** (configured by default)
3. **Enable HSTS** in reverse proxy:
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```
4. **Monitor certificate expiration** (set up alerts)
5. **Rotate certificates** on security incidents

## Port Configuration

Default ports with TLS:
- **HTTPS API:** 8443 (or 443 with reverse proxy)
- **WSS WebSocket:** 9443 (or 443 with reverse proxy)  
- **JSON-RPC over TLS:** 8432 (optional)

Configure via environment:
```bash
export KUBERCOIN_HTTPS_PORT="8443"
export KUBERCOIN_WSS_PORT="9443"
```
