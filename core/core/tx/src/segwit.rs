// SegWit (BIP-141) - Segregated Witness Implementation
// Enables witness data separation, malleability fix, and Lightning Network support

use crate::Transaction;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt;

/// SegWit-related errors
#[allow(missing_docs)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SegwitError {
    InvalidWitness(String),
    InvalidWitnessProgram(String),
    WeightExceeded,
    MalformedTransaction,
    InvalidSignature,
    WitnessStackEmpty,
    InvalidWitnessVersion,
}

impl fmt::Display for SegwitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidWitness(msg) => write!(f, "Invalid witness: {}", msg),
            Self::InvalidWitnessProgram(msg) => write!(f, "Invalid witness program: {}", msg),
            Self::WeightExceeded => write!(f, "Transaction weight exceeded"),
            Self::MalformedTransaction => write!(f, "Malformed transaction"),
            Self::InvalidSignature => write!(f, "Invalid signature"),
            Self::WitnessStackEmpty => write!(f, "Witness stack is empty"),
            Self::InvalidWitnessVersion => write!(f, "Invalid witness version"),
        }
    }
}

impl Error for SegwitError {}

/// Witness data for a transaction input
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Witness {
    /// Stack items (signatures, public keys, scripts, etc.)
    pub stack: Vec<Vec<u8>>,
}

impl Witness {
    /// Create a new empty witness
    pub fn new() -> Self {
        Self { stack: Vec::new() }
    }

    /// Create witness with stack items
    pub fn from_stack(stack: Vec<Vec<u8>>) -> Self {
        Self { stack }
    }

    /// Check if witness is empty
    pub fn is_empty(&self) -> bool {
        self.stack.is_empty()
    }

    /// Get witness size in bytes (for weight calculation)
    pub fn size(&self) -> usize {
        let mut size = compact_size_len(self.stack.len());
        for item in &self.stack {
            size += compact_size_len(item.len()) + item.len();
        }
        size
    }

    /// Push an item to the witness stack
    pub fn push(&mut self, item: Vec<u8>) {
        self.stack.push(item);
    }

    /// Pop an item from the witness stack
    pub fn pop(&mut self) -> Option<Vec<u8>> {
        self.stack.pop()
    }
}

impl Default for Witness {
    fn default() -> Self {
        Self::new()
    }
}

/// Witness version (0-16)
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WitnessVersion {
    V0 = 0,
    V1 = 1,
    // V2-V16 reserved for future use
}

impl WitnessVersion {
    /// Parse witness version from opcode
    pub fn from_opcode(opcode: u8) -> Result<Self, SegwitError> {
        match opcode {
            0x00 => Ok(Self::V0),
            0x51 => Ok(Self::V1), // OP_1
            _ => Err(SegwitError::InvalidWitnessVersion),
        }
    }

    /// Convert to opcode
    pub fn to_opcode(self) -> u8 {
        match self {
            Self::V0 => 0x00,
            Self::V1 => 0x51,
        }
    }
}

/// Witness program (hash of the script/pubkey)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WitnessProgram {
    /// Witness version
    pub version: WitnessVersion,
    /// Program bytes (hash of script or pubkey)
    pub program: Vec<u8>,
}

impl WitnessProgram {
    /// Create a new witness program
    pub fn new(version: WitnessVersion, program: Vec<u8>) -> Result<Self, SegwitError> {
        // BIP-141: witness programs must be 2-40 bytes
        if program.len() < 2 || program.len() > 40 {
            return Err(SegwitError::InvalidWitnessProgram(
                "Witness program must be 2-40 bytes".into(),
            ));
        }

        // Version 0 witness programs must be 20 or 32 bytes
        if version == WitnessVersion::V0 && program.len() != 20 && program.len() != 32 {
            return Err(SegwitError::InvalidWitnessProgram(
                "V0 witness program must be 20 or 32 bytes".into(),
            ));
        }
        Ok(Self { version, program })
    }

    /// Parse witness program from script
    pub fn from_script(script: &[u8]) -> Result<Self, SegwitError> {
        if script.len() < 4 || script.len() > 42 {
            return Err(SegwitError::InvalidWitnessProgram(
                "Invalid script length".into(),
            ));
        }

        let version = WitnessVersion::from_opcode(script[0])?;
        let push_len = script[1] as usize;

        if script.len() != push_len + 2 {
            return Err(SegwitError::InvalidWitnessProgram(
                "Script length mismatch".into(),
            ));
        }

        let program = script[2..2 + push_len].to_vec();
        Self::new(version, program)
    }

