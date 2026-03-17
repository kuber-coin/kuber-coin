#!/bin/bash
# AWS EKS Deployment Script for KuberCoin
# Usage: ./deploy-aws.sh [environment] [region]
# Example: ./deploy-aws.sh production us-east-1

set -e

ENVIRONMENT=${1:-staging}
REGION=${2:-us-east-1}
CLUSTER_NAME="kubercoin-${ENVIRONMENT}"

echo "=========================================="
echo "KuberCoin AWS Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Cluster: $CLUSTER_NAME"
echo "=========================================="

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        echo "Error: AWS CLI not installed"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        echo "Error: kubectl not installed"
        exit 1
    fi
    
    if ! command -v eksctl &> /dev/null; then
        echo "Error: eksctl not installed"
        exit 1
    fi
    
    echo "✓ All prerequisites met"
}

# Create EKS cluster if it doesn't exist
create_cluster() {
    echo "Checking if cluster exists..."
    
    if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" &> /dev/null; then
        echo "✓ Cluster $CLUSTER_NAME already exists"
    else
        echo "Creating EKS cluster..."
        eksctl create cluster \
            --name "$CLUSTER_NAME" \
            --region "$REGION" \
            --nodegroup-name standard-workers \
            --node-type t3.medium \
            --nodes 3 \
            --nodes-min 1 \
            --nodes-max 5 \
            --managed
        
        echo "✓ Cluster created successfully"
    fi
}

# Configure kubectl context
configure_kubectl() {
    echo "Configuring kubectl context..."
    aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION"
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

# Deploy application
deploy_app() {
    echo "Deploying KuberCoin application..."
    
    # Apply Kubernetes manifests
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

# Configure LoadBalancer
configure_loadbalancer() {
    echo "Configuring LoadBalancer..."
    
    # Get LoadBalancer endpoints
    echo "Waiting for LoadBalancer IP..."
    kubectl get svc kubercoin-p2p -n kubercoin -w &
    WAIT_PID=$!
    sleep 30
    kill $WAIT_PID 2>/dev/null || true
    
    P2P_IP=$(kubectl get svc kubercoin-p2p -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    GRAFANA_IP=$(kubectl get svc grafana -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    
    echo ""
    echo "=========================================="
    echo "Deployment Complete!"
    echo "=========================================="
    echo "P2P Endpoint: $P2P_IP:8633"
    echo "API Endpoint: Configure Ingress for HTTPS"
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
    create_cluster
    configure_kubectl
    create_namespace
    install_cert_manager
    deploy_app
    deploy_monitoring
    configure_loadbalancer
}

main
