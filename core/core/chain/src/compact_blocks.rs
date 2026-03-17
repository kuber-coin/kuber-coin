// BIP-152: Compact Block Relay
//
// Reduces block transmission bandwidth by using short transaction IDs
// instead of full transactions. Uses SipHash-2-4 for short ID generation.

use crate::BlockHeader;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// BIP-152 version number
pub const BIP152_VERSION: u32 = 2;

/// Short transaction ID size (6 bytes)
pub const SHORT_TXID_SIZE: usize = 6;

/// Compact block message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactBlock {
    /// Block header
    pub header: BlockHeader,

    /// Nonce for short transaction ID calculation
    pub nonce: u64,

    /// Short transaction IDs
    pub short_ids: Vec<ShortTxId>,

    /// Prefilled transactions (coinbase + select others)
    pub prefilled_txs: Vec<PrefilledTransaction>,
}

/// Short transaction ID (6 bytes)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ShortTxId([u8; SHORT_TXID_SIZE]);

/// Prefilled transaction (index + full transaction)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefilledTransaction {
    /// Differential index (difference from previous)
    pub index: u64,

    /// Full transaction data
    pub tx: Vec<u8>,
}

/// Block transactions message (response to getblocktxn)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockTransactions {
    /// Block hash
    pub blockhash: [u8; 32],

    /// Transactions
    pub transactions: Vec<Vec<u8>>,
}

/// Get block transactions message (request missing transactions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetBlockTransactions {
    /// Block hash
    pub blockhash: [u8; 32],

    /// Indices of missing transactions
    pub indices: Vec<u64>,
}

/// Compact block errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompactBlockError {
    /// Invalid short transaction ID
    InvalidShortTxId,

    /// Invalid prefilled transaction index
    InvalidPrefilledIndex,

    /// Duplicate short transaction ID
    DuplicateShortTxId,

    /// Missing transactions
    MissingTransactions,

    /// Invalid block header
    InvalidBlockHeader,

    /// Invalid nonce
    InvalidNonce,
}

impl CompactBlock {
    /// Create a new compact block
    pub fn new(
        header: BlockHeader,
        nonce: u64,
        transactions: &[Vec<u8>],
        prefilled_indices: &[usize],
    ) -> Result<Self, CompactBlockError> {
        // Calculate SipHash key from header and nonce
        let key = Self::calculate_key(&header, nonce);

        // Generate short IDs for all transactions
        let mut short_ids = Vec::new();
        let mut prefilled_txs = Vec::new();
        let mut prefilled_set: HashMap<usize, bool> = HashMap::new();

        // Mark prefilled indices
        for &idx in prefilled_indices {
            prefilled_set.insert(idx, true);
        }

        // Always include coinbase (index 0)
        prefilled_set.entry(0).or_insert(true);

        let mut last_prefilled_index = 0u64;

        for (i, tx) in transactions.iter().enumerate() {
            if prefilled_set.contains_key(&i) {
                // Calculate differential index
                let diff_index = (i as u64).saturating_sub(last_prefilled_index);
                last_prefilled_index = (i as u64).saturating_add(1);

                prefilled_txs.push(PrefilledTransaction {
                    index: diff_index,
                    tx: tx.clone(),
                });
            } else {
                // Generate short ID
                let short_id = Self::calculate_short_txid(tx, &key);
                short_ids.push(short_id);
            }
        }

        Ok(CompactBlock {
            header,
            nonce,
            short_ids,
            prefilled_txs,
        })
    }

    /// Calculate SipHash key from block header and nonce
    pub fn calculate_key(header: &BlockHeader, nonce: u64) -> [u8; 16] {
        let mut hasher = Sha256::new();

        // Hash header fields
        hasher.update(header.prev_hash);
        hasher.update(header.merkle_root);
        hasher.update(header.timestamp.to_le_bytes());
        hasher.update(header.bits.to_le_bytes());
        hasher.update(header.nonce.to_le_bytes());

        // Hash nonce
        hasher.update(nonce.to_le_bytes());

        let hash = hasher.finalize();

        // Use first 16 bytes as SipHash key
        let mut key = [0u8; 16];
        key.copy_from_slice(&hash[..16]);
        key
    }

