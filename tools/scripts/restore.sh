#!/bin/bash
# KuberCoin Restore Script
# Restore blockchain data, UTXO database, and configuration from backup
# Usage: ./restore.sh [backup-name]

set -e

BACKUP_NAME=${1:-""}
BACKUP_DIR="/backups/kubercoin"
DATA_DIR="/var/lib/kubercoin"
CONFIG_DIR="/etc/kubercoin"
S3_BUCKET=${S3_BACKUP_BUCKET:-""}
GCS_BUCKET=${GCS_BACKUP_BUCKET:-""}
AZURE_CONTAINER=${AZURE_BACKUP_CONTAINER:-""}

if [ -z "$BACKUP_NAME" ]; then
    echo "Error: Backup name required"
    echo "Usage: ./restore.sh [backup-name]"
    echo ""
    echo "Available backups:"
    find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 -type d -name 'backup-*' -printf '%f\n'
    exit 1
fi

echo "=========================================="
echo "KuberCoin Restore Script"
echo "Backup Name: $BACKUP_NAME"
echo "=========================================="
echo ""
echo "WARNING: This will overwrite existing data!"
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Download from cloud if not local
download_from_cloud() {
    if [ ! -d "$BACKUP_DIR/$BACKUP_NAME" ]; then
        echo "Backup not found locally, checking cloud storage..."
        
        local backup_archive="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
        
        # Try S3
        if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
            if aws s3 ls "s3://$S3_BUCKET/kubercoin/$BACKUP_NAME.tar.gz" &> /dev/null; then
                echo "Downloading from S3..."
                aws s3 cp "s3://$S3_BUCKET/kubercoin/$BACKUP_NAME.tar.gz" "$backup_archive"
            fi
        fi
        
        # Try GCS
        if [ ! -f "$backup_archive" ] && [ -n "$GCS_BUCKET" ] && command -v gsutil &> /dev/null; then
            if gsutil ls "gs://$GCS_BUCKET/kubercoin/$BACKUP_NAME.tar.gz" &> /dev/null; then
                echo "Downloading from GCS..."
                gsutil cp "gs://$GCS_BUCKET/kubercoin/$BACKUP_NAME.tar.gz" "$backup_archive"
            fi
        fi
        
        # Try Azure
        if [ ! -f "$backup_archive" ] && [ -n "$AZURE_CONTAINER" ] && command -v az &> /dev/null; then
            echo "Downloading from Azure..."
            az storage blob download \
                --container-name "$AZURE_CONTAINER" \
                --name "kubercoin/$BACKUP_NAME.tar.gz" \
                --file "$backup_archive"
        fi
        
        # Extract archive
        if [ -f "$backup_archive" ]; then
            echo "Extracting backup..."
            tar -xzf "$backup_archive" -C "$BACKUP_DIR"
            rm -f "$backup_archive"
        else
            echo "Error: Backup not found in any storage location"
            exit 1
        fi
    fi
}

# Stop node service
stop_node() {
    echo "Stopping KuberCoin node..."
    
    if systemctl is-active --quiet kubercoin; then
        systemctl stop kubercoin
    elif docker ps | grep -q kubercoin; then
        docker stop kubercoin
    elif kubectl get pods -n kubercoin | grep -q kubercoin-node; then
        kubectl scale deployment/kubercoin-node --replicas=0 -n kubercoin
        kubectl wait --for=delete pod -l app=kubercoin-node -n kubercoin --timeout=300s
    fi
    
    echo "✓ Node stopped"
}

# Restore blockchain data
restore_blockchain() {
    echo "Restoring blockchain data..."
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/blocks.tar.gz" ]; then
        rm -rf "$DATA_DIR/blocks"
        mkdir -p "$DATA_DIR"
        tar -xzf "$BACKUP_DIR/$BACKUP_NAME/blocks.tar.gz" -C "$DATA_DIR"
        echo "✓ Blockchain data restored"
    else
        echo "⚠ No blockchain backup found"
    fi
}

