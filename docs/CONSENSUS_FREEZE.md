# Consensus Freeze

This document identifies every consensus-critical file and rule in the KuberCoin codebase.
Any change to the files listed here requires dedicated review from at least two maintainers
with explicit acknowledgement that the change affects consensus behavior.

## Consensus-Critical Files

| File | Lines | Purpose | Tests |
|------|-------|---------|-------|
| `chain/src/lib.rs` | 51 | Constants and module exports | Yes |
| `chain/src/header.rs` | 114 | Block header structure, SHA-256d PoW hash | Yes |
| `chain/src/block.rs` | 200+ | Block structure, Merkle root, witness Merkle root | Yes |
| `chain/src/utxo.rs` | 400+ | UTXO set, BIP-30, coinbase maturity, undo data | Yes |
| `consensus/src/lib.rs` | 25 | Module exports | Yes |
| `consensus/src/params.rs` | 299 | **Canonical consensus parameters** (single source of truth) | Yes |
| `consensus/src/validator.rs` | 800+ | **Core transaction and block validation** | Yes |
| `consensus/src/difficulty.rs` | 300 | Compact bits to target, retargeting formula | Yes |
| `consensus/src/pow.rs` | 200 | Proof-of-work verification | Yes |
| `consensus/src/sig_cache.rs` | 150 | Signature verification cache | Yes |
| `tx/src/lib.rs` | 400+ | Transaction structure, txid, wtxid, sighash | Yes |
| `tx/src/script.rs` | 500 | P2PKH script VM (sandboxed) | Yes |
| `tx/src/script_interpreter.rs` | 500+ | **Full Bitcoin script interpreter** | Yes |
| `tx/src/opcodes.rs` | 400 | Opcode set, disabled opcodes, script builder | Yes |
| `node/src/state.rs` | 500+ | **Fork choice, reorg, UTXO commitment** | Yes |
| `node/src/blockchain_validation.rs` | 400 | Block header validation, MTP, difficulty | Yes |
| `testnet/src/genesis.rs` | 200 | **Genesis block definitions** (all networks) | Yes |

**Total**: approximately 5,200 lines of consensus-critical code across 17 files.

### Consensus-Adjacent Files (Policy, Not Consensus)

These files affect relay and mining behavior but do not determine block validity:

| File | Purpose |
|------|---------|
| `node/src/mempool.rs` | Transaction relay policy, fee floors, eviction |
| `node/src/mempool_policy.rs` | Configurable mempool admission policy |
| `node/src/mempool_limits.rs` | Mempool resource limits |
| `node/src/block_template.rs` | Mining template builder |
| `node/src/fee_estimation.rs` | Fee rate estimator |

## Chain Parameters

Source of truth: `consensus/src/params.rs`

| Parameter | Value | Notes |
|-----------|-------|-------|
| MAX_SUPPLY | 2,100,000,000,000,000 sat | 21,000,000 KUBER |
| COIN | 100,000,000 sat | 1 KUBER |
| INITIAL_BLOCK_REWARD | 5,000,000,000 sat | 50 KUBER |
| HALVING_INTERVAL | 210,000 blocks | ~4 years at 10-min blocks |
| COINBASE_MATURITY | 100 blocks | ~16.7 hours |
| DIFFICULTY_ADJUSTMENT_INTERVAL | 2,016 blocks | ~2 weeks |
| TARGET_BLOCK_TIME_SECS | 600 | 10 minutes |
| MAX_DIFFICULTY_ADJUSTMENT_FACTOR | 4 | Retarget clamped to [1/4, 4x] |
| MAX_BLOCK_WEIGHT | 4,000,000 WU | 4 MW (SegWit) |
| MAX_BLOCK_SIZE | 1,000,000 bytes | Legacy fallback |
| MAX_FUTURE_BLOCK_TIME_SECS | 7,200 | 2 hours |
| MAX_BLOCK_SIGOPS_COST | 80,000 WU | Legacy sigop = 4 WU, witness = 1 WU |

## Genesis Blocks

Source of truth: `testnet/src/genesis.rs`

### Mainnet

| Field | Value |
|-------|-------|
| Timestamp | 1771459200 (Feb 19, 2026 00:00:00 UTC) |
| Bits | 0x1e0fffff |
| Nonce | 2919801 |
| Reward | 50 KUBER |
| Message | "KuberCoin Mainnet Genesis 19/Feb/2026 - Sound Money for the Sovereign Individual" |
| Hash | 0000067aeba8c6ae3383ea38e108651add328687f4d0b01736bfe5d9f0244e41 |

### Testnet

