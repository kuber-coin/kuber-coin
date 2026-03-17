// BIP-341: Taproot - SegWit version 1 spending rules
//
// Taproot is a Bitcoin upgrade that introduces:
// - More efficient and private smart contracts
// - Schnorr signature aggregation
// - MAST (Merkelized Alternative Script Trees)
//
// Key Components:
// - Key-path spending: Single signature (most common case)
// - Script-path spending: Reveal script from Merkle tree (complex cases)
// - Tapscript: Enhanced Bitcoin Script (BIP-342)
//
// BIP-341 Reference: https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki

use crate::schnorr::{SchnorrPublicKey, SchnorrSignature};
use secp256k1::{Scalar, Secp256k1, XOnlyPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Taproot output (P2TR) - SegWit version 1
///
/// Format: OP_1 <32-byte-output>
/// The 32-byte output is a tweaked public key: Q = P + H(P||c)*G
/// where P is the internal key and c is the script tree commitment
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaprootOutput {
    /// The output public key (tweaked)
    pub output_key: [u8; 32],
}

impl TaprootOutput {
    /// Create a Taproot output from an output key
    pub fn new(output_key: [u8; 32]) -> Self {
        Self { output_key }
    }

    /// Create a key-path only Taproot output (no script tree)
    ///
    /// For key-path only, the output key is: Q = P + H(P)*G
    /// where P is the internal key
    pub fn key_path_only(internal_key: &SchnorrPublicKey) -> Result<Self, TaprootError> {
        let output_key = tweak_public_key(&internal_key.x, None)?;
        Ok(Self { output_key })
    }

    /// Create a Taproot output with a script tree
    ///
    /// The output key is: Q = P + H(P||c)*G
    /// where P is the internal key and c is the Merkle root
    pub fn with_script_tree(
        internal_key: &SchnorrPublicKey,
        merkle_root: &[u8; 32],
    ) -> Result<Self, TaprootError> {
        let output_key = tweak_public_key(&internal_key.x, Some(merkle_root))?;
        Ok(Self { output_key })
    }

    /// Get the output script for this Taproot output
    ///
    /// Returns: OP_1 <32-byte-output-key>
    pub fn to_script(&self) -> Vec<u8> {
        let mut script = Vec::with_capacity(34);
        script.push(0x51); // OP_1 (SegWit version 1)
        script.push(0x20); // Push 32 bytes
        script.extend_from_slice(&self.output_key);
        script
    }

    /// Parse a Taproot output from a script
    ///
    /// Expected format: OP_1 <32-byte-output-key>
    pub fn from_script(script: &[u8]) -> Result<Self, TaprootError> {
        if script.len() != 34 {
            return Err(TaprootError::InvalidScriptLength(script.len()));
        }

        if script[0] != 0x51 {
            return Err(TaprootError::InvalidWitnessVersion(script[0]));
        }

        if script[1] != 0x20 {
            return Err(TaprootError::InvalidPushSize(script[1]));
        }

        let mut output_key = [0u8; 32];
        output_key.copy_from_slice(&script[2..34]);

        Ok(Self { output_key })
    }
}

/// Tweak a public key for Taproot
///
/// Computes: Q = P + H(P||c)*G using proper EC point arithmetic
/// - P: internal public key (32 bytes x-only)
/// - c: optional script tree commitment (32 bytes Merkle root)
/// - Q: output public key (32 bytes x-only)
///
/// For key-path only (no scripts): Q = P + H(P)*G
pub fn tweak_public_key(
    internal_key: &[u8; 32],
    script_commitment: Option<&[u8; 32]>,
) -> Result<[u8; 32], TaprootError> {
    let secp = Secp256k1::new();

    // Parse the x-only internal public key
    let xonly_internal =
        XOnlyPublicKey::from_slice(internal_key).map_err(|_| TaprootError::InvalidInternalKey)?;

    // Compute the tweak: t = H("TapTweak", P || c)
    let tweak = compute_taptweak(internal_key, script_commitment)?;

    // Convert tweak bytes to a Scalar
    let tweak_scalar = Scalar::from_be_bytes(tweak).map_err(|_| TaprootError::TweakOutOfRange)?;

    // Compute Q = P + t*G using secp256k1's add_tweak
    // First convert back to full public key (with even y assumed)
    let (_tweaked_pk, _parity) = xonly_internal
        .add_tweak(&secp, &tweak_scalar)
        .map_err(|_| TaprootError::TweakOutOfRange)?;

    // Get the x-only output key
    let output_key = _tweaked_pk.serialize();
    Ok(output_key)
}

/// Compute the TapTweak hash
///
/// TapTweak = tagged_hash("TapTweak", P || c)
/// - P: internal public key (32 bytes)
/// - c: optional script tree commitment (32 bytes)
pub fn compute_taptweak(
    internal_key: &[u8; 32],
    script_commitment: Option<&[u8; 32]>,
) -> Result<[u8; 32], TaprootError> {
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(internal_key);

    if let Some(commitment) = script_commitment {
        data.extend_from_slice(commitment);
    }

    Ok(tagged_hash(b"TapTweak", &data))
}

/// Tagged hash for Taproot (same as BIP-340)
///
/// tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
fn tagged_hash(tag: &[u8], msg: &[u8]) -> [u8; 32] {
    let tag_hash = Sha256::digest(tag);
    let mut hasher = Sha256::new();
    hasher.update(tag_hash);
    hasher.update(tag_hash);
    hasher.update(msg);
    let result = hasher.finalize();

    let mut output = [0u8; 32];
    output.copy_from_slice(&result);
    output
}

/// Key-path spending witness
///
/// For key-path spending, the witness contains only a Schnorr signature:
/// - `witness[0]`: 64-byte Schnorr signature
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaprootKeyPathWitness {
    /// The Schnorr signature
    pub signature: SchnorrSignature,
}

impl TaprootKeyPathWitness {
    /// Create a new key-path witness
    pub fn new(signature: SchnorrSignature) -> Self {
        Self { signature }
    }

    /// Serialize to witness stack
    pub fn to_witness_stack(&self) -> Vec<Vec<u8>> {
        vec![self.signature.to_bytes().to_vec()]
    }

    /// Parse from witness stack
    pub fn from_witness_stack(stack: &[Vec<u8>]) -> Result<Self, TaprootError> {
        if stack.len() != 1 {
            return Err(TaprootError::InvalidWitnessStackSize(stack.len()));
        }

        let signature =
            SchnorrSignature::from_bytes(&stack[0]).map_err(|_| TaprootError::InvalidSignature)?;

        Ok(Self { signature })
    }
}

/// Script-path spending witness
///
/// For script-path spending, the witness contains:
/// - `witness[0..n-2]`: Script inputs
/// - `witness[n-1]`: Script being executed (TapLeaf)
/// - `witness[n]`: Control block (proof of script inclusion)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaprootScriptPathWitness {
    /// Script inputs (everything except script and control block)
    pub script_inputs: Vec<Vec<u8>>,
    /// The script being executed (TapLeaf script)
    pub script: Vec<u8>,
    /// Control block (proof of script inclusion in Merkle tree)
    pub control_block: ControlBlock,
}

