#!/bin/bash
# KuberCoin Backup Script
# Automated backup of blockchain data, UTXO database, and configuration
# Usage: ./backup.sh [backup-name]

set -e

BACKUP_NAME=${1:-backup-$(date +%Y%m%d-%H%M%S)}
BACKUP_DIR="/backups/kubercoin"
DATA_DIR="/var/lib/kubercoin"
CONFIG_DIR="/etc/kubercoin"
S3_BUCKET=${S3_BACKUP_BUCKET:-""}
GCS_BUCKET=${GCS_BACKUP_BUCKET:-""}
AZURE_CONTAINER=${AZURE_BACKUP_CONTAINER:-""}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

echo "=========================================="
echo "KuberCoin Backup Script"
echo "Backup Name: $BACKUP_NAME"
echo "=========================================="

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Backup blockchain data
backup_blockchain() {
    echo "Backing up blockchain data..."
    
    if [ -d "$DATA_DIR/blocks" ]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME/blocks.tar.gz" -C "$DATA_DIR" blocks
        echo "✓ Blockchain data backed up ($(du -h "$BACKUP_DIR/$BACKUP_NAME/blocks.tar.gz" | cut -f1))"
    else
        echo "⚠ No blockchain data found"
    fi
}

# Backup UTXO database
backup_utxo() {
    echo "Backing up UTXO database..."
    
    if [ -d "$DATA_DIR/utxo" ]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME/utxo.tar.gz" -C "$DATA_DIR" utxo
        echo "✓ UTXO database backed up ($(du -h "$BACKUP_DIR/$BACKUP_NAME/utxo.tar.gz" | cut -f1))"
    else
        echo "⚠ No UTXO database found"
    fi
}

# Backup mempool
backup_mempool() {
    echo "Backing up mempool..."
    
    if [ -f "$DATA_DIR/mempool.dat" ]; then
        cp "$DATA_DIR/mempool.dat" "$BACKUP_DIR/$BACKUP_NAME/mempool.dat"
        echo "✓ Mempool backed up"
    else
        echo "⚠ No mempool data found"
    fi
}

# Backup configuration
backup_config() {
    echo "Backing up configuration..."
    
    if [ -d "$CONFIG_DIR" ]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME/config.tar.gz" -C "$CONFIG_DIR" .
        echo "✓ Configuration backed up"
    else
        echo "⚠ No configuration found"
    fi
}

# Backup wallet (if exists)
backup_wallet() {
    echo "Backing up wallet..."
    
    if [ -f "$DATA_DIR/wallet.dat" ]; then
        # Encrypt wallet backup
        openssl enc -aes-256-cbc -salt -in "$DATA_DIR/wallet.dat" \
            -out "$BACKUP_DIR/$BACKUP_NAME/wallet.dat.enc" \
            -pass pass:${WALLET_BACKUP_PASSWORD:-changeme}
        echo "✓ Wallet backed up (encrypted)"
    else
        echo "⚠ No wallet found"
    fi
}

# Create backup metadata
create_metadata() {
    echo "Creating backup metadata..."
        local backup_files
        backup_files=$(find "$BACKUP_DIR/$BACKUP_NAME" -maxdepth 1 -mindepth 1 -printf '    "%f",\n' | grep -v 'metadata.json' | sed '$ s/,$//')
    
    cat > "$BACKUP_DIR/$BACKUP_NAME/metadata.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "version": "$(cat /app/VERSION 2>/dev/null || echo 'unknown')",
    "block_height": $(curl -s http://localhost:8634/api/info | jq -r '.height' 2>/dev/null || echo 0),
  "files": [
${backup_files}
  ]
}
EOF
    
    echo "✓ Metadata created"
}

# Upload to cloud storage
upload_to_cloud() {
    local backup_archive="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
    
    echo "Creating backup archive..."
    tar -czf "$backup_archive" -C "$BACKUP_DIR" "$BACKUP_NAME"
    
    # Upload to AWS S3
    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        echo "Uploading to S3..."
        aws s3 cp "$backup_archive" "s3://$S3_BUCKET/kubercoin/$BACKUP_NAME.tar.gz"
        echo "✓ Uploaded to S3"
    fi
    
    # Upload to Google Cloud Storage
    if [ -n "$GCS_BUCKET" ] && command -v gsutil &> /dev/null; then
        echo "Uploading to GCS..."
        gsutil cp "$backup_archive" "gs://$GCS_BUCKET/kubercoin/$BACKUP_NAME.tar.gz"
        echo "✓ Uploaded to GCS"
    fi
    
    # Upload to Azure Blob Storage
    if [ -n "$AZURE_CONTAINER" ] && command -v az &> /dev/null; then
        echo "Uploading to Azure..."
        az storage blob upload \
            --container-name "$AZURE_CONTAINER" \
            --name "kubercoin/$BACKUP_NAME.tar.gz" \
            --file "$backup_archive"
        echo "✓ Uploaded to Azure"
    fi
    
    # Clean up local archive
    rm -f "$backup_archive"
}

# Clean old backups
cleanup_old_backups() {
    echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
    
    find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup-*" -mtime +$RETENTION_DAYS -exec rm -rf {} \;
    
    # Clean cloud storage
    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        aws s3 ls "s3://$S3_BUCKET/kubercoin/" | \
            awk -v date="$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)" '$1 < date {print $4}' | \
            xargs -I {} aws s3 rm "s3://$S3_BUCKET/kubercoin/{}"
    fi
    
    echo "✓ Cleanup complete"
}

# Verify backup integrity
verify_backup() {
    echo "Verifying backup integrity..."
    
    local error=0
    
    for file in "$BACKUP_DIR/$BACKUP_NAME"/*.tar.gz; do
        if [ -f "$file" ]; then
            if ! tar -tzf "$file" > /dev/null 2>&1; then
                echo "✗ Failed to verify $file"
                error=1
            fi
        fi
    done
    
    if [ $error -eq 0 ]; then
        echo "✓ Backup integrity verified"
    else
        echo "✗ Backup verification failed"
        exit 1
    fi
}

# Main execution
main() {
    backup_blockchain
    backup_utxo
    backup_mempool
    backup_config
    backup_wallet
    create_metadata
    verify_backup
    upload_to_cloud
    cleanup_old_backups
    
    echo ""
    echo "=========================================="
    echo "Backup Complete!"
    echo "=========================================="
    echo "Backup location: $BACKUP_DIR/$BACKUP_NAME"
    echo "Backup size: $(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)"
    echo ""
    echo "To restore from this backup:"
    echo "  ./restore.sh $BACKUP_NAME"
    echo "=========================================="
}

main