| Field | Value |
|-------|-------|
| Timestamp | 1738195200 (Jan 29, 2026 00:00:00 UTC) |
| Bits | 0x1e0fffff |
| Nonce | 1921722 |
| Reward | 50 KUBER |
| Message | "The Times 29/Jan/2026 KuberCoin Genesis" |
| Hash | 00000ca78d72864b61fb2d4808ac8fe68041588f0d0b6ba6c3ae36d1bddd07de |

### Regtest

| Field | Value |
|-------|-------|
| Timestamp | 1738195200 |
| Bits | 0x207fffff (trivial difficulty) |
| Nonce | 0 |
| Hash | 421ba472bcf66bd89584b3a47f1d8244584bfe732d6aff245fb4787a1c951fac |

## Consensus Rules Summary

### Block Validation (`consensus/src/validator.rs`, `node/src/blockchain_validation.rs`)

1. Previous hash must match parent block hash.
2. Merkle root must match calculated Merkle tree of transactions.
3. Timestamp must be strictly after parent timestamp.
4. Timestamp must not exceed current time + 2 hours (MAX_FUTURE_BLOCK_TIME_SECS).
5. Timestamp must exceed Median-Time-Past of previous 11 blocks (BIP-113).
6. Difficulty bits must match calculated next difficulty (retarget every 2,016 blocks).
7. Block hash must be less than or equal to target derived from bits (PoW).
8. Block must contain at least one transaction.
9. First transaction must be coinbase; no other coinbase transactions allowed.
10. Block weight must not exceed 4,000,000 WU.
11. Block sigops cost must not exceed 80,000 WU.
12. No double-spends within a single block.

### Transaction Validation (`consensus/src/validator.rs`)

1. Transaction version must be 1 or 2 (v2 required for BIP-68 CSV).
2. Each output value must not exceed MAX_SUPPLY.
3. All inputs must reference existing, unspent outputs.
4. Total input value must be greater than or equal to total output value.
5. Coinbase outputs cannot be spent until COINBASE_MATURITY (100) confirmations.
6. Lock time is enforced per BIP-65: height-based (< 500,000,000) or time-based (MTP comparison).
7. Lock time is disabled when all input sequences are 0xFFFFFFFF.
8. BIP-68 relative lock-time (CSV) is enforced for v2 transactions when sequence bit 31 is 0.
9. All input signatures must be valid per the script type.

### Script Validation (`tx/src/script_interpreter.rs`, `consensus/src/validator.rs`)

Supported script types and their verification:

| Type | Detection | Verification |
|------|-----------|--------------|
| P2PKH | OP_DUP OP_HASH160 \<20\> \<hash\> OP_EQUALVERIFY OP_CHECKSIG | HASH160(pubkey) == hash, ECDSA sig check |
| P2SH (BIP-16) | OP_HASH160 \<20\> \<hash\> OP_EQUAL | Redeem script hash match, then execute redeem script |
| P2WPKH (BIP-141) | Witness v0, 20-byte program | HASH160(witness pubkey) == program, ECDSA sig check |
| P2WSH (BIP-141) | Witness v0, 32-byte program | SHA256(witness script) == program, execute witness script |
| P2SH-P2WPKH | P2SH wrapping witness v0 20-byte | Unwrap, then P2WPKH rules |
| P2SH-P2WSH | P2SH wrapping witness v0 32-byte | Unwrap, then P2WSH rules |
| Taproot key-path (BIP-341) | Witness v1, 32-byte program | Schnorr signature verification |
| Taproot script-path | Witness v1, script-path spend | **Rejected** (not yet implemented) |

### Fork Choice (`node/src/state.rs`)

1. The chain with the most cumulative proof-of-work is the canonical chain.
2. Reorgs disconnect blocks from the losing branch and replay the winning branch.
3. Reorgs deeper than MAX_REORG_DEPTH (100) are rejected.
4. Checkpoints (at minimum, genesis) cannot be reverted.
5. UTXO undo data is maintained per block for reorg correctness.

### Supply Schedule (`consensus/src/params.rs`)

1. Block reward starts at 50 KUBER.
2. Reward halves every 210,000 blocks.
3. 33rd halving produces 0 reward (right-shift of 50 KUBER by 32 = 0).
4. Total supply is bounded at 21,000,000 KUBER.
5. Coinbase transaction output must not exceed block_subsidy(height) + total_fees.

## Sighash Algorithms

| Algorithm | Scope | Reference |
|-----------|-------|-----------|
| Legacy ECDSA | `tx/src/lib.rs` — `signature_hash()` | Pre-SegWit |
| BIP-143 (SegWit v0) | `tx/src/lib.rs` — `segwit_v0_signature_hash()` | hashPrevouts, hashSequence, hashOutputs |
| BIP-341 (Taproot) | `tx/src/lib.rs` — `taproot_signature_hash()` | Tagged hash, all prevout amounts/scripts |

