#!/bin/bash
# GCP GKE Deployment Script for KuberCoin
# Usage: ./deploy-gcp.sh [environment] [zone]
# Example: ./deploy-gcp.sh production us-central1-a

set -e

ENVIRONMENT=${1:-staging}
ZONE=${2:-us-central1-a}
REGION=${ZONE%-*}
PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project)}
CLUSTER_NAME="kubercoin-${ENVIRONMENT}"

echo "=========================================="
echo "KuberCoin GCP Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Zone: $ZONE"
echo "Project: $PROJECT_ID"
echo "Cluster: $CLUSTER_NAME"
echo "=========================================="

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        echo "Error: gcloud CLI not installed"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        echo "Error: kubectl not installed"
        exit 1
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        echo "Error: GCP_PROJECT_ID not set"
        exit 1
    fi
    
    echo "✓ All prerequisites met"
}

# Enable required APIs
enable_apis() {
    echo "Enabling required GCP APIs..."
    gcloud services enable container.googleapis.com --project="$PROJECT_ID"
    gcloud services enable compute.googleapis.com --project="$PROJECT_ID"
    echo "✓ APIs enabled"
}

# Create GKE cluster if it doesn't exist
create_cluster() {
    echo "Checking if cluster exists..."
    
    if gcloud container clusters describe "$CLUSTER_NAME" --zone="$ZONE" --project="$PROJECT_ID" &> /dev/null; then
        echo "✓ Cluster $CLUSTER_NAME already exists"
    else
        echo "Creating GKE cluster..."
        gcloud container clusters create "$CLUSTER_NAME" \
            --zone="$ZONE" \
            --project="$PROJECT_ID" \
            --machine-type=n1-standard-2 \
            --num-nodes=3 \
            --enable-autoscaling \
            --min-nodes=1 \
            --max-nodes=5 \
            --enable-autorepair \
            --enable-autoupgrade \
            --enable-stackdriver-kubernetes
        
        echo "✓ Cluster created successfully"
    fi
}

# Configure kubectl context
configure_kubectl() {
    echo "Configuring kubectl context..."
    gcloud container clusters get-credentials "$CLUSTER_NAME" --zone="$ZONE" --project="$PROJECT_ID"
    echo "✓ kubectl configured"
}

# Create namespace
create_namespace() {
    echo "Creating namespace..."
    kubectl create namespace kubercoin --dry-run=client -o yaml | kubectl apply -f -
    echo "✓ Namespace ready"
}

# Install cert-manager for TLS
install_cert_manager() {
    echo "Installing cert-manager..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    
    echo "Waiting for cert-manager to be ready..."
    kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager -n cert-manager
    kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-webhook -n cert-manager
    
    echo "✓ cert-manager installed"
}

# Create persistent disks
create_storage() {
    echo "Creating persistent disk..."
    
    DISK_NAME="kubercoin-${ENVIRONMENT}-data"
    
    if gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" --project="$PROJECT_ID" &> /dev/null; then
        echo "✓ Disk already exists"
    else
        gcloud compute disks create "$DISK_NAME" \
            --size=100GB \
            --zone="$ZONE" \
            --project="$PROJECT_ID" \
            --type=pd-ssd
        echo "✓ Disk created"
    fi
}

# Deploy application
deploy_app() {
    echo "Deploying KuberCoin application..."
    
    kubectl apply -f k8s/deployment.yaml -n kubercoin
    
    echo "Waiting for deployment to be ready..."
    kubectl rollout status deployment/kubercoin-node -n kubercoin --timeout=600s
    
    echo "✓ Application deployed"
}

# Deploy monitoring stack
deploy_monitoring() {
    echo "Deploying monitoring stack..."
    kubectl apply -f k8s/monitoring.yaml -n kubercoin
    
    echo "Waiting for Prometheus and Grafana..."
    kubectl rollout status deployment/prometheus -n kubercoin --timeout=300s
    kubectl rollout status deployment/grafana -n kubercoin --timeout=300s
    
    echo "✓ Monitoring deployed"
}

# Configure Ingress
configure_ingress() {
    echo "Configuring Ingress..."
    
    # Reserve static IP
    IP_NAME="kubercoin-${ENVIRONMENT}-ip"
    if ! gcloud compute addresses describe "$IP_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
        gcloud compute addresses create "$IP_NAME" --region="$REGION" --project="$PROJECT_ID"
    fi
    
    STATIC_IP=$(gcloud compute addresses describe "$IP_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(address)')
    
    echo "Waiting for LoadBalancer IP..."
    sleep 30
    
    P2P_IP=$(kubectl get svc kubercoin-p2p -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    GRAFANA_IP=$(kubectl get svc grafana -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    echo ""
    echo "=========================================="
    echo "Deployment Complete!"
    echo "=========================================="
    echo "Static IP: $STATIC_IP"
    echo "P2P Endpoint: $P2P_IP:8633"
    echo "Grafana: http://$GRAFANA_IP:3000 (credentials from deployment config)"
    echo ""
    echo "To access the API:"
    echo "  kubectl port-forward svc/kubercoin-api 8634:8634 -n kubercoin"
    echo ""
    echo "To view logs:"
    echo "  kubectl logs -f deployment/kubercoin-node -n kubercoin"
    echo "=========================================="
}

# Main execution
main() {
    check_prerequisites
    enable_apis
    create_cluster
    configure_kubectl
    create_namespace
    install_cert_manager
    create_storage
    deploy_app
    deploy_monitoring
    configure_ingress
}

main
