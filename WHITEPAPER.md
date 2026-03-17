# KuberCoin: A Peer-to-Peer Electronic Cash System

**Version 1.0 — February 2026**

## Abstract

KuberCoin is a decentralized cryptocurrency built on first-principles
cryptographic engineering. It implements a full UTXO-based transaction model
with SHA-256d Proof-of-Work consensus, a fixed monetary supply of 21 million
KUBER, and a halving schedule that reduces block rewards every 210,000 blocks.
The system provides a complete stack: consensus engine, P2P network layer,
JSON-RPC API, web wallet, block explorer, and monitoring infrastructure — all
from a single auditable codebase.

---

## 1. Introduction

Digital currencies require a trustless mechanism for establishing consensus on
transaction ordering. KuberCoin achieves this through computational proof-of-work,
where miners compete to find valid block hashes below a dynamically-adjusted
difficulty target. Every participant can independently verify the entire chain
from genesis without trusting any central authority.

### 1.1 Design Goals

- **Sound money**: Hard-capped supply with predictable issuance schedule
- **Simplicity**: Clean UTXO model without Turing-complete scripting
- **Auditability**: Single Rust workspace; every line is readable
- **Compatibility**: Bitcoin-compatible RPC interface and address encoding
- **Performance**: Optimized release binary under 6 MB

---

## 2. Transactions

### 2.1 UTXO Model

KuberCoin uses an Unspent Transaction Output (UTXO) model. Each transaction
consumes one or more previous outputs and creates new outputs. The sum of
inputs must equal or exceed the sum of outputs; any difference is collected
as a miner fee.

```
Transaction {
    inputs:  Vec<TxInput>,    // References to previous outputs
    outputs: Vec<TxOutput>,   // New unspent outputs
}

TxInput {
    prev_txid: [u8; 32],      // Hash of the previous transaction
    prev_index: u32,          // Index within that transaction's outputs
    signature: Vec<u8>,       // ECDSA signature proving ownership
    pubkey: Vec<u8>,          // Public key matching the output script
}

TxOutput {
    amount: u64,              // Value in satoshis (1 KUBER = 10^8 sat)
    script_pubkey: Vec<u8>,   // Locking script (P2PKH)
}
```

### 2.2 Address Format

KuberCoin uses Pay-to-Public-Key-Hash (P2PKH) addresses:

1. Generate a secp256k1 keypair
2. SHA-256 → RIPEMD-160 of the compressed public key (20 bytes)
3. Prepend version byte: `0x00` (mainnet) or `0x6f` (testnet)
4. Append 4-byte checksum (double SHA-256 of versioned payload)
5. Base58Check encode

**Mainnet** addresses start with `1`. **Testnet** addresses start with `m` or `n`.

### 2.3 Transaction Validation

- Each input must reference an existing, unspent output
- Signature must be valid against the referenced output's public key hash
- Sum of input values ≥ sum of output values
- Transaction size ≤ 100 KB (relay policy) / 1 MB (consensus)
- No double-spends within the same block or mempool

---

## 3. Proof-of-Work

### 3.1 Mining Algorithm

KuberCoin uses **SHA-256d** (double SHA-256) as its proof-of-work function:

```
block_hash = SHA256(SHA256(block_header))
```

The block header contains:
- Previous block hash (32 bytes)
- Merkle root of transactions (32 bytes)
- Timestamp (8 bytes)
- Difficulty target bits (4 bytes)
- Nonce (4 bytes)

A block is valid when `block_hash < target`, where `target` is derived from
the compact difficulty bits using Bitcoin's `nBits` encoding.

### 3.2 Difficulty Adjustment

Difficulty retargets every **2,016 blocks** (~2 weeks at 10-minute intervals):

```
new_target = old_target × (actual_time / expected_time)
```

Where:
- `expected_time = 2016 × 600 seconds` (2 weeks)
- `actual_time` = wall-clock time between the 2016-block window
- Clamped to [¼×, 4×] to prevent extreme swings

### 3.3 Coinbase Maturity

Block reward outputs (coinbase) require **100 confirmations** before they
can be spent. This prevents miners from spending rewards from blocks that
may later be orphaned.

---

## 4. Monetary Policy

### 4.1 Supply Schedule

| Parameter | Value |
|-----------|-------|
| Maximum supply | 21,000,000 KUBER |
| Initial block reward | 50 KUBER |
| Halving interval | 210,000 blocks |
| Block target time | 10 minutes |
| Denomination | 1 KUBER = 100,000,000 satoshis |

### 4.2 Halving Schedule

| Era | Block Heights | Reward | Cumulative Supply |
|-----|--------------|--------|-------------------|
| 1 | 0 – 209,999 | 50 KUBER | 10,500,000 |
| 2 | 210,000 – 419,999 | 25 KUBER | 15,750,000 |
| 3 | 420,000 – 629,999 | 12.5 KUBER | 18,375,000 |
| 4 | 630,000 – 839,999 | 6.25 KUBER | 19,687,500 |
| ... | ... | ... | ... |
| 33 | 6,720,000+ | 0 KUBER | 21,000,000 |

After approximately 132 years (at 10-minute blocks), all 21 million KUBER
will have been mined. Transaction fees then become the sole miner incentive.

---

## 5. Network Protocol

### 5.1 P2P Wire Protocol

Nodes communicate using a binary protocol with 4-byte magic prefix:

| Network | Magic Bytes | Port |
|---------|-------------|------|
| Mainnet | `KBCN` (0x4B424345) | 8633 |
| Testnet | 0x0B110907 | 18633 |
| Regtest | 0xFABFB5DA | 18444 |

### 5.2 Message Types

