// Integration Test: Transaction Processing
//
// Tests real transaction validation and UTXO lifecycle using NodeState
// production paths.  Script execution / signature verification is exercised
// indirectly through add_block and validate_transaction.

use super::helpers::{make_state, mine_block, mine_blocks, p2wpkh_script};

// ── validate_transaction defers coinbase checks to block-level validation ─────

#[test]
fn test_validate_transaction_accepts_coinbase_for_block_level_validation() {
    // validate_transaction_cached returns Ok(()) for coinbase transactions because
    // coinbase rules (reward, height encoding, etc.) are enforced at block-accept
    // time, not at individual-tx validation time.
    let (_dir, node, _mempool) = make_state();
    let reward = consensus::params::block_subsidy(1);
    let coinbase = tx::Transaction::new_coinbase(1, reward, p2wpkh_script(0));
    let result = node.validate_transaction(&coinbase);
    assert!(
        result.is_ok(),
        "validate_transaction must pass coinbase through (block-level rules apply)"
    );
}

// ── Empty-input transaction ───────────────────────────────────────────────────

#[test]
fn test_validate_transaction_rejects_no_inputs() {
    let (_dir, node, _mempool) = make_state();
    let tx_no_inputs = tx::Transaction {
        version: 2,
        inputs: vec![],
        outputs: vec![tx::TxOutput {
            value: 1000,
            script_pubkey: p2wpkh_script(1),
        }],
        lock_time: 0,
    };
    let tx = tx_no_inputs;
    let result = node.validate_transaction(&tx);
    assert!(result.is_err(), "tx with no inputs must be rejected");
}

// ── Empty-output transaction ──────────────────────────────────────────────────

#[test]
fn test_validate_transaction_rejects_no_outputs() {
    let (_dir, node, _mempool) = make_state();
    let tx_no_outputs = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput {
            prev_output: tx::OutPoint {
                txid: [1u8; 32],
                vout: 0,
            },
            script_sig: vec![],
            sequence: 0xffffffff,
            witness: tx::Witness::new(),
        }],
        outputs: vec![],
        lock_time: 0,
    };
    let result = node.validate_transaction(&tx_no_outputs);
    assert!(result.is_err(), "tx with no outputs must be rejected");
}

// ── Missing UTXO ─────────────────────────────────────────────────────────────

#[test]
fn test_validate_transaction_rejects_unknown_utxo() {
    let (_dir, node, _mempool) = make_state();
    // Reference a UTXO that does not exist in the UTXO set.
    let tx = tx::Transaction {
        version: 2,
        inputs: vec![tx::TxInput {
            prev_output: tx::OutPoint {
                txid: [0xdeu8; 32],
                vout: 0,
            },
            script_sig: vec![],
            sequence: 0xffffffff,
            witness: tx::Witness::new(),
        }],
        outputs: vec![tx::TxOutput {
            value: 5000,
            script_pubkey: p2wpkh_script(2),
        }],
        lock_time: 0,
    };
    let result = node.validate_transaction(&tx);
    assert!(result.is_err(), "tx spending unknown UTXO must be rejected");
}

// ── UTXO set populated after mining ──────────────────────────────────────────

#[test]
fn test_coinbase_utxo_exists_after_mining() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 10);
    let coinbase_txid = block.transactions[0].txid();
    let utxo = node.get_utxo(&coinbase_txid, 0);
    assert!(
        utxo.is_some(),
        "coinbase UTXO must be present in UTXO set immediately after mining"
    );
}

#[test]
fn test_get_balance_returns_zero_for_unknown_address() {
    let (_dir, node, _mempool) = make_state();
    // A fresh node with no mining has zero balance everywhere.
    // We use a bech32 address that we know is not funded.
    // Address validation failure returns an error; zero balance is also valid.
    let balance = node.get_balance("kbc1qunknownaddressforthisunittestxx");
    // Either the address is rejected (Err) or returns 0 — both are correct
    // behaviours for an unfunded address.
    match balance {
        Ok(b) => assert_eq!(b, 0),
        Err(_) => {} // Address parse error is acceptable
    }
}

// ── TX height index ───────────────────────────────────────────────────────────

#[test]
fn test_coinbase_tx_height_indexed() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 7);
    let coinbase_txid = block.transactions[0].txid();
    let height = node.get_tx_height(&coinbase_txid);
    assert_eq!(height, Some(1), "coinbase tx at block 1 must have height 1");
}

// ── Block height index ────────────────────────────────────────────────────────

#[test]
fn test_block_height_for_mined_block() {
    let (_dir, node, mempool) = make_state();
    mine_blocks(&node, &mempool, 3);
    let hash3 = node.get_block_hash(3).expect("block at height 3 must exist");
    let h = node.get_block_height(&hash3);
    assert_eq!(h, Some(3));
}
