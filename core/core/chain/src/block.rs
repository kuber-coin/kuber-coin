use crate::header::BlockHeader;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tx::Transaction;

/// A block containing a header and transactions
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Block {
    /// Block header (contains PoW)
    pub header: BlockHeader,

    /// List of transactions
    /// Sprint 1: Only coinbase transaction
    pub transactions: Vec<Transaction>,
}

impl Block {
    /// Create a new block
    pub fn new(header: BlockHeader, transactions: Vec<Transaction>) -> Self {
        Self {
            header,
            transactions,
        }
    }

    /// Create a block from individual parameters (for testing/fuzzing)
    pub fn from_params(
        height: u64,
        prev_block_hash: [u8; 32],
        merkle_root: [u8; 32],
        timestamp: u64,
        bits: u32,
        nonce: u64,
        transactions: Vec<Transaction>,
    ) -> Self {
        let header = BlockHeader::new(prev_block_hash, merkle_root, timestamp, bits, nonce);
        let mut block = Self::new(header, transactions);
        block.header.height = height;
        block
    }

    /// Get the block hash (delegates to header)
    pub fn hash(&self) -> [u8; 32] {
        self.header.hash()
    }

    /// Get the block hash as hex string
    pub fn hash_hex(&self) -> String {
        self.header.hash_hex()
    }

    /// Calculate the merkle root of all transactions
    pub fn calculate_merkle_root(transactions: &[Transaction]) -> [u8; 32] {
        if transactions.is_empty() {
            return [0u8; 32];
        }

        // For Sprint 2 Phase 1: Simple merkle root for multiple transactions
        // Collect all transaction IDs
        let mut hashes: Vec<[u8; 32]> = transactions.iter().map(|tx| tx.txid()).collect();

        // If only one transaction, return its hash
        if hashes.len() == 1 {
            return hashes[0];
        }

        // Build merkle tree bottom-up
        while hashes.len() > 1 {
            let mut next_level = Vec::new();

            for chunk in hashes.chunks(2) {
                let combined = if chunk.len() == 2 {
                    // Hash pair — double SHA256 per Bitcoin consensus
                    let mut data = Vec::new();
                    data.extend_from_slice(&chunk[0]);
                    data.extend_from_slice(&chunk[1]);
                    let first = Sha256::digest(&data);
                    Sha256::digest(first).into()
                } else {
                    // Odd one out, hash with itself — double SHA256
                    let mut data = Vec::new();
                    data.extend_from_slice(&chunk[0]);
                    data.extend_from_slice(&chunk[0]);
                    let first = Sha256::digest(&data);
                    Sha256::digest(first).into()
                };
                next_level.push(combined);
            }

            hashes = next_level;
        }

        hashes[0]
    }

    /// Verify the merkle root matches the transactions
    pub fn verify_merkle_root(&self) -> bool {
        let calculated = Self::calculate_merkle_root(&self.transactions);
        calculated == self.header.merkle_root
    }

    /// Block base size in bytes (transactions serialized WITHOUT witness data).
    ///
    /// Includes the block header and transaction-count varint.
    pub fn base_size(&self) -> usize {
        // version(4) + prev_hash(32) + merkle_root(32) + timestamp(8) + bits(4) + nonce(8) + height(8)
        const HEADER_SIZE: usize = 96;
        HEADER_SIZE
            + compact_size_len(self.transactions.len())
            + self.transactions.iter().map(|tx| tx.base_size()).sum::<usize>()
    }

    /// Block total size in bytes (transactions serialized WITH witness data).
    pub fn total_size(&self) -> usize {
        const HEADER_SIZE: usize = 96;
        HEADER_SIZE
            + compact_size_len(self.transactions.len())
            + self.transactions.iter().map(|tx| tx.total_size()).sum::<usize>()
    }

    /// Block weight in weight units (BIP-141).
    ///
    /// `weight = base_size * 3 + total_size`
    pub fn weight(&self) -> usize {
        self.base_size() * 3 + self.total_size()
    }

    /// Calculate the witness merkle root (BIP-141).
    ///
    /// Uses `wtxid` for every transaction except the coinbase, which
    /// is replaced with 32 zero bytes per the specification.
    pub fn calculate_witness_merkle_root(transactions: &[Transaction]) -> [u8; 32] {
        if transactions.is_empty() {
            return [0u8; 32];
        }

        let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(transactions.len());
        for (i, tx) in transactions.iter().enumerate() {
            if i == 0 {
                // Coinbase wtxid is defined as 0x00..00
                hashes.push([0u8; 32]);
            } else {
                hashes.push(tx.wtxid());
            }
        }

        if hashes.len() == 1 {
            return hashes[0];
        }

        while hashes.len() > 1 {
            let mut next_level = Vec::new();
            for chunk in hashes.chunks(2) {
                let mut data = Vec::with_capacity(64);
                data.extend_from_slice(&chunk[0]);
                if chunk.len() == 2 {
                    data.extend_from_slice(&chunk[1]);
                } else {
                    data.extend_from_slice(&chunk[0]);
                }
                // BIP-141: witness merkle uses double SHA-256 (SHA256d), same as txid merkle.
                let first = Sha256::digest(&data);
                next_level.push(<[u8; 32]>::from(Sha256::digest(first)));
            }
            hashes = next_level;
        }

        hashes[0]
    }
}

