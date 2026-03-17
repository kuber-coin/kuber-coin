// Adversarial Tests — KuberCoin consensus security
//
// Each test exercises a distinct attack surface or malformed-block path.
// Tests use direct crate APIs (no mocks) and must all pass deterministically.
//
// Coverage:
//   • Proof-of-Work checks (verify_pow)
//   • Block header validity (timestamp, height, bits, version)
//   • Block structural validity (weight, coinbase position, multiple coinbase)
//   • Consensus amount checks (excessive coinbase reward, bad merkle root)
//   • Intra-block security (double-spend, BIP-30 duplicate txid)
//   • Transaction-level validation (version, inputs, outputs, UTXOs)
//   • Mempool policy (coinbase rejection)
//   • Orphan pool (unknown parent stored, overflow eviction)
//
// The 23 tests map exactly to LAUNCH_CHECKLIST item 7.

use chain::{Block, BlockHeader, UtxoSet};
use kubercoin_node::{config::Network, Config, Mempool, NodeState};
use std::sync::Arc;
use tempfile::TempDir;

// ── Local helpers ─────────────────────────────────────────────────────────────

fn make_state() -> (TempDir, Arc<NodeState>, Arc<Mempool>) {
    let dir = tempfile::tempdir().expect("tempdir");
    let config = Config {
        data_dir: dir.path().to_path_buf(),
        network: Network::Regtest,
        ..Config::default()
    };
    let node = NodeState::new(config).expect("NodeState::new");
    let mempool = Arc::new(Mempool::new(10 * 1024 * 1024));
    (dir, node, mempool)
}

