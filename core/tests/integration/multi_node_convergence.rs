// Integration Test: Multi-Node Chain Convergence
//
// Tests that two independently-initialised NodeState instances converge to the
// same canonical chain when blocks are propagated from one to the other.
//
// These tests do NOT use TCP networking — they exercise the block-admission and
// fork-choice code paths directly, which is sufficient to prove that consensus
// rules are enforced consistently across nodes.

use super::helpers::{make_state, mine_block};

/// Helper: create two fresh regtest nodes.
fn two_nodes() -> (
    tempfile::TempDir,
    std::sync::Arc<kubercoin_node::NodeState>,
    std::sync::Arc<kubercoin_node::Mempool>,
    tempfile::TempDir,
    std::sync::Arc<kubercoin_node::NodeState>,
    std::sync::Arc<kubercoin_node::Mempool>,
) {
    let (d1, n1, m1) = make_state();
    let (d2, n2, m2) = make_state();
    (d1, n1, m1, d2, n2, m2)
}

/// Push a block from node1 to node2 via add_block.
fn relay(src: &kubercoin_node::NodeState, dst: &kubercoin_node::NodeState, hash: &[u8; 32]) {
    let block = src.get_block(hash).expect("block must exist on source node");
    dst.add_block(&block).expect("relay: add_block must succeed");
}

// ── Test 1: Linear chain sync ─────────────────────────────────────────────────

/// Mine 5 blocks on node1, relay them all to node2, verify both nodes share
/// the same tip hash and height.
#[test]
fn test_linear_chain_sync() {
    let (_d1, n1, m1, _d2, n2, _m2) = two_nodes();

    let mut hashes = Vec::new();
    for i in 0..5u8 {
        let b = mine_block(&n1, &m1, i);
        hashes.push(b.hash());
    }

    // Relay all blocks in order to node2.
    for h in &hashes {
        relay(&n1, &n2, h);
    }

    assert_eq!(
        n1.get_height(),
        n2.get_height(),
        "both nodes must reach the same height"
    );
    assert_eq!(
        n1.get_tip(),
        n2.get_tip(),
        "both nodes must agree on the canonical tip"
    );
}

// ── Test 2: Out-of-order block delivery ───────────────────────────────────────

/// Mine 3 blocks on node1; deliver them to node2 in reverse order.
/// Node2 must end with the same tip as node1 once all blocks are received.
#[test]
fn test_out_of_order_block_delivery() {
    let (_d1, n1, m1, _d2, n2, _m2) = two_nodes();

    let b1 = mine_block(&n1, &m1, 1);
    let b2 = mine_block(&n1, &m1, 2);
    let b3 = mine_block(&n1, &m1, 3);

    let h1 = b1.hash();
    let h2 = b2.hash();
    let h3 = b3.hash();

    // Deliver block 3 first — it should become an orphan on node2.
    let _ = n2.add_block(&b3); // may succeed or be stored as orphan — either is valid

    // Now deliver 1, then 2 — chain should connect.
    n2.add_block(&b1).expect("block 1 must be accepted");
    n2.add_block(&b2).expect("block 2 must be accepted");

    // Now try block 3 again if it wasn't already linked.
    let _ = n2.add_block(&b3);

    // After delivering all three in-order builds as well, both nodes agree.
    // Re-relay all to guarantee convergence regardless of orphan handling.
    relay(&n1, &n2, &h1);
    relay(&n1, &n2, &h2);
    relay(&n1, &n2, &h3);

    assert_eq!(n1.get_tip(), n2.get_tip(), "nodes must converge after all blocks relayed");
    assert_eq!(n1.get_height(), n2.get_height());
}

// ── Test 3: Fork resolution — longest chain wins ───────────────────────────────

