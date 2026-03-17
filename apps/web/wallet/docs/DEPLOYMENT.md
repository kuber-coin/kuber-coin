# KuberCoin Wallet - Production Deployment Guide

Complete guide for deploying KuberCoin Wallet to production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Deployment](#docker-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Nginx Configuration](#nginx-configuration)
5. [SSL/TLS Setup](#ssltls-setup)
6. [Monitoring](#monitoring)
7. [Backup & Recovery](#backup--recovery)
8. [Scaling](#scaling)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Infrastructure Requirements

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 20GB minimum for application + logs
- **Network**: Static IP, port 80/443 open

### Software Requirements

```bash
Docker >= 20.10.0
Docker Compose >= 2.0.0
Kubernetes >= 1.25.0 (for K8s deployment)
kubectl >= 1.25.0
Nginx >= 1.20.0
Certbot (for SSL certificates)
```

### Domain Configuration

- Primary domain: `wallet.kuber-coin.com`
- Staging domain: `staging-wallet.kuber-coin.com`
- API endpoint: `api.kuber-coin.com`

---

## Docker Deployment

### Basic Docker Setup

**1. Build Docker Image**

```bash
cd wallet-web

# Build production image
docker build -t kubercoin/wallet-web:latest -f Dockerfile .

# Verify image
docker images | grep kubercoin
```

**2. Run Container**

```bash
docker run -d \
  --name kubercoin-wallet \
  -p 3250:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_NODE_URL=https://api.kuber-coin.com \
  -e NEXT_PUBLIC_NETWORK=mainnet \
  --restart unless-stopped \
  kubercoin/wallet-web:latest
```

**3. Verify Deployment**

```bash
# Check container status
docker ps | grep kubercoin-wallet

# View logs
docker logs kubercoin-wallet

# Test health endpoint
curl http://localhost:3250/health
```

### Docker Compose Deployment

**Create `docker-compose.prod.yml`:**

```yaml
version: '3.8'

services:
  wallet-web:
    image: kubercoin/wallet-web:latest
    container_name: kubercoin-wallet
    restart: unless-stopped
    ports:
      - "3250:3000"
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_NODE_URL: ${NODE_URL}
      NEXT_PUBLIC_EXPLORER_URL: ${EXPLORER_URL}
      NEXT_PUBLIC_NETWORK: mainnet
    networks:
      - kubercoin-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    image: nginx:alpine
    container_name: kubercoin-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/cache:/var/cache/nginx
    depends_on:
      - wallet-web
    networks:
      - kubercoin-network

  prometheus:
    image: prom/prometheus:latest
    container_name: kubercoin-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./infra/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - kubercoin-network

  grafana:
    image: grafana/grafana:latest
    container_name: kubercoin-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
      GF_INSTALL_PLUGINS: grafana-clock-panel
    volumes:
      - grafana-data:/var/lib/grafana
      - ./infra/monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./infra/monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    depends_on:
      - prometheus
    networks:
      - kubercoin-network

networks:
  kubercoin-network:
    driver: bridge

volumes:
  prometheus-data:
  grafana-data:
```

**Deploy with Docker Compose:**

```bash
# Create .env file
cat > .env << EOF
NODE_URL=https://api.kuber-coin.com
EXPLORER_URL=https://explorer.kuber-coin.com
GRAFANA_PASSWORD=your_secure_password
EOF

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f wallet-web
```

---

## Kubernetes Deployment

### Namespace Setup

```bash
# Create namespace
kubectl create namespace wallet-production

# Set as default
kubectl config set-context --current --namespace=wallet-production
```

### ConfigMap

**`k8s/configmap.yaml`:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: wallet-config
  namespace: wallet-production
data:
  NODE_ENV: "production"
  NEXT_PUBLIC_NETWORK: "mainnet"
  NEXT_PUBLIC_NODE_URL: "https://api.kuber-coin.com"
  NEXT_PUBLIC_EXPLORER_URL: "https://explorer.kuber-coin.com"
```

### Secret

```bash
# Create secret for sensitive data
kubectl create secret generic wallet-secrets \
  --from-literal=api-key=your_api_key \
  --namespace=wallet-production
```

### Deployment

**`k8s/deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wallet-web
  namespace: wallet-production
  labels:
    app: wallet-web
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: wallet-web
  template:
    metadata:
      labels:
        app: wallet-web
        version: v1
    spec:
      containers:
      - name: wallet-web
        image: kubercoin/wallet-web:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: wallet-config
        env:
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: wallet-secrets
              key: api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - wallet-web
              topologyKey: kubernetes.io/hostname
```

### Service

**`k8s/service.yaml`:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: wallet-web
  namespace: wallet-production
  labels:
    app: wallet-web
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: wallet-web
```

### Ingress

**`k8s/ingress.yaml`:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wallet-web
  namespace: wallet-production
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - wallet.kuber-coin.com
    secretName: wallet-tls
  rules:
  - host: wallet.kuber-coin.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wallet-web
            port:
              number: 80
```

### HorizontalPodAutoscaler

**`k8s/hpa.yaml`:**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: wallet-web
  namespace: wallet-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: wallet-web
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 2
        periodSeconds: 15
      selectPolicy: Max
```

### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Verify deployment
kubectl get pods -n wallet-production
kubectl get svc -n wallet-production
kubectl get ingress -n wallet-production

# Check logs
kubectl logs -f deployment/wallet-web -n wallet-production

# Check autoscaling
kubectl get hpa -n wallet-production
```

---

## Nginx Configuration

**`nginx/nginx.conf`:**

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/json application/javascript application/xml+rss 
               application/rss+xml font/truetype font/opentype 
               application/vnd.ms-fontobject image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    # Caching
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=STATIC:10m 
                     inactive=24h max_size=1g;

    upstream wallet_backend {
        least_conn;
        server wallet-web:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTP redirect to HTTPS
    server {
        listen 80;
        server_name wallet.kuber-coin.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name wallet.kuber-coin.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:MozSSL:10m;
        ssl_session_tickets off;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # HSTS
        add_header Strict-Transport-Security "max-age=63072000" always;

        # Rate limiting
        limit_req zone=general burst=200 nodelay;
        limit_conn addr 10;

        # Static files caching
        location /_next/static/ {
            proxy_pass http://wallet_backend;
            proxy_cache STATIC;
            proxy_cache_valid 200 1d;
            proxy_cache_use_stale error timeout http_500 http_502 http_503 http_504;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # API endpoints
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://wallet_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Main application
        location / {
            proxy_pass http://wallet_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Health check endpoint
        location /health {
            access_log off;
            proxy_pass http://wallet_backend;
        }
    }
}
```

---

## SSL/TLS Setup

### Using Certbot (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d wallet.kuber-coin.com

# Verify auto-renewal
sudo certbot renew --dry-run

# Auto-renewal cron job (already set up by certbot)
sudo systemctl status certbot.timer
```

### Manual SSL Certificate

```bash
# Generate SSL certificate
sudo mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl

# Create private key and CSR
sudo openssl req -new -newkey rsa:2048 -nodes \
  -keyout privkey.pem \
  -out csr.pem \
  -subj "/C=US/ST=State/L=City/O=KuberCoin/CN=wallet.kuber-coin.com"

# Get certificate from CA and save as fullchain.pem
# Then restart Nginx
sudo systemctl restart nginx
```

---

## Monitoring

### Prometheus Configuration

**`infra/monitoring/prometheus.yml`:**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'wallet-web'
    static_configs:
      - targets: ['wallet-web:3000']
    metrics_path: '/api/metrics'
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
  
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

### Grafana Dashboards

Access Grafana at `http://your-server:3000`

**Pre-configured dashboards**:
1. Application Metrics
2. System Resources
3. Nginx Performance
4. User Activity

---

## Backup & Recovery

### Automated Backup Script

**`scripts/backup.sh`:**

```bash
#!/bin/bash

BACKUP_DIR="/backups/wallet"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Docker volumes
docker run --rm \
  -v wallet-data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/wallet-data-$DATE.tar.gz -C /data .

# Backup configurations
tar czf $BACKUP_DIR/config-$DATE.tar.gz \
  nginx/ \
  k8s/ \
  .env \
  docker-compose.prod.yml

# Remove old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

### Restore Procedure

```bash
# Stop services
docker-compose -f docker-compose.prod.yml down

# Restore data
tar xzf /backups/wallet/wallet-data-TIMESTAMP.tar.gz -C /var/lib/docker/volumes/wallet-data/_data

# Restore configs
tar xzf /backups/wallet/config-TIMESTAMP.tar.gz

# Start services
docker-compose -f docker-compose.prod.yml up -d
```

---

## Scaling

### Horizontal Scaling (Docker Swarm)

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml kubercoin

# Scale service
docker service scale kubercoin_wallet-web=5

# Check replicas
docker service ps kubercoin_wallet-web
```

### Vertical Scaling

Update resource limits in `docker-compose.prod.yml`:

```yaml
services:
  wallet-web:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

---

## Troubleshooting

### Common Issues

**Issue**: Container keeps restarting

```bash
# Check logs
docker logs kubercoin-wallet --tail 100

# Check health
docker inspect kubercoin-wallet | grep -A 10 Health
```

**Issue**: High memory usage

```bash
# Check resource usage
docker stats kubercoin-wallet

# Increase memory limit
docker update --memory 2g kubercoin-wallet
```

**Issue**: Slow response times

```bash
# Check Nginx logs
tail -f /var/log/nginx/access.log

# Enable debug logging
docker-compose logs -f wallet-web
```

---

**Version**: 1.0.0  
**Last Updated**: February 3, 2026  

For support: connect@kuber-coin.com