fn p2wpkh_script(seed: u8) -> Vec<u8> {
    let mut hash = [0u8; 20];
    hash[0] = seed;
    hash[19] = seed.wrapping_mul(7);
    let mut script = vec![0x00u8, 0x14];
    script.extend_from_slice(&hash);
    script
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Build a valid coinbase transaction at the given height and script.
fn make_coinbase(height: u64, value: u64, script: Vec<u8>) -> tx::Transaction {
    tx::Transaction::new_coinbase(height, value, script)
}

/// Build a minimal valid block header for direct validator calls.
/// Uses version=0x2000_0000, regtest bits, height=1.
fn adv_header(merkle_root: [u8; 32]) -> BlockHeader {
    BlockHeader {
        version: 0x2000_0000,
        prev_hash: [0u8; 32],
        merkle_root,
        timestamp: 1_700_000_000,
        bits: 0x207fffff,
        nonce: 0,
        height: 1,
    }
}

// ── 1. Proof-of-Work ─────────────────────────────────────────────────────────

/// A block header with mainnet difficulty (0x1d00ffff) and nonce=0 will almost
/// never satisfy the target — verify_pow must return false.
#[test]
fn test_bad_pow_verify_pow_returns_false() {
    // Use mainnet difficulty — the probability of nonce=0 satisfying it is ~2^(-32).
    let header = BlockHeader {
        version: 0x2000_0000,
        prev_hash: [0u8; 32],
        merkle_root: [1u8; 32],
        timestamp: 1_700_000_000,
        bits: 0x1d00ffff, // mainnet difficulty — nonce=0 won't satisfy
        nonce: 0,
        height: 1,
    };
    assert!(
        !consensus::verify_pow(&header),
        "nonce=0 against mainnet difficulty must fail PoW check"
    );
}

// ── 2. Future timestamp ───────────────────────────────────────────────────────

/// add_block must reject a block whose timestamp is more than
/// MAX_FUTURE_BLOCK_TIME_SECS (7200 s) ahead of wall-clock time.
#[test]
fn test_block_with_future_timestamp_rejected() {
    let (_dir, node, _mempool) = make_state();
    let height = 1u64;
    let prev_hash = node.get_tip();
    let bits = node.calculate_next_bits(height);
    let reward = consensus::params::block_subsidy(height);
    let coinbase = make_coinbase(height, reward, p2wpkh_script(0));
    let txs = vec![coinbase];
    let merkle = Block::calculate_merkle_root(&txs);
    let header = BlockHeader {
        version: 0x2000_0000,
        prev_hash,
        merkle_root: merkle,
        timestamp: unix_now() + 3 * 3600, // 3 hours > 2-hour limit
        bits,
        nonce: 0,
        height,
    };
    let block = Block::new(header, txs);
    let result = node.add_block(&block);
    assert!(result.is_err(), "block with future timestamp must be rejected");
}

// ── 3. Wrong block height ─────────────────────────────────────────────────────

/// add_block must reject a block whose height does not equal parent_height + 1.
#[test]
fn test_block_with_wrong_height_rejected() {
    let (_dir, node, _mempool) = make_state();
    let prev_hash = node.get_tip(); // genesis (height 0)
    let wrong_height = 5u64; // should be 1
    let bits = node.calculate_next_bits(1);
    let reward = consensus::params::block_subsidy(wrong_height);
    let coinbase = make_coinbase(wrong_height, reward, p2wpkh_script(0));
    let txs = vec![coinbase];
    let merkle = Block::calculate_merkle_root(&txs);
    let header = BlockHeader {
        version: 0x2000_0000,
        prev_hash,
        merkle_root: merkle,
        timestamp: unix_now(),
        bits,
        nonce: 0,
        height: wrong_height,
    };
    let block = Block::new(header, txs);
    let result = node.add_block(&block);
    assert!(result.is_err(), "block with wrong height must be rejected");
}

// ── 4. Wrong bits ─────────────────────────────────────────────────────────────

/// add_block must reject a block whose bits field does not match the
/// expected difficulty target computed from the parent chain.
#[test]
fn test_block_with_wrong_bits_rejected() {
    let (_dir, node, _mempool) = make_state();
    let height = 1u64;
    let prev_hash = node.get_tip();
    let correct_bits = node.calculate_next_bits(height);
    // Use the opposite of the correct bits (mainnet vs regtest).
    let wrong_bits = if correct_bits == 0x207fffff {
        0x1d00ffff
    } else {
        0x207fffff
    };
    let reward = consensus::params::block_subsidy(height);
    let coinbase = make_coinbase(height, reward, p2wpkh_script(0));
    let txs = vec![coinbase];
    let merkle = Block::calculate_merkle_root(&txs);
    let header = BlockHeader {
        version: 0x2000_0000,
        prev_hash,
        merkle_root: merkle,
        timestamp: unix_now(),
        bits: wrong_bits,
        nonce: 0,
        height,
    };
    let block = Block::new(header, txs);
    let result = node.add_block(&block);
    assert!(result.is_err(), "block with wrong bits must be rejected");
}

// ── 5. Empty block ────────────────────────────────────────────────────────────

/// validate_block must reject a block that contains no transactions at all.
#[test]
fn test_empty_block_rejected() {
    let header = adv_header([0u8; 32]);
    let block = Block::new(header, vec![]);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        result.is_err(),
        "block with no transactions must be rejected"
    );
}

// ── 6. Non-coinbase first transaction ─────────────────────────────────────────

/// validate_block must reject a block whose first transaction is not a coinbase.
#[test]
fn test_coinbase_not_first_rejected() {
    // A regular (non-coinbase) transaction as the first tx in the block.
    let regular_tx = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new(tx::OutPoint::new([2u8; 32], 0), vec![])],
        outputs: vec![tx::TxOutput {
            value: 0,
            script_pubkey: vec![0x51],
        }],
        lock_time: 0,
    };
    let txs = vec![regular_tx];
    let merkle = Block::calculate_merkle_root(&txs);
    let block = Block::new(adv_header(merkle), txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(
            result,
            Err(consensus::ValidationError::InvalidCoinbasePosition)
        ),
        "non-coinbase first tx must yield InvalidCoinbasePosition"
    );
}

// ── 7. Multiple coinbase transactions ─────────────────────────────────────────

/// validate_block must reject a block that contains more than one coinbase.
#[test]
fn test_multiple_coinbase_rejected() {
    let reward = consensus::params::block_subsidy(1);
    let cb1 = make_coinbase(1, reward / 2, p2wpkh_script(0));
    let cb2 = make_coinbase(1, reward / 2, p2wpkh_script(1));
    let txs = vec![cb1, cb2];
    let merkle = Block::calculate_merkle_root(&txs);
    let block = Block::new(adv_header(merkle), txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(result, Err(consensus::ValidationError::MultipleCoinbase)),
        "block with two coinbase txs must yield MultipleCoinbase"
    );
}