impl TaprootScriptPathWitness {
    /// Create a new script-path witness
    pub fn new(script_inputs: Vec<Vec<u8>>, script: Vec<u8>, control_block: ControlBlock) -> Self {
        Self {
            script_inputs,
            script,
            control_block,
        }
    }

    /// Serialize to witness stack
    pub fn to_witness_stack(&self) -> Vec<Vec<u8>> {
        let mut stack = self.script_inputs.clone();
        stack.push(self.script.clone());
        stack.push(self.control_block.to_bytes());
        stack
    }

    /// Parse from witness stack
    pub fn from_witness_stack(stack: &[Vec<u8>]) -> Result<Self, TaprootError> {
        if stack.len() < 2 {
            return Err(TaprootError::InvalidWitnessStackSize(stack.len()));
        }

        let control_block = ControlBlock::from_bytes(&stack[stack.len() - 1])?;
        let script = stack[stack.len() - 2].clone();
        let script_inputs = stack[0..stack.len() - 2].to_vec();

        Ok(Self {
            script_inputs,
            script,
            control_block,
        })
    }
}

/// Control block for Taproot script-path spending
///
/// Format:
/// - Byte 0: Version and parity
///   - Bit 0: Parity of internal key's y-coordinate (`c[0] & 1`)
///   - Bits 1-7: Leaf version (`c[0] & 0xfe`), e.g. 0xc0 for Tapscript
/// - Bytes 1-32: Internal public key (32 bytes)
/// - Bytes 33+: Merkle proof (0 or more 32-byte hashes)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ControlBlock {
    /// Leaf version (bits 1-7, must be even: 0x00-0xfe)
    pub leaf_version: u8,
    /// Parity of internal key's y-coordinate (bit 0)
    pub parity: bool,
    /// Internal public key (not tweaked)
    pub internal_key: [u8; 32],
    /// Merkle proof path (sequence of 32-byte hashes)
    pub merkle_proof: Vec<[u8; 32]>,
}

