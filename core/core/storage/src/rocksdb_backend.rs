//! Persistent Storage Backend Implementation
//!
//! Provides persistent storage layer using sled database for production blockchain data.
//! Sled is a pure-Rust embedded database that works across all platforms without
//! requiring external dependencies like libclang (unlike RocksDB).
//!
//! # Example
//!
//! ```no_run
//! use storage::rocksdb_backend::{SledStorage, StorageConfig, Storage};
//!
//! # fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let config = StorageConfig::default();
//! let storage = SledStorage::new(config)?;
//!
//! storage.put(b"key", b"value")?;
//! let value = storage.get(b"key")?;
//! assert_eq!(value, Some(b"value".to_vec()));
//! # Ok(())
//! # }
//! ```

use parking_lot::RwLock;
use sled::{Batch, Db};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;

/// Storage configuration for Sled backend
#[derive(Debug, Clone)]
pub struct StorageConfig {
    /// Database path
    pub path: String,

    /// Cache size in bytes (for sled)
    pub cache_capacity: u64,

    /// Enable compression
    pub compression: bool,

    /// Flush interval in milliseconds
    pub flush_every_ms: Option<u64>,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            path: "./data/kubercoin.db".to_string(),
            cache_capacity: 512 * 1024 * 1024, // 512 MB
            compression: true,
            flush_every_ms: Some(500),
        }
    }
}

/// Configuration for RocksDB-style storage (implemented using Sled)
///
/// This config provides a familiar RocksDB-like interface while using
/// the cross-platform Sled database underneath.
#[derive(Debug, Clone)]
pub struct RocksDBConfig {
    /// Database path
    pub path: String,

    /// Block cache size in bytes
    pub block_cache_size: u64,

    /// Write buffer size in bytes  
    pub write_buffer_size: u64,

    /// Maximum number of open files
    pub max_open_files: i32,

    /// Enable compression
    pub compression: bool,

    /// Enable bloom filters for faster lookups
    pub bloom_filter_bits: u32,

    /// Background compaction threads
    pub num_compaction_threads: u32,
}

impl Default for RocksDBConfig {
    fn default() -> Self {
        Self {
            path: "./data/kubercoin_rocks.db".to_string(),
            block_cache_size: 256 * 1024 * 1024, // 256 MB
            write_buffer_size: 64 * 1024 * 1024, // 64 MB
            max_open_files: 1000,
            compression: true,
            bloom_filter_bits: 10,
            num_compaction_threads: 4,
        }
    }
}

impl RocksDBConfig {
    /// Convert to Sled-compatible StorageConfig
    fn to_storage_config(&self) -> StorageConfig {
        StorageConfig {
            path: self.path.clone(),
            cache_capacity: self.block_cache_size,
            compression: self.compression,
            flush_every_ms: Some(500),
        }
    }
}

/// Storage errors
#[derive(Error, Debug)]
pub enum StorageError {
    /// Database operation error.
    #[error("Database error: {0}")]
    Database(String),

    /// Key not found.
    #[error("Key not found: {0}")]
    KeyNotFound(String),

    /// Serialization/deserialization error.
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// I/O error.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Storage trait for blockchain data
///
/// Provides a generic interface for persistent key-value storage.
/// Implementations must be thread-safe (Send + Sync).
pub trait Storage: Send + Sync {
    /// Store a key-value pair
    ///
    /// # Arguments
    ///
    /// * `key` - The key to store
    /// * `value` - The value to store
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if the operation fails
    fn put(&self, key: &[u8], value: &[u8]) -> Result<(), StorageError>;

    /// Retrieve a value by key
    ///
    /// # Arguments
    ///
    /// * `key` - The key to retrieve
    ///
    /// # Returns
    ///
    /// Some(value) if found, None if not found
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if the operation fails
    fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StorageError>;

    /// Delete a key
    ///
    /// # Arguments
    ///
    /// * `key` - The key to delete
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if the operation fails
    fn delete(&self, key: &[u8]) -> Result<(), StorageError>;