## Script Interpreter Limits

| Limit | Value | Source |
|-------|-------|--------|
| MAX_SCRIPT_SIZE | 10,000 bytes | `tx/src/script_interpreter.rs` |
| MAX_STACK_SIZE | 1,000 elements | `tx/src/script_interpreter.rs` |
| MAX_ELEMENT_SIZE | 520 bytes | `tx/src/script_interpreter.rs` |
| MAX_OPS_PER_SCRIPT | 201 | `tx/src/script_interpreter.rs` |
| MAX_SCRIPT_ITERATIONS | 10,000 | `tx/src/script.rs` |
| MAX_EXECUTION_TIME_MS | 5,000 ms | `tx/src/script.rs` |

## Disabled Opcodes

The following opcodes are consensus-invalid and cause immediate script failure:

OP_CAT (0x7e), OP_SUBSTR (0x7f), OP_LEFT (0x80), OP_RIGHT (0x81),
OP_INVERT (0x83), OP_AND (0x84), OP_OR (0x85), OP_XOR (0x86),
OP_2MUL (0x8d), OP_2DIV (0x8e), OP_MUL (0x95), OP_DIV (0x96),
OP_MOD (0x97), OP_LSHIFT (0x98), OP_RSHIFT (0x99)

## BIPs Implemented

| BIP | Description | Location |
|-----|-------------|----------|
| BIP-16 | Pay-to-Script-Hash (P2SH) | `consensus/src/validator.rs` |
| BIP-30 | Duplicate transaction prevention | `chain/src/utxo.rs` |
| BIP-34 | Height in coinbase scriptSig | `node/src/block_template.rs` |
| BIP-65 | OP_CHECKLOCKTIMEVERIFY (CLTV) | `tx/src/script_interpreter.rs` |
| BIP-68 | Relative lock-time (CSV sequences) | `consensus/src/validator.rs` |
| BIP-112 | OP_CHECKSEQUENCEVERIFY (CSV) | `tx/src/script_interpreter.rs` |
| BIP-113 | Median-Time-Past for locktime | `node/src/blockchain_validation.rs`, `node/src/state.rs` |
| BIP-125 | Replace-By-Fee signaling | `node/src/mempool.rs` |
| BIP-141 | Segregated Witness (P2WPKH, P2WSH) | `consensus/src/validator.rs`, `tx/src/lib.rs` |
| BIP-143 | SegWit v0 sighash | `tx/src/lib.rs` |
| BIP-147 | NULLDUMMY for CHECKMULTISIG | `tx/src/script_interpreter.rs` |
| BIP-152 | Compact block relay | `chain/src/compact_blocks.rs` |
| BIP-341 | Taproot (key-path spend only) | `consensus/src/validator.rs`, `tx/src/lib.rs` |

## Auditor Notes

1. **Taproot script-path spending is explicitly rejected** in `consensus/src/validator.rs` to prevent
   anyone-can-spend attacks until a full tapscript interpreter is implemented, reviewed, and ready for activation.

2. **Supply enforcement** is implicit via `params::block_subsidy()` — the 33rd halving produces 0 reward.
   No explicit "total minted" counter exists; supply is the sum of all unspent outputs.

3. **Checkpoint enforcement** is in `node/src/state.rs` — genesis checkpoint is mandatory.
   No additional checkpoints are defined for mainnet yet.

4. **Parallel block validation** via Rayon in `consensus/src/validator.rs` uses a thread-safe
   `SigCache` for signature verification deduplication.

5. **UTXO commitment hash** in `chain/src/utxo.rs` provides a deterministic SHA-256 digest of the
   sorted UTXO set for cross-node comparison.

## Change Control Process

Starting from the v1 release candidate branch:

1. **Identification**: Any PR touching the files listed in "Consensus-Critical Files" must be
   tagged with the `consensus` label.

2. **Review**: Consensus PRs require approval from at least two maintainers.

3. **Testing**: Consensus PRs must include regression tests exercising the changed rule.

4. **Documentation**: Any parameter or rule change must update this document before merge.

5. **Announcement**: Consensus changes that affect block or transaction validity must be
   announced to all node operators with at least 2,016 blocks (~2 weeks) of lead time.

6. **Hard fork policy**: Changes that make previously-invalid blocks valid require a planned
   activation height and coordinated upgrade across all node operators.

7. **Soft fork policy**: Changes that make previously-valid blocks invalid may use
   version-bit signaling (BIP-9 style) when support is added.