// ── 8. Excessive coinbase reward ──────────────────────────────────────────────

/// validate_block must reject a block whose coinbase claims more than
/// the block subsidy (no fees possible since there are no other transactions).
#[test]
fn test_excessive_coinbase_reward_rejected() {
    let height = 1u64;
    let reward = consensus::params::block_subsidy(height);
    // Claim one satoshi more than allowed.
    let cb = make_coinbase(height, reward + 1, p2wpkh_script(0));
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let block = Block::new(adv_header(merkle), txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(
            result,
            Err(consensus::ValidationError::ExcessiveCoinbaseReward)
        ),
        "coinbase claiming reward+1 must yield ExcessiveCoinbaseReward"
    );
}

// ── 9. Bad merkle root ────────────────────────────────────────────────────────

/// validate_block must reject a block whose stated merkle root does not match
/// the actual merkle root of its transaction list.
#[test]
fn test_bad_merkle_root_rejected() {
    let height = 1u64;
    let reward = consensus::params::block_subsidy(height);
    let cb = make_coinbase(height, reward, p2wpkh_script(0));
    let txs = vec![cb];
    // Intentionally wrong merkle root.
    let wrong_merkle = [0xffu8; 32];
    let mut header = adv_header(wrong_merkle);
    header.merkle_root = wrong_merkle;
    let block = Block::new(header, txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(result, Err(consensus::ValidationError::InvalidMerkleRoot)),
        "block with wrong merkle root must yield InvalidMerkleRoot"
    );
}

// ── 10. Double-spend within a single block ────────────────────────────────────

/// validate_block must detect when two transactions within the same block
/// both attempt to spend the same UTXO (intra-block double-spend).
#[test]
fn test_double_spend_within_block_rejected() {
    let height = 1u64;
    let reward = consensus::params::block_subsidy(height);
    let cb = make_coinbase(height, reward, p2wpkh_script(0));
    // Two ordinary transactions both spending the same outpoint.
    let shared_input = tx::OutPoint::new([0xabu8; 32], 0);
    let spend1 = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new(shared_input, vec![])],
        outputs: vec![tx::TxOutput {
            value: 0,
            script_pubkey: p2wpkh_script(1),
        }],
        lock_time: 0,
    };
    let spend2 = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new(shared_input, vec![])], // same UTXO
        outputs: vec![tx::TxOutput {
            value: 0,
            script_pubkey: p2wpkh_script(2),
        }],
        lock_time: 0,
    };
    let txs = vec![cb, spend1, spend2];
    let merkle = Block::calculate_merkle_root(&txs);
    let block = Block::new(adv_header(merkle), txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(result, Err(consensus::ValidationError::DoubleSpend)),
        "intra-block double-spend must yield DoubleSpend"
    );
}

// ── 11. BIP-30: duplicate txid rejected ───────────────────────────────────────

/// BIP-30: a block is rejected if any of its transactions have the same txid
/// as a transaction whose outputs already exist in the UTXO set.
///
/// Strategy: accept block B1 (putting its coinbase txid into the UTXO set),
/// then build block B2 that re-uses the exact same coinbase transaction.
/// validate_block_no_scripts sees the coinbase txid already in the UTXO set
/// and returns DuplicateTxid.
#[test]
fn test_bip30_duplicate_txid_rejected() {
    let (_dir, node, _mempool) = make_state();

    // Build and accept the first block (B1).
    let height = 1u64;
    let prev_hash = node.get_tip();
    let bits = node.calculate_next_bits(height);
    let reward = consensus::params::block_subsidy(height);
    let cb = make_coinbase(height, reward, p2wpkh_script(0));
    let txs1: Vec<tx::Transaction> = vec![cb.clone()];
    let merkle1 = Block::calculate_merkle_root(&txs1);
    let now = unix_now();
    let mtp = node.get_mtp(height);
    let ps = node.get_block(&prev_hash).map(|b| b.header.timestamp).unwrap_or(0);
    let ts = now.max(mtp.saturating_add(1)).max(ps.saturating_add(1));
    let h1 = BlockHeader {
        version: 0x2000_0000,
        prev_hash,
        merkle_root: merkle1,
        timestamp: ts,
        bits,
        nonce: 0,
        height,
    };
    let mut b1 = Block::new(h1, txs1);
    for nonce in 0..u64::MAX {
        b1.header.nonce = nonce;
        if consensus::verify_pow(&b1.header) {
            break;
        }
    }
    node.add_block(&b1).expect("first block must be accepted");

    // Build block B2 that reuses the same coinbase tx (same txid).
    // The coinbase txid's outputs are now in the UTXO set → BIP-30 triggers.
    let height2 = 2u64;
    let prev_hash2 = node.get_tip(); // tip is now B1
    let bits2 = node.calculate_next_bits(height2);
    let txs2: Vec<tx::Transaction> = vec![cb]; // same coinbase → same txid
    let merkle2 = Block::calculate_merkle_root(&txs2);
    let h2 = BlockHeader {
        version: 0x2000_0000,
        prev_hash: prev_hash2,
        merkle_root: merkle2,
        timestamp: ts + 1,
        bits: bits2,
        nonce: 0,
        height: height2,
    };
    let b2 = Block::new(h2, txs2);

    // validate_block_no_scripts with the current UTXO set detects the duplicate.
    let utxo_guard = node.utxo_set();
    let result = consensus::validator::validate_block_no_scripts(&b2, &utxo_guard);
    assert!(
        matches!(result, Err(consensus::ValidationError::DuplicateTxid)),
        "block reusing a coinbase txid already in the UTXO set must yield DuplicateTxid"
    );
}

