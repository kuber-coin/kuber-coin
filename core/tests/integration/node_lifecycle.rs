// Integration Test: Full Node Lifecycle
//
// Tests the complete lifecycle of a KuberCoin node using real NodeState.
// No mocks — every assertion exercises the production code path.

use super::helpers::{make_state, mine_block, mine_blocks};
use kubercoin_node::{config::Network, Config, NodeState};

// ── Startup ───────────────────────────────────────────────────────────────────

#[test]
fn test_node_initial_state_is_empty() {
    let (_dir, node, _mempool) = make_state();
    assert_eq!(node.get_height(), 0, "fresh node should be at height 0 (genesis)");
    // Genesis block is automatically created: tip is a real hash, not null.
    assert_ne!(node.get_tip(), [0u8; 32], "genesis tip must be a real hash");
}

#[test]
fn test_node_network_is_regtest() {
    let (_dir, node, _mempool) = make_state();
    assert_eq!(node.network(), Network::Regtest);
}

// ── Mining ────────────────────────────────────────────────────────────────────

#[test]
fn test_node_mines_first_block() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 0);
    assert_eq!(node.get_height(), 1);
    assert_eq!(node.get_tip(), block.hash());
}

#[test]
fn test_node_mines_five_blocks() {
    let (_dir, node, mempool) = make_state();
    let blocks = mine_blocks(&node, &mempool, 5);
    assert_eq!(node.get_height(), 5);
    assert_eq!(node.get_tip(), blocks.last().unwrap().hash());
}

// ── Block retrieval ───────────────────────────────────────────────────────────

#[test]
fn test_get_block_by_hash() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 1);
    let hash = block.hash();
    let retrieved = node.get_block(&hash).expect("block should be retrievable");
    assert_eq!(retrieved.hash(), hash);
    assert_eq!(retrieved.header.height, 1);
}

#[test]
fn test_get_block_hash_by_height() {
    let (_dir, node, mempool) = make_state();
    let block = mine_block(&node, &mempool, 2);
    let hash_from_height = node.get_block_hash(1).expect("height 1 should exist");
    assert_eq!(hash_from_height, block.hash());
}

#[test]
fn test_get_unknown_block_returns_none() {
    let (_dir, node, _mempool) = make_state();
    assert!(node.get_block(&[0xffu8; 32]).is_none());
}

// ── State persistence ─────────────────────────────────────────────────────────

#[test]
fn test_node_state_persists_across_restart() {
    // Mine a few blocks, drop the node, reload from the same data dir, and
    // verify the height is intact.
    let dir = tempfile::tempdir().unwrap();
    let mempool = std::sync::Arc::new(kubercoin_node::Mempool::new(10 * 1024 * 1024));

    let expected_height = {
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: Network::Regtest,
            ..Config::default()
        };
        let node = NodeState::new(config).expect("first NodeState");
        mine_blocks(&node, &mempool, 3);
        node.get_height()
    };
    assert_eq!(expected_height, 3);

    // Restart — new NodeState from same data_dir.
    let config2 = Config {
        data_dir: dir.path().to_path_buf(),
        network: Network::Regtest,
        ..Config::default()
    };
    let node2 = NodeState::new(config2).expect("second NodeState");
    assert_eq!(
        node2.get_height(),
        expected_height,
        "restarted node should recover to the persisted height"
    );
}

// ── Chain progress ────────────────────────────────────────────────────────────

#[test]
fn test_chainwork_grows_with_each_block() {
    let (_dir, node, mempool) = make_state();
    let work_before = node.get_chainwork();
    mine_block(&node, &mempool, 0);
    let work_after = node.get_chainwork();
    // Chainwork is a 256-bit big-endian number; after mining it must be strictly
    // larger.
    assert!(work_after > work_before, "chainwork must increase after mining");
}

#[test]
fn test_mtp_advances() {
    let (_dir, node, mempool) = make_state();
    mine_blocks(&node, &mempool, 1);
    let mtp_1 = node.get_mtp(1);
    // Genesis MTP is 0; after one block it should advance.
    // At height 1 we query get_mtp(2) for the next block's MTP.
    mine_blocks(&node, &mempool, 10);
    let mtp_12 = node.get_mtp(12);
    assert!(mtp_12 >= mtp_1, "MTP must not decrease as chain grows");
}
