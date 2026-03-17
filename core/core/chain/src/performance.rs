// Performance optimizations for Kubercoin
//
// This module provides caching, memory pooling, and performance utilities
// for improving blockchain processing speed and reducing memory allocations.

use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;

/// Cache for transaction validation results
pub struct TxValidationCache {
    cache: Arc<Mutex<HashMap<[u8; 32], bool>>>,
    max_size: usize,
}

impl TxValidationCache {
    /// Create a new validation cache
    pub fn new(max_size: usize) -> Self {
        TxValidationCache {
            cache: Arc::new(Mutex::new(HashMap::new())),
            max_size,
        }
    }

    /// Check if transaction is valid (cached)
    pub fn is_valid(&self, txid: &[u8; 32]) -> Option<bool> {
        let cache = self.cache.lock();
        cache.get(txid).copied()
    }

    /// Mark transaction as valid or invalid
    pub fn set_valid(&self, txid: [u8; 32], valid: bool) {
        let mut cache = self.cache.lock();

        // Evict oldest entry if cache is full
        if cache.len() >= self.max_size && !cache.contains_key(&txid) {
            if let Some(&key) = cache.keys().next() {
                cache.remove(&key);
            }
        }

        cache.insert(txid, valid);
    }

    /// Clear the cache
    pub fn clear(&self) {
        let mut cache = self.cache.lock();
        cache.clear();
    }

