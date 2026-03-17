# Mempool & Relay Policy

Reference for the transaction relay and mempool admission rules enforced by
every Kubercoin full node. All constants live in `node/src/mempool.rs`.

## Relay-policy constants

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `MIN_RELAY_FEE_RATE` | 1 000 sat/kB (≈1 sat/vB) | Minimum fee-rate for relay and mempool admission |
| `DUST_OUTPUT_THRESHOLD` | 546 sat | Outputs below this value are rejected as dust |
| `MAX_TX_RELAY_SIZE` | 100 KB | Maximum serialised size of a single relayed transaction |

## Mempool capacity limits

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `MAX_MEMPOOL_TRANSACTIONS` | 50 000 | Hard count ceiling — admission past this evicts the lowest-fee-rate tx |
| `MAX_MEMPOOL_BYTES` | 300 MB | Aggregate serialised-size ceiling — lowest-fee-rate txs evicted until under budget |
| `MAX_MEMPOOL_TX_AGE_SECS` | 14 days (1 209 600 s) | Transactions older than this are expired on the next sweep |

## Unconfirmed chain depth limits

Mirroring Bitcoin Core defaults:

| Parameter | Value |
|-----------|-------|
| `MAX_ANCESTOR_COUNT` | 25 |
| `MAX_DESCENDANT_COUNT` | 25 |

A new transaction is rejected if its unconfirmed ancestor chain depth exceeds
25, or if adding it would push any existing parent's descendant count beyond 25.

## Admission flow

1. **Coinbase check** — coinbase transactions are never accepted.
2. **Duplicate check** — already-in-mempool txids are rejected.
3. **Consensus validation** — full `validate_transaction()` against the current
   UTXO set and block height.
4. **Fee calculation** — fee is derived from UTXO inputs vs outputs.
5. **Size check** — reject if serialised size > `MAX_TX_RELAY_SIZE`.
6. **Fee-rate check** — reject if fee-rate < `MIN_RELAY_FEE_RATE`.
7. **Dust check** — reject if any output has `0 < value < DUST_OUTPUT_THRESHOLD`.
8. **Double-spend / RBF** — if inputs conflict with an existing mempool tx,
   attempt Replace-by-Fee (BIP 125-style). Non-signalling conflicts are
   rejected as double-spends.
9. **Ancestor/descendant limits** — walk the unconfirmed chain to enforce depth.
10. **Capacity eviction** — if count ≥ `MAX_MEMPOOL_TRANSACTIONS` or bytes >
    `MAX_MEMPOOL_BYTES`, evict the lowest-fee-rate entry. If the new tx's
    fee-rate is not higher than the lowest, it is itself rejected.

## Eviction strategy

When eviction is needed the pool removes the entry with the **lowest fee-rate**
(the first element in the internal `BTreeMap<(fee_rate, txid), Transaction>`).
All index structures (`spent_outpoints`, `outpoint_to_txid`, `txid_to_fee`,
`entry_time`) are updated atomically in a single `remove_transaction()` call.

## Expiry

`expire_old_transactions()` walks `entry_time` and removes every tx whose
age exceeds `MAX_MEMPOOL_TX_AGE_SECS` (14 days). This is called periodically
by the node's background maintenance task.

## Replace-by-Fee (RBF)

A mempool transaction may be replaced if:

* The original signals replaceability (sequence < 0xFFFF_FFFE on at least one
  input).
* The replacement pays a strictly higher absolute fee.
* The replacement's fee-rate is at least as high as the original's.

The `RbfManager` (`node/src/rbf.rs`) enforces these checks and records
replacement lineage.

## Network-layer limits

These are enforced in the transport / RPC layers, not the mempool itself:

| Layer | Limit |
|-------|-------|
| HTTP body (RPC) | 1 MB — returns HTTP 413 |
| JSON-RPC request | 1 MB (`MAX_RPC_REQUEST_SIZE`) |
| P2P message frame | 10 MB (`MAX_MESSAGE_SIZE` in `transport.rs`) |

## Fee estimation

`fee_estimation.rs` provides `estimate_fee_rate(target_blocks)` that tracks
confirmed fee samples in recent blocks. Estimates are **clamped to at least
`MIN_RELAY_FEE_RATE`** (1 000 sat/kB) so wallets never produce transactions
that would be rejected at relay.

Percentile strategy by target:

| Target (blocks) | Percentile |
|------------------|------------|
| 1 | 90th (fast) |
| 2–3 | 75th (medium) |
| 4–6 | 50th (normal) |
| 7+ | 25th (economy) |

### Wallet integration

`Wallet::suggest_fee(estimator, num_inputs, num_outputs, target_blocks)` uses
a P2PKH size estimate (10 + 148×inputs + 34×outputs bytes) and the
`FeeEstimator` rate for the desired target. Falls back to `MIN_RELAY_FEE_RATE`
when the estimator has no samples.

## Reorganisation and finality guidance

### Maximum reorg depth

`MAX_REORG_DEPTH = 100` (`node/src/state.rs`) limits the length of chain
reorganisations. If a competing fork diverges more than 100 blocks from the
current tip, the node rejects the reorg as potentially hostile.

### Practical finality

Kubercoin is a proof-of-work chain — finality is probabilistic:

| Confirmations | Confidence | Use case |
|---------------|------------|----------|
| 1 | ~50% | Low-value, non-critical |
| 3 | ~87.5% | Small payments |
| 6 | ~99.9% | Standard payments (recommended default) |
| 12 | ~99.9999% | High-value transfers |
| 100 | Coinbase maturity, policy-final | Exchange deposits, protocol-level finality |

Services should choose a confirmation threshold appropriate for transaction
value. The `COINBASE_MATURITY` of 100 blocks means mined coins cannot be
spent for approximately 16.7 hours, providing a strong economic finality
baseline.

### Consensus constants summary

| Parameter | Value | Source |
|-----------|-------|--------|
| Block subsidy | 50 KUBER (halves every 210 000 blocks) | `consensus::params::INITIAL_BLOCK_REWARD` |
| Max supply | 21 000 000 KUBER | `consensus::params::MAX_SUPPLY` |
| Target block time | 10 minutes | `consensus::params::TARGET_BLOCK_TIME_SECS` |
| Difficulty adjustment | Every 2 016 blocks | `consensus::params::DIFFICULTY_ADJUSTMENT_INTERVAL` |
| Coinbase maturity | 100 blocks | `consensus::params::COINBASE_MATURITY` |
| Max block weight | 4 000 000 WU | `consensus::params::MAX_BLOCK_WEIGHT` |
| Max future block time | 2 hours | `consensus::params::MAX_FUTURE_BLOCK_TIME_SECS` |
| Max reorg depth | 100 blocks | `state::MAX_REORG_DEPTH` |

## Test coverage

Unit tests exercising these policies live in `node/src/mempool.rs` (module
`tests`). Key scenarios:

* Dust rejection, relay-fee enforcement, oversized-tx rejection
* Eviction of lowest-fee-rate entry
* Ancestor and descendant chain depth limits
* CPFP package ordering, RBF replacement
* Total-size tracking and capacity edge cases

Adversarial tests in `node/src/adversarial_tests.rs` cover deep-reorg depth
enforcement, max-reorg rejection, UTXO consistency across reorgs, and
competing-chain fork choice.