    /// Check if a key exists
    ///
    /// # Arguments
    ///
    /// * `key` - The key to check
    ///
    /// # Returns
    ///
    /// true if the key exists, false otherwise
    fn exists(&self, key: &[u8]) -> Result<bool, StorageError>;

    /// Write a batch of operations atomically
    ///
    /// # Arguments
    ///
    /// * `batch` - Vector of write operations to execute atomically
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if any operation fails
    fn write_batch(&self, batch: Vec<WriteOp>) -> Result<(), StorageError>;

    /// Iterate over all key-value pairs whose key starts with `prefix`.
    ///
    /// Returns pairs in lexicographic key order.
    fn scan_prefix(&self, prefix: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, StorageError>;
}

/// Write operation for batch writes
#[derive(Debug, Clone)]
pub enum WriteOp {
    /// Put operation
    Put {
        /// Storage key.
        key: Vec<u8>,
        /// Value to store.
        value: Vec<u8>,
    },
    /// Delete operation
    Delete {
        /// Storage key to remove.
        key: Vec<u8>,
    },
}

/// Sled-based persistent storage
///
/// Production-grade storage implementation using sled embedded database
/// for blockchain data persistence. Pure Rust, no external dependencies.
pub struct SledStorage {
    db: Arc<Db>,
    _config: StorageConfig,
}

impl SledStorage {
    /// Force a flush of all pending writes to disk.
    pub fn flush(&self) -> Result<(), StorageError> {
        self.db
            .flush()
            .map_err(|e| StorageError::Database(e.to_string()))?;
        Ok(())
    }
}

/// RocksDB-compatible storage backend (implemented using Sled)
///
/// This provides a RocksDB-like API for familiarity while using Sled
/// for cross-platform compatibility. Sled is a pure-Rust embedded database
/// that doesn't require external dependencies like libclang.
///
/// # Example
///
/// ```no_run
/// # use storage::rocksdb_backend::{RocksDBStorage, RocksDBConfig, Storage};
/// let config = RocksDBConfig::default();
/// let storage = RocksDBStorage::new(config)?;
/// storage.put(b"key", b"value")?;
/// # Ok::<(), storage::rocksdb_backend::StorageError>(())
/// ```
pub struct RocksDBStorage {
    /// Sled database instance (RocksDB-compatible interface)
    inner: SledStorage,
    /// Original config for reference
    config: RocksDBConfig,
}

impl SledStorage {
    /// Create new sled storage with the given configuration
    ///
    /// # Arguments
    ///
    /// * `config` - Storage configuration parameters
    ///
    /// # Returns
    ///
    /// New sled storage instance
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if database initialization fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use storage::rocksdb_backend::{SledStorage, StorageConfig};
    /// let config = StorageConfig::default();
    /// let storage = SledStorage::new(config)?;
    /// # Ok::<(), storage::rocksdb_backend::StorageError>(())
    /// ```
    pub fn new(config: StorageConfig) -> Result<Self, StorageError> {
        let mut db_config = sled::Config::new()
            .path(&config.path)
            .cache_capacity(config.cache_capacity);

        if let Some(flush_ms) = config.flush_every_ms {
            db_config = db_config.flush_every_ms(Some(flush_ms));
        }

        if config.compression {
            db_config = db_config.use_compression(true);
        }

        let db = db_config
            .open()
            .map_err(|e| StorageError::Serialization(e.to_string()))?;

        Ok(Self {
            db: Arc::new(db),
            _config: config,
        })
    }
}

impl Storage for SledStorage {
    fn put(&self, key: &[u8], value: &[u8]) -> Result<(), StorageError> {
        self.db
            .insert(key, value)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;
        Ok(())
    }

    fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StorageError> {
        match self.db.get(key) {
            Ok(Some(v)) => Ok(Some(v.to_vec())),
            Ok(None) => Ok(None),
            Err(e) => Err(StorageError::Serialization(e.to_string())),
        }
    }