    /// Calculate short transaction ID using SipHash-2-4
    pub fn calculate_short_txid(tx: &[u8], key: &[u8; 16]) -> ShortTxId {
        // Calculate transaction hash (wtxid)
        let mut hasher = Sha256::new();
        hasher.update(tx);
        let txid = hasher.finalize();

        // SipHash-2-4 with key
        let hash = Self::siphash_2_4(&txid, key);

        // Take lower 6 bytes
        let mut short_id = [0u8; SHORT_TXID_SIZE];
        short_id.copy_from_slice(&hash[..SHORT_TXID_SIZE]);

        ShortTxId(short_id)
    }

    /// SipHash-2-4 implementation (simplified)
    fn siphash_2_4(data: &[u8], key: &[u8; 16]) -> [u8; 8] {
        // Initialize state with key
        let k0 = u64::from_le_bytes([
            key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[7],
        ]);
        let k1 = u64::from_le_bytes([
            key[8], key[9], key[10], key[11], key[12], key[13], key[14], key[15],
        ]);

        let mut v0 = 0x736f6d6570736575u64 ^ k0;
        let mut v1 = 0x646f72616e646f6du64 ^ k1;
        let mut v2 = 0x6c7967656e657261u64 ^ k0;
        let mut v3 = 0x7465646279746573u64 ^ k1;

        // Process 8-byte chunks
        let mut chunks = data.chunks_exact(8);
        for chunk in chunks.by_ref() {
            let m = u64::from_le_bytes([
                chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7],
            ]);

            v3 ^= m;

            // SipRound x 2
            for _ in 0..2 {
                v0 = v0.wrapping_add(v1);
                v1 = v1.rotate_left(13);
                v1 ^= v0;
                v0 = v0.rotate_left(32);

                v2 = v2.wrapping_add(v3);
                v3 = v3.rotate_left(16);
                v3 ^= v2;

                v0 = v0.wrapping_add(v3);
                v3 = v3.rotate_left(21);
                v3 ^= v0;

                v2 = v2.wrapping_add(v1);
                v1 = v1.rotate_left(17);
                v1 ^= v2;
                v2 = v2.rotate_left(32);
            }

            v0 ^= m;
        }

        // Process remaining bytes
        let remainder = chunks.remainder();
        let mut last = (data.len() as u64) << 56;
        for (i, &byte) in remainder.iter().enumerate() {
            last |= (byte as u64) << (i * 8);
        }

        v3 ^= last;

        // SipRound x 2
        for _ in 0..2 {
            v0 = v0.wrapping_add(v1);
            v1 = v1.rotate_left(13);
            v1 ^= v0;
            v0 = v0.rotate_left(32);

            v2 = v2.wrapping_add(v3);
            v3 = v3.rotate_left(16);
            v3 ^= v2;

            v0 = v0.wrapping_add(v3);
            v3 = v3.rotate_left(21);
            v3 ^= v0;

            v2 = v2.wrapping_add(v1);
            v1 = v1.rotate_left(17);
            v1 ^= v2;
            v2 = v2.rotate_left(32);
        }

        v0 ^= last;

        // Finalization
        v2 ^= 0xff;

        // SipRound x 4
        for _ in 0..4 {
            v0 = v0.wrapping_add(v1);
            v1 = v1.rotate_left(13);
            v1 ^= v0;
            v0 = v0.rotate_left(32);

            v2 = v2.wrapping_add(v3);
            v3 = v3.rotate_left(16);
            v3 ^= v2;

            v0 = v0.wrapping_add(v3);
            v3 = v3.rotate_left(21);
            v3 ^= v0;

            v2 = v2.wrapping_add(v1);
            v1 = v1.rotate_left(17);
            v1 ^= v2;
            v2 = v2.rotate_left(32);
        }