    /// Convert to script (witness version + push + program)
    pub fn to_script(&self) -> Vec<u8> {
        let mut script = Vec::new();
        script.push(self.version.to_opcode());
        script.push(self.program.len() as u8);
        script.extend_from_slice(&self.program);
        script
    }

    /// Check if this is P2WPKH (Pay-to-Witness-Public-Key-Hash)
    pub fn is_p2wpkh(&self) -> bool {
        self.version == WitnessVersion::V0 && self.program.len() == 20
    }

    /// Check if this is P2WSH (Pay-to-Witness-Script-Hash)
    pub fn is_p2wsh(&self) -> bool {
        self.version == WitnessVersion::V0 && self.program.len() == 32
    }
}

/// P2WPKH (Pay-to-Witness-Public-Key-Hash) - Native SegWit v0
pub struct P2WPKH;

impl P2WPKH {
    /// Create P2WPKH script from pubkey hash (20 bytes)
    pub fn script_pubkey(pubkey_hash: &[u8; 20]) -> Vec<u8> {
        let mut script = Vec::new();
        script.push(0x00); // OP_0 (witness version 0)
        script.push(0x14); // Push 20 bytes
        script.extend_from_slice(pubkey_hash);
        script
    }

    /// Create witness for P2WPKH (signature + pubkey)
    pub fn create_witness(signature: Vec<u8>, pubkey: Vec<u8>) -> Witness {
        Witness::from_stack(vec![signature, pubkey])
    }

    /// Verify P2WPKH witness
    pub fn verify_witness(witness: &Witness, pubkey_hash: &[u8; 20]) -> Result<bool, SegwitError> {
        if witness.stack.len() != 2 {
            return Err(SegwitError::InvalidWitness(
                "P2WPKH witness must have 2 items".into(),
            ));
        }

        let pubkey = &witness.stack[1];

        // Hash the pubkey and verify it matches
        let mut hasher = Sha256::new();
        hasher.update(pubkey);
        let pubkey_sha = hasher.finalize();

        let mut ripemd = ripemd::Ripemd160::new();
        ripemd.update(pubkey_sha);
        let computed_hash = ripemd.finalize();

        if computed_hash.as_slice() != pubkey_hash {
            return Ok(false);
        }

        // Signature verification would happen in script interpreter
        Ok(true)
    }
}

/// P2WSH (Pay-to-Witness-Script-Hash) - Native SegWit v0 for complex scripts
pub struct P2WSH;

impl P2WSH {
    /// Create P2WSH script from script hash (32 bytes)
    pub fn script_pubkey(script_hash: &[u8; 32]) -> Vec<u8> {
        let mut script = Vec::new();
        script.push(0x00); // OP_0 (witness version 0)
        script.push(0x20); // Push 32 bytes
        script.extend_from_slice(script_hash);
        script
    }

    /// Hash a script for P2WSH
    pub fn hash_script(script: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(script);
        let hash = hasher.finalize();
        let mut result = [0u8; 32];
        result.copy_from_slice(&hash);
        result
    }

    /// Create witness for P2WSH (script items + witness script)
    pub fn create_witness(stack_items: Vec<Vec<u8>>, witness_script: Vec<u8>) -> Witness {
        let mut stack = stack_items;
        stack.push(witness_script);
        Witness::from_stack(stack)
    }

    /// Verify P2WSH witness
    pub fn verify_witness(witness: &Witness, script_hash: &[u8; 32]) -> Result<bool, SegwitError> {
        if witness.stack.is_empty() {
            return Err(SegwitError::WitnessStackEmpty);
        }

        // Last item is the witness script
        // SAFETY: witness stack verified non-empty by the length check above.
        let witness_script = witness
            .stack
            .last()
            .expect("witness stack checked non-empty above");

        // Hash the witness script and verify it matches
        let computed_hash = Self::hash_script(witness_script);

        if &computed_hash != script_hash {
            return Ok(false);
        }

        // Script execution would happen in script interpreter
        Ok(true)
    }
}

/// Transaction weight calculation (BIP-141)
/// Weight = (base_size * 3) + total_size
/// where base_size excludes witness data, total_size includes witness data
pub struct Weight;

