//! Consensus checkpoints — hardcoded (height, hash) pairs that anchor the chain.
//!
//! A checkpoint prevents deep reorgs below the highest matched checkpoint.
//! During initial block download (IBD), blocks at checkpoint heights
//! **must** have the expected hash; otherwise they are rejected.

/// A single checkpoint entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Checkpoint {
    /// Block height.
    pub height: u64,
    /// Expected block hash (double-SHA-256, little-endian).
    pub hash: [u8; 32],
}

/// Manages per-network checkpoint lists and provides query helpers.
#[derive(Debug, Clone)]
pub struct CheckpointManager {
    checkpoints: Vec<Checkpoint>,
}

impl CheckpointManager {
    /// Create a manager from a sorted (ascending height) list of checkpoints.
    ///
    /// Callers typically pass the genesis hash (height 0) as the first entry.
    pub fn new(mut checkpoints: Vec<Checkpoint>) -> Self {
        checkpoints.sort_by_key(|c| c.height);
        Self { checkpoints }
    }

    /// Create an empty manager (no checkpoints enforced).
    pub fn empty() -> Self {
        Self { checkpoints: Vec::new() }
    }

    /// Returns `true` if `hash` at `height` satisfies the checkpoint list.
    ///
    /// * If `height` matches a checkpoint entry and the hash **differs**
    ///   → returns `false` (block must be rejected).
    /// * Otherwise → returns `true`.
    pub fn verify(&self, height: u64, hash: &[u8; 32]) -> bool {
        for cp in &self.checkpoints {
            if cp.height == height {
                return cp.hash == *hash;
            }
        }
        true // height not checkpointed — no constraint
    }

    /// Height of the highest checkpoint, or `None` if the list is empty.
    pub fn last_checkpoint_height(&self) -> Option<u64> {
        self.checkpoints.last().map(|c| c.height)
    }

    /// Returns `true` if a reorg that would roll back past the highest
    /// checkpoint should be forbidden.
    ///
    /// `current_height` is the chain tip; `reorg_target` is the height we
    /// would roll back to.  If `reorg_target` is below the last checkpoint
    /// we deny the reorg.
    pub fn reorg_allowed(&self, reorg_target: u64) -> bool {
        match self.last_checkpoint_height() {
            Some(last) => reorg_target >= last,
            None => true,
        }
    }

    /// Number of checkpoints in this manager.
    pub fn len(&self) -> usize {
        self.checkpoints.len()
    }

    /// Whether the checkpoint list is empty.
    pub fn is_empty(&self) -> bool {
        self.checkpoints.is_empty()
    }

    /// Iterate over all checkpoints.
    pub fn iter(&self) -> impl Iterator<Item = &Checkpoint> {
        self.checkpoints.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_hash(byte: u8) -> [u8; 32] {
        let mut h = [0u8; 32];
        h[0] = byte;
        h
    }

    #[test]
    fn empty_manager_allows_everything() {
        let mgr = CheckpointManager::empty();
        assert!(mgr.verify(0, &[0u8; 32]));
        assert!(mgr.verify(100_000, &[1u8; 32]));
        assert!(mgr.reorg_allowed(0));
        assert!(mgr.is_empty());
    }

    #[test]
    fn verify_matching_checkpoint() {
        let cp = Checkpoint { height: 0, hash: sample_hash(0xAA) };
        let mgr = CheckpointManager::new(vec![cp]);
        assert!(mgr.verify(0, &sample_hash(0xAA)));
    }

    #[test]
    fn verify_mismatching_checkpoint_rejected() {
        let cp = Checkpoint { height: 0, hash: sample_hash(0xAA) };
        let mgr = CheckpointManager::new(vec![cp]);
        assert!(!mgr.verify(0, &sample_hash(0xBB)));
    }

    #[test]
    fn non_checkpoint_height_allowed() {
        let cp = Checkpoint { height: 0, hash: sample_hash(0xAA) };
        let mgr = CheckpointManager::new(vec![cp]);
        assert!(mgr.verify(42, &[0xFFu8; 32]));
    }

    #[test]
    fn last_checkpoint_height() {
        let cps = vec![
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 50_000, hash: sample_hash(2) },
            Checkpoint { height: 100_000, hash: sample_hash(3) },
        ];
        let mgr = CheckpointManager::new(cps);
        assert_eq!(mgr.last_checkpoint_height(), Some(100_000));
    }