impl ControlBlock {
    /// Create a new control block
    pub fn new(
        leaf_version: u8,
        parity: bool,
        internal_key: [u8; 32],
        merkle_proof: Vec<[u8; 32]>,
    ) -> Result<Self, TaprootError> {
        // Validate leaf version (must be even and <= 0xfe)
        if leaf_version > 0xFE || leaf_version & 1 != 0 {
            return Err(TaprootError::InvalidLeafVersion(leaf_version));
        }

        Ok(Self {
            leaf_version,
            parity,
            internal_key,
            merkle_proof,
        })
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(33 + self.merkle_proof.len() * 32);

        // First byte: leaf_version (bits 1-7) | parity (bit 0)
        let first_byte = self.leaf_version | (self.parity as u8);
        bytes.push(first_byte);

        // Internal key
        bytes.extend_from_slice(&self.internal_key);

        // Merkle proof
        for hash in &self.merkle_proof {
            bytes.extend_from_slice(hash);
        }

        bytes
    }

    /// Parse from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, TaprootError> {
        if bytes.len() < 33 {
            return Err(TaprootError::InvalidControlBlockSize(bytes.len()));
        }

        // Check that proof size is a multiple of 32 bytes
        if !(bytes.len() - 33).is_multiple_of(32) {
            return Err(TaprootError::InvalidControlBlockSize(bytes.len()));
        }

        // Parse first byte
        let first_byte = bytes[0];
        let leaf_version = first_byte & 0xFE; // Bits 1-7
        let parity = (first_byte & 1) != 0; // Bit 0

        // Parse internal key
        let mut internal_key = [0u8; 32];
        internal_key.copy_from_slice(&bytes[1..33]);

        // Parse merkle proof
        let proof_count = (bytes.len() - 33) / 32;
        let mut merkle_proof = Vec::with_capacity(proof_count);
        for i in 0..proof_count {
            let start = 33 + i * 32;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&bytes[start..start + 32]);
            merkle_proof.push(hash);
        }

        Self::new(leaf_version, parity, internal_key, merkle_proof)
    }

    /// Get the size in bytes
    pub fn size(&self) -> usize {
        33 + self.merkle_proof.len() * 32
    }
}

/// TapLeaf - A leaf in the Taproot script tree
///
/// Each leaf contains a script and a version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TapLeaf {
    /// Leaf version (0xC0 for BIP-342 Tapscript)
    pub version: u8,
    /// The script
    pub script: Vec<u8>,
}

impl TapLeaf {
    /// Standard Tapscript version (BIP-342)
    pub const TAPSCRIPT_VERSION: u8 = 0xC0;

    /// Create a new TapLeaf
    pub fn new(version: u8, script: Vec<u8>) -> Self {
        Self { version, script }
    }

    /// Create a Tapscript leaf (standard version 0xC0)
    pub fn tapscript(script: Vec<u8>) -> Self {
        Self {
            version: Self::TAPSCRIPT_VERSION,
            script,
        }
    }

    /// Compute the TapLeaf hash
    ///
    /// TapLeaf = tagged_hash("TapLeaf", version || compact_size(script) || script)
    pub fn hash(&self) -> [u8; 32] {
        let mut data = Vec::with_capacity(1 + 9 + self.script.len());
        data.push(self.version);

        // Compact size encoding of script length
        encode_compact_size(&mut data, self.script.len());

        // Script
        data.extend_from_slice(&self.script);

        tagged_hash(b"TapLeaf", &data)
    }
}