/// Varint length (Bitcoin CompactSize encoding).
fn compact_size_len(n: usize) -> usize {
    if n < 0xfd { 1 } else if n <= 0xffff { 3 } else if n <= 0xffff_ffff { 5 } else { 9 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_coinbase(height: u64) -> Transaction {
        Transaction::new_coinbase(height, 50_000_000, vec![0xab])
    }

    #[test]
    fn test_block_creation() {
        let header = BlockHeader::new([0u8; 32], [1u8; 32], 1234567890, 0x1d00ffff, 0);
        let tx = create_test_coinbase(0);
        let block = Block::new(header.clone(), vec![tx]);

        assert_eq!(block.header, header);
        assert_eq!(block.transactions.len(), 1);
    }

    #[test]
    fn test_merkle_root_deterministic() {
        let tx = create_test_coinbase(0);

        let root1 = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let root2 = Block::calculate_merkle_root(std::slice::from_ref(&tx));

        assert_eq!(root1, root2, "Merkle root must be deterministic");
    }

    #[test]
    fn test_merkle_root_changes_with_transaction() {
        let tx1 = create_test_coinbase(0);
        let tx2 = create_test_coinbase(1); // Different height

        let root1 = Block::calculate_merkle_root(&[tx1]);
        let root2 = Block::calculate_merkle_root(&[tx2]);

        assert_ne!(
            root1, root2,
            "Merkle root must change with different transaction"
        );
    }

    #[test]
    fn test_verify_merkle_root() {
        let tx = create_test_coinbase(0);
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx));

        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);

        let block = Block::new(header, vec![tx]);
        assert!(block.verify_merkle_root(), "Merkle root should be valid");
    }

    #[test]
    fn test_verify_merkle_root_invalid() {
        let tx = create_test_coinbase(0);
        let wrong_merkle_root = [0u8; 32]; // Wrong root

        let header = BlockHeader::new([0u8; 32], wrong_merkle_root, 1234567890, 0x1d00ffff, 0);

        let block = Block::new(header, vec![tx]);
        assert!(
            !block.verify_merkle_root(),
            "Invalid merkle root should be detected"
        );
    }

    #[test]
    fn test_block_weight_single_coinbase() {
        let tx = create_test_coinbase(0);
        let tx_weight = tx.weight();
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);
        let block = Block::new(header, vec![tx]);

        // Header (96 bytes) + 1-byte varint for 1 tx = 97 bytes non-witness overhead
        // weight = base_size * 3 + total_size
        // For a single coinbase (no witness): weight = total_bytes * 4
        let expected = (97 + tx_weight / 4) * 4; // base == total for no-witness
        assert_eq!(block.weight(), expected);
        assert!(block.weight() < crate::MAX_BLOCK_WEIGHT);
    }

    #[test]
    fn test_block_base_size_equals_total_size_without_witness() {
        let tx = create_test_coinbase(0);
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);
        let block = Block::new(header, vec![tx]);

        // Without witness data, base_size == total_size
        assert_eq!(block.base_size(), block.total_size());
        // And weight == 4 * base_size
        assert_eq!(block.weight(), block.base_size() * 4);
    }

    #[test]
    fn test_block_weight_under_limit() {
        // Verify a normal block is well under the weight limit
        let tx = create_test_coinbase(0);
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);
        let block = Block::new(header, vec![tx]);

        assert!(
            block.weight() < crate::MAX_BLOCK_WEIGHT,
            "Single-coinbase block weight {} should be < {}",
            block.weight(),
            crate::MAX_BLOCK_WEIGHT,
        );
    }

    #[test]
    fn test_empty_transactions_merkle_root_is_zeros() {
        let root = Block::calculate_merkle_root(&[]);
        assert_eq!(root, [0u8; 32]);
    }

    #[test]
    fn test_block_hash_length_is_32() {
        let header = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 0);
        let block = Block::new(header, vec![]);
        assert_eq!(block.hash().len(), 32);
    }

    #[test]
    fn test_from_params_stores_height() {
        let tx = create_test_coinbase(42);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let block = Block::from_params(42, [0u8; 32], merkle, 1_700_000_000, 0x1d00ffff, 0, vec![tx]);
        assert_eq!(block.header.height, 42);
    }

    #[test]
    fn test_two_tx_merkle_differs_from_one_tx() {
        let tx1 = create_test_coinbase(0);
        let tx2 = create_test_coinbase(1);
        let root1 = Block::calculate_merkle_root(&[tx1.clone()]);
        let root2 = Block::calculate_merkle_root(&[tx1.clone(), tx2]);
        assert_ne!(root1, root2);
    }

    #[test]
    fn test_total_size_gte_base_size() {
        let tx = create_test_coinbase(0);
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx));
        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);
        let block = Block::new(header, vec![tx]);
        assert!(block.total_size() >= block.base_size());
    }

    #[test]
    fn test_verify_merkle_root_fails_if_tx_added() {
        let tx1 = create_test_coinbase(0);
        let merkle_root = Block::calculate_merkle_root(std::slice::from_ref(&tx1));
        let header = BlockHeader::new([0u8; 32], merkle_root, 1234567890, 0x1d00ffff, 0);
        let tx2 = create_test_coinbase(1);
        // Build block with a different transaction than was used for the header
        let block = Block::new(header, vec![tx2]);
        assert!(!block.verify_merkle_root(), "tampered block should fail merkle check");
    }

    #[test]
    fn test_hash_hex_is_64_char_hex() {
        let header = BlockHeader::new([0u8; 32], [0u8; 32], 0, 0x1d00ffff, 0);
        let block = Block::new(header, vec![]);
        let h = block.hash_hex();
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_witness_merkle_root_single_coinbase_is_zeros() {
        // Per BIP-141, coinbase wtxid is [0;32], so for a single-tx block
        // the witness merkle root equals [0;32]
        let tx = create_test_coinbase(0);
        let root = Block::calculate_witness_merkle_root(&[tx]);
        assert_eq!(root, [0u8; 32]);
    }
}
