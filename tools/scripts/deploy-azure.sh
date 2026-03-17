#!/bin/bash
# Azure AKS Deployment Script for KuberCoin
# Usage: ./deploy-azure.sh [environment] [location]
# Example: ./deploy-azure.sh production eastus

set -e

ENVIRONMENT=${1:-staging}
LOCATION=${2:-eastus}
RESOURCE_GROUP="kubercoin-${ENVIRONMENT}-rg"
CLUSTER_NAME="kubercoin-${ENVIRONMENT}"

echo "=========================================="
echo "KuberCoin Azure Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Resource Group: $RESOURCE_GROUP"
echo "Cluster: $CLUSTER_NAME"
echo "=========================================="

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v az &> /dev/null; then
        echo "Error: Azure CLI not installed"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        echo "Error: kubectl not installed"
        exit 1
    fi
    
    # Check if logged in
    if ! az account show &> /dev/null; then
        echo "Error: Not logged into Azure. Run 'az login'"
        exit 1
    fi
    
    echo "✓ All prerequisites met"
}

# Create resource group
create_resource_group() {
    echo "Creating resource group..."
    
    if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        echo "✓ Resource group already exists"
    else
        az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
        echo "✓ Resource group created"
    fi
}

# Create AKS cluster if it doesn't exist
create_cluster() {
    echo "Checking if cluster exists..."
    
    if az aks show --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" &> /dev/null; then
        echo "✓ Cluster $CLUSTER_NAME already exists"
    else
        echo "Creating AKS cluster..."
        az aks create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$CLUSTER_NAME" \
            --location "$LOCATION" \
            --node-count 3 \
            --node-vm-size Standard_D2s_v3 \
            --enable-cluster-autoscaler \
            --min-count 1 \
            --max-count 5 \
            --enable-managed-identity \
            --generate-ssh-keys
        
        echo "✓ Cluster created successfully"
    fi
}

# Configure kubectl context
configure_kubectl() {
    echo "Configuring kubectl context..."
    az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --overwrite-existing
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

# Create Azure Storage for persistence
create_storage() {
    echo "Creating Azure Storage..."
    
    STORAGE_ACCOUNT="kubercoin${ENVIRONMENT}storage"
    
    # Storage account names must be lowercase and alphanumeric
    STORAGE_ACCOUNT=$(echo "$STORAGE_ACCOUNT" | tr '[:upper:]' '[:lower:]' | tr -d '-')
    
    if az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo "✓ Storage account already exists"
    else
        az storage account create \
            --name "$STORAGE_ACCOUNT" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --sku Standard_LRS \
            --kind StorageV2
        echo "✓ Storage account created"
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

# Configure LoadBalancer
configure_loadbalancer() {
    echo "Configuring LoadBalancer..."
    
    echo "Waiting for LoadBalancer IP..."
    sleep 30
    
    P2P_IP=$(kubectl get svc kubercoin-p2p -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    GRAFANA_IP=$(kubectl get svc grafana -n kubercoin -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    echo ""
    echo "=========================================="
    echo "Deployment Complete!"
    echo "=========================================="
    echo "P2P Endpoint: $P2P_IP:8633"
    echo "Grafana: http://$GRAFANA_IP:3000 (credentials from deployment config)"
    echo ""
    echo "To access the API:"
    echo "  kubectl port-forward svc/kubercoin-api 8634:8634 -n kubercoin"
    echo ""
    echo "To view logs:"
    echo "  kubectl logs -f deployment/kubercoin-node -n kubercoin"
    echo ""
    echo "To configure DNS:"
    echo "  Create A records pointing to: $P2P_IP"
    echo "=========================================="
}

# Main execution
main() {
    check_prerequisites
    create_resource_group
    create_cluster
    configure_kubectl
    create_namespace
    install_cert_manager
    create_storage
    deploy_app
    deploy_monitoring
    configure_loadbalancer
}

main