/// Encode a compact size integer (Bitcoin's variable-length integer encoding)
fn encode_compact_size(output: &mut Vec<u8>, n: usize) {
    if n < 0xFD {
        output.push(n as u8);
    } else if n <= 0xFFFF {
        output.push(0xFD);
        output.extend_from_slice(&(n as u16).to_le_bytes());
    } else if n <= 0xFFFFFFFF {
        output.push(0xFE);
        output.extend_from_slice(&(n as u32).to_le_bytes());
    } else {
        output.push(0xFF);
        output.extend_from_slice(&(n as u64).to_le_bytes());
    }
}

/// TapBranch - A branch node in the Taproot Merkle tree
///
/// Branches are computed by hashing two child nodes together.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TapBranch {
    /// Left child hash
    pub left: [u8; 32],
    /// Right child hash
    pub right: [u8; 32],
}

impl TapBranch {
    /// Create a new TapBranch
    pub fn new(left: [u8; 32], right: [u8; 32]) -> Self {
        Self { left, right }
    }

    /// Compute the TapBranch hash
    ///
    /// TapBranch = tagged_hash("TapBranch", min(left, right) || max(left, right))
    ///
    /// Note: Children are sorted lexicographically to ensure canonical ordering
    pub fn hash(&self) -> [u8; 32] {
        let (min, max) = if self.left <= self.right {
            (&self.left, &self.right)
        } else {
            (&self.right, &self.left)
        };

        let mut data = [0u8; 64];
        data[0..32].copy_from_slice(min);
        data[32..64].copy_from_slice(max);

        tagged_hash(b"TapBranch", &data)
    }
}

/// Verify a Taproot key-path spend
///
/// # Arguments
/// * `output_key` - The output public key from the P2TR output
/// * `signature` - The Schnorr signature
/// * `msg` - The message hash (typically sighash)
///
/// # Returns
/// Ok(()) if the signature is valid, Err otherwise
pub fn verify_key_path_spend(
    output_key: &[u8; 32],
    signature: &SchnorrSignature,
    msg: &[u8; 32],
) -> Result<(), TaprootError> {
    // Convert output key to Schnorr public key
    let pubkey =
        SchnorrPublicKey::from_bytes(output_key).map_err(|_| TaprootError::InvalidPublicKey)?;

    // Verify the signature
    crate::schnorr::verify(signature, msg, &pubkey)
        .map_err(|_| TaprootError::SignatureVerificationFailed)?;

    Ok(())
}

/// Verify a Taproot script-path spend
///
/// # Arguments
/// * `output_key` - The output public key from the P2TR output
/// * `witness` - The script-path witness (script + control block)
/// * `msg` - The message hash for signature verification
///
/// # Returns
/// Ok(()) if the spend is valid, Err otherwise
pub fn verify_script_path_spend(
    output_key: &[u8; 32],
    witness: &TaprootScriptPathWitness,
    _msg: &[u8; 32],
) -> Result<(), TaprootError> {
    // 1. Compute the TapLeaf hash
    let leaf = TapLeaf::new(witness.control_block.leaf_version, witness.script.clone());
    let leaf_hash = leaf.hash();

    // 2. Compute the Merkle root from the proof
    let mut current_hash = leaf_hash;
    for proof_hash in &witness.control_block.merkle_proof {
        let branch = TapBranch::new(current_hash, *proof_hash);
        current_hash = branch.hash();
    }
    let merkle_root = current_hash;

    // 3. Compute the expected output key
    let expected_output_key =
        tweak_public_key(&witness.control_block.internal_key, Some(&merkle_root))?;

    // 4. Verify the output key matches
    if &expected_output_key != output_key {
        return Err(TaprootError::OutputKeyMismatch);
    }

    // 5. Execute the script (simplified - would need full Tapscript interpreter)
    // For now, we just verify the structure is correct

    Ok(())
}

/// Errors that can occur during Taproot operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaprootError {
    /// Invalid script length
    InvalidScriptLength(usize),
    /// Invalid witness version
    InvalidWitnessVersion(u8),
    /// Invalid push size
    InvalidPushSize(u8),
    /// Invalid witness stack size
    InvalidWitnessStackSize(usize),
    /// Invalid signature
    InvalidSignature,
    /// Invalid public key
    InvalidPublicKey,
    /// Invalid internal key (x-only key parsing failed)
    InvalidInternalKey,
    /// Tweak value out of range for secp256k1
    TweakOutOfRange,
    /// Signature verification failed
    SignatureVerificationFailed,
    /// Invalid control block size
    InvalidControlBlockSize(usize),
    /// Invalid leaf version
    InvalidLeafVersion(u8),
    /// Output key mismatch
    OutputKeyMismatch,
    /// Merkle proof verification failed
    MerkleProofVerificationFailed,
}

