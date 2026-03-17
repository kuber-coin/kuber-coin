# KuberCoin Helm Chart

Production-ready Helm chart for deploying KuberCoin blockchain nodes on Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.0+
- PV provisioner support in the underlying infrastructure

## Installation

### Quick Start

```bash
# Add repository (if published)
helm repo add kubercoin https://charts.kuber-coin.com
helm repo update

# Install with default values
helm install kubercoin kubercoin/kubercoin

# Install with custom values
helm install kubercoin kubercoin/kubercoin -f custom-values.yaml
```

### Install from source

```bash
# Clone repository
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin

# Install chart
helm install kubercoin ./helm/kubercoin
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Image repository | `kubercoin/node` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Deployment Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `1` |
| `resources.limits.cpu` | CPU limit | `4000m` |
| `resources.limits.memory` | Memory limit | `8Gi` |
| `resources.requests.cpu` | CPU request | `1000m` |
| `resources.requests.memory` | Memory request | `2Gi` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.api.port` | API port | `8080` |
| `service.rpc.port` | RPC port | `8332` |
| `service.p2p.type` | P2P service type | `LoadBalancer` |
| `service.p2p.port` | P2P port | `8633` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.hosts[0].host` | Hostname | `api.kubercoin.local` |
| `ingress.tls[0].secretName` | TLS secret name | `kubercoin-tls` |

### Persistence Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `standard` |
| `persistence.size` | Storage size | `100Gi` |
| `persistence.accessMode` | Access mode | `ReadWriteOnce` |

### Autoscaling Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `1` |
| `autoscaling.maxReplicas` | Maximum replicas | `3` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `70` |
| `autoscaling.targetMemoryUtilizationPercentage` | Target Memory % | `80` |

### Monitoring Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `monitoring.enabled` | Enable monitoring | `true` |
| `monitoring.prometheus.enabled` | Enable Prometheus | `true` |
| `monitoring.grafana.enabled` | Enable Grafana | `true` |
| `monitoring.grafana.adminPassword` | Grafana admin password | `admin` |

## Examples

### Production Deployment

```yaml
# production-values.yaml
replicaCount: 3

image:
  tag: "v1.0.0"
  pullPolicy: Always

resources:
  limits:
    cpu: 8000m
    memory: 16Gi
  requests:
    cpu: 2000m
    memory: 4Gi

persistence:
  enabled: true
  storageClass: "fast-ssd"
  size: 500Gi

ingress:
  enabled: true
  hosts:
    - host: api.kuber-coin.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kubercoin-prod-tls
      hosts:
        - api.kuber-coin.com

monitoring:
  prometheus:
    enabled: true
  grafana:
    enabled: true
    adminPassword: "secure-password"

config:
  network: mainnet
  logLevel: info
```

Deploy:
```bash
helm install kubercoin ./helm/kubercoin -f production-values.yaml
```

### Development Deployment

```yaml
# dev-values.yaml
replicaCount: 1

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

persistence:
  enabled: false

ingress:
  enabled: false

autoscaling:
  enabled: false

config:
  network: testnet
  logLevel: debug
```

Deploy:
```bash
helm install kubercoin-dev ./helm/kubercoin -f dev-values.yaml
```

## Upgrading

```bash
# Upgrade to new version
helm upgrade kubercoin kubercoin/kubercoin --version 1.1.0

# Upgrade with new values
helm upgrade kubercoin kubercoin/kubercoin -f new-values.yaml
```

## Uninstalling

```bash
# Uninstall release
helm uninstall kubercoin

# Uninstall and delete PVCs
helm uninstall kubercoin
kubectl delete pvc -l app.kubernetes.io/instance=kubercoin
```

## Backup and Restore

The chart supports automated backups using CronJobs:

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention: 30
  s3:
    bucket: "my-kubercoin-backups"
    region: "us-east-1"
```

## Monitoring

Access monitoring dashboards:

```bash
# Port-forward Grafana
kubectl port-forward svc/grafana 3000:3000 -n kubercoin

# Port-forward Prometheus
kubectl port-forward svc/prometheus 9090:9090 -n kubercoin
```

Default credentials:
- Grafana: set through your values file or referenced secret

## Troubleshooting

View logs:
```bash
kubectl logs -f deployment/kubercoin -n kubercoin
```

Check pod status:
```bash
kubectl get pods -n kubercoin
kubectl describe pod <pod-name> -n kubercoin
```

Check events:
```bash
kubectl get events -n kubercoin --sort-by='.lastTimestamp'
```

## Support

- Documentation: https://kuber-coin.com/docs
- Issues: https://github.com/kubercoin/kubercoin/issues
- Chat: https://discord.gg/kubercoin
