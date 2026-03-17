#![warn(missing_docs)]
//! KuberCoin Storage Layer
//!
//! Provides persistent storage backends for blockchain data:
//! - `SledStorage`: Primary storage using Sled embedded database (cross-platform)
//! - `RocksDBStorage`: RocksDB-compatible interface using Sled backend
//! - `MemoryStorage`: In-memory storage for testing
//!
//! # Example
//!
//! ```no_run
//! use storage::rocksdb_backend::{SledStorage, StorageConfig, Storage};
//!
//! let config = StorageConfig::default();
//! let storage = SledStorage::new(config)?;
//!
//! storage.put(b"key", b"value")?;
//! let value = storage.get(b"key")?;
//! # Ok::<(), storage::rocksdb_backend::StorageError>(())
//! ```

pub mod rocksdb_backend;

// Re-export common types for convenience
pub use rocksdb_backend::{
    MemoryStorage, RocksDBConfig, RocksDBStorage, SledStorage, Storage, StorageConfig,
    StorageError, WriteOp,
};
