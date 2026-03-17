//! Signature verification cache.
//!
//! Avoids re-verifying the same transaction input signature when:
//! - A transaction is first validated for mempool admission, then
//!   validated again as part of a block.
//! - A block is re-validated during chain reorganisation (reorg).
//!
//! The cache key is `SHA256(txid || input_index)` which uniquely
//! identifies a specific script verification.  The cache is
//! thread-safe so it can be shared with Rayon's parallel block
//! validation.

use std::collections::HashSet;
use std::sync::RwLock;

/// Maximum number of entries before the cache is cleared.
/// At ~32 bytes per entry this is ≈ 32 MB.
const MAX_ENTRIES: usize = 1_000_000;

/// Thread-safe signature verification cache.
pub struct SigCache {
    inner: RwLock<HashSet<[u8; 32]>>,
}

impl SigCache {
    /// Create an empty signature cache.
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashSet::new()),
        }
    }

    /// Compute a cache key from a transaction id and input index.
    pub fn cache_key(txid: &[u8; 32], input_index: usize) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(txid);
        hasher.update(&(input_index as u64).to_le_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        key
    }

    /// Check whether a verification result is cached.
    pub fn contains(&self, key: &[u8; 32]) -> bool {
        self.inner
            .read()
            .map(|guard| guard.contains(key))
            .unwrap_or(false)
    }

    /// Insert a successful verification into the cache.
    pub fn insert(&self, key: [u8; 32]) {
        if let Ok(mut guard) = self.inner.write() {
            // Evict everything if we hit the cap (simple strategy)
            if guard.len() >= MAX_ENTRIES {
                guard.clear();
            }
            guard.insert(key);
        }
    }

    /// Number of cached entries.
    pub fn len(&self) -> usize {
        self.inner.read().map(|g| g.len()).unwrap_or(0)
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Clear the cache (e.g. after a deep reorg).
    pub fn clear(&self) {
        if let Ok(mut guard) = self.inner.write() {
            guard.clear();
        }
    }
}

impl Default for SigCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_deterministic() {
        let txid = [42u8; 32];
        let k1 = SigCache::cache_key(&txid, 0);
        let k2 = SigCache::cache_key(&txid, 0);
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_different_inputs_different_keys() {
        let txid = [42u8; 32];
        let k0 = SigCache::cache_key(&txid, 0);
        let k1 = SigCache::cache_key(&txid, 1);
        assert_ne!(k0, k1);
    }

    #[test]
    fn test_insert_and_contains() {
        let cache = SigCache::new();
        let key = [1u8; 32];
        assert!(!cache.contains(&key));
        cache.insert(key);
        assert!(cache.contains(&key));
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn test_clear() {
        let cache = SigCache::new();
        cache.insert([1u8; 32]);
        cache.insert([2u8; 32]);
        assert_eq!(cache.len(), 2);
        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn test_thread_safety() {
        use std::sync::Arc;
        let cache = Arc::new(SigCache::new());
        let mut handles = vec![];

        for i in 0..10u8 {
            let c = Arc::clone(&cache);
            handles.push(std::thread::spawn(move || {
                c.insert([i; 32]);
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        assert_eq!(cache.len(), 10);
    }

    // ── Principle 1: H(x) = y — Cache key is a hash function ──

    #[test]
    fn test_cache_key_is_32_bytes() {
        let key = SigCache::cache_key(&[0u8; 32], 0);
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_cache_key_changes_with_txid() {
        let k1 = SigCache::cache_key(&[0u8; 32], 0);
        let k2 = SigCache::cache_key(&[1u8; 32], 0);
        assert_ne!(k1, k2, "different txid → different cache key");
    }

    // ── Principle 4: Signatures — cached vs not cached ──

    #[test]
    fn test_duplicate_insert_no_double_count() {
        let cache = SigCache::new();
        let key = [0xABu8; 32];
        cache.insert(key);
        cache.insert(key);
        assert_eq!(cache.len(), 1, "duplicate key must not increase count");
    }

    #[test]
    fn test_contains_returns_false_after_clear() {
        let cache = SigCache::new();
        let key = [0xCDu8; 32];
        cache.insert(key);
        assert!(cache.contains(&key));
        cache.clear();
        assert!(!cache.contains(&key));
    }

    #[test]
    fn test_is_empty_on_new_cache() {
        assert!(SigCache::new().is_empty());
    }

    #[test]
    fn test_default_is_same_as_new() {
        let d = SigCache::default();
        assert!(d.is_empty());
    }
}
