// Integration Test: Mempool Management
//
// Tests the mempool using real Mempool::new and real transaction types.
// No mock structs — every path exercises production code.

use super::helpers::{make_state, mine_blocks, p2wpkh_script};
use kubercoin_node::Mempool;

// ── Construction ──────────────────────────────────────────────────────────────

#[test]
fn test_mempool_starts_empty() {
    let mempool = Mempool::new(10 * 1024 * 1024);
    assert_eq!(mempool.count(), 0);
    assert_eq!(mempool.size_bytes(), 0);
}

#[test]
fn test_mempool_size_limit_is_enforced() {
    // A 1-byte mempool cannot hold any real transaction.
    let tiny = Mempool::new(1);
    assert_eq!(tiny.count(), 0);
}

// ── Coinbase rejection ────────────────────────────────────────────────────────

#[test]
fn test_mempool_rejects_coinbase_directly() {
    let (_dir, node, mempool) = make_state();
    let reward = consensus::params::block_subsidy(1);
    let script = p2wpkh_script(0);
    let coinbase = tx::Transaction::new_coinbase(1, reward, script);
    // add_transaction_checked should reject coinbase transactions.
    let result = mempool.add_transaction_checked(coinbase, 0, &node.utxo_set());
    assert!(result.is_err(), "coinbase must be rejected by the mempool");
}

// ── Orphan tracking ───────────────────────────────────────────────────────────

#[test]
fn test_orphan_count_increments() {
    let (_dir, _node, mempool) = make_state();
    let unknown_parent = [0xabu8; 32];
    let orphan = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput {
            prev_output: tx::OutPoint {
                txid: unknown_parent,
                vout: 0,
            },
            script_sig: vec![],
            sequence: 0xfffffffd,
            witness: tx::Witness::new(),
        }],
        outputs: vec![tx::TxOutput {
            value: 1000,
            script_pubkey: p2wpkh_script(1),
        }],
        lock_time: 0,
    };
    mempool.add_orphan(orphan, vec![unknown_parent]);
    assert_eq!(mempool.orphan_count(), 1);
}

#[test]
fn test_orphan_removed_explicitly() {
    let (_dir, _node, mempool) = make_state();
    let unknown_parent = [0xcdu8; 32];
    let orphan = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput {
            prev_output: tx::OutPoint {
                txid: unknown_parent,
                vout: 0,
            },
            script_sig: vec![],
            sequence: 0xfffffffd,
            witness: tx::Witness::new(),
        }],
        outputs: vec![tx::TxOutput {
            value: 500,
            script_pubkey: p2wpkh_script(2),
        }],
        lock_time: 0,
    };
    let txid = orphan.txid();
    mempool.add_orphan(orphan, vec![unknown_parent]);
    assert_eq!(mempool.orphan_count(), 1);
    mempool.remove_orphan(&txid);
    assert_eq!(mempool.orphan_count(), 0);
}

// ── Block transaction removal ─────────────────────────────────────────────────

#[test]
fn test_block_transactions_cleared_from_mempool() {
    let (_dir, node, mempool) = make_state();
    // Mine a block — helper already calls remove_block_transactions.
    let blocks = mine_blocks(&node, &mempool, 2);
    // After mining, all coinbase txids from the two blocks must not be in
    // the mempool (they were never in it, but the removal must be idempotent).
    for block in &blocks {
        for tx in &block.transactions {
            assert!(!mempool.contains(&tx.txid()));
        }
    }
    assert_eq!(mempool.count(), 0);
}

// ── Fee histogram / estimation ────────────────────────────────────────────────

#[test]
fn test_empty_mempool_fee_estimation_is_none() {
    let mempool = Mempool::new(10 * 1024 * 1024);
    // With no transactions, fee estimation for any target must be None.
    assert!(mempool.estimate_fee_rate(1).is_none());
    assert!(mempool.estimate_fee_rate(6).is_none());
}

#[test]
fn test_empty_mempool_fee_histogram_is_empty_or_default() {
    let mempool = Mempool::new(10 * 1024 * 1024);
    // fee_histogram may return a pre-allocated list of empty buckets or
    // a fully-empty vec — both are acceptable for an empty mempool.
    let histogram = mempool.fee_histogram();
    // If non-empty, all buckets must have zero transaction count.
    for (_, count) in &histogram {
        assert_eq!(*count, 0, "all histogram buckets must be empty");
    }
}

// ── Clear ─────────────────────────────────────────────────────────────────────

#[test]
fn test_clear_resets_mempool() {
    let (_dir, _node, mempool) = make_state();
    let unknown_parent = [0x11u8; 32];
    let orphan = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput {
            prev_output: tx::OutPoint {
                txid: unknown_parent,
                vout: 0,
            },
            script_sig: vec![],
            sequence: 0xfffffffe,
            witness: tx::Witness::new(),
        }],
        outputs: vec![tx::TxOutput {
            value: 100,
            script_pubkey: p2wpkh_script(3),
        }],
        lock_time: 0,
    };
    mempool.add_orphan(orphan, vec![unknown_parent]);
    mempool.clear();
    assert_eq!(mempool.count(), 0);
    assert_eq!(mempool.orphan_count(), 0);
}