        let result = v0 ^ v1 ^ v2 ^ v3;
        result.to_le_bytes()
    }

    /// Reconstruct full block from compact block and mempool
    pub fn reconstruct(
        &self,
        mempool: &HashMap<ShortTxId, Vec<u8>>,
    ) -> Result<Vec<Vec<u8>>, CompactBlockError> {
        let total_txs = self.short_ids.len().saturating_add(self.prefilled_txs.len());
        const MAX_BLOCK_TXS: usize = 25_000;
        if total_txs > MAX_BLOCK_TXS {
            return Err(CompactBlockError::InvalidPrefilledIndex);
        }
        let mut transactions = vec![Vec::new(); total_txs];

        // Fill in prefilled transactions
        let mut index = 0u64;
        for prefilled in &self.prefilled_txs {
            index += prefilled.index;
            if index as usize >= total_txs {
                return Err(CompactBlockError::InvalidPrefilledIndex);
            }
            transactions[index as usize] = prefilled.tx.clone();
            index += 1;
        }

        // Fill in transactions from mempool
        let mut short_id_index = 0;
        for tx in transactions.iter_mut() {
            if tx.is_empty() {
                if short_id_index >= self.short_ids.len() {
                    return Err(CompactBlockError::MissingTransactions);
                }

                let short_id = self.short_ids[short_id_index];
                match mempool.get(&short_id) {
                    Some(tx_data) => {
                        *tx = tx_data.clone();
                    }
                    None => {
                        return Err(CompactBlockError::MissingTransactions);
                    }
                }
                short_id_index += 1;
            }
        }

        Ok(transactions)
    }

    /// Get missing transaction indices
    pub fn get_missing_indices(&self, mempool: &HashMap<ShortTxId, Vec<u8>>) -> Vec<u64> {
        const MAX_BLOCK_TXS: usize = 25_000;
        let total = self.short_ids.len().saturating_add(self.prefilled_txs.len());
        if total > MAX_BLOCK_TXS {
            return Vec::new();
        }

        let mut missing = Vec::new();
        let mut index = 0u64;

        // Skip prefilled transactions
        let mut prefilled_indices = vec![false; total];
        let mut idx = 0u64;
        for prefilled in &self.prefilled_txs {
            idx += prefilled.index;
            if (idx as usize) < prefilled_indices.len() {
                prefilled_indices[idx as usize] = true;
            }
            idx += 1;
        }

        // Check short IDs
        for &short_id in self.short_ids.iter() {
            while index < prefilled_indices.len() as u64 && prefilled_indices[index as usize] {
                index += 1;
            }

            if !mempool.contains_key(&short_id) {
                missing.push(index);
            }

            index += 1;
        }

        missing
    }
}

impl ShortTxId {
    /// Create from bytes
    pub fn from_bytes(bytes: [u8; SHORT_TXID_SIZE]) -> Self {
        ShortTxId(bytes)
    }

    /// Get bytes
    pub fn as_bytes(&self) -> &[u8; SHORT_TXID_SIZE] {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_compact_block() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let transactions = vec![
            vec![1, 2, 3], // coinbase
            vec![4, 5, 6],
            vec![7, 8, 9],
        ];

        let compact = CompactBlock::new(header, 123456789, &transactions, &[]).unwrap();

        assert_eq!(compact.prefilled_txs.len(), 1); // coinbase
        assert_eq!(compact.short_ids.len(), 2); // other transactions
    }

    #[test]
    fn test_short_txid_generation() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let nonce = 123456789u64;
        let key = CompactBlock::calculate_key(&header, nonce);

        let tx = vec![1, 2, 3, 4, 5];
        let short_id = CompactBlock::calculate_short_txid(&tx, &key);