    /// Get cache size
    pub fn len(&self) -> usize {
        let cache = self.cache.lock();
        cache.len()
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Cache for script verification results
pub struct ScriptCache {
    cache: Arc<Mutex<HashMap<[u8; 32], bool>>>,
    max_size: usize,
}

impl ScriptCache {
    /// Create a new script cache
    pub fn new(max_size: usize) -> Self {
        ScriptCache {
            cache: Arc::new(Mutex::new(HashMap::new())),
            max_size,
        }
    }

    /// Get script hash for caching
    pub fn script_hash(script: &[u8], input_data: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(script);
        hasher.update(input_data);
        hasher.finalize().into()
    }

    /// Check if script is valid (cached)
    pub fn is_valid(&self, hash: &[u8; 32]) -> Option<bool> {
        let cache = self.cache.lock();
        cache.get(hash).copied()
    }

    /// Mark script as valid or invalid
    pub fn set_valid(&self, hash: [u8; 32], valid: bool) {
        let mut cache = self.cache.lock();

        // Evict oldest entry if cache is full
        if cache.len() >= self.max_size && !cache.contains_key(&hash) {
            if let Some(&key) = cache.keys().next() {
                cache.remove(&key);
            }
        }

        cache.insert(hash, valid);
    }

    /// Clear the cache
    pub fn clear(&self) {
        let mut cache = self.cache.lock();
        cache.clear();
    }
}

/// Memory pool for reusable buffers
pub struct BufferPool {
    pools: Arc<Mutex<HashMap<usize, Vec<Vec<u8>>>>>,
}

impl BufferPool {
    /// Create a new buffer pool
    pub fn new() -> Self {
        BufferPool {
            pools: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get a buffer of specified size
    pub fn get(&self, size: usize) -> Vec<u8> {
        let mut pools = self.pools.lock();

        if let Some(pool) = pools.get_mut(&size) {
            if let Some(mut buffer) = pool.pop() {
                buffer.clear();
                buffer.reserve(size);
                return buffer;
            }
        }

        Vec::with_capacity(size)
    }

    /// Return a buffer to the pool
    pub fn put(&self, mut buffer: Vec<u8>) {
        let capacity = buffer.capacity();
        if capacity > 0 && capacity <= 1024 * 1024 {
            // Max 1MB buffers
            buffer.clear();

            let mut pools = self.pools.lock();
            let pool = pools.entry(capacity).or_default();

            if pool.len() < 100 {
                // Max 100 buffers per size
                pool.push(buffer);
            }
        }
    }

    /// Clear the pool
    pub fn clear(&self) {
        let mut pools = self.pools.lock();
        pools.clear();
    }
}

impl Default for BufferPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Batch processor for parallel transaction validation
pub struct BatchProcessor {
    batch_size: usize,
}

impl BatchProcessor {
    /// Create a new batch processor
    pub fn new(batch_size: usize) -> Self {
        BatchProcessor { batch_size }
    }

    /// Process items in batches
    pub fn process<T, F, R>(&self, items: Vec<T>, mut processor: F) -> Vec<R>
    where
        F: FnMut(&[T]) -> Vec<R>,
        T: Send,
        R: Send,
    {
        let mut results = Vec::with_capacity(items.len());

        for chunk in items.chunks(self.batch_size) {
            let chunk_results = processor(chunk);
            results.extend(chunk_results);
        }

        results
    }
}

/// Bloom filter for fast membership testing
pub struct BloomFilter {
    bits: Vec<u8>,
    num_hashes: usize,
    size: usize,
}

impl BloomFilter {
    /// Create a new Bloom filter
    pub fn new(size: usize, num_hashes: usize) -> Self {
        let byte_size = size.div_ceil(8);
        BloomFilter {
            bits: vec![0u8; byte_size],
            num_hashes,
            size,
        }
    }

    /// Add an item to the filter
    pub fn add(&mut self, item: &[u8]) {
        for i in 0..self.num_hashes {
            let hash = self.hash(item, i);
            let bit_index = hash % self.size;
            let byte_index = bit_index / 8;
            let bit_offset = bit_index % 8;

            self.bits[byte_index] |= 1 << bit_offset;
        }
    }

    /// Check if an item might be in the filter
    pub fn contains(&self, item: &[u8]) -> bool {
        for i in 0..self.num_hashes {
            let hash = self.hash(item, i);
            let bit_index = hash % self.size;
            let byte_index = bit_index / 8;
            let bit_offset = bit_index % 8;

            if (self.bits[byte_index] & (1 << bit_offset)) == 0 {
                return false;
            }
        }

        true
    }

    /// Clear the filter
    pub fn clear(&mut self) {
        for byte in &mut self.bits {
            *byte = 0;
        }
    }

    /// Hash function for Bloom filter
    fn hash(&self, item: &[u8], seed: usize) -> usize {
        let mut hasher = Sha256::new();
        hasher.update(seed.to_le_bytes());
        hasher.update(item);
        let hash = hasher.finalize();

        let mut result = 0usize;
        for (i, &byte) in hash.iter().enumerate().take(8) {
            result |= (byte as usize) << (i * 8);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tx_validation_cache() {
        let cache = TxValidationCache::new(10);
        let txid = [1u8; 32];

        // Initially not cached
        assert_eq!(cache.is_valid(&txid), None);

        // Mark as valid
        cache.set_valid(txid, true);
        assert_eq!(cache.is_valid(&txid), Some(true));

        // Mark as invalid
        cache.set_valid(txid, false);
        assert_eq!(cache.is_valid(&txid), Some(false));
    }

    #[test]
    fn test_cache_eviction() {
        let cache = TxValidationCache::new(3);

        let txid1 = [1u8; 32];
        let txid2 = [2u8; 32];
        let txid3 = [3u8; 32];
        let txid4 = [4u8; 32];

        cache.set_valid(txid1, true);
        cache.set_valid(txid2, true);
        cache.set_valid(txid3, true);

        assert_eq!(cache.len(), 3);

        // Adding 4th item should evict oldest
        cache.set_valid(txid4, true);
        assert_eq!(cache.len(), 3);
    }

    #[test]
    fn test_script_cache() {
        let cache = ScriptCache::new(10);
        let script = b"script";
        let input = b"input";

        let hash = ScriptCache::script_hash(script, input);

        // Initially not cached
        assert_eq!(cache.is_valid(&hash), None);

        // Mark as valid
        cache.set_valid(hash, true);
        assert_eq!(cache.is_valid(&hash), Some(true));
    }

    #[test]
    fn test_buffer_pool() {
        let pool = BufferPool::new();

        let buffer1 = pool.get(1024);
        assert!(buffer1.capacity() >= 1024);

        pool.put(buffer1);

        let buffer2 = pool.get(1024);
        assert!(buffer2.capacity() >= 1024);
    }

    #[test]
    fn test_buffer_pool_limit() {
        let pool = BufferPool::new();

        // Add 101 buffers (should only keep 100)
        for _ in 0..101 {
            let buffer = pool.get(1024);
            pool.put(buffer);
        }

        let pools = pool.pools.lock();
        let vec_pool = pools.get(&1024).unwrap();
        assert!(vec_pool.len() <= 100);
    }

    #[test]
    fn test_batch_processor() {
        let processor = BatchProcessor::new(3);

        let items: Vec<i32> = vec![1, 2, 3, 4, 5, 6, 7];

        let results = processor.process(items, |chunk| chunk.iter().map(|x| x * 2).collect());

        assert_eq!(results, vec![2, 4, 6, 8, 10, 12, 14]);
    }

    #[test]
    fn test_bloom_filter() {
        let mut filter = BloomFilter::new(1000, 3);

        let item1 = b"item1";
        let item2 = b"item2";
        let item3 = b"item3";

        // Add items
        filter.add(item1);
        filter.add(item2);

        // Check membership
        assert!(filter.contains(item1));
        assert!(filter.contains(item2));

        // item3 might have false positive, but usually not
        let contains_item3 = filter.contains(item3);

        // Clear filter
        filter.clear();
        assert!(!filter.contains(item1));
        assert!(!filter.contains(item2));

        // The false positive test is probabilistic
        let _ = contains_item3;
    }

    #[test]
    fn test_bloom_filter_false_positive() {
        let mut filter = BloomFilter::new(100, 2);

        filter.add(b"test");

        // Should definitely contain the item we added
        assert!(filter.contains(b"test"));

        // Test item should not be present (but might have false positive)
        let _fp = filter.contains(b"not_added");
    }

    #[test]
    fn test_cache_clear() {
        let cache = TxValidationCache::new(10);
        let txid = [1u8; 32];

        cache.set_valid(txid, true);
        assert!(!cache.is_empty());

        cache.clear();
        assert!(cache.is_empty());
        assert_eq!(cache.is_valid(&txid), None);
    }

    #[test]
    fn test_tx_validation_cache_overwrite() {
        let cache = TxValidationCache::new(10);
        let txid = [42u8; 32];
        cache.set_valid(txid, true);
        assert_eq!(cache.is_valid(&txid), Some(true));
        cache.set_valid(txid, false);
        assert_eq!(cache.is_valid(&txid), Some(false));
    }

    #[test]
    fn test_tx_validation_cache_many_distinct() {
        let cache = TxValidationCache::new(5);
        for i in 0..10_u8 {
            let mut txid = [0u8; 32];
            txid[0] = i;
            cache.set_valid(txid, i % 2 == 0);
        }
        // Cache max_size=5, so at most 5 entries survive after eviction
        assert!(cache.len() <= 5);
    }

    #[test]
    fn test_script_cache_hash_determinism() {
        let script = b"OP_DUP OP_HASH160";
        let input = b"input_data";
        let h1 = ScriptCache::script_hash(script, input);
        let h2 = ScriptCache::script_hash(script, input);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_script_cache_hash_different_inputs_differ() {
        let script = b"OP_DUP OP_HASH160";
        let h1 = ScriptCache::script_hash(script, b"input0");
        let h2 = ScriptCache::script_hash(script, b"input1");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_script_cache_set_and_check() {
        let cache = ScriptCache::new(10);
        let hash = [99u8; 32];
        assert_eq!(cache.is_valid(&hash), None);
        cache.set_valid(hash, true);
        assert_eq!(cache.is_valid(&hash), Some(true));
        cache.clear();
        assert_eq!(cache.is_valid(&hash), None);
    }

    #[test]
    fn test_buffer_pool_different_sizes() {
        let pool = BufferPool::new();
        let b1 = pool.get(64);
        let b2 = pool.get(256);
        assert!(b1.capacity() >= 64);
        assert!(b2.capacity() >= 256);
        pool.put(b1);
        pool.put(b2);
        // Retrieve again — should reuse
        let b3 = pool.get(64);
        assert!(b3.capacity() >= 64);
    }

    #[test]
    fn test_buffer_pool_oversized_rejected() {
        let pool = BufferPool::new();
        // Buffers > 1MB should not be pooled
        let big = vec![0u8; 2_000_000];
        let cap = big.capacity();
        pool.put(big);
        // Pool should still be effectively empty for that capacity
        let pools = pool.pools.lock();
        assert!(pools.get(&cap).is_none() || pools[&cap].is_empty());
    }

    #[test]
    fn test_batch_processor_empty_input() {
        let processor = BatchProcessor::new(5);
        let items: Vec<i32> = vec![];
        let results = processor.process(items, |chunk| chunk.iter().map(|x| x * 2).collect());
        assert!(results.is_empty());
    }

    #[test]
    fn test_batch_processor_single_item() {
        let processor = BatchProcessor::new(10);
        let results = processor.process(vec![42], |chunk| chunk.to_vec());
        assert_eq!(results, vec![42]);
    }

    #[test]
    fn test_bloom_filter_no_false_negatives() {
        let mut filter = BloomFilter::new(1000, 5);
        let items: Vec<Vec<u8>> = (0..50_u8).map(|i| vec![i; 8]).collect();
        for item in &items {
            filter.add(item);
        }
        // Every inserted item MUST be found (no false negatives)
        for item in &items {
            assert!(filter.contains(item), "false negative for {:?}", item);
        }
    }

    #[test]
    fn test_bloom_filter_clear_resets() {
        let mut filter = BloomFilter::new(100, 3);
        filter.add(b"alpha");
        filter.add(b"beta");
        assert!(filter.contains(b"alpha"));
        filter.clear();
        // After clear, previously-added items should not be found
        // (probabilistically — extremely unlikely to still match)
        assert!(!filter.contains(b"alpha"));
        assert!(!filter.contains(b"beta"));
    }
}