impl fmt::Display for TaprootError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TaprootError::InvalidScriptLength(len) => {
                write!(f, "Invalid Taproot script length: {} (expected 34)", len)
            }
            TaprootError::InvalidWitnessVersion(ver) => {
                write!(f, "Invalid witness version: 0x{:02x} (expected 0x51)", ver)
            }
            TaprootError::InvalidPushSize(size) => {
                write!(f, "Invalid push size: {} (expected 32)", size)
            }
            TaprootError::InvalidWitnessStackSize(size) => {
                write!(f, "Invalid witness stack size: {}", size)
            }
            TaprootError::InvalidSignature => write!(f, "Invalid Taproot signature"),
            TaprootError::InvalidPublicKey => write!(f, "Invalid Taproot public key"),
            TaprootError::InvalidInternalKey => {
                write!(f, "Invalid internal key (x-only key parsing failed)")
            }
            TaprootError::TweakOutOfRange => write!(f, "Tweak value out of range for secp256k1"),
            TaprootError::SignatureVerificationFailed => {
                write!(f, "Taproot signature verification failed")
            }
            TaprootError::InvalidControlBlockSize(size) => {
                write!(
                    f,
                    "Invalid control block size: {} (must be 33 + N*32)",
                    size
                )
            }
            TaprootError::InvalidLeafVersion(ver) => {
                write!(f, "Invalid leaf version: 0x{:02x}", ver)
            }
            TaprootError::OutputKeyMismatch => {
                write!(f, "Output key does not match expected value")
            }
            TaprootError::MerkleProofVerificationFailed => {
                write!(f, "Merkle proof verification failed")
            }
        }
    }
}

impl std::error::Error for TaprootError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tagged_hash() {
        let tag = b"TapTweak";
        let msg = b"test message";

        let hash1 = tagged_hash(tag, msg);
        let hash2 = tagged_hash(tag, msg);

        // Same input should produce same output
        assert_eq!(hash1, hash2);

        // Different tag should produce different output
        let hash3 = tagged_hash(b"TapLeaf", msg);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_taproot_output_script() {
        let output_key = [42u8; 32];
        let output = TaprootOutput::new(output_key);

        let script = output.to_script();
        assert_eq!(script.len(), 34);
        assert_eq!(script[0], 0x51); // OP_1
        assert_eq!(script[1], 0x20); // Push 32 bytes
        assert_eq!(&script[2..34], &output_key);

        // Parse it back
        let parsed = TaprootOutput::from_script(&script).unwrap();
        assert_eq!(parsed, output);
    }

    #[test]
    fn test_taproot_output_invalid_script() {
        // Too short
        let script = vec![0x51, 0x20];
        assert!(TaprootOutput::from_script(&script).is_err());

        // Wrong version
        let mut script = vec![0x50, 0x20];
        script.extend_from_slice(&[0u8; 32]);
        assert!(TaprootOutput::from_script(&script).is_err());
    }

    #[test]
    fn test_taproot_key_path_only() {
        let internal_key = SchnorrPublicKey { x: [1u8; 32] };
        let output = TaprootOutput::key_path_only(&internal_key).unwrap();

        // Output key should be different from internal key (tweaked)
        assert_ne!(&output.output_key, &internal_key.x);
    }

    #[test]
    fn test_taproot_with_script_tree() {
        let internal_key = SchnorrPublicKey { x: [1u8; 32] };
        let merkle_root = [2u8; 32];

        let output = TaprootOutput::with_script_tree(&internal_key, &merkle_root).unwrap();

        // Output key should be different from internal key
        assert_ne!(&output.output_key, &internal_key.x);
    }

    #[test]
    fn test_compute_taptweak() {
        let internal_key = [1u8; 32];

        // Without script commitment
        let tweak1 = compute_taptweak(&internal_key, None).unwrap();
        assert_eq!(tweak1.len(), 32);

        // With script commitment
        let merkle_root = [2u8; 32];
        let tweak2 = compute_taptweak(&internal_key, Some(&merkle_root)).unwrap();
        assert_eq!(tweak2.len(), 32);

        // Different commitments should produce different tweaks
        assert_ne!(tweak1, tweak2);
    }

