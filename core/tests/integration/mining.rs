// Integration Test: Mining
//
// Tests mining functionality using real NodeState and consensus PoW.
// All blocks are mined at regtest difficulty (0x207fffff) which requires
// only a handful of nonce iterations, completing in microseconds.

use super::helpers::{make_state, mine_block, mine_blocks, p2wpkh_script};
use consensus::params::{block_subsidy, HALVING_INTERVAL, INITIAL_BLOCK_REWARD};
use testnet::{Network, NetworkParams};

// ── Block production ──────────────────────────────────────────────────────────

#[test]
fn test_mine_single_block_height_increments() {
    let (_dir, node, mempool) = make_state();
    assert_eq!(node.get_height(), 0);
    mine_block(&node, &mempool, 0);
    assert_eq!(node.get_height(), 1);
}

#[test]
fn test_mine_ten_blocks_sequential() {
    let (_dir, node, mempool) = make_state();
    mine_blocks(&node, &mempool, 10);
    assert_eq!(node.get_height(), 10);
}

#[test]
fn test_tip_advances_after_each_block() {
    let (_dir, node, mempool) = make_state();
    let mut prev_tip = node.get_tip();
    for i in 0..5u8 {
        let block = mine_block(&node, &mempool, i);
        let new_tip = node.get_tip();
        assert_ne!(new_tip, prev_tip, "tip must change after block {i}");
        assert_eq!(new_tip, block.hash());
        prev_tip = new_tip;
    }
}

// ── Block content ─────────────────────────────────────────────────────────────

#[test]
fn test_mined_block_contains_coinbase() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 5);
    assert!(!block.transactions.is_empty(), "block must have at least one tx");
    // First tx is the coinbase — it has no input txid (all-zeros).
    let coinbase = &block.transactions[0];
    assert!(
        coinbase.inputs.is_empty()
            || coinbase.inputs[0].prev_output.txid == [0u8; 32],
        "first transaction must be coinbase"
    );
}

#[test]
fn test_coinbase_reward_matches_consensus() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 0);
    let coinbase = &block.transactions[0];
    let reward = consensus::params::block_subsidy(1);
    let coinbase_output_value: u64 = coinbase.outputs.iter().map(|o| o.value).sum();
    assert_eq!(
        coinbase_output_value, reward,
        "coinbase output must equal the block subsidy"
    );
}

#[test]
fn test_block_bits_match_regtest_target() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 0);
    // Regtest difficulty target — essentially no work required.
    assert_eq!(
        block.header.bits, 0x207fffff,
        "regtest bits must be 0x207fffff"
    );
}

// ── PoW validation ────────────────────────────────────────────────────────────

#[test]
fn test_each_mined_block_satisfies_pow() {
    let (_dir, node, mempool) = make_state();
    let blocks = mine_blocks(&node, &mempool, 5);
    for (i, block) in blocks.iter().enumerate() {
        assert!(
            consensus::verify_pow(&block.header),
            "block at index {i} must satisfy PoW"
        );
    }
}

#[test]
fn test_merkle_root_is_consistent() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 0);
    let recomputed = chain::Block::calculate_merkle_root(&block.transactions);
    assert_eq!(
        block.header.merkle_root, recomputed,
        "merkle root header field must match recomputed root"
    );
}

// ── Block linkage ─────────────────────────────────────────────────────────────

#[test]
fn test_blocks_link_to_previous_hash() {
    let (_dir, node, mempool) = make_state();
    // Genesis (height 0) is auto-created; its hash is a real hash, not null.
    let genesis_hash = node.get_block_hash(0).expect("genesis must exist at height 0");
    let blocks = mine_blocks(&node, &mempool, 4);
    // blocks[0] is height 1, so its prev_hash must equal the genesis hash.
    assert_eq!(blocks[0].header.prev_hash, genesis_hash);
    for i in 1..blocks.len() {
        assert_eq!(
            blocks[i].header.prev_hash,
            blocks[i - 1].hash(),
            "block {i} must reference the hash of block {}",
            i - 1
        );
    }
}

#[test]
fn test_block_heights_are_monotone() {
    let (_dir, node, mempool) = make_state();
    let blocks = mine_blocks(&node, &mempool, 5);
    for (i, block) in blocks.iter().enumerate() {
        assert_eq!(
            block.header.height,
            (i + 1) as u64,
            "block at index {i} must have height {}",
            i + 1
        );
    }
}

// ── Subsidy halving sanity ────────────────────────────────────────────────────

#[test]
fn test_block_subsidy_at_height_1_is_positive() {
    let reward = block_subsidy(1);
    assert!(reward > 0, "block subsidy at height 1 must be positive");
}

#[test]
fn test_regtest_halving_schedule_matches_canonical_consensus_boundary() {
    let (_dir, node, _mempool) = make_state();
    let regtest = NetworkParams::for_network(Network::Regtest);

    assert_eq!(node.network(), kubercoin_node::config::Network::Regtest);
    assert_eq!(regtest.halving_interval, HALVING_INTERVAL);
    assert_eq!(regtest.block_reward(HALVING_INTERVAL - 1), INITIAL_BLOCK_REWARD);
    assert_eq!(regtest.block_reward(HALVING_INTERVAL), INITIAL_BLOCK_REWARD / 2);
    assert_eq!(regtest.block_reward(HALVING_INTERVAL), block_subsidy(HALVING_INTERVAL));
    assert_eq!(regtest.block_reward(HALVING_INTERVAL - 1), block_subsidy(HALVING_INTERVAL - 1));
}

#[test]
fn test_coinbase_script_pubkey_present() {
    let script = p2wpkh_script(42);
    assert_eq!(script.len(), 22, "P2WPKH script must be 22 bytes");
    assert_eq!(script[0], 0x00, "first byte must be OP_0");
    assert_eq!(script[1], 0x14, "second byte must be PUSH20");
}
