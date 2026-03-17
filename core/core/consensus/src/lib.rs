#![warn(missing_docs)]
//! # Consensus
//!
//! Proof-of-Work consensus rules for KuberCoin.
//!
//! This crate implements difficulty adjustment (`bits_to_target` / `target_to_bits`),
//! PoW verification, block/transaction validation, and canonical protocol
//! parameters ([`params`]).

/// Canonical consensus parameters (single source of truth).
pub mod params;
/// Difficulty adjustment and target conversion.
pub mod difficulty;
/// Proof-of-Work verification.
pub mod pow;
/// Block and transaction validation.
pub mod validator;
/// Signature verification cache.
pub mod sig_cache;
/// BIP-9 version bits signaling.
pub mod version_bits;
/// Hardcoded chain checkpoints.
pub mod checkpoints;

pub use difficulty::{bits_to_difficulty, bits_to_target, retarget_target, target_to_bits, work_from_compact, add_work, compare_work};
pub use pow::verify_pow;
pub use sig_cache::SigCache;
pub use checkpoints::{Checkpoint, CheckpointManager};
pub use validator::{
    validate_block, validate_block_cached, validate_block_no_scripts, validate_block_no_scripts_with_mtp,
    validate_transaction, validate_transaction_cached,
    ValidationError,
};
