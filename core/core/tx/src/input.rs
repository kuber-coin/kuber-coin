use crate::OutPoint;
use serde::{Deserialize, Serialize};

/// Witness data for a transaction input (BIP-141).
///
/// For legacy (pre-SegWit) inputs this is empty.
/// For SegWit inputs it contains the signature, public key, and/or
/// redeem script components that were formerly in `script_sig`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Witness {
    /// Stack items (signatures, public keys, scripts, etc.)
    pub stack: Vec<Vec<u8>>,
}

impl Witness {
    /// Create a new empty witness.
    pub fn new() -> Self {
        Self { stack: Vec::new() }
    }

    /// Create witness from stack items.
    pub fn from_stack(stack: Vec<Vec<u8>>) -> Self {
        Self { stack }
    }

    /// Check if witness is empty (legacy input).
    pub fn is_empty(&self) -> bool {
        self.stack.is_empty()
    }

    /// Number of items on the witness stack.
    pub fn len(&self) -> usize {
        self.stack.len()
    }

    /// Serialized size in bytes (for weight calculation).
    pub fn size(&self) -> usize {
        let mut s = compact_size_len(self.stack.len());
        for item in &self.stack {
            s += compact_size_len(item.len()) + item.len();
        }
        s
    }

    /// Push an item onto the witness stack.
    pub fn push(&mut self, item: Vec<u8>) {
        self.stack.push(item);
    }
}

/// Compact-size encoding length (mimics Bitcoin's CompactSize).
fn compact_size_len(n: usize) -> usize {
    if n < 0xfd { 1 } else if n <= 0xffff { 3 } else if n <= 0xffff_ffff { 5 } else { 9 }
}

/// Transaction input (spends a previous output)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TxInput {
    /// Reference to the output being spent
    pub prev_output: OutPoint,

    /// Script signature (proof of ownership for legacy inputs)
    pub script_sig: Vec<u8>,

    /// Sequence number (for timelocks, RBF)
    pub sequence: u32,

    /// Segregated witness data (BIP-141).
    /// Empty for legacy inputs; populated for SegWit spends.
    #[serde(default)]
    pub witness: Witness,
}

impl TxInput {
    /// Create a new transaction input
    pub fn new(prev_output: OutPoint, script_sig: Vec<u8>) -> Self {
        Self {
            prev_output,
            script_sig,
            sequence: 0xffffffff, // Default: finalized
            witness: Witness::new(),
        }
    }

    /// Create a new transaction input with witness data (SegWit)
    pub fn new_witness(prev_output: OutPoint, witness: Witness) -> Self {
        Self {
            prev_output,
            script_sig: Vec::new(), // SegWit inputs have empty script_sig (or just the redeem script hash for P2SH-P2WPKH)
            sequence: 0xffffffff,
            witness,
        }
    }

    /// Create a coinbase input (no previous output)
    pub fn new_coinbase(height: u64, extra_data: Vec<u8>) -> Self {
        // BIP-34: script_sig starts with serialized block height (push length + LE bytes)
        let mut script_sig = Self::encode_bip34_height(height);
        script_sig.extend(extra_data);

        Self {
            prev_output: OutPoint::null(),
            script_sig,
            sequence: 0xffffffff,
            witness: Witness::new(),
        }
    }

    /// Check if this is a coinbase input
    pub fn is_coinbase(&self) -> bool {
        self.prev_output.is_null()
    }

    /// Check if this input has witness data (is a SegWit spend)
    pub fn has_witness(&self) -> bool {
        !self.witness.is_empty()
    }

    /// Encode block height in BIP-34 format: push-length byte followed by minimal LE bytes.
    fn encode_bip34_height(height: u64) -> Vec<u8> {
        if height == 0 {
            return vec![0x01, 0x00];
        }
        let mut bytes = Vec::new();
        let mut h = height;
        while h > 0 {
            bytes.push((h & 0xff) as u8);
            h >>= 8;
        }
        let mut result = vec![bytes.len() as u8];
        result.extend(bytes);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_input_creation() {
        let outpoint = OutPoint::new([1u8; 32], 0);
        let script_sig = vec![0x01, 0x02, 0x03];
        let input = TxInput::new(outpoint, script_sig.clone());

        assert_eq!(input.prev_output, outpoint);
        assert_eq!(input.script_sig, script_sig);
        assert_eq!(input.sequence, 0xffffffff);
    }

    #[test]
    fn test_coinbase_input() {
        let coinbase = TxInput::new_coinbase(100, b"extra data".to_vec());

        assert!(coinbase.is_coinbase());
        assert!(coinbase.prev_output.is_null());
        assert!(!coinbase.script_sig.is_empty());
    }

    #[test]
    fn test_non_coinbase_input() {
        let outpoint = OutPoint::new([1u8; 32], 0);
        let input = TxInput::new(outpoint, vec![]);

        assert!(!input.is_coinbase());
    }

    #[test]
    fn test_default_sequence_is_max_u32() {
        let outpoint = OutPoint::new([0u8; 32], 0);
        let input = TxInput::new(outpoint, vec![]);
        assert_eq!(input.sequence, 0xffffffff);
    }

    #[test]
    fn test_witness_input_has_empty_script_sig() {
        let outpoint = OutPoint::new([1u8; 32], 0);
        let witness = Witness::from_stack(vec![vec![0xde, 0xad]]);
        let input = TxInput::new_witness(outpoint, witness);
        assert!(input.script_sig.is_empty());
    }

    #[test]
    fn test_has_witness_true_when_witness_present() {
        let outpoint = OutPoint::new([1u8; 32], 0);
        let witness = Witness::from_stack(vec![vec![0x01, 0x02]]);
        let input = TxInput::new_witness(outpoint, witness);
        assert!(input.has_witness());
    }

    #[test]
    fn test_has_witness_false_when_no_witness() {
        let outpoint = OutPoint::new([1u8; 32], 0);
        let input = TxInput::new(outpoint, vec![0xde]);
        assert!(!input.has_witness());
    }

    #[test]
    fn test_coinbase_extra_data_appended() {
        let coinbase = TxInput::new_coinbase(1, vec![0xAB, 0xCD]);
        assert!(coinbase.script_sig.contains(&0xAB));
        assert!(coinbase.script_sig.contains(&0xCD));
    }

    #[test]
    fn test_coinbase_sequence_is_max() {
        let coinbase = TxInput::new_coinbase(777, vec![]);
        assert_eq!(coinbase.sequence, 0xffffffff);
    }

    #[test]
    fn test_two_coinbases_different_height_different_scriptsig() {
        let cb100 = TxInput::new_coinbase(100, vec![]);
        let cb200 = TxInput::new_coinbase(200, vec![]);
        assert_ne!(cb100.script_sig, cb200.script_sig);
    }
}