    fn delete(&self, key: &[u8]) -> Result<(), StorageError> {
        self.db
            .remove(key)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;
        Ok(())
    }

    fn exists(&self, key: &[u8]) -> Result<bool, StorageError> {
        match self.db.contains_key(key) {
            Ok(exists) => Ok(exists),
            Err(e) => Err(StorageError::Serialization(e.to_string())),
        }
    }

    fn write_batch(&self, batch: Vec<WriteOp>) -> Result<(), StorageError> {
        let mut db_batch = Batch::default();

        for op in batch {
            match op {
                WriteOp::Put { key, value } => {
                    db_batch.insert(key, value);
                }
                WriteOp::Delete { key } => {
                    db_batch.remove(key);
                }
            }
        }

        self.db
            .apply_batch(db_batch)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;
        Ok(())
    }

    fn scan_prefix(&self, prefix: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, StorageError> {
        self.scan_prefix_inner(prefix)
    }
}

impl SledStorage {
    /// Iterate over all key-value pairs whose key starts with the given prefix.
    fn scan_prefix_inner(&self, prefix: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, StorageError> {
        let mut results = Vec::new();
        for item in self.db.scan_prefix(prefix) {
            let (k, v) = item.map_err(|e| StorageError::Database(e.to_string()))?;
            results.push((k.to_vec(), v.to_vec()));
        }
        Ok(results)
    }
}

impl RocksDBStorage {
    /// Create new RocksDB-compatible storage with Sled backend
    ///
    /// # Arguments
    ///
    /// * `config` - RocksDB-style configuration
    ///
    /// # Returns
    ///
    /// New storage instance
    ///
    /// # Errors
    ///
    /// Returns `StorageError` if database initialization fails
    pub fn new(config: RocksDBConfig) -> Result<Self, StorageError> {
        let sled_config = config.to_storage_config();
        let inner = SledStorage::new(sled_config)?;

        Ok(Self { inner, config })
    }

    /// Open existing database at path
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, StorageError> {
        let config = RocksDBConfig {
            path: path.as_ref().to_string_lossy().to_string(),
            ..Default::default()
        };
        Self::new(config)
    }

    /// Get the underlying database path
    pub fn path(&self) -> &str {
        &self.config.path
    }

    /// Flush database to disk
    pub fn flush(&self) -> Result<(), StorageError> {
        self.inner
            .db
            .flush()
            .map_err(|e| StorageError::Database(e.to_string()))?;
        Ok(())
    }

    /// Get database size in bytes (approximate)
    pub fn size_on_disk(&self) -> Result<u64, StorageError> {
        self.inner
            .db
            .size_on_disk()
            .map_err(|e| StorageError::Database(e.to_string()))
    }
}

impl Storage for RocksDBStorage {
    fn put(&self, key: &[u8], value: &[u8]) -> Result<(), StorageError> {
        self.inner.put(key, value)
    }

    fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StorageError> {
        self.inner.get(key)
    }

    fn delete(&self, key: &[u8]) -> Result<(), StorageError> {
        self.inner.delete(key)
    }

    fn exists(&self, key: &[u8]) -> Result<bool, StorageError> {
        self.inner.exists(key)
    }

    fn write_batch(&self, batch: Vec<WriteOp>) -> Result<(), StorageError> {
        self.inner.write_batch(batch)
    }