        assert_eq!(short_id.as_bytes().len(), SHORT_TXID_SIZE);
    }

    #[test]
    fn test_reconstruct_full_block() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let transactions = vec![
            vec![1, 2, 3], // coinbase
            vec![4, 5, 6],
            vec![7, 8, 9],
        ];

        let compact = CompactBlock::new(header.clone(), 123456789, &transactions, &[]).unwrap();

        // Build mempool with all transactions
        let mut mempool = HashMap::new();
        let key = CompactBlock::calculate_key(&header, 123456789);

        for tx in &transactions[1..] {
            let short_id = CompactBlock::calculate_short_txid(tx, &key);
            mempool.insert(short_id, tx.clone());
        }

        let reconstructed = compact.reconstruct(&mempool).unwrap();

        assert_eq!(reconstructed.len(), transactions.len());
        assert_eq!(reconstructed[0], transactions[0]); // coinbase
        assert_eq!(reconstructed[1], transactions[1]);
        assert_eq!(reconstructed[2], transactions[2]);
    }

    #[test]
    fn test_missing_transactions() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let transactions = vec![
            vec![1, 2, 3], // coinbase
            vec![4, 5, 6],
            vec![7, 8, 9],
        ];

        let compact = CompactBlock::new(header, 123456789, &transactions, &[]).unwrap();

        // Empty mempool
        let mempool = HashMap::new();

        let result = compact.reconstruct(&mempool);
        assert_eq!(result, Err(CompactBlockError::MissingTransactions));
    }

    #[test]
    fn test_get_missing_indices() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let transactions = vec![
            vec![1, 2, 3], // coinbase
            vec![4, 5, 6],
            vec![7, 8, 9],
            vec![10, 11, 12],
        ];

        let compact = CompactBlock::new(header.clone(), 123456789, &transactions, &[]).unwrap();

        // Mempool with only one transaction
        let mut mempool = HashMap::new();
        let key = CompactBlock::calculate_key(&header, 123456789);
        let short_id = CompactBlock::calculate_short_txid(&transactions[1], &key);
        mempool.insert(short_id, transactions[1].clone());

        let missing = compact.get_missing_indices(&mempool);

        // Should have 2 missing transactions (indices 2 and 3)
        assert_eq!(missing.len(), 2);
    }

    #[test]
    fn test_prefilled_transactions() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let transactions = vec![
            vec![1, 2, 3], // coinbase
            vec![4, 5, 6],
            vec![7, 8, 9],
            vec![10, 11, 12],
        ];

        // Prefill coinbase and transaction at index 2
        let compact = CompactBlock::new(header, 123456789, &transactions, &[2]).unwrap();

        assert_eq!(compact.prefilled_txs.len(), 2); // coinbase + index 2
        assert_eq!(compact.short_ids.len(), 2); // indices 1 and 3

        // Check differential encoding
        assert_eq!(compact.prefilled_txs[0].index, 0); // coinbase at 0
        assert_eq!(compact.prefilled_txs[1].index, 1); // diff from coinbase: 2 - 0 - 1 = 1
    }

    #[test]
    fn test_block_header_hash() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 12345);

        let hash1 = header.hash();
        let hash2 = header.hash();

        assert_eq!(hash1, hash2); // Deterministic
        assert_eq!(hash1.len(), 32);
    }

    #[test]
    fn test_siphash_deterministic() {
        let data = b"Hello, World!";
        let key = [0u8; 16];

        let hash1 = CompactBlock::siphash_2_4(data, &key);
        let hash2 = CompactBlock::siphash_2_4(data, &key);

        assert_eq!(hash1, hash2); // Deterministic
    }

    #[test]
    fn test_siphash_different_keys() {
        let data = b"Hello, World!";
        let key1 = [0u8; 16];
        let mut key2 = [0u8; 16];
        key2[0] = 1;

        let hash1 = CompactBlock::siphash_2_4(data, &key1);
        let hash2 = CompactBlock::siphash_2_4(data, &key2);

        assert_ne!(hash1, hash2); // Different keys produce different hashes
    }

    #[test]
    fn test_short_txid_size_constant_is_6() {
        assert_eq!(SHORT_TXID_SIZE, 6);
    }

    #[test]
    fn test_siphash_different_data_different_hash() {
        let key = [0xAAu8; 16];
        let h1 = CompactBlock::siphash_2_4(b"data_one", &key);
        let h2 = CompactBlock::siphash_2_4(b"data_two", &key);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_compact_block_nonce_is_stored() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);
        let nonce = 9_999_999u64;
        let compact = CompactBlock::new(header, nonce, &[vec![1, 2, 3]], &[]).unwrap();
        assert_eq!(compact.nonce, nonce);
    }

    #[test]
    fn test_calculate_key_deterministic() {
        let header = BlockHeader::new([2u8; 32], [3u8; 32], 100, 0x1d00ffff, 42);
        let key1 = CompactBlock::calculate_key(&header, 12345);
        let key2 = CompactBlock::calculate_key(&header, 12345);
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 16);
    }

    #[test]
    fn test_calculate_key_changes_with_nonce() {
        let header = BlockHeader::new([2u8; 32], [3u8; 32], 100, 0x1d00ffff, 42);
        let key1 = CompactBlock::calculate_key(&header, 1);
        let key2 = CompactBlock::calculate_key(&header, 2);
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_short_txid_from_and_as_bytes_roundtrip() {
        let bytes = [1u8, 2, 3, 4, 5, 6];
        let stxid = ShortTxId::from_bytes(bytes);
        assert_eq!(stxid.as_bytes(), &bytes);
    }

    #[test]
    fn test_prefilled_coinbase_tx_present() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);
        let txs = vec![vec![0xCB; 10], vec![0x01; 5], vec![0x02; 5]];
        let compact = CompactBlock::new(header, 1, &txs, &[]).unwrap();
        // Coinbase is always prefilled
        assert!(!compact.prefilled_txs.is_empty());
        assert_eq!(compact.prefilled_txs[0].tx, vec![0xCB; 10]);
    }
}