// ── 12. Block exceeds maximum weight ─────────────────────────────────────────

/// validate_block must reject a block whose weight exceeds MAX_BLOCK_WEIGHT
/// (4,000,000 weight units ≈ 1 MB base-only).
#[test]
fn test_block_exceeds_max_weight_rejected() {
    // A ~1 MB script_pubkey on the coinbase output pushes block weight > 4 MW.
    let large_script = vec![0x51u8; 1_000_001];
    let cb = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new_coinbase(1, vec![])],
        outputs: vec![tx::TxOutput {
            value: 0, // zero value — coinbase reward check passes (0 ≤ subsidy)
            script_pubkey: large_script,
        }],
        lock_time: 0,
    };
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let block = Block::new(adv_header(merkle), txs);
    // Verify the block actually exceeds the limit before asserting on the error.
    assert!(
        block.weight() > chain::MAX_BLOCK_WEIGHT,
        "test setup: block weight {} must exceed MAX_BLOCK_WEIGHT {}",
        block.weight(),
        chain::MAX_BLOCK_WEIGHT
    );
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(result, Err(consensus::ValidationError::BlockTooHeavy)),
        "oversized block must yield BlockTooHeavy"
    );
}

// ── 13. Bad block version ─────────────────────────────────────────────────────

/// validate_block must reject a block whose version does not have the BIP-9
/// top-3-bits set to 0b001 (value 0x20000000 mask).
/// Version 1 (legacy) fails this check.
#[test]
fn test_bad_block_version_rejected() {
    let reward = consensus::params::block_subsidy(1);
    let cb = make_coinbase(1, reward, p2wpkh_script(0));
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let mut header = adv_header(merkle);
    header.version = 1; // Legacy version, top bits not set to 001
    let block = Block::new(header, txs);
    let utxo = UtxoSet::new();
    let result = consensus::validator::validate_block_no_scripts(&block, &utxo);
    assert!(
        matches!(result, Err(consensus::ValidationError::BadBlockVersion)),
        "block with version=1 must yield BadBlockVersion"
    );
}

// ── 14. Transaction version 0 rejected ───────────────────────────────────────

/// validate_transaction must reject a non-coinbase transaction with version=0.
/// Version 0 is non-standard and was never valid on Bitcoin or KuberCoin.
#[test]
fn test_tx_version_zero_rejected() {
    let tx = tx::Transaction {
        version: 0,
        inputs: vec![tx::TxInput::new(tx::OutPoint::new([1u8; 32], 0), vec![])],
        outputs: vec![tx::TxOutput {
            value: 1000,
            script_pubkey: p2wpkh_script(0),
        }],
        lock_time: 0,
    };
    let utxo = UtxoSet::new();
    let result = consensus::validate_transaction(&tx, &utxo, 1);
    assert!(
        result.is_err(),
        "transaction with version=0 must be rejected"
    );
}