    fn scan_prefix(&self, prefix: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, StorageError> {
        self.inner.scan_prefix(prefix)
    }
}

/// In-memory storage for testing
pub struct MemoryStorage {
    store: Arc<RwLock<HashMap<Vec<u8>, Vec<u8>>>>,
}

impl MemoryStorage {
    /// Create a new empty in-memory storage.
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl Default for MemoryStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl Storage for MemoryStorage {
    fn put(&self, key: &[u8], value: &[u8]) -> Result<(), StorageError> {
        let mut store = self.store.write();
        store.insert(key.to_vec(), value.to_vec());
        Ok(())
    }

    fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StorageError> {
        let store = self.store.read();
        Ok(store.get(key).cloned())
    }

    fn delete(&self, key: &[u8]) -> Result<(), StorageError> {
        let mut store = self.store.write();
        store.remove(key);
        Ok(())
    }

    fn exists(&self, key: &[u8]) -> Result<bool, StorageError> {
        let store = self.store.read();
        Ok(store.contains_key(key))
    }

    fn write_batch(&self, batch: Vec<WriteOp>) -> Result<(), StorageError> {
        let mut store = self.store.write();
        for op in batch {
            match op {
                WriteOp::Put { key, value } => {
                    store.insert(key, value);
                }
                WriteOp::Delete { key } => {
                    store.remove(&key);
                }
            }
        }
        Ok(())
    }

    fn scan_prefix(&self, prefix: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, StorageError> {
        let store = self.store.read();
        let mut results: Vec<(Vec<u8>, Vec<u8>)> = store
            .iter()
            .filter(|(k, _)| k.starts_with(prefix))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        results.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_memory_storage_basic() {
        let storage = MemoryStorage::new();

        // Put
        storage.put(b"key1", b"value1").unwrap();

        // Get
        let value = storage.get(b"key1").unwrap();
        assert_eq!(value, Some(b"value1".to_vec()));

        // Exists
        assert!(storage.exists(b"key1").unwrap());
        assert!(!storage.exists(b"key2").unwrap());

        // Delete
        storage.delete(b"key1").unwrap();
        assert!(!storage.exists(b"key1").unwrap());
    }

    #[test]
    fn test_batch_operations() {
        let storage = MemoryStorage::new();

        let batch = vec![
            WriteOp::Put {
                key: b"key1".to_vec(),
                value: b"value1".to_vec(),
            },
            WriteOp::Put {
                key: b"key2".to_vec(),
                value: b"value2".to_vec(),
            },
            WriteOp::Delete {
                key: b"key1".to_vec(),
            },
        ];

        storage.write_batch(batch).unwrap();

        assert!(!storage.exists(b"key1").unwrap());
        assert!(storage.exists(b"key2").unwrap());
    }

    #[test]
    fn test_rocksdb_storage_basic() {
        let test_path = "./test_data/rocksdb_test_basic";
        let _ = fs::remove_dir_all(test_path);

        let config = RocksDBConfig {
            path: test_path.to_string(),
            ..Default::default()
        };

        let storage = RocksDBStorage::new(config).expect("Failed to create storage");

        // Put
        storage.put(b"key1", b"value1").unwrap();

        // Get
        let value = storage.get(b"key1").unwrap();
        assert_eq!(value, Some(b"value1".to_vec()));

        // Exists
        assert!(storage.exists(b"key1").unwrap());
        assert!(!storage.exists(b"key2").unwrap());

        // Delete
        storage.delete(b"key1").unwrap();
        assert!(!storage.exists(b"key1").unwrap());

        // Cleanup
        drop(storage);
        let _ = fs::remove_dir_all(test_path);
    }

    #[test]
    fn test_rocksdb_storage_batch() {
        let test_path = "./test_data/rocksdb_test_batch";
        let _ = fs::remove_dir_all(test_path);

        let config = RocksDBConfig {
            path: test_path.to_string(),
            ..Default::default()
        };

        let storage = RocksDBStorage::new(config).expect("Failed to create storage");

        let batch = vec![
            WriteOp::Put {
                key: b"batch_key1".to_vec(),
                value: b"batch_value1".to_vec(),
            },
            WriteOp::Put {
                key: b"batch_key2".to_vec(),
                value: b"batch_value2".to_vec(),
            },
            WriteOp::Delete {
                key: b"batch_key1".to_vec(),
            },
        ];

        storage.write_batch(batch).unwrap();

        assert!(!storage.exists(b"batch_key1").unwrap());
        assert!(storage.exists(b"batch_key2").unwrap());
        assert_eq!(
            storage.get(b"batch_key2").unwrap(),
            Some(b"batch_value2".to_vec())
        );

        // Cleanup
        drop(storage);
        let _ = fs::remove_dir_all(test_path);
    }

    #[test]
    fn test_rocksdb_storage_persistence() {
        let test_path = "./test_data/rocksdb_test_persist";
        let _ = fs::remove_dir_all(test_path);

        // Create storage and write data
        {
            let storage = RocksDBStorage::open(test_path).expect("Failed to create storage");
            storage.put(b"persist_key", b"persist_value").unwrap();
            storage.flush().unwrap();
        }

        // Reopen and verify data persisted
        {
            let storage = RocksDBStorage::open(test_path).expect("Failed to reopen storage");
            let value = storage.get(b"persist_key").unwrap();
            assert_eq!(value, Some(b"persist_value".to_vec()));
        }

        // Cleanup
        let _ = fs::remove_dir_all(test_path);
    }

    #[test]
    fn test_sled_storage_basic() {
        let test_path = "./test_data/sled_test_basic";
        let _ = fs::remove_dir_all(test_path);

        let config = StorageConfig {
            path: test_path.to_string(),
            ..Default::default()
        };

        let storage = SledStorage::new(config).expect("Failed to create storage");

        // Put
        storage.put(b"sled_key1", b"sled_value1").unwrap();

        // Get
        let value = storage.get(b"sled_key1").unwrap();
        assert_eq!(value, Some(b"sled_value1".to_vec()));

        // Exists
        assert!(storage.exists(b"sled_key1").unwrap());

        // Cleanup
        drop(storage);
        let _ = fs::remove_dir_all(test_path);
    }

    #[test]
    fn test_memory_scan_prefix() {
        let storage = MemoryStorage::new();
        storage.put(b"tx:aaa", b"v1").unwrap();
        storage.put(b"tx:bbb", b"v2").unwrap();
        storage.put(b"block:001", b"v3").unwrap();
        storage.put(b"tx:ccc", b"v4").unwrap();

        let results = storage.scan_prefix(b"tx:").unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].0, b"tx:aaa");
        assert_eq!(results[1].0, b"tx:bbb");
        assert_eq!(results[2].0, b"tx:ccc");

        let empty = storage.scan_prefix(b"missing:").unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn test_sled_scan_prefix() {
        let test_path = "./test_data/sled_scan_prefix";
        let _ = fs::remove_dir_all(test_path);
        let config = StorageConfig { path: test_path.to_string(), ..Default::default() };
        let storage = SledStorage::new(config).unwrap();
        storage.put(b"utxo:aaa", b"1").unwrap();
        storage.put(b"utxo:bbb", b"2").unwrap();
        storage.put(b"peer:xxx", b"3").unwrap();

        let results = storage.scan_prefix(b"utxo:").unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].0, b"utxo:aaa");
        assert_eq!(results[1].0, b"utxo:bbb");

        drop(storage);
        let _ = fs::remove_dir_all(test_path);
    }

