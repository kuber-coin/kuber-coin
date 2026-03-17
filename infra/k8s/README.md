# KuberCoin Kubernetes Deployment Guide

## Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Helm 3+ (optional)
- 100GB+ storage available
- cert-manager (for TLS)
- nginx-ingress-controller

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f k8s/deployment.yaml
```

This creates:
- `kubercoin` namespace
- ConfigMap with default settings
- PersistentVolumeClaim (100GB)
- Deployment (1 replica)
- Services (P2P, API, Metrics)
- Ingress (with TLS)
- HorizontalPodAutoscaler

### 2. Verify Deployment

```bash
# Check pod status
kubectl get pods -n kubercoin

# Check services
kubectl get svc -n kubercoin

# Check logs
kubectl logs -n kubercoin -l app=kubercoin --tail=100 -f
```

### 3. Deploy Monitoring (Optional)

```bash
kubectl apply -f k8s/monitoring.yaml
```

This deploys:
- Prometheus (metrics collection)
- Grafana (visualization)
- ServiceMonitor (auto-discovery)

Access Grafana:
```bash
kubectl port-forward -n kubercoin svc/grafana 3000:3000
# Open http://localhost:3000 using the configured Grafana credentials
```

## Configuration

### Environment Variables

Edit `kubercoin-config` ConfigMap:

```bash
kubectl edit configmap kubercoin-config -n kubercoin
```

Available settings:
- `RUST_LOG`: Log level (debug, info, warn, error)
- `KUBERCOIN_P2P_PORT`: P2P network port
- `KUBERCOIN_API_PORT`: REST API port
- `KUBERCOIN_RPC_PORT`: JSON-RPC port
- `KUBERCOIN_WS_PORT`: WebSocket port
- `KUBERCOIN_METRICS_PORT`: Prometheus metrics port
- `KUBERCOIN_TLS_ENABLED`: Enable TLS (true/false)
- `KUBERCOIN_UPNP_ENABLED`: Enable UPnP (true/false)
- `KUBERCOIN_BOOTSTRAP_PEERS`: Comma-separated peer list

### Storage

Default: 100GB PersistentVolumeClaim

To change:
```bash
kubectl edit pvc kubercoin-data -n kubercoin
```

Or modify `deployment.yaml`:
```yaml
resources:
  requests:
    storage: 500Gi  # Increase for mainnet
```

### Resource Limits

Default limits:
- Memory: 2-8 GB
- CPU: 1-4 cores

To change:
```bash
kubectl edit deployment kubercoin-node -n kubercoin
```

Or modify `deployment.yaml`:
```yaml
resources:
  requests:
    memory: "4Gi"
    cpu: "2000m"
  limits:
    memory: "16Gi"
    cpu: "8000m"
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment kubercoin-node -n kubercoin --replicas=3
```

### Auto-Scaling

HorizontalPodAutoscaler is pre-configured:
- Min replicas: 1
- Max replicas: 3
- CPU threshold: 70%
- Memory threshold: 80%

To adjust:
```bash
kubectl edit hpa kubercoin-hpa -n kubercoin
```

## Networking

### Expose P2P Port

For external peers:

```bash
# Get LoadBalancer IP
kubectl get svc kubercoin-p2p -n kubercoin

# Or use NodePort
kubectl patch svc kubercoin-p2p -n kubercoin -p '{"spec":{"type":"NodePort"}}'
```

### Ingress Configuration

Edit `kubercoin-ingress` in `deployment.yaml`:

```yaml
spec:
  tls:
  - hosts:
    - your-domain.com  # Change this
    secretName: kubercoin-tls
  rules:
  - host: your-domain.com  # Change this
```

Apply changes:
```bash
kubectl apply -f k8s/deployment.yaml
```

## Monitoring

### Prometheus Metrics

Metrics endpoint: `http://kubercoin-metrics:9091/metrics`

Available metrics:
- `kubercoin_block_height` - Current blockchain height
- `kubercoin_mempool_size` - Transactions in mempool
- `kubercoin_peers` - Connected peers
- `kubercoin_ws_connections` - Active WebSocket connections
- `kubercoin_http_requests_total` - HTTP request counter
- `kubercoin_utxo_count` - Total UTXOs
- `kubercoin_total_value_satoshis` - Total value locked
- `kubercoin_uptime_seconds` - Node uptime

### Health Checks

Liveness probe: `GET /api/health` (every 30s)
Readiness probe: `GET /api/health` (every 10s)

To check manually:
```bash
kubectl exec -n kubercoin <pod-name> -- curl -s http://localhost:8080/api/health
```

