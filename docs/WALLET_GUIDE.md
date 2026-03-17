# KuberCoin Wallet Guide

## Overview

KuberCoin uses a UTXO-based transaction model with P2PKH (Pay-to-Public-Key-Hash)
addresses. Wallets store private keys and track unspent transaction outputs to
compute balances.

## Address Format

| Network | Prefix | Version Byte | Example |
|---------|--------|-------------|---------|
| Mainnet | `1` | `0x00` | `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` |
| Testnet | `m`/`n` | `0x6f` | `mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef` |

Addresses use Base58Check encoding with a SHA-256d checksum.

## CLI Wallet

### Create a Wallet

```bash
kubercoin create-wallet my_wallet.json
```

Output:
```
Created wallet: 1NtgbytPetuEu28UDBeh3KXm4pjexBEAdP
```

The wallet file contains your **private key**. Back it up immediately.

### Check Balance

```bash
kubercoin balance my_wallet.json
```

### Send KUBER

```bash
kubercoin send my_wallet.json <recipient_address> <amount>
```

Example:
```bash
kubercoin send my_wallet.json 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa 10.5
```

### Dry Run (Preview)

Preview a transaction without broadcasting:
```bash
kubercoin send-dry-run my_wallet.json 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa 10.5
```

### Transaction History

```bash
kubercoin history my_wallet.json
```

## Web Wallet

A full-featured web wallet is available at http://localhost:3250 when the
wallet-web application is running.

### Starting the Web Wallet

```bash
cd wallet-web
npm install
npm run dev
```

### Features

- **Create Wallet** — Generate a new wallet in the browser
- **Import Wallet** — Load an existing wallet JSON file
- **Send Coins** — Transfer KUBER with address validation
- **Transaction History** — View all incoming and outgoing transactions
- **Real-time Updates** — Balance refreshes automatically via WebSocket
- **QR Codes** — Share your address via QR code

## Wallet File Format

The wallet JSON file structure:

```json
{
  "address": "1NtgbytPetuEu28UDBeh3KXm4pjexBEAdP",
  "public_key": "04a1b2c3...",
  "private_key": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

**SECURITY**: Never share the `private_key` field. Anyone with access to it can
spend your coins.

## Backup & Recovery

### Rule of Three

Keep at least three copies of your wallet file in separate locations:

1. **Active copy** — On your computer
2. **Offline backup** — USB drive stored securely
3. **Paper backup** — Print the private key and store in a safe

### Backup Commands

```bash
# Copy to USB drive
cp my_wallet.json /mnt/usb/kubercoin_backup/my_wallet.json

# Verify the backup
diff my_wallet.json /mnt/usb/kubercoin_backup/my_wallet.json
```

### Cold Storage

For long-term storage, generate a wallet offline and never connect it to the
network until you need to spend:

```bash
# On an air-gapped machine
kubercoin create-wallet cold_storage.json
# Copy the address (not the file) to your online machine for receiving
```

See [COLD_STORAGE_GUIDE.md](COLD_STORAGE_GUIDE.md) for detailed instructions.

## API Endpoints

The node exposes REST endpoints for wallet operations:

### Get Balance

```
GET /api/balance/<address>
```

```bash
curl http://localhost:8080/api/balance/1NtgbytPetuEu28UDBeh3KXm4pjexBEAdP
```

### Send Transaction

```
POST /api/transaction
Content-Type: application/json

{
  "from_wallet": { ... },
  "to_address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "amount": 10.5
}
```

### Get UTXOs

```
GET /api/utxos/<address>
```

### Transaction Details

```
GET /api/transaction/<txid>
```

## Multiple Wallets

You can create and manage multiple wallets for different purposes:

```bash
kubercoin create-wallet savings.json      # Long-term storage
kubercoin create-wallet spending.json     # Daily use
kubercoin create-wallet mining.json       # Mining rewards
```

## Transaction Fees

Transactions include a fee that goes to the miner who includes the transaction
in a block. The fee is calculated as:

```
fee = sum(inputs) - sum(outputs)
```

Higher fees incentivize miners to include your transaction faster.

## Security Best Practices

1. **Never share private keys** — Treat them like passwords
2. **Use strong file permissions** — `chmod 600 my_wallet.json`
3. **Encrypt backups** — Use GPG or similar encryption for backup copies
4. **Verify addresses** — Always double-check recipient addresses before sending
5. **Use testnet first** — Test transactions on testnet before mainnet
6. **Air-gapped signing** — For large amounts, sign transactions offline

## Troubleshooting

### "Insufficient balance"

Your wallet's UTXOs don't cover the amount plus fees. Check your balance:
```bash
kubercoin balance my_wallet.json
```

### "Invalid address"

Ensure the recipient address:
- Starts with `1` (mainnet) or `m`/`n` (testnet)
- Is 25–34 characters long
- Uses only Base58 characters (no 0, O, I, l)

### "Transaction not confirming"

The transaction is in the mempool waiting for a miner to include it. Wait for the
next block or include a higher fee.

### Wallet file corrupted

Restore from your backup copy. If no backup exists, the funds are unrecoverable.
This is why the Rule of Three backup strategy is critical.