// ── 15. Transaction version 3 rejected ───────────────────────────────────────

/// validate_transaction must reject a non-coinbase transaction with version>2.
/// Only versions 1 and 2 are valid (version 2 enables BIP-68 CSV).
#[test]
fn test_tx_version_three_rejected() {
    let tx = tx::Transaction {
        version: 3,
        inputs: vec![tx::TxInput::new(tx::OutPoint::new([1u8; 32], 0), vec![])],
        outputs: vec![tx::TxOutput {
            value: 1000,
            script_pubkey: p2wpkh_script(0),
        }],
        lock_time: 0,
    };
    let utxo = UtxoSet::new();
    let result = consensus::validate_transaction(&tx, &utxo, 1);
    assert!(
        result.is_err(),
        "transaction with version=3 must be rejected"
    );
}

// ── 16. Transaction with no inputs rejected ───────────────────────────────────

/// validate_transaction must reject a transaction that has no inputs at all.
#[test]
fn test_tx_no_inputs_rejected() {
    let tx = tx::Transaction {
        version: 2,
        inputs: vec![],
        outputs: vec![tx::TxOutput {
            value: 1000,
            script_pubkey: p2wpkh_script(0),
        }],
        lock_time: 0,
    };
    let utxo = UtxoSet::new();
    let result = consensus::validate_transaction(&tx, &utxo, 1);
    assert!(result.is_err(), "transaction with no inputs must be rejected");
}

// ── 17. Transaction with no outputs rejected ──────────────────────────────────

/// validate_transaction must reject a transaction that has no outputs.
/// A transaction that destroys coins is never valid.
#[test]
fn test_tx_no_outputs_rejected() {
    let tx = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new(tx::OutPoint::new([1u8; 32], 0), vec![])],
        outputs: vec![],
        lock_time: 0,
    };
    let utxo = UtxoSet::new();
    let result = consensus::validate_transaction(&tx, &utxo, 1);
    assert!(
        result.is_err(),
        "transaction with no outputs must be rejected"
    );
}

// ── 18. Transaction spending unknown UTXO rejected ────────────────────────────

/// validate_transaction must reject a transaction that attempts to spend an
/// outpoint that does not exist in the current UTXO set.
#[test]
fn test_tx_unknown_utxo_rejected() {
    let nonexistent = tx::OutPoint::new([0xddu8; 32], 7);
    let tx = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput::new(nonexistent, vec![])],
        outputs: vec![tx::TxOutput {
            value: 100,
            script_pubkey: p2wpkh_script(0),
        }],
        lock_time: 0,
    };
    let utxo = UtxoSet::new(); // empty — outpoint definitely missing
    let result = consensus::validate_transaction(&tx, &utxo, 1);
    assert!(
        result.is_err(),
        "transaction spending unknown UTXO must be rejected"
    );
}

// ── 19. Mempool rejects coinbase transaction ──────────────────────────────────

/// The mempool must refuse to accept a coinbase transaction.
/// Coinbase transactions are only valid when mined directly into a block;
/// broadcasting them via the mempool is invalid.
#[test]
fn test_mempool_rejects_coinbase_transaction() {
    let (_dir, node, mempool) = make_state();
    let reward = consensus::params::block_subsidy(1);
    let coinbase = tx::Transaction::new_coinbase(1, reward, p2wpkh_script(0));
    let utxo_guard = node.utxo_set();
    let result = mempool.add_transaction_checked(coinbase, 0, &utxo_guard);
    assert!(
        result.is_err(),
        "mempool must reject coinbase transactions"
    );
}

// ── 20. Orphan block stored, not rejected ────────────────────────────────────

/// When add_block receives a block whose parent is unknown, the block must be
/// stored as an orphan (not rejected).  add_block returns Ok(()) and the
/// orphan counter increments by exactly one.
#[test]
fn test_orphan_block_stored_not_rejected() {
    let (_dir, node, _mempool) = make_state();
    let unknown_parent = [0xeeu8; 32]; // random bytes, no real parent
    let height = 1u64;
    let bits = node.calculate_next_bits(height);
    let reward = consensus::params::block_subsidy(height);
    let cb = make_coinbase(height, reward, p2wpkh_script(0));
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let header = BlockHeader {
        version: 0x2000_0000,
        prev_hash: unknown_parent,
        merkle_root: merkle,
        timestamp: 1_700_000_000,
        bits,
        nonce: 0,
        height,
    };
    let block = Block::new(header, txs);
    let before = node.orphan_count();
    let result = node.add_block(&block);
    assert!(result.is_ok(), "orphan block must not return an error");
    assert_eq!(
        node.orphan_count(),
        before + 1,
        "orphan count must increase by one"
    );
}

