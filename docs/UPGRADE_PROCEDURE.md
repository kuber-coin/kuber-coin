# Kubercoin Node — Upgrade and Rollback Procedure

This document describes how to safely upgrade a running Kubercoin full node to a new binary
version and how to roll back if something goes wrong.

---

## Overview

The node stores all persistent state in three files:

| File | Purpose |
|---|---|
| `chainstate.bin` | UTXO set, block index, chain tip |
| `mempool.bin` | Pending (unconfirmed) transactions |
| `fee_estimator.bin` | Historical fee-rate samples |

All three files use bincode serialization.  A **schema change** between versions requires a
migration or a fresh sync.  When in doubt, treat a minor version bump as safe and a major
version bump as potentially requiring a re-sync (check the release notes).

---

## Before You Start

1. **Read the release notes** for the new version — look for any "breaking change" or "migration
   required" notices.
2. **Ensure you have a recent backup** (see Backup section below).
3. Test the new binary on testnet or regtest before upgrading a production mainnet node.

---

## Backup

Back up the three state files while the node is **stopped** to guarantee consistency.
Hot copies of `chainstate.bin` taken while the node is running may be internally inconsistent
because writes are not atomic across all three files simultaneously.

```bash
# 1. Stop the node (graceful shutdown — the node flushes state on SIGTERM)
systemctl stop kubercoin          # systemd
# or: kill -TERM <pid>

# 2. Wait for the process to exit completely
sleep 5

# 3. Copy the data directory
DATA_DIR=/var/lib/kubercoin       # adjust to your KUBERCOIN_DATA_DIR
BACKUP_DIR=/var/backups/kubercoin/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
cp "$DATA_DIR/chainstate.bin"    "$BACKUP_DIR/"
cp "$DATA_DIR/mempool.bin"       "$BACKUP_DIR/"
cp "$DATA_DIR/fee_estimator.bin" "$BACKUP_DIR/"
echo "Backup at $BACKUP_DIR"
```

> **PowerShell (Windows):**
> ```powershell
> $DataDir   = "data\kubercoin"
> $BackupDir = "backups\kubercoin\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
> New-Item -ItemType Directory -Path $BackupDir | Out-Null
> Copy-Item "$DataDir\chainstate.bin"    $BackupDir
> Copy-Item "$DataDir\mempool.bin"       $BackupDir
> Copy-Item "$DataDir\fee_estimator.bin" $BackupDir
> Write-Host "Backup at $BackupDir"
> ```

---

## Upgrade Steps

### Step 1 — Build or obtain the new binary

```bash
# Build from source (recommended)
git fetch --tags
git checkout v<NEW_VERSION>
cargo build --release -p node
# Binary is at: target/release/kubercoin

# Verify checksum if using a pre-built release
sha256sum -c kubercoin.sha256
```

### Step 2 — Stop the running node

```bash
systemctl stop kubercoin
# or: kill -TERM <pid>
```

Wait until the process is fully stopped:

```bash
while pgrep -x kubercoin > /dev/null; do sleep 1; done
echo "Node stopped"
```

### Step 3 — Backup state files (see Backup section above)

### Step 4 — Replace the binary

```bash
INSTALL_PATH=/usr/local/bin/kubercoin    # adjust as needed
cp target/release/kubercoin "$INSTALL_PATH"
chmod 0755 "$INSTALL_PATH"
```

### Step 5 — Start the node

```bash
systemctl start kubercoin
# Monitor logs for startup errors
journalctl -u kubercoin -f
```

Expected startup output includes:

```
[INFO] chain state loaded, tip height=<N>
[INFO] HTTP API listening on 0.0.0.0:<PORT>
[INFO] P2P listener on 0.0.0.0:8633
```

### Step 6 — Verify

```bash
# Check the tip is advancing
curl -s -H "X-API-Key: $KUBERCOIN_API_KEYS" http://localhost:8080/api/v1/blocks/tip | jq .height

# Check peer count
curl -s -H "X-API-Key: $KUBERCOIN_API_KEYS" http://localhost:8080/api/v1/peers | jq length
```

---

## Rollback Steps

If the new binary fails to start or produces incorrect behavior, restore the backup and
reinstall the previous binary.

### Step 1 — Stop the node (if still running)

```bash
systemctl stop kubercoin
```

### Step 2 — Restore state files

```bash
DATA_DIR=/var/lib/kubercoin
BACKUP_DIR=/var/backups/kubercoin/<TIMESTAMP>    # use the backup made before upgrading

cp "$BACKUP_DIR/chainstate.bin"    "$DATA_DIR/"
cp "$BACKUP_DIR/mempool.bin"       "$DATA_DIR/"
cp "$BACKUP_DIR/fee_estimator.bin" "$DATA_DIR/"
```

### Step 3 — Reinstall the previous binary

```bash
# If you kept the old binary
cp /path/to/previous/kubercoin /usr/local/bin/kubercoin
chmod 0755 /usr/local/bin/kubercoin

# Or rebuild it from the previous tag
git checkout v<OLD_VERSION>
cargo build --release -p node
cp target/release/kubercoin /usr/local/bin/kubercoin
```

### Step 4 — Start the node

```bash
systemctl start kubercoin
journalctl -u kubercoin -f
```

---

## Schema Migration (Major Version Upgrades)

If the release notes say "chainstate format changed" or "migration required":

### Option A — Wipe and re-sync (simplest)

```bash
systemctl stop kubercoin
DATA_DIR=/var/lib/kubercoin
rm "$DATA_DIR/chainstate.bin" "$DATA_DIR/mempool.bin" "$DATA_DIR/fee_estimator.bin"
# Install new binary, then start — node will sync from genesis
systemctl start kubercoin
```

Re-sync time depends on chain length.  Monitor `height` via the API.

### Option B — Run a migration script (if provided)

Check the release's `docs/migrations/` directory.  If a migration script exists, follow its
instructions before starting the new binary.

---

## Automated Backup Script

For production deployments, schedule this script via cron or a systemd timer:

```bash
#!/usr/bin/env bash
# /etc/cron.daily/kubercoin-backup
set -euo pipefail

DATA_DIR="${KUBERCOIN_DATA_DIR:-/var/lib/kubercoin}"
BACKUP_ROOT="/var/backups/kubercoin"
KEEP_DAYS=7

# Only back up if the node is not running (clean copies)
if pgrep -x kubercoin > /dev/null; then
    echo "WARNING: node is running; skipping backup to avoid inconsistent state" >&2
    exit 1
fi

DEST="$BACKUP_ROOT/$(date +%Y%m%d)"
mkdir -p "$DEST"
cp "$DATA_DIR/chainstate.bin"    "$DEST/"
cp "$DATA_DIR/mempool.bin"       "$DEST/"
cp "$DATA_DIR/fee_estimator.bin" "$DEST/"

# Prune old backups
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} +

echo "Backup complete: $DEST"
```

For zero-downtime backups on a live node, use a dedicated snapshot mechanism at the storage
layer (LVM snapshot, ZFS snapshot, cloud disk snapshot) taken while the node is live, then
restore the three files from the snapshot.

---

## See Also

- [docs/OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) — full operator reference
- [docs/CHANGELOG.md](CHANGELOG.md) — version history and breaking changes
- `scripts/release.sh` / `scripts/release.ps1` — building and checksumming release binaries