    #[test]
    fn test_key_path_witness() {
        let sig = SchnorrSignature::new([1u8; 32], [2u8; 32]);
        let witness = TaprootKeyPathWitness::new(sig);

        let stack = witness.to_witness_stack();
        assert_eq!(stack.len(), 1);
        assert_eq!(stack[0].len(), 64);

        let parsed = TaprootKeyPathWitness::from_witness_stack(&stack).unwrap();
        assert_eq!(parsed, witness);
    }

    #[test]
    fn test_control_block() {
        let leaf_version = 0xC0;
        let parity = true;
        let internal_key = [1u8; 32];
        let merkle_proof = vec![[2u8; 32], [3u8; 32]];

        let cb =
            ControlBlock::new(leaf_version, parity, internal_key, merkle_proof.clone()).unwrap();

        assert_eq!(cb.leaf_version, leaf_version);
        assert_eq!(cb.parity, parity);
        assert_eq!(cb.internal_key, internal_key);
        assert_eq!(cb.merkle_proof, merkle_proof);

        // Serialize and parse
        let bytes = cb.to_bytes();
        assert_eq!(bytes.len(), 33 + 2 * 32);
        assert_eq!(bytes[0], 0xC1); // leaf_version (0xC0) | parity (1) = 0xC1

        let parsed = ControlBlock::from_bytes(&bytes).unwrap();
        assert_eq!(parsed, cb);
    }

    #[test]
    fn test_control_block_invalid_version() {
        let result = ControlBlock::new(0xFF, false, [1u8; 32], vec![]);
        assert!(result.is_err());
    }

    #[test]
    fn test_control_block_invalid_size() {
        // Too short
        let bytes = vec![0xC0; 32];
        assert!(ControlBlock::from_bytes(&bytes).is_err());

        // Not a multiple of 32 after first 33 bytes
        let bytes = vec![0xC0; 50];
        assert!(ControlBlock::from_bytes(&bytes).is_err());
    }

    #[test]
    fn test_tapleaf_hash() {
        let script = vec![0x51]; // OP_1
        let leaf = TapLeaf::tapscript(script.clone());

        assert_eq!(leaf.version, TapLeaf::TAPSCRIPT_VERSION);
        assert_eq!(leaf.script, script);

        let hash = leaf.hash();
        assert_eq!(hash.len(), 32);

        // Same leaf should produce same hash
        let leaf2 = TapLeaf::tapscript(script);
        assert_eq!(leaf.hash(), leaf2.hash());
    }

    #[test]
    fn test_tapbranch_hash() {
        let left = [1u8; 32];
        let right = [2u8; 32];

        let branch = TapBranch::new(left, right);
        let hash = branch.hash();
        assert_eq!(hash.len(), 32);

        // Swapping children should produce same hash (lexicographic ordering)
        let branch_swapped = TapBranch::new(right, left);
        assert_eq!(branch.hash(), branch_swapped.hash());
    }

    #[test]
    fn test_encode_compact_size() {
        let test_cases = vec![
            (0, vec![0x00]),
            (252, vec![0xFC]),
            (253, vec![0xFD, 0xFD, 0x00]),
            (65535, vec![0xFD, 0xFF, 0xFF]),
            (65536, vec![0xFE, 0x00, 0x00, 0x01, 0x00]),
        ];

        for (n, expected) in test_cases {
            let mut output = Vec::new();
            encode_compact_size(&mut output, n);
            assert_eq!(output, expected, "Failed for n={}", n);
        }
    }

    #[test]
    fn test_script_path_witness() {
        let script_inputs = vec![vec![1, 2, 3]];
        let script = vec![0x51]; // OP_1
        let control_block = ControlBlock::new(0xC0, false, [1u8; 32], vec![]).unwrap();

        let witness = TaprootScriptPathWitness::new(
            script_inputs.clone(),
            script.clone(),
            control_block.clone(),
        );

        let stack = witness.to_witness_stack();
        assert_eq!(stack.len(), 3); // inputs + script + control block

        let parsed = TaprootScriptPathWitness::from_witness_stack(&stack).unwrap();
        assert_eq!(parsed.script_inputs, script_inputs);
        assert_eq!(parsed.script, script);
        assert_eq!(parsed.control_block, control_block);
    }