    // ── Hardening tests ────────────────────────────────────────────────────

    #[test]
    fn test_memory_storage_put_overwrite() {
        let storage = MemoryStorage::new();
        storage.put(b"key1", b"first").unwrap();
        storage.put(b"key1", b"second").unwrap();
        assert_eq!(storage.get(b"key1").unwrap(), Some(b"second".to_vec()));
    }

    #[test]
    fn test_memory_storage_delete_nonexistent_is_ok() {
        let storage = MemoryStorage::new();
        // Deleting a key that was never inserted must not fail
        let result = storage.delete(b"ghost_key");
        assert!(result.is_ok(), "delete of nonexistent key should be Ok");
    }

    #[test]
    fn test_memory_storage_exists_true_and_false() {
        let storage = MemoryStorage::new();
        assert!(!storage.exists(b"x").unwrap());
        storage.put(b"x", b"1").unwrap();
        assert!(storage.exists(b"x").unwrap());
        storage.delete(b"x").unwrap();
        assert!(!storage.exists(b"x").unwrap());
    }

    #[test]
    fn test_write_batch_atomic_puts_and_deletes() {
        let storage = MemoryStorage::new();
        // Pre-populate a key that will be deleted in the batch
        storage.put(b"del_me", b"old").unwrap();

        let ops = vec![
            WriteOp::Put { key: b"a".to_vec(), value: b"1".to_vec() },
            WriteOp::Put { key: b"b".to_vec(), value: b"2".to_vec() },
            WriteOp::Put { key: b"c".to_vec(), value: b"3".to_vec() },
            WriteOp::Delete { key: b"del_me".to_vec() },
        ];
        storage.write_batch(ops).unwrap();

        assert_eq!(storage.get(b"a").unwrap(), Some(b"1".to_vec()));
        assert_eq!(storage.get(b"b").unwrap(), Some(b"2".to_vec()));
        assert_eq!(storage.get(b"c").unwrap(), Some(b"3".to_vec()));
        assert!(storage.get(b"del_me").unwrap().is_none(), "batch-deleted key must be gone");
    }

