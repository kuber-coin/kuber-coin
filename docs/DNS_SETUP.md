<!-- markdownlint-disable MD040 MD033 MD056 MD047 MD025 -->
# KuberCoin DNS & Domain Configuration
## Domain: kuber-coin.com

## Testnet Seed Node DNS Records (⚠️ ACTION REQUIRED)

These two A records must be added at your DNS registrar to enable automatic
peer discovery for the public testnet:

```text
testnet-seed.kuber-coin.com.  A  <TESTNET_SEED_IP_1>
testnet2.kuber-coin.com.      A  <TESTNET_SEED_IP_2>
```

TTL: 300 seconds (5 min) so operators get quick failover if IPs change.

These hostnames are hardcoded in `crates/core/testnet/src/lib.rs` `dns_seeds()`
and are used by every new node as fallback bootstrap when the hardcoded seed IPs
are unreachable.

Status: configure these records once your testnet seed infrastructure is live.

---

## Production DNS Records
Configure the following DNS records with your DNS provider:

### A Records (IPv4)
Point all subdomains to your server's IP address:

```text
kuber-coin.com.              A     <YOUR_SERVER_IP>
www.kuber-coin.com.          A     <YOUR_SERVER_IP>
wallet.kuber-coin.com.       A     <YOUR_SERVER_IP>
explorer.kuber-coin.com.     A     <YOUR_SERVER_IP>
node.kuber-coin.com.         A     <YOUR_SERVER_IP>
rpc.kuber-coin.com.          A     <YOUR_SERVER_IP>
docs.kuber-coin.com.         A     <YOUR_SERVER_IP>
dapp.kuber-coin.com.         A     <YOUR_SERVER_IP>
```

### AAAA Records (IPv6) - Optional

```text
kuber-coin.com.              AAAA  <YOUR_SERVER_IPV6>
wallet.kuber-coin.com.       AAAA  <YOUR_SERVER_IPV6>
...
```

### CNAME Records (Alternative)
If using a load balancer or CDN:

```text
www.kuber-coin.com.          CNAME kuber-coin.com.
wallet.kuber-coin.com.       CNAME kuber-coin.com.
explorer.kuber-coin.com.     CNAME kuber-coin.com.
node.kuber-coin.com.         CNAME kuber-coin.com.
rpc.kuber-coin.com.          CNAME kuber-coin.com.
docs.kuber-coin.com.         CNAME kuber-coin.com.
dapp.kuber-coin.com.         CNAME kuber-coin.com.
```

## Domain Mapping
| Domain | Service | Port | Description |
|--------|---------|------|-------------|
| kuber-coin.com | web-unified | 3000 | Main landing page |
| www.kuber-coin.com | web-unified | 3000 | Redirects to kuber-coin.com |
| wallet.kuber-coin.com | wallet-web | 3000 | Web wallet interface |
| explorer.kuber-coin.com | explorer-web | 3000 | Blockchain explorer |
| node.kuber-coin.com | node | 8081/9090 | REST API & WebSocket |
| rpc.kuber-coin.com | node | 8332 | JSON-RPC API (authenticated) |
| docs.kuber-coin.com | static/docs | - | Documentation |
| dapp.kuber-coin.com | web-unified | 3000 | Decentralized app interface |

## Deployment Commands
### Docker Compose (Production)

```bash
# 1. Create and configure environment
cat > .env.production <<'EOF'
MAIN_DOMAIN=kuber-coin.com
WALLET_DOMAIN=wallet.kuber-coin.com
EXPLORER_DOMAIN=explorer.kuber-coin.com
NODE_DOMAIN=node.kuber-coin.com
API_DOMAIN=api.kuber-coin.com
WS_DOMAIN=ws.kuber-coin.com
RPC_DOMAIN=rpc.kuber-coin.com
DOCS_DOMAIN=docs.kuber-coin.com
DAPP_DOMAIN=dapp.kuber-coin.com
OPS_DOMAIN=ops.kuber-coin.com
KUBERCOIN_ACME_EMAIL=replace-with-your-email@example.com
KUBERCOIN_NETWORK=mainnet
RPC_USER=kubercoin_rpc
RPC_PASSWORD=replace-with-a-long-random-password
KUBERCOIN_API_KEYS=replace-with-a-32-byte-random-api-key
OPS_AUTH_USER=admin
OPS_AUTH_HASH=replace-with-caddy-hash
EOF

# Edit .env.production with your values

# 2. Generate password hashes for Caddy
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-password'

# 3. Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d

# 4. Check status
docker compose ps

# 5. View logs
docker compose logs -f caddy
```

### Kubernetes

```bash
# 1. Create namespace
kubectl create namespace kubercoin

# 2. Create secrets
kubectl create secret generic kubercoin-rpc-auth \
  --from-literal=auth='admin:$apr1$...' \
  -n kubercoin

# 3. Apply configurations
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/deployment.yaml

# 4. Verify
kubectl get ingress -n kubercoin
kubectl get pods -n kubercoin
```

## SSL/TLS Certificates
### Automatic (Caddy)
Caddy automatically obtains and renews Let's Encrypt certificates.
Ensure:
- Port 80 and 443 are accessible from the internet
- DNS records are properly configured
- `KUBERCOIN_ACME_EMAIL` is set in `.env.production`

### Automatic (Kubernetes with cert-manager)
cert-manager handles certificates automatically using the ClusterIssuer defined in `k8s/ingress.yaml`.

### Manual SSL Setup
If needed, place certificates in:

```text
./caddy/certs/kuber-coin.com.crt
./caddy/certs/kuber-coin.com.key
```

## Firewall Rules
Required ports:

| Port | Protocol | Service | Public |
|------|----------|---------|--------|
| 80 | TCP | HTTP (redirect to HTTPS) | Yes |
| 443 | TCP | HTTPS | Yes |
| 443 | UDP | HTTPS/QUIC (HTTP/3) | Yes |
| 8633 | TCP | P2P Network | Yes |

Internal only (do not expose):

| Port | Protocol | Service |
|------|----------|---------|
| 8332 | TCP | RPC API (via Caddy auth) |
| 8081 | TCP | REST API (via Caddy) |
| 9090 | TCP | WebSocket (via Caddy) |
| 9091 | TCP | Metrics |
| 3000 | TCP | Web UIs |

## Testing

```bash
# Test main site
curl -I https://kuber-coin.com

# Test wallet
curl -I https://wallet.kuber-coin.com

# Test explorer
curl -I https://explorer.kuber-coin.com

# Test node API
curl https://node.kuber-coin.com/api/health

# Test WebSocket
wscat -c wss://node.kuber-coin.com/ws

# Test RPC (with auth)
curl -u admin:password -X POST https://rpc.kuber-coin.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
```

## Troubleshooting
### Certificate Issues

```bash
# Check Caddy logs
docker compose logs caddy | grep -i "tls\|cert\|acme"

# Force certificate renewal
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Connection Refused

```bash
# Check if services are running
docker compose ps

# Check service health
docker compose exec node curl http://localhost:8081/api/health
```

### DNS Not Resolving

```bash
# Check DNS propagation
dig kuber-coin.com
dig wallet.kuber-coin.com

# Clear DNS cache
ipconfig /flushdns  # Windows
sudo systemd-resolve --flush-caches  # Linux
```