### Grafana Dashboards

Access Grafana:
```bash
kubectl port-forward -n kubercoin svc/grafana 3000:3000
```

Default credentials: `admin` / `admin`

Pre-configured dashboard shows:
- Block height over time
- Mempool size
- Peer connections
- HTTP request rate
- WebSocket connections
- UTXO metrics
- Node uptime

## Backup and Recovery

### Backup Blockchain Data

```bash
# Create snapshot
kubectl exec -n kubercoin <pod-name> -- tar czf /tmp/backup.tar.gz /data/kubercoin

# Copy to local
kubectl cp kubercoin/<pod-name>:/tmp/backup.tar.gz ./backup.tar.gz
```

### Restore from Backup

```bash
# Copy backup to pod
kubectl cp ./backup.tar.gz kubercoin/<pod-name>:/tmp/backup.tar.gz

# Extract
kubectl exec -n kubercoin <pod-name> -- tar xzf /tmp/backup.tar.gz -C /
```

### Volume Snapshots

If using CSI driver with snapshot support:

```bash
# Create VolumeSnapshot
kubectl apply -f - <<EOF
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: kubercoin-snapshot
  namespace: kubercoin
spec:
  source:
    persistentVolumeClaimName: kubercoin-data
EOF
```

## Troubleshooting

### Pod Not Starting

```bash
# Check events
kubectl describe pod -n kubercoin <pod-name>

# Check logs
kubectl logs -n kubercoin <pod-name>

# Check resource constraints
kubectl top pod -n kubercoin <pod-name>
```

### No External Connectivity

```bash
# Check service
kubectl get svc kubercoin-p2p -n kubercoin

# Check LoadBalancer
kubectl describe svc kubercoin-p2p -n kubercoin

# Test from within cluster
kubectl run -it --rm debug --image=busybox --restart=Never -- telnet kubercoin-p2p 8633
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n kubercoin

# Check available space
kubectl exec -n kubercoin <pod-name> -- df -h /data/kubercoin

# Resize PVC (if supported)
kubectl patch pvc kubercoin-data -n kubercoin -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'
```

### High Memory Usage

```bash
# Check current usage
kubectl top pod -n kubercoin

# Increase limits
kubectl edit deployment kubercoin-node -n kubercoin
# Increase resources.limits.memory

# Restart pod
kubectl rollout restart deployment kubercoin-node -n kubercoin
```

## Security

### Network Policies

Create `NetworkPolicy` to restrict traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kubercoin-netpol
  namespace: kubercoin
spec:
  podSelector:
    matchLabels:
      app: kubercoin
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 8633  # P2P
    - protocol: TCP
      port: 8080  # API
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 8633  # P2P to other nodes
```

### Secrets Management

Store sensitive data in Secrets:

```bash
# Create API key secret
kubectl create secret generic kubercoin-secrets \
  --from-literal=api-key=your-secret-key \
  -n kubercoin

# Reference in deployment
env:
- name: KUBERCOIN_API_KEYS
  valueFrom:
    secretKeyRef:
      name: kubercoin-secrets
      key: api-key
```

### Pod Security

Add security context:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL
```

## Production Best Practices

1. **High Availability**
   - Run 3+ replicas across different availability zones
   - Use pod anti-affinity rules
   - Configure proper resource requests/limits

2. **Monitoring**
   - Enable Prometheus metrics
   - Set up Grafana dashboards
   - Configure alerting (Alertmanager)

3. **Backup Strategy**
   - Daily volume snapshots
   - Store backups offsite
   - Test recovery procedures

4. **Security**
   - Enable TLS for all endpoints
   - Use Network Policies
   - Keep images updated
   - Scan for vulnerabilities

5. **Performance**
   - Use fast storage (SSD/NVMe)
   - Allocate sufficient memory (8GB+)
   - Tune resource limits based on load

## Helm Chart (Optional)

For easier management, create Helm chart:

```bash
helm create kubercoin
# Copy manifests to templates/
helm install kubercoin ./kubercoin -n kubercoin
```

Benefits:
- Version management
- Easy upgrades
- Templating support
- Values override

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to Kubernetes
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up kubectl
        uses: azure/setup-kubectl@v3
      - name: Deploy
        run: |
          kubectl apply -f k8s/deployment.yaml
          kubectl rollout status deployment/kubercoin-node -n kubercoin
```

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)
- [Grafana](https://grafana.com/docs/)
- [cert-manager](https://cert-manager.io/)

---

**Version**: 1.0.0  
**Last Updated**: January 31, 2026