impl Weight {
    /// Maximum transaction weight (4,000,000 weight units = 1,000,000 vbytes)
    pub const MAX_TX_WEIGHT: usize = 4_000_000;

    /// Weight per witness scale factor
    pub const WITNESS_SCALE_FACTOR: usize = 4;

    /// Calculate transaction weight
    pub fn calculate(base_size: usize, total_size: usize) -> usize {
        base_size * 3 + total_size
    }

    /// Calculate virtual size (vsize) from weight
    pub fn to_vsize(weight: usize) -> usize {
        weight.div_ceil(Self::WITNESS_SCALE_FACTOR)
    }

    /// Calculate weight from vsize
    pub fn from_vsize(vsize: usize) -> usize {
        vsize * Self::WITNESS_SCALE_FACTOR
    }

    /// Validate transaction weight
    pub fn validate(weight: usize) -> Result<(), SegwitError> {
        if weight > Self::MAX_TX_WEIGHT {
            return Err(SegwitError::WeightExceeded);
        }
        Ok(())
    }
}

/// SegWit transaction with witness data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegwitTransaction {
    /// Base transaction
    pub transaction: Transaction,
    /// Witness data for each input
    pub witnesses: Vec<Witness>,
}

impl SegwitTransaction {
    /// Create a new SegWit transaction
    pub fn new(transaction: Transaction) -> Self {
        let witness_count = transaction.inputs.len();
        Self {
            transaction,
            witnesses: vec![Witness::new(); witness_count],
        }
    }

    /// Add witness for an input
    pub fn set_witness(&mut self, input_index: usize, witness: Witness) -> Result<(), SegwitError> {
        if input_index >= self.witnesses.len() {
            return Err(SegwitError::InvalidWitness(
                "Input index out of bounds".into(),
            ));
        }
        self.witnesses[input_index] = witness;
        Ok(())
    }

    /// Check if transaction has any witness data
    pub fn has_witness(&self) -> bool {
        self.witnesses.iter().any(|w| !w.is_empty())
    }

    /// Calculate base size (without witness data)
    pub fn base_size(&self) -> usize {
        // Version (4) + input count + inputs + output count + outputs + locktime (4)
        let mut size = 4 + compact_size_len(self.transaction.inputs.len());

        for input in &self.transaction.inputs {
            size += 32 + 4 + compact_size_len(input.script_sig.len()) + input.script_sig.len() + 4;
        }

        size += compact_size_len(self.transaction.outputs.len());
        for output in &self.transaction.outputs {
            size += 8 + compact_size_len(output.script_pubkey.len()) + output.script_pubkey.len();
        }

        size + 4
    }

    /// Calculate total size (with witness data)
    pub fn total_size(&self) -> usize {
        let mut size = self.base_size();

        if self.has_witness() {
            // Marker (1) + Flag (1)
            size += 2;

            // Witness data
            for witness in &self.witnesses {
                size += witness.size();
            }
        }

        size
    }

    /// Calculate transaction weight
    pub fn weight(&self) -> usize {
        Weight::calculate(self.base_size(), self.total_size())
    }

    /// Calculate virtual size (vsize)
    pub fn vsize(&self) -> usize {
        Weight::to_vsize(self.weight())
    }

    /// Validate transaction weight
    pub fn validate_weight(&self) -> Result<(), SegwitError> {
        Weight::validate(self.weight())
    }

    /// Serialize transaction (with witness data if present)
    pub fn serialize(&self) -> Vec<u8> {
        let mut data = Vec::new();

        // Version
        data.extend_from_slice(&self.transaction.version.to_le_bytes());

        if self.has_witness() {
            // Marker and flag
            data.push(0x00); // Marker
            data.push(0x01); // Flag
        }

        // Inputs
        write_compact_size(&mut data, self.transaction.inputs.len());
        for input in &self.transaction.inputs {
            data.extend_from_slice(&input.prev_output.txid);
            data.extend_from_slice(&input.prev_output.vout.to_le_bytes());
            write_compact_size(&mut data, input.script_sig.len());
            data.extend_from_slice(&input.script_sig);
            data.extend_from_slice(&input.sequence.to_le_bytes());
        }

        // Outputs
        write_compact_size(&mut data, self.transaction.outputs.len());
        for output in &self.transaction.outputs {
            data.extend_from_slice(&output.value.to_le_bytes());
            write_compact_size(&mut data, output.script_pubkey.len());
            data.extend_from_slice(&output.script_pubkey);
        }

        // Witness data
        if self.has_witness() {
            for witness in &self.witnesses {
                write_compact_size(&mut data, witness.stack.len());
                for item in &witness.stack {
                    write_compact_size(&mut data, item.len());
                    data.extend_from_slice(item);
                }
            }
        }

        // Locktime
        data.extend_from_slice(&self.transaction.lock_time.to_le_bytes());

        data
    }