    #[test]
    fn test_write_batch_empty_is_noop() {
        let storage = MemoryStorage::new();
        storage.put(b"stable", b"value").unwrap();
        storage.write_batch(vec![]).unwrap();
        assert_eq!(storage.get(b"stable").unwrap(), Some(b"value".to_vec()));
    }

    #[test]
    fn test_scan_prefix_empty_returns_empty() {
        let storage = MemoryStorage::new();
        storage.put(b"other:x", b"1").unwrap();
        let results = storage.scan_prefix(b"nomatch:").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_scan_prefix_special_chars_in_key() {
        let storage = MemoryStorage::new();
        // Keys with slashes, colons, and null bytes
        storage.put(b"p:a/b", b"1").unwrap();
        storage.put(b"p:c\x00d", b"2").unwrap();
        storage.put(b"q:other", b"3").unwrap();
        let results = storage.scan_prefix(b"p:").unwrap();
        assert_eq!(results.len(), 2);
        let keys: Vec<Vec<u8>> = results.into_iter().map(|(k, _)| k).collect();
        assert!(keys.contains(&b"p:a/b".to_vec()));
        assert!(keys.contains(&b"p:c\x00d".to_vec()));
    }

    #[test]
    fn test_memory_storage_large_value() {
        let storage = MemoryStorage::new();
        let big_val: Vec<u8> = (0u8..=255).cycle().take(65536).collect();
        storage.put(b"big", &big_val).unwrap();
        let recovered = storage.get(b"big").unwrap();
        assert_eq!(recovered, Some(big_val), "64 KiB value must survive put/get roundtrip");
    }

    #[test]
    fn test_sled_overwrite_and_delete() {
        let test_path = "./test_data/sled_overwrite_delete";
        let _ = fs::remove_dir_all(test_path);
        let config = StorageConfig { path: test_path.to_string(), ..Default::default() };
        let storage = SledStorage::new(config).unwrap();

        storage.put(b"key", b"v1").unwrap();
        assert_eq!(storage.get(b"key").unwrap(), Some(b"v1".to_vec()));
        storage.put(b"key", b"v2").unwrap();
        assert_eq!(storage.get(b"key").unwrap(), Some(b"v2".to_vec()));
        storage.delete(b"key").unwrap();
        assert!(storage.get(b"key").unwrap().is_none());

        drop(storage);
        let _ = fs::remove_dir_all(test_path);
    }

    #[test]
    fn test_memory_storage_concurrent_reads() {
        use std::sync::Arc;
        use std::thread;

        let storage = Arc::new(MemoryStorage::new());
        (0..16u8).for_each(|i| storage.put(&[i], &[i * 2]).unwrap());

        let handles: Vec<_> = (0..8).map(|_| {
            let s = Arc::clone(&storage);
            thread::spawn(move || {
                for i in 0..16u8 {
                    let v = s.get(&[i]).unwrap().expect("key must exist");
                    assert_eq!(v, vec![i * 2]);
                }
            })
        }).collect();

        for h in handles {
            h.join().expect("reader thread panicked");
        }
    }
}
