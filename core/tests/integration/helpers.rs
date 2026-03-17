// Shared helpers for real integration tests.
// All helpers use production code paths — no mocks.

use chain::{Block, BlockHeader};
use kubercoin_node::{config::Network, Config, Mempool, NodeState};
use std::sync::Arc;
use tempfile::TempDir;

/// Creates a regtest-configured `NodeState` and `Mempool` in a fresh temporary
/// directory.  Returns the `TempDir` so the caller can keep it alive for the
/// duration of the test.
pub fn make_state() -> (TempDir, Arc<NodeState>, Arc<Mempool>) {
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

/// Returns a minimal valid P2WPKH script-pubkey (OP_0 PUSH20 <hash>).
/// Uses a deterministic key derived from `seed` so the same address can be
/// regenerated in the same test.
pub fn p2wpkh_script(seed: u8) -> Vec<u8> {
    let mut hash = [0u8; 20];
    hash[0] = seed;
    hash[19] = seed.wrapping_mul(7);
    // OP_0 (0x00)  PUSH20 (0x14)  <20-byte hash>
    let mut script = vec![0x00u8, 0x14];
    script.extend_from_slice(&hash);
    script
}

/// Mines exactly one valid regtest block on top of the current chain tip and
/// calls `node.add_block()`.  Returns the mined `Block`.
///
/// The timestamp is chosen as `max(now, mtp+1, parent_ts+1)` to satisfy BIP-113.
pub fn mine_block(node: &NodeState, mempool: &Mempool, seed: u8) -> Block {
    let height = node.get_height() + 1;
    let prev_hash = node.get_tip();
    let bits = node.calculate_next_bits(height);

    // BIP-113: timestamp must be strictly greater than the median-time-past and
    // the parent block's timestamp.
    let now = unix_now();
    let mtp = node.get_mtp(height);
    let parent_ts = node
        .get_block(&prev_hash)
        .map(|b| b.header.timestamp)
        .unwrap_or(0);
    let timestamp = now.max(mtp.saturating_add(1)).max(parent_ts.saturating_add(1));

    let reward = consensus::params::block_subsidy(height);
    let script_pubkey = p2wpkh_script(seed);
    let coinbase = tx::Transaction::new_coinbase(height, reward, script_pubkey);

    let txs = vec![coinbase];
    let merkle_root = Block::calculate_merkle_root(&txs);

    let header = BlockHeader {
        version: 0x2000_0000,
        height,
        prev_hash,
        merkle_root,
        timestamp,
        bits,
        nonce: 0,
    };
    let mut block = Block::new(header, txs);

    // Solve PoW — regtest bits (0x207fffff) require almost no work.
    for nonce in 0..u64::MAX {
        block.header.nonce = nonce;
        if consensus::verify_pow(&block.header) {
            break;
        }
    }

    node.add_block(&block).expect("add_block");
    mempool.remove_block_transactions(&block);
    block
}

/// Mines `count` regtest blocks, returning all of them.
pub fn mine_blocks(node: &NodeState, mempool: &Mempool, count: u64) -> Vec<Block> {
    (0..count).map(|i| mine_block(node, mempool, i as u8)).collect()
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
