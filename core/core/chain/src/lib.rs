#![warn(missing_docs)]
//! # Chain
//!
//! Core blockchain data structures and UTXO management for KuberCoin.
//!
//! This crate provides the foundational types for blocks, headers, compact blocks,
//! the UTXO set (in-memory), and the persistent UTXO database (sled-backed).
//! It also includes performance primitives such as bloom filters, script caches,
//! and batch-processing utilities.

/// Block data structures.
pub mod block;
/// Compact block relay (BIP-152).
pub mod compact_blocks;
/// Chain error types.
pub mod error;
/// Block header types.
pub mod header;
/// Performance primitives (bloom filters, caches).
pub mod performance;
/// In-memory UTXO set.
pub mod utxo;
/// Persistent UTXO database.
pub mod utxo_db;

/// Maximum block weight in weight units (4 MW, SegWit-compatible).
///
/// KuberCoin uses the Bitcoin SegWit weight system:
/// - Legacy bytes count as 4 weight units each
/// - Witness bytes count as 1 weight unit each
/// - Maximum block weight: 4,000,000 WU
///
/// This effectively gives a ~4 MB block size limit for witness-heavy
/// blocks, or ~1 MB for legacy-only blocks.
pub const MAX_BLOCK_WEIGHT: usize = 4_000_000;

/// Legacy maximum block size in bytes (1 MB) for non-SegWit serialized size.
pub const MAX_BLOCK_SIZE: usize = 1_000_000;

/// Maximum script size in bytes (10KB)
pub const MAX_SCRIPT_SIZE: usize = 10_000;

pub use block::Block;
pub use compact_blocks::{
    BlockTransactions, CompactBlock, GetBlockTransactions, PrefilledTransaction, ShortTxId,
};
pub use error::ChainError;
pub use header::BlockHeader;
pub use performance::{BatchProcessor, BloomFilter, BufferPool, ScriptCache, TxValidationCache};
pub use utxo::{
    compress_script, compress_utxo, compress_utxo_set, decode_varint, decompress_script,
    decompress_utxo, decompress_utxo_set, encode_varint, BlockUndoData, TxUndoData, UtxoSet,
    COINBASE_MATURITY, UTXO,
};
pub use utxo_db::UtxoDatabase;