    #[test]
    fn reorg_denied_below_checkpoint() {
        let cps = vec![
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 50_000, hash: sample_hash(2) },
        ];
        let mgr = CheckpointManager::new(cps);
        assert!(!mgr.reorg_allowed(49_999));
        assert!(mgr.reorg_allowed(50_000));
        assert!(mgr.reorg_allowed(50_001));
    }

    #[test]
    fn checkpoints_sorted_on_construction() {
        let cps = vec![
            Checkpoint { height: 200, hash: sample_hash(3) },
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 100, hash: sample_hash(2) },
        ];
        let mgr = CheckpointManager::new(cps);
        let heights: Vec<u64> = mgr.iter().map(|c| c.height).collect();
        assert_eq!(heights, vec![0, 100, 200]);
    }

    #[test]
    fn len_and_is_empty() {
        assert!(CheckpointManager::empty().is_empty());
        assert_eq!(CheckpointManager::empty().len(), 0);

        let mgr = CheckpointManager::new(vec![
            Checkpoint { height: 0, hash: [0u8; 32] },
        ]);
        assert!(!mgr.is_empty());
        assert_eq!(mgr.len(), 1);
    }

    // ── Phase 7 hardening ──

    #[test]
    fn verify_all_checkpoints_match() {
        let cps = vec![
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 100, hash: sample_hash(2) },
            Checkpoint { height: 200, hash: sample_hash(3) },
        ];
        let mgr = CheckpointManager::new(cps);
        assert!(mgr.verify(0, &sample_hash(1)));
        assert!(mgr.verify(100, &sample_hash(2)));
        assert!(mgr.verify(200, &sample_hash(3)));
    }

    #[test]
    fn verify_wrong_hash_at_each_checkpoint() {
        let cps = vec![
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 100, hash: sample_hash(2) },
        ];
        let mgr = CheckpointManager::new(cps);
        assert!(!mgr.verify(0, &sample_hash(99)));
        assert!(!mgr.verify(100, &sample_hash(99)));
    }

    #[test]
    fn reorg_at_exact_checkpoint_allowed() {
        let cps = vec![Checkpoint { height: 1000, hash: sample_hash(1) }];
        let mgr = CheckpointManager::new(cps);
        assert!(mgr.reorg_allowed(1000));
        assert!(mgr.reorg_allowed(1001));
        assert!(!mgr.reorg_allowed(999));
    }

    #[test]
    fn empty_last_checkpoint_is_none() {
        assert_eq!(CheckpointManager::empty().last_checkpoint_height(), None);
    }

    #[test]
    fn iter_returns_sorted_checkpoints() {
        let cps = vec![
            Checkpoint { height: 300, hash: sample_hash(3) },
            Checkpoint { height: 100, hash: sample_hash(1) },
            Checkpoint { height: 200, hash: sample_hash(2) },
        ];
        let mgr = CheckpointManager::new(cps);
        let heights: Vec<u64> = mgr.iter().map(|c| c.height).collect();
        assert_eq!(heights, vec![100, 200, 300]);
    }

    #[test]
    fn duplicate_height_checkpoints() {
        // If two checkpoints have the same height, first match wins (sorted)
        let cps = vec![
            Checkpoint { height: 0, hash: sample_hash(1) },
            Checkpoint { height: 0, hash: sample_hash(2) },
        ];
        let mgr = CheckpointManager::new(cps);
        assert_eq!(mgr.len(), 2);
        // verify uses first match
        assert!(mgr.verify(0, &sample_hash(1)));
    }

    #[test]
    fn checkpoint_struct_equality() {
        let a = Checkpoint { height: 42, hash: sample_hash(7) };
        let b = Checkpoint { height: 42, hash: sample_hash(7) };
        let c = Checkpoint { height: 42, hash: sample_hash(8) };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn large_height_checkpoint() {
        let cp = Checkpoint { height: u64::MAX, hash: sample_hash(0xFF) };
        let mgr = CheckpointManager::new(vec![cp]);
        assert_eq!(mgr.last_checkpoint_height(), Some(u64::MAX));
        assert!(mgr.verify(u64::MAX, &sample_hash(0xFF)));
        assert!(!mgr.verify(u64::MAX, &sample_hash(0)));
    }
}