// ── 21. Orphan pool overflow evicts oldest entries ───────────────────────────

/// When more than MAX_ORPHAN_BLOCKS (100) orphans are queued, the oldest
/// entries are evicted so the pool never exceeds the limit.
#[test]
fn test_orphan_pool_overflow_caps_at_maximum() {
    let (_dir, node, _mempool) = make_state();
    // Submit 101 blocks with distinct unknown parents.
    // Each gets a unique prev_hash and nonce so all blocks have different hashes.
    for i in 0u8..=100 {
        let mut unknown_parent = [0x10u8; 32];
        unknown_parent[0] = i;
        unknown_parent[1] = i.wrapping_add(1);
        let height = 1u64;
        let bits = node.calculate_next_bits(height);
        let reward = consensus::params::block_subsidy(height);
        let cb = make_coinbase(height, reward, p2wpkh_script(i));
        let txs = vec![cb];
        let merkle = Block::calculate_merkle_root(&txs);
        let header = BlockHeader {
            version: 0x2000_0000,
            prev_hash: unknown_parent,
            merkle_root: merkle,
            timestamp: 1_700_000_000,
            bits,
            nonce: i as u64,
            height,
        };
        let block = Block::new(header, txs);
        node.add_block(&block).expect("orphan submission must succeed");
    }
    assert!(
        node.orphan_count() <= 100,
        "orphan pool must cap at MAX_ORPHAN_BLOCKS=100, got {}",
        node.orphan_count()
    );
}

// ── 22. Block timestamp at or before MTP rejected ────────────────────────────

/// BIP-113: a block's timestamp must be strictly greater than the
/// Median-Time-Past.  validate_block_no_scripts_with_mtp enforces this when
/// an mtp_at_height closure is supplied.
#[test]
fn test_block_timestamp_at_mtp_rejected() {
    let fixed_mtp = 1_700_000_000u64;
    let mtp_fn = |_h: u64| fixed_mtp;

    let reward = consensus::params::block_subsidy(1);
    let cb = make_coinbase(1, reward, p2wpkh_script(0));
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let mut header = adv_header(merkle);
    // Set timestamp exactly equal to MTP — not strictly greater.
    header.timestamp = fixed_mtp;

    let block = Block::new(header, txs);
    let utxo = UtxoSet::new();
    let result =
        consensus::validator::validate_block_no_scripts_with_mtp(&block, &utxo, Some(&mtp_fn));
    assert!(
        matches!(
            result,
            Err(consensus::ValidationError::TimestampBeforeMTP)
        ),
        "block with timestamp == MTP must yield TimestampBeforeMTP"
    );
}

// ── 23. Genesis replacement with wrong bits rejected ─────────────────────────

/// An attacker cannot replace the genesis block by submitting a different
/// block at height 0 with prev_hash=[0;32].  If the bits do not match the
/// genesis_bits parameter, add_block immediately rejects the submission.
#[test]
fn test_genesis_replacement_with_wrong_bits_rejected() {
    let (_dir, node, _mempool) = make_state();
    // Regtest genesis uses bits=0x207fffff; use mainnet bits to trigger the check.
    let wrong_bits = 0x1d00ffff;
    let reward = consensus::params::block_subsidy(0);
    let cb = make_coinbase(0, reward, p2wpkh_script(0));
    let txs = vec![cb];
    let merkle = Block::calculate_merkle_root(&txs);
    let fake_genesis = Block::new(
        BlockHeader {
            version: 0x2000_0000,
            prev_hash: [0u8; 32], // signals "this is genesis"
            merkle_root: merkle,
            timestamp: 1_000_000_000,
            bits: wrong_bits,
            nonce: 0,
            height: 0,
        },
        txs,
    );
    let result = node.add_block(&fake_genesis);
    assert!(
        result.is_err(),
        "genesis replacement with wrong bits must be rejected"
    );
}