    #[test]
    fn test_taproot_output_from_script_wrong_push() {
        // Correct length 34, correct OP_1 (0x51), but wrong push byte (0x21 != 0x20)
        let mut script = vec![0x51, 0x21];
        script.extend_from_slice(&[0u8; 32]);
        match TaprootOutput::from_script(&script) {
            Err(TaprootError::InvalidPushSize(0x21)) => {}
            other => panic!("expected InvalidPushSize, got {:?}", other),
        }
    }

    #[test]
    fn test_control_block_size() {
        let cb = ControlBlock::new(0xC0, false, [0u8; 32], vec![]).unwrap();
        assert_eq!(cb.size(), 33);
        let cb2 = ControlBlock::new(0xC0, true, [0u8; 32], vec![[1u8; 32]; 3]).unwrap();
        assert_eq!(cb2.size(), 33 + 3 * 32);
    }

    #[test]
    fn test_control_block_odd_leaf_version_rejected() {
        // Odd leaf versions (bit 0 set) are invalid
        for v in [0x01_u8, 0x03, 0xC1, 0xFF] {
            assert!(ControlBlock::new(v, false, [0u8; 32], vec![]).is_err(),
                "leaf_version 0x{:02x} should be rejected", v);
        }
    }

    #[test]
    fn test_control_block_even_leaf_versions_accepted() {
        for v in [0x00_u8, 0x02, 0xC0, 0xFE] {
            assert!(ControlBlock::new(v, false, [0u8; 32], vec![]).is_ok(),
                "leaf_version 0x{:02x} should be accepted", v);
        }
    }

    #[test]
    fn test_tap_leaf_different_scripts_differ() {
        let l1 = TapLeaf::tapscript(vec![0x51]); // OP_1
        let l2 = TapLeaf::tapscript(vec![0x52]); // OP_2
        assert_ne!(l1.hash(), l2.hash());
    }

    #[test]
    fn test_tap_leaf_different_versions_differ() {
        let l1 = TapLeaf::new(0xC0, vec![0x51]);
        let l2 = TapLeaf::new(0xC2, vec![0x51]);
        assert_ne!(l1.hash(), l2.hash());
    }

    #[test]
    fn test_tap_branch_same_children() {
        let h = [0xAA; 32];
        let branch = TapBranch::new(h, h);
        let hash = branch.hash();
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_key_path_witness_invalid_stack() {
        // Empty stack
        assert!(TaprootKeyPathWitness::from_witness_stack(&[]).is_err());
        // Two items (too many)
        let stack = vec![vec![0u8; 64], vec![0u8; 64]];
        assert!(TaprootKeyPathWitness::from_witness_stack(&stack).is_err());
    }

    #[test]
    fn test_script_path_witness_too_short() {
        // Need at least 2 items (script + control block)
        assert!(TaprootScriptPathWitness::from_witness_stack(&[]).is_err());
        assert!(TaprootScriptPathWitness::from_witness_stack(&[vec![1]]).is_err());
    }

    #[test]
    fn test_taproot_error_display() {
        let errors = vec![
            TaprootError::InvalidScriptLength(10),
            TaprootError::InvalidWitnessVersion(0x50),
            TaprootError::InvalidPushSize(0x21),
            TaprootError::InvalidWitnessStackSize(5),
            TaprootError::InvalidSignature,
            TaprootError::InvalidPublicKey,
            TaprootError::InvalidInternalKey,
            TaprootError::TweakOutOfRange,
            TaprootError::SignatureVerificationFailed,
            TaprootError::InvalidControlBlockSize(10),
            TaprootError::InvalidLeafVersion(0xFF),
            TaprootError::OutputKeyMismatch,
            TaprootError::MerkleProofVerificationFailed,
        ];
        for e in &errors {
            let s = format!("{}", e);
            assert!(!s.is_empty(), "Display for {:?} should not be empty", e);
        }
    }

    #[test]
    fn test_tweak_key_path_vs_script_path_differ() {
        let internal_key = SchnorrPublicKey { x: [1u8; 32] };
        let key_only = TaprootOutput::key_path_only(&internal_key).unwrap();
        let merkle_root = [3u8; 32];
        let with_script = TaprootOutput::with_script_tree(&internal_key, &merkle_root).unwrap();
        assert_ne!(key_only.output_key, with_script.output_key);
    }
}