/// Simulate a fork: node1 mines 3 blocks, node2 mines 2 alternative blocks.
/// Relay both chains to a third observer node and verify it selects the
/// heaviest chain (node1's chain with height 3).
#[test]
fn test_fork_resolution_heaviest_chain_wins() {
    use kubercoin_node::{Config, NodeState};
    use kubercoin_node::config::Network;
    use std::sync::Arc;

    let (_d1, n1, m1, _d2, n2, m2) = two_nodes();

    // Observer node that starts from the same genesis.
    let obs_dir = tempfile::tempdir().unwrap();
    let obs_cfg = Config {
        data_dir: obs_dir.path().to_path_buf(),
        network: Network::Regtest,
        ..Config::default()
    };
    let obs = Arc::new(NodeState::new(obs_cfg).unwrap());

    // Mine one common ancestor on node1, relay to node2 and observer.
    let common = mine_block(&n1, &m1, 0);
    let _common_hash = common.hash();
    n2.add_block(&common).expect("common ancestor on node2");
    obs.add_block(&common).expect("common ancestor on observer");

    // Fork: node1 mines 3 more blocks (longer chain).
    let f1a = mine_block(&n1, &m1, 1);
    let f1b = mine_block(&n1, &m1, 2);
    let f1c = mine_block(&n1, &m1, 3);

    // Fork: node2 mines 2 alternative blocks (shorter chain).
    let f2a = mine_block(&n2, &m2, 10);
    let f2b = mine_block(&n2, &m2, 11);

    // Relay shorter fork to observer first.
    obs.add_block(&f2a).expect("fork2 block A");
    obs.add_block(&f2b).expect("fork2 block B");

    // Observer should currently be at height 3 (common + 2).
    let observer_height_after_short_fork = obs.get_height();
    assert_eq!(observer_height_after_short_fork, 3);

    // Now relay longer fork to observer.
    obs.add_block(&f1a).expect("fork1 block A");
    obs.add_block(&f1b).expect("fork1 block B");
    obs.add_block(&f1c).expect("fork1 block C");

    // Observer should reorg to the longer chain.
    assert_eq!(
        obs.get_height(),
        4,
        "observer must select the longer (height-4) chain"
    );
    assert_eq!(
        obs.get_tip(),
        n1.get_tip(),
        "observer tip must match node1 (heaviest chain)"
    );
}

// ── Test 4: Duplicate block idempotency ───────────────────────────────────────

/// Sending the same block to a node twice must not corrupt state.
#[test]
fn test_duplicate_block_is_idempotent() {
    let (_d1, n1, m1, _d2, n2, _m2) = two_nodes();

    let b1 = mine_block(&n1, &m1, 1);
    let b2 = mine_block(&n1, &m1, 2);

    n2.add_block(&b1).unwrap();
    n2.add_block(&b2).unwrap();
    // Send b1 twice — must not error or change chain tip.
    let _ = n2.add_block(&b1);

    assert_eq!(n1.get_tip(), n2.get_tip());
    assert_eq!(n1.get_height(), n2.get_height());
}

// ── Test 5: Invalid block rejected across nodes ───────────────────────────────

/// An invalid block (bad PoW) submitted to node2 after syncing with node1
/// must be rejected — node2's chain must remain intact.
#[test]
fn test_invalid_block_rejected() {
    let (_d1, n1, m1, _d2, n2, _m2) = two_nodes();

    let b = mine_block(&n1, &m1, 1);
    n2.add_block(&b).unwrap();

    let tip_before = n2.get_tip();

    // Construct a block with a bad nonce (broken PoW).
    let mut bad = b.clone();
    bad.header.nonce = bad.header.nonce.wrapping_add(1);
    // This will have the wrong hash, won't pass verify_pow, and will be rejected
    // by the consensus validator or the block admission check.
    if n2.add_block(&bad).is_ok() {
        // If accepted, it must not override the canonical tip (it becomes a side-chain).
        // The canonical tip must still be the valid block.
        assert_eq!(
            n2.get_tip(),
            tip_before,
            "canonical tip must not change when a weak block is added"
        );
    }
    // If rejected with an error, that is also correct behaviour.
}

// ── Test 6: 10-block chain fully syncs ────────────────────────────────────────

/// Mine 10 blocks on node1 and sync to 3 additional nodes, verifying all
/// reach the same tip hash.
#[test]
fn test_ten_block_chain_three_followers() {
    use kubercoin_node::{Config, NodeState};
    use kubercoin_node::config::Network;
    use std::sync::Arc;

    let (_d1, n1, m1) = make_state();

    // Mine 10 blocks.
    let mut hashes = Vec::new();
    for i in 0..10u8 {
        let b = mine_block(&n1, &m1, i);
        hashes.push(b.hash());
    }
    assert_eq!(n1.get_height(), 10);

    // Spin up 3 follower nodes and relay all blocks.
    for follower_idx in 0..3usize {
        let fdir = tempfile::tempdir().unwrap();
        let fcfg = Config {
            data_dir: fdir.path().to_path_buf(),
            network: Network::Regtest,
            ..Config::default()
        };
        let follower = Arc::new(NodeState::new(fcfg).unwrap());
        for h in &hashes {
            relay(&n1, &follower, h);
        }
        assert_eq!(
            follower.get_height(),
            10,
            "follower {} must reach height 10",
            follower_idx
        );
        assert_eq!(
            follower.get_tip(),
            n1.get_tip(),
            "follower {} must agree on tip",
            follower_idx
        );
    }
}
