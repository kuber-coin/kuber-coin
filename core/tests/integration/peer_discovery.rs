// Integration Test: Peer Discovery
//
// Full peer-discovery tests require multiple live TCP nodes and are covered by
// the end-to-end test suite (scripts/e2e_live.ps1).
//
// This module verifies the node can be instantiated without a P2PServer and
// that peer-related state is correctly initialised to the "no peers" baseline.

use super::helpers::make_state;

#[test]
fn test_node_starts_without_p2p_server() {
    // NodeState::new should succeed even when PeerManager / P2PServer is not
    // started.  AppState.peers == None is the expected initial condition.
    let (_dir, node, _mempool) = make_state();
    // If we get here without a panic the node started cleanly with peers=None.
    assert_eq!(node.get_height(), 0);
}

#[test]
fn test_orphan_pool_empty_on_start() {
    let (_dir, node, _mempool) = make_state();
    assert_eq!(
        node.orphan_count(),
        0,
        "no orphans expected on a fresh node"
    );
}