# Restore UTXO database
restore_utxo() {
    echo "Restoring UTXO database..."
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/utxo.tar.gz" ]; then
        rm -rf "$DATA_DIR/utxo"
        mkdir -p "$DATA_DIR"
        tar -xzf "$BACKUP_DIR/$BACKUP_NAME/utxo.tar.gz" -C "$DATA_DIR"
        echo "✓ UTXO database restored"
    else
        echo "⚠ No UTXO backup found"
    fi
}

# Restore mempool
restore_mempool() {
    echo "Restoring mempool..."
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/mempool.dat" ]; then
        cp "$BACKUP_DIR/$BACKUP_NAME/mempool.dat" "$DATA_DIR/mempool.dat"
        echo "✓ Mempool restored"
    else
        echo "⚠ No mempool backup found"
    fi
}

# Restore configuration
restore_config() {
    echo "Restoring configuration..."
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/config.tar.gz" ]; then
        mkdir -p "$CONFIG_DIR"
        tar -xzf "$BACKUP_DIR/$BACKUP_NAME/config.tar.gz" -C "$CONFIG_DIR"
        echo "✓ Configuration restored"
    else
        echo "⚠ No configuration backup found"
    fi
}

# Restore wallet
restore_wallet() {
    echo "Restoring wallet..."
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/wallet.dat.enc" ]; then
        : "${WALLET_BACKUP_PASSWORD:?Set WALLET_BACKUP_PASSWORD before decrypting wallet backups}"
        openssl enc -aes-256-cbc -d -in "$BACKUP_DIR/$BACKUP_NAME/wallet.dat.enc" \
            -out "$DATA_DIR/wallet.dat" \
            -pass pass:${WALLET_BACKUP_PASSWORD}
        echo "✓ Wallet restored (decrypted)"
    else
        echo "⚠ No wallet backup found"
    fi
}

# Set permissions
set_permissions() {
    echo "Setting permissions..."
    chown -R kubercoin:kubercoin "$DATA_DIR" 2>/dev/null || true
    chown -R kubercoin:kubercoin "$CONFIG_DIR" 2>/dev/null || true
    chmod 700 "$DATA_DIR" 2>/dev/null || true
    echo "✓ Permissions set"
}

# Start node service
start_node() {
    echo "Starting KuberCoin node..."
    
    if systemctl list-unit-files | grep -q kubercoin; then
        systemctl start kubercoin
    elif command -v docker &> /dev/null; then
        docker start kubercoin 2>/dev/null || docker-compose up -d
    elif command -v kubectl &> /dev/null; then
        kubectl scale deployment/kubercoin-node --replicas=1 -n kubercoin
        kubectl wait --for=condition=Ready pod -l app=kubercoin-node -n kubercoin --timeout=300s
    fi
    
    echo "✓ Node started"
}

# Verify restore
verify_restore() {
    echo "Verifying restore..."
    
    sleep 10
    
    # Check if node is responding
    if curl -f -s http://localhost:8634/api/health > /dev/null; then
        echo "✓ Node is responding"
        
        # Get block height
        local height
        height=$(curl -s http://localhost:8634/api/info | jq -r '.height' 2>/dev/null || echo 0)
        echo "✓ Current block height: $height"
    else
        echo "⚠ Node not responding yet, check logs"
    fi
}

# Main execution
main() {
    download_from_cloud
    stop_node
    restore_blockchain
    restore_utxo
    restore_mempool
    restore_config
    restore_wallet
    set_permissions
    start_node
    verify_restore
    
    echo ""
    echo "=========================================="
    echo "Restore Complete!"
    echo "=========================================="
    echo "Restored from: $BACKUP_DIR/$BACKUP_NAME"
    echo ""
    echo "Monitor logs:"
    echo "  journalctl -u kubercoin -f"
    echo "  docker logs -f kubercoin"
    echo "  kubectl logs -f deployment/kubercoin-node -n kubercoin"
    echo "=========================================="
}

main