    /// Get transaction ID (without witness data - for backward compatibility)
    pub fn txid(&self) -> [u8; 32] {
        self.transaction.txid()
    }

    /// Get witness transaction ID (with witness data)
    pub fn wtxid(&self) -> [u8; 32] {
        let serialized = self.serialize();
        let mut hasher = Sha256::new();
        hasher.update(&serialized);
        let hash1 = hasher.finalize();

        let mut hasher = Sha256::new();
        hasher.update(hash1);
        let hash2 = hasher.finalize();

        let mut result = [0u8; 32];
        result.copy_from_slice(&hash2);
        result
    }
}

/// Calculate compact size length
fn compact_size_len(n: usize) -> usize {
    if n < 0xfd {
        1
    } else if n <= 0xffff {
        3
    } else if n <= 0xffffffff {
        5
    } else {
        9
    }
}

/// Write compact size to buffer
fn write_compact_size(data: &mut Vec<u8>, n: usize) {
    if n < 0xfd {
        data.push(n as u8);
    } else if n <= 0xffff {
        data.push(0xfd);
        data.extend_from_slice(&(n as u16).to_le_bytes());
    } else if n <= 0xffffffff {
        data.push(0xfe);
        data.extend_from_slice(&(n as u32).to_le_bytes());
    } else {
        data.push(0xff);
        data.extend_from_slice(&(n as u64).to_le_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OutPoint, TxInput};

    #[test]
    fn test_witness_empty() {
        let witness = Witness::new();
        assert!(witness.is_empty());
        assert_eq!(witness.stack.len(), 0);
    }

    #[test]
    fn test_witness_push_pop() {
        let mut witness = Witness::new();
        witness.push(vec![1, 2, 3]);
        witness.push(vec![4, 5, 6]);
        assert_eq!(witness.stack.len(), 2);
        assert_eq!(witness.pop(), Some(vec![4, 5, 6]));
        assert_eq!(witness.pop(), Some(vec![1, 2, 3]));
        assert!(witness.is_empty());
    }

    #[test]
    fn test_witness_version() {
        assert_eq!(
            WitnessVersion::from_opcode(0x00).unwrap(),
            WitnessVersion::V0
        );
        assert_eq!(
            WitnessVersion::from_opcode(0x51).unwrap(),
            WitnessVersion::V1
        );
        assert!(WitnessVersion::from_opcode(0x52).is_err());
    }

    #[test]
    fn test_witness_program_v0() {
        // P2WPKH (20 bytes)
        let program = vec![0u8; 20];
        let wp = WitnessProgram::new(WitnessVersion::V0, program.clone()).unwrap();
        assert!(wp.is_p2wpkh());
        assert!(!wp.is_p2wsh());

        // P2WSH (32 bytes)
        let program = vec![0u8; 32];
        let wp = WitnessProgram::new(WitnessVersion::V0, program.clone()).unwrap();
        assert!(!wp.is_p2wpkh());
        assert!(wp.is_p2wsh());

        // Invalid length
        let program = vec![0u8; 25];
        assert!(WitnessProgram::new(WitnessVersion::V0, program).is_err());
    }

    #[test]
    fn test_witness_program_to_script() {
        let program = vec![0u8; 20];
        let wp = WitnessProgram::new(WitnessVersion::V0, program.clone()).unwrap();
        let script = wp.to_script();
        assert_eq!(script[0], 0x00); // OP_0
        assert_eq!(script[1], 0x14); // Push 20
        assert_eq!(&script[2..], &program[..]);
    }

    #[test]
    fn test_p2wpkh_script() {
        let pubkey_hash = [1u8; 20];
        let script = P2WPKH::script_pubkey(&pubkey_hash);
        assert_eq!(script.len(), 22); // 1 + 1 + 20
        assert_eq!(script[0], 0x00);
        assert_eq!(script[1], 0x14);
    }

    #[test]
    fn test_p2wsh_script() {
        let script_hash = [1u8; 32];
        let script = P2WSH::script_pubkey(&script_hash);
        assert_eq!(script.len(), 34); // 1 + 1 + 32
        assert_eq!(script[0], 0x00);
        assert_eq!(script[1], 0x20);
    }

    #[test]
    fn test_p2wsh_hash_script() {
        let script = vec![0x76, 0xa9, 0x14]; // OP_DUP OP_HASH160 OP_PUSH20
        let hash = P2WSH::hash_script(&script);
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_weight_calculation() {
        let base_size = 100;
        let total_size = 150;
        let weight = Weight::calculate(base_size, total_size);
        assert_eq!(weight, 100 * 3 + 150); // 450

        let vsize = Weight::to_vsize(weight);
        assert_eq!(vsize, 450_usize.div_ceil(4)); // 113
    }

    #[test]
    fn test_weight_validation() {
        assert!(Weight::validate(1000).is_ok());
        assert!(Weight::validate(Weight::MAX_TX_WEIGHT).is_ok());
        assert!(Weight::validate(Weight::MAX_TX_WEIGHT + 1).is_err());
    }

    #[test]
    fn test_segwit_transaction_no_witness() {
        let tx = Transaction {
            version: 2,
            inputs: vec![],
            outputs: vec![],
            lock_time: 0,
        };
        let segwit_tx = SegwitTransaction::new(tx);
        assert!(!segwit_tx.has_witness());
    }

    #[test]
    fn test_segwit_transaction_with_witness() {
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::new([0u8; 32], 0),
                script_sig: vec![],
                sequence: 0xffffffff,
                witness: Default::default(),
            }],
            outputs: vec![],
            lock_time: 0,
        };
        let mut segwit_tx = SegwitTransaction::new(tx);

        let witness = Witness::from_stack(vec![vec![1, 2, 3]]);
        segwit_tx.set_witness(0, witness).unwrap();

        assert!(segwit_tx.has_witness());
    }

    #[test]
    fn test_compact_size() {
        assert_eq!(compact_size_len(0), 1);
        assert_eq!(compact_size_len(252), 1);
        assert_eq!(compact_size_len(253), 3);
        assert_eq!(compact_size_len(0xffff), 3);
        assert_eq!(compact_size_len(0x10000), 5);
    }

    #[test]
    fn test_witness_from_stack() {
        let stack = vec![vec![0xAA; 72], vec![0xBB; 33]];
        let w = Witness::from_stack(stack.clone());
        assert_eq!(w.stack, stack);
        assert!(!w.is_empty());
    }

    #[test]
    fn test_witness_size_calculation() {
        let w = Witness::from_stack(vec![vec![1, 2, 3], vec![4, 5]]);
        // compact_size(2 items) = 1, item0: compact_size(3)+3 = 4, item1: compact_size(2)+2 = 3
        let expected = 1 + (1 + 3) + (1 + 2);
        assert_eq!(w.size(), expected);
    }

    #[test]
    fn test_witness_default() {
        let w = Witness::default();
        assert!(w.is_empty());
        assert_eq!(w.stack.len(), 0);
    }

    #[test]
    fn test_witness_version_to_opcode_roundtrip() {
        assert_eq!(WitnessVersion::V0.to_opcode(), 0x00);
        assert_eq!(WitnessVersion::V1.to_opcode(), 0x51);
        assert_eq!(WitnessVersion::from_opcode(WitnessVersion::V0.to_opcode()).unwrap(), WitnessVersion::V0);
        assert_eq!(WitnessVersion::from_opcode(WitnessVersion::V1.to_opcode()).unwrap(), WitnessVersion::V1);
    }

    #[test]
    fn test_witness_program_too_short() {
        let prog = vec![0u8; 1]; // < 2 bytes
        assert!(WitnessProgram::new(WitnessVersion::V1, prog).is_err());
    }

    #[test]
    fn test_witness_program_too_long() {
        let prog = vec![0u8; 41]; // > 40 bytes
        assert!(WitnessProgram::new(WitnessVersion::V1, prog).is_err());
    }

    #[test]
    fn test_witness_program_v1_flexible_length() {
        // V1 accepts 2-40 bytes (not restricted to 20/32 like V0)
        for len in [2, 10, 32, 40] {
            let prog = vec![0u8; len];
            assert!(WitnessProgram::new(WitnessVersion::V1, prog).is_ok(), "len {}", len);
        }
    }

    #[test]
    fn test_witness_program_script_roundtrip() {
        let prog = vec![0xAB; 20];
        let wp = WitnessProgram::new(WitnessVersion::V0, prog).unwrap();
        let script = wp.to_script();
        let parsed = WitnessProgram::from_script(&script).unwrap();
        assert_eq!(parsed.version, wp.version);
        assert_eq!(parsed.program, wp.program);
    }

    #[test]
    fn test_witness_program_from_script_invalid() {
        // Too short
        assert!(WitnessProgram::from_script(&[0x00]).is_err());
        // Length mismatch
        assert!(WitnessProgram::from_script(&[0x00, 0x14, 0x01]).is_err());
    }

    #[test]
    fn test_p2wpkh_verify_witness_valid() {
        use sha2::Digest;
        // Create a fake pubkey and compute its HASH160
        let pubkey = vec![0x02; 33]; // compressed pubkey placeholder
        let sha = sha2::Sha256::digest(&pubkey);
        let ripe = ripemd::Ripemd160::digest(sha);
        let mut hash20 = [0u8; 20];
        hash20.copy_from_slice(&ripe);

        let witness = P2WPKH::create_witness(vec![0xFF; 72], pubkey);
        let result = P2WPKH::verify_witness(&witness, &hash20).unwrap();
        assert!(result);
    }

    #[test]
    fn test_p2wpkh_verify_witness_wrong_hash() {
        let witness = P2WPKH::create_witness(vec![0xFF; 72], vec![0x02; 33]);
        let wrong_hash = [0u8; 20];
        let result = P2WPKH::verify_witness(&witness, &wrong_hash).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_p2wsh_verify_witness() {
        let script = vec![0x51, 0xAC]; // OP_1 OP_CHECKSIG
        let hash = P2WSH::hash_script(&script);
        let witness = P2WSH::create_witness(vec![], script);
        assert!(P2WSH::verify_witness(&witness, &hash).unwrap());
    }

    #[test]
    fn test_p2wsh_verify_witness_wrong_hash() {
        let script = vec![0x51, 0xAC];
        let witness = P2WSH::create_witness(vec![], script);
        let wrong = [0xFF; 32];
        assert!(!P2WSH::verify_witness(&witness, &wrong).unwrap());
    }

    #[test]
    fn test_weight_from_vsize() {
        let vsize = 250;
        let weight = Weight::from_vsize(vsize);
        assert_eq!(weight, 1000);
        assert_eq!(Weight::to_vsize(weight), vsize);
    }

    #[test]
    fn test_segwit_tx_set_witness_out_of_bounds() {
        let tx = Transaction {
            version: 2,
            inputs: vec![],
            outputs: vec![],
            lock_time: 0,
        };
        let mut stx = SegwitTransaction::new(tx);
        assert!(stx.set_witness(0, Witness::new()).is_err());
    }

    #[test]
    fn test_segwit_tx_serialization_no_witness() {
        let tx = Transaction {
            version: 1,
            inputs: vec![],
            outputs: vec![],
            lock_time: 0,
        };
        let stx = SegwitTransaction::new(tx);
        let data = stx.serialize();
        // version(4) + varint(0 inputs) + varint(0 outputs) + locktime(4)
        assert!(data.len() >= 10);
        assert_eq!(&data[0..4], &1_u32.to_le_bytes());
    }

    #[test]
    fn test_write_compact_size_boundaries() {
        let mut buf = Vec::new();
        write_compact_size(&mut buf, 0);
        assert_eq!(buf, vec![0]);

        buf.clear();
        write_compact_size(&mut buf, 252);
        assert_eq!(buf, vec![252]);

        buf.clear();
        write_compact_size(&mut buf, 253);
        assert_eq!(buf[0], 0xfd);
        assert_eq!(buf.len(), 3);

        buf.clear();
        write_compact_size(&mut buf, 0x10000);
        assert_eq!(buf[0], 0xfe);
        assert_eq!(buf.len(), 5);
    }
}
