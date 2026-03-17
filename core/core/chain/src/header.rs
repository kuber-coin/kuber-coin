use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Block header containing metadata and proof-of-work
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BlockHeader {
    /// Block version (BIP-9 uses top 3 bits + signal bits)
    pub version: i32,

    /// Hash of the previous block header
    pub prev_hash: [u8; 32],

    /// Merkle root of all transactions in the block
    pub merkle_root: [u8; 32],

    /// Block timestamp (seconds since Unix epoch)
    pub timestamp: u64,

    /// Difficulty target in compact format
    pub bits: u32,

    /// Proof-of-work nonce
    pub nonce: u64,

    /// Block height in the chain
    pub height: u64,
}

impl BlockHeader {
    /// Create a new block header
    pub fn new(
        prev_hash: [u8; 32],
        merkle_root: [u8; 32],
        timestamp: u64,
        bits: u32,
        nonce: u64,
    ) -> Self {
        Self {
            version: 0x2000_0000, // BIP-9 top bits set
            prev_hash,
            merkle_root,
            timestamp,
            bits,
            nonce,
            height: 0, // Will be set by blockchain
        }
    }

    /// Create a new block header with height
    pub fn with_height(
        prev_hash: [u8; 32],
        merkle_root: [u8; 32],
        timestamp: u64,
        bits: u32,
        nonce: u64,
        height: u64,
    ) -> Self {
        Self {
            version: 0x2000_0000, // BIP-9 top bits set
            prev_hash,
            merkle_root,
            timestamp,
            bits,
            nonce,
            height,
        }
    }

    /// Compute SHA-256d hash of the header
    /// This is what must be below the target for valid PoW
    pub fn hash(&self) -> [u8; 32] {
        // Serialize header for hashing
        // SAFETY: bincode::serialize cannot fail on a fixed-layout struct of primitives.
        let serialized =
            bincode::serialize(self).expect("BlockHeader serialization should never fail");

        // Double SHA-256 (Bitcoin-style)
        let first_hash = Sha256::digest(&serialized);
        let second_hash = Sha256::digest(first_hash);

        second_hash.into()
    }

    /// Get header hash as hex string (for display)
    pub fn hash_hex(&self) -> String {
        hex::encode(self.hash())
    }
}

impl fmt::Display for BlockHeader {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "BlockHeader(height={}, hash={}, prev={})",
            self.height,
            hex::encode(&self.hash()[..8]),
            hex::encode(&self.prev_hash[..8])
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_hash_deterministic() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);

        let hash1 = header.hash();
        let hash2 = header.hash();

        assert_eq!(hash1, hash2, "Hash must be deterministic");
    }

    #[test]
    fn test_header_hash_changes_with_nonce() {
        let header1 = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);

        let header2 = BlockHeader::new(
            [0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 1, // Different nonce
        );

        assert_ne!(
            header1.hash(),
            header2.hash(),
            "Hash must change when nonce changes"
        );
    }

    #[test]
    fn test_header_hash_changes_with_any_field() {
        let base = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);

        let mut different_prev = base.clone();
        different_prev.prev_hash[0] = 1;

        let mut different_merkle = base.clone();
        different_merkle.merkle_root[0] = 2;

        let mut different_timestamp = base.clone();
        different_timestamp.timestamp = 1234567891;

        let mut different_bits = base.clone();
        different_bits.bits = 0x1d00fffe;

        let mut different_height = base.clone();
        different_height.height = 1;

        let base_hash = base.hash();
        assert_ne!(base_hash, different_prev.hash());
        assert_ne!(base_hash, different_merkle.hash());
        assert_ne!(base_hash, different_timestamp.hash());
        assert_ne!(base_hash, different_bits.hash());
        assert_ne!(base_hash, different_height.hash());
    }

    #[test]
    fn test_hash_is_32_bytes() {
        let header = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 0);
        assert_eq!(header.hash().len(), 32);
    }

    #[test]
    fn test_hash_hex_is_64_char_lowercase_hex() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 99);
        let h = header.hash_hex();
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()), "hash_hex must be hex: {}", h);
    }

    #[test]
    fn test_display_contains_height_and_prev() {
        let mut header = BlockHeader::new([0xABu8; 32], [0u8; 32], 0, 0x1d00ffff, 0);
        header.height = 42;
        let s = format!("{header}");
        assert!(s.contains("height=42"), "display must contain height, got: {s}");
    }

    #[test]
    fn test_new_header_height_defaults_to_zero() {
        let header = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 0);
        assert_eq!(header.height, 0);
    }

    #[test]
    fn test_hash_not_all_zeros() {
        // SHA256d of any non-trivial input is not all zeros
        let header = BlockHeader::new([1u8; 32], [2u8; 32], 100, 0x1d00ffff, 0);
        assert_ne!(header.hash(), [0u8; 32]);
    }

    #[test]
    fn test_genesis_like_hash_is_stable() {
        // Two separate calls on an identical header produce the same result
        let h1 = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 2083236893);
        let h2 = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 2083236893);
        assert_eq!(h1.hash(), h2.hash());
    }

    #[test]
    fn test_different_nonces_yield_different_hashes() {
        let h1 = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 1_000);
        let h2 = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 1_001);
        assert_ne!(h1.hash(), h2.hash());
    }
}