- **Version/Verack**: Handshake with version, best height, user-agent
- **Inv/GetData**: Inventory announcements and data requests
- **Block/Tx**: Block and transaction relay
- **GetBlocks/GetHeaders**: Chain synchronization
- **Ping/Pong**: Keepalive
- **Addr**: Peer address exchange
- **CompactBlock**: BIP-152 efficient block relay
- **FilterLoad/MerkleBlock**: BIP-37 SPV support (🔜 planned — not yet implemented)

### 5.3 Peer Discovery

1. **DNS seeds**: `seed.kuber-coin.com`, `seed2.kuber-coin.com`,
   `dnsseed.kuber-coin.com`
2. **Addr gossip**: Nodes exchange known peer addresses
3. **Peer book persistence**: Known peers saved to disk

### 5.4 Node Configuration

The node is configured via environment variables or `kubercoin.conf`:

- `KUBERCOIN_NETWORK`: `mainnet` | `testnet` | `regtest`
- `KUBERCOIN_API_KEYS`: Comma-separated RPC authentication keys
- `KUBERCOIN_RATE_LIMIT_PER_MIN`: Per-client rate limit

---

## 6. Security

### 6.1 Consensus Rules

- Block size ≤ 4 MB (SegWit-equivalent weight limit)
- ≤ 10,000 transactions per block
- Minimum fee: 1 satoshi per byte
- Maximum reorg depth: 100 blocks
- Checkpoint verification at known-good heights

### 6.2 Mempool Policy

- Maximum 300 MB / 50,000 transactions
- 100 KB per-transaction relay limit
- 25 ancestor/descendant chain limit
- 100 transactions per address cap
- 14-day expiry for unconfirmed transactions

### 6.3 Network Security

- Per-client rate limiting on RPC
- API key authentication
- Input validation on all API boundaries
- TLS support for production deployments

---

## 7. Implementation

### 7.1 Architecture

```
┌─────────────────────────────────────────────┐
│                kubercoin.exe                │
├──────┬──────┬──────┬──────┬──────┬──────────┤
│ node │  tx  │chain │cons. │store │ testnet  │
├──────┴──────┴──────┴──────┴──────┴──────────┤
│           Rust Workspace (9 crates)         │
└─────────────────────────────────────────────┘
```

| Crate | Purpose |
|-------|---------|
| `node` | Main binary — P2P, RPC, REST, mining |
| `tx` | Transaction types, address encoding, BIP-44 HD wallets |
| `chain` | Block and chain data structures |
| `consensus` | Difficulty adjustment, validation rules |
| `storage` | Chain state persistence |
| `testnet` | Genesis block generation |
| `miner` | Mining pool support |
| `lightning` | Lightning Network (L2 — reserved for future phase; not production-ready) |
| `faucet` | Testnet coin faucet |

### 7.2 API Surface

**JSON-RPC 2.0** (port 8634):
`getblockcount`, `getblock`, `getblockchaininfo`, `getblockhash`,
`getrawtransaction`, `sendrawtransaction`, `generatetoaddress`,
`getmempoolinfo`, `getpeerinfo`, `getnetworkinfo`

**REST API** (port 8634, same HTTP server as JSON-RPC — routes mounted at `/api/*`):
`/api/health`, `/api/info`, `/api/supply`,
`/api/balance/{addr}`, `/api/tx/{txid}`, `/api/events`

**WebSocket** (port 8634, path `/ws`): Real-time block and transaction notifications

### 7.3 CLI

```
kubercoin mine [count]              Mine blocks
kubercoin mine-to <addr> [count]    Mine to specific address
kubercoin new-wallet [path]         Create HD wallet
kubercoin get-address [path]        Show wallet address
kubercoin get-balance [path]        Show wallet balance
kubercoin send <wallet> <to> <amt>  Send transaction
kubercoin send-many <wallet> ...    Multi-recipient send
kubercoin node [port] [--no-p2p]    Start full node
kubercoin version                   Show version info
```

---

## 8. Wallet

### 8.1 HD Wallet (BIP-44)

KuberCoin wallets follow the BIP-44 derivation path:

```
m / 44' / 0' / 0' / 0 / index
```

Coin type `0` for mainnet, `1` for testnet. Each wallet can generate
unlimited receiving addresses from a single seed.

### 8.2 Web Wallet

A full-featured Next.js web wallet (`wallet-web/`) provides:
- Wallet creation and recovery
- Balance display with UTXO breakdown
- Send/receive with QR codes
- Transaction history
- Address generation

---

## 9. Deployment

### 9.1 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 8 GB |
| Disk | 10 GB | 100 GB SSD |
| Network | 10 Mbps | 100 Mbps |

### 9.2 Docker

```bash
docker compose up -d
```

Includes: node, block explorer, web wallet, Prometheus, Grafana.

### 9.3 Kubernetes

Helm chart available at `infra/helm/kubercoin/` for production cluster deployment.

---

## 10. Conclusion

KuberCoin demonstrates that a complete cryptocurrency can be built from
first principles in a single, auditable codebase. The system implements
sound monetary policy (21M hard cap), proven consensus (SHA-256d PoW with
difficulty adjustment), and production infrastructure (Docker, K8s, CI/CD,
monitoring). All 1,334 unit and integration tests pass, confirming the correctness of the
core protocol implementation. End-to-end wallet UI tests provide additional
coverage of the web interface layer.

---

## References

1. Nakamoto, S. (2008). *Bitcoin: A Peer-to-Peer Electronic Cash System*
2. BIP-44: Multi-Account Hierarchy for Deterministic Wallets
3. BIP-152: Compact Block Relay
4. BIP-37: Connection Bloom Filtering

---

*© 2026 KuberCoin Contributors. Released under the MIT License.*
