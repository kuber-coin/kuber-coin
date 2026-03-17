/// PSBT (Partially Signed Bitcoin Transactions) - BIP-174
///
/// PSBT is a format for Bitcoin transactions that are not fully signed yet.
/// It allows multiple parties to collaborate on creating, signing, and finalizing
/// a transaction, which is essential for:
/// - Hardware wallets
/// - Multisig coordination
/// - Offline signing
/// - Air-gapped security
///
/// # Roles
///
/// 1. **Creator**: Creates the initial PSBT structure
/// 2. **Updater**: Adds information (UTXOs, redeem scripts, witness data)
/// 3. **Signer**: Signs inputs with available keys
/// 4. **Combiner**: Combines multiple PSBTs into one
/// 5. **Finalizer**: Converts PSBT to final transaction
///
/// # Example
///
/// ```rust
/// use tx::psbt::Psbt;
/// use tx::{Transaction, TxInput, TxOutput, OutPoint};
///
/// // Create an unsigned transaction
/// let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
/// let output = TxOutput::new(50_000_000, vec![0x76, 0xa9]);
/// let unsigned_tx = Transaction::new(vec![input], vec![output], 0);
///
/// // Creator creates PSBT
/// let mut psbt = Psbt::new(unsigned_tx).unwrap();
/// assert_eq!(psbt.inputs.len(), 1);
///
/// // Updater adds UTXO information
/// let prev_output = TxOutput::new(100_000_000, vec![]);
/// psbt.add_witness_utxo(0, prev_output).unwrap();
/// ```
use crate::{PrivateKey, Script, Transaction, TxOutput};

#[cfg(test)]
use crate::TxInput;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

/// Errors produced by PSBT operations.
#[derive(Debug, Error)]
pub enum PsbtError {
    /// Input or output index is out of range.
    #[error("{0} index out of bounds")]
    IndexOutOfBounds(&'static str),

    /// A field has an invalid length or format.
    #[error("{0}")]
    InvalidFormat(String),

    /// A required field is missing.
    #[error("{0}")]
    MissingData(&'static str),

    /// Binary parsing / deserialization failure.
    #[error("{0}")]
    Parse(&'static str),

    /// Finalization error (missing or wrong number of signatures).
    #[error("{0}")]
    Finalize(String),

    /// Size limit exceeded.
    #[error("{0}")]
    SizeExceeded(&'static str),

    /// Cannot combine incompatible PSBTs.
    #[error("Cannot combine PSBTs for different transactions")]
    CombineMismatch,

    /// Constraint on the unsigned transaction.
    #[error("{0}")]
    Validation(&'static str),

    /// Underlying transaction operation error.
    #[error(transparent)]
    Transaction(#[from] crate::TxError),
}

/// PSBT magic bytes (0x70736274 = "psbt" in ASCII)
pub const PSBT_MAGIC: [u8; 4] = [0x70, 0x73, 0x62, 0x74];

/// PSBT separator byte
pub const PSBT_SEPARATOR: u8 = 0xff;

/// Taproot BIP-32 derivation: pubkey_x_only -> (leaf_hashes, (fingerprint, path))
type TapBip32Derivation = BTreeMap<Vec<u8>, (Vec<Vec<u8>>, (u32, Vec<u32>))>;

/// PSBT global key types
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum GlobalType {
    UnsignedTx = 0x00,
    XpubKey = 0x01,
    Version = 0xfb,
    Proprietary = 0xfc,
}

/// PSBT input key types
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum InputType {
    NonWitnessUtxo = 0x00,
    WitnessUtxo = 0x01,
    PartialSig = 0x02,
    SighashType = 0x03,
    RedeemScript = 0x04,
    WitnessScript = 0x05,
    Bip32Derivation = 0x06,
    FinalScriptSig = 0x07,
    FinalScriptWitness = 0x08,
    // BIP-371 Taproot fields
    TapKeySig = 0x13,
    TapScriptSig = 0x14,
    TapLeafScript = 0x15,
    TapBip32Derivation = 0x16,
    TapInternalKey = 0x17,
    TapMerkleRoot = 0x18,
    Proprietary = 0xfc,
}

/// PSBT output key types
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum OutputType {
    RedeemScript = 0x00,
    WitnessScript = 0x01,
    Bip32Derivation = 0x02,
    // BIP-371 Taproot fields
    TapInternalKey = 0x05,
    TapTree = 0x06,
    TapBip32Derivation = 0x07,
    Proprietary = 0xfc,
}

/// A Partially Signed Bitcoin Transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Psbt {
    /// The unsigned transaction
    pub unsigned_tx: Transaction,

    /// Version of the PSBT format
    pub version: u32,

    /// Per-input information
    pub inputs: Vec<PsbtInput>,

    /// Per-output information
    pub outputs: Vec<PsbtOutput>,

    /// Extended public keys (for derivation)
    pub xpubs: BTreeMap<Vec<u8>, Vec<u8>>,

    /// Proprietary fields
    pub proprietary: BTreeMap<Vec<u8>, Vec<u8>>,
}

/// Per-input PSBT data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PsbtInput {
    /// Non-witness UTXO (full transaction)
    pub non_witness_utxo: Option<Transaction>,

    /// Witness UTXO (for SegWit inputs)
    pub witness_utxo: Option<TxOutput>,

    /// Partial signatures: pubkey -> signature
    pub partial_sigs: BTreeMap<Vec<u8>, Vec<u8>>,

    /// Sighash type to use
    pub sighash_type: Option<u32>,

    /// Redeem script (for P2SH)
    pub redeem_script: Option<Script>,

    /// Witness script (for P2WSH)
    pub witness_script: Option<Script>,

    /// BIP-32 derivation paths: pubkey -> (fingerprint, path)
    pub bip32_derivation: BTreeMap<Vec<u8>, (u32, Vec<u32>)>,

    /// Final scriptSig (after signing)
    pub final_script_sig: Option<Script>,

    /// Final witness (after signing)
    pub final_script_witness: Option<Vec<Vec<u8>>>,

    // BIP-371 Taproot fields
    /// Taproot key path signature (64 bytes Schnorr signature)
    pub tap_key_sig: Option<Vec<u8>>,

    /// Taproot script path signatures: (control block, script) -> signature
    pub tap_script_sig: BTreeMap<(Vec<u8>, Vec<u8>), Vec<u8>>,

    /// Taproot leaf scripts: control block -> (script, leaf_version)
    pub tap_leaf_script: BTreeMap<Vec<u8>, (Vec<u8>, u8)>,

    /// Taproot BIP-32 derivations: pubkey_x_only -> (leaf_hashes, (fingerprint, path))
    pub tap_bip32_derivation: TapBip32Derivation,

    /// Taproot internal key (32 bytes x-only pubkey)
    pub tap_internal_key: Option<Vec<u8>>,

    /// Taproot merkle root (32 bytes)
    pub tap_merkle_root: Option<Vec<u8>>,

    /// Proprietary fields
    pub proprietary: BTreeMap<Vec<u8>, Vec<u8>>,
}

/// Per-output PSBT data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PsbtOutput {
    /// Redeem script (if output is P2SH)
    pub redeem_script: Option<Script>,

    /// Witness script (if output is P2WSH)
    pub witness_script: Option<Script>,

    /// BIP-32 derivation paths: pubkey -> (fingerprint, path)
    pub bip32_derivation: BTreeMap<Vec<u8>, (u32, Vec<u32>)>,

    // BIP-371 Taproot fields
    /// Taproot internal key (32 bytes x-only pubkey)
    pub tap_internal_key: Option<Vec<u8>>,

    /// Taproot script tree: control block -> (script, leaf_version)
    pub tap_tree: BTreeMap<Vec<u8>, (Vec<u8>, u8)>,

    /// Taproot BIP-32 derivations: pubkey_x_only -> (leaf_hashes, (fingerprint, path))
    pub tap_bip32_derivation: TapBip32Derivation,

    /// Proprietary fields
    pub proprietary: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl Psbt {
    /// Create a new PSBT from an unsigned transaction (Creator role)
    ///
    /// # Arguments
    ///
    /// * `unsigned_tx` - The unsigned transaction
    ///
    /// # Returns
    ///
    /// A new PSBT with empty input/output metadata
    pub fn new(unsigned_tx: Transaction) -> Result<Self, PsbtError> {
        if unsigned_tx.inputs.is_empty() {
            return Err(PsbtError::Validation("Transaction must have at least one input"));
        }

        let input_count = unsigned_tx.inputs.len();
        let output_count = unsigned_tx.outputs.len();

        Ok(Self {
            unsigned_tx,
            version: 0,
            inputs: vec![PsbtInput::default(); input_count],
            outputs: vec![PsbtOutput::default(); output_count],
            xpubs: BTreeMap::new(),
            proprietary: BTreeMap::new(),
        })
    }

    /// Add UTXO information to an input (Updater role)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `utxo` - The UTXO being spent
    pub fn add_witness_utxo(&mut self, index: usize, utxo: TxOutput) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }

        self.inputs[index].witness_utxo = Some(utxo);
        Ok(())
    }

    /// Add a redeem script to an input (Updater role)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `script` - The redeem script (for P2SH)
    pub fn add_redeem_script(&mut self, index: usize, script: Script) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }

        self.inputs[index].redeem_script = Some(script);
        Ok(())
    }

    /// Add BIP-32 derivation path to an input (Updater role)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `pubkey` - Public key
    /// * `fingerprint` - Master key fingerprint
    /// * `path` - Derivation path
    pub fn add_bip32_derivation(
        &mut self,
        index: usize,
        pubkey: Vec<u8>,
        fingerprint: u32,
        path: Vec<u32>,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }

        self.inputs[index]
            .bip32_derivation
            .insert(pubkey, (fingerprint, path));
        Ok(())
    }

    /// Sign an input with a private key (Signer role)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index to sign
    /// * `private_key` - Private key for signing
    ///
    /// # Returns
    ///
    /// Ok if signing succeeded
    pub fn sign_input(&mut self, index: usize, private_key: &PrivateKey) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }

        // Get the public key
        let pubkey = private_key.public_key();
        let pubkey_bytes = pubkey.to_bytes();

        // Calculate signature hash (simplified)
        let sighash = self.unsigned_tx.signature_hash(index)?;

        // Sign the hash
        let signature = private_key.sign(&sighash);
        let mut sig_bytes = signature.serialize_der().to_vec();

        // Append SIGHASH_ALL (0x01)
        sig_bytes.push(0x01);

        // Add to partial signatures
        self.inputs[index]
            .partial_sigs
            .insert(pubkey_bytes, sig_bytes);

        Ok(())
    }

    /// Combine multiple PSBTs (Combiner role)
    ///
    /// # Arguments
    ///
    /// * `other` - Another PSBT to combine with this one
    ///
    /// # Returns
    ///
    /// Ok if combination succeeded
    pub fn combine(&mut self, other: &Psbt) -> Result<(), PsbtError> {
        // Verify same transaction
        if self.unsigned_tx.txid() != other.unsigned_tx.txid() {
            return Err(PsbtError::CombineMismatch);
        }

        // Combine inputs
        for (i, input) in other.inputs.iter().enumerate() {
            if i >= self.inputs.len() {
                continue;
            }

            // Merge non-witness UTXO
            if self.inputs[i].non_witness_utxo.is_none() && input.non_witness_utxo.is_some() {
                self.inputs[i].non_witness_utxo = input.non_witness_utxo.clone();
            }

            // Merge witness UTXO
            if self.inputs[i].witness_utxo.is_none() && input.witness_utxo.is_some() {
                self.inputs[i].witness_utxo = input.witness_utxo.clone();
            }

            // Merge partial signatures
            for (pubkey, sig) in &input.partial_sigs {
                self.inputs[i]
                    .partial_sigs
                    .entry(pubkey.clone())
                    .or_insert_with(|| sig.clone());
            }

            // Merge redeem script
            if self.inputs[i].redeem_script.is_none() && input.redeem_script.is_some() {
                self.inputs[i].redeem_script = input.redeem_script.clone();
            }

            // Merge witness script
            if self.inputs[i].witness_script.is_none() && input.witness_script.is_some() {
                self.inputs[i].witness_script = input.witness_script.clone();
            }

            // Merge BIP-32 derivation
            for (pubkey, path) in &input.bip32_derivation {
                self.inputs[i]
                    .bip32_derivation
                    .entry(pubkey.clone())
                    .or_insert_with(|| path.clone());
            }
        }

        // Combine outputs
        for (i, output) in other.outputs.iter().enumerate() {
            if i >= self.outputs.len() {
                continue;
            }

            if self.outputs[i].redeem_script.is_none() && output.redeem_script.is_some() {
                self.outputs[i].redeem_script = output.redeem_script.clone();
            }

            if self.outputs[i].witness_script.is_none() && output.witness_script.is_some() {
                self.outputs[i].witness_script = output.witness_script.clone();
            }
        }

        Ok(())
    }

    /// Check if PSBT is complete (all inputs signed)
    pub fn is_complete(&self) -> bool {
        for input in self.inputs.iter() {
            // Check if input has final scriptSig or sufficient signatures
            if input.final_script_sig.is_none() && input.partial_sigs.is_empty() {
                return false;
            }

            // For multisig, check if we have enough signatures
            // (This is simplified - real implementation needs to parse redeem script)
            if let Some(ref _redeem_script) = input.redeem_script {
                // P2SH multisig check would go here
                if input.partial_sigs.is_empty() {
                    return false;
                }
            }
        }

        true
    }

    /// Finalize the PSBT and extract the signed transaction (Finalizer role)
    ///
    /// # Returns
    ///
    /// The fully signed transaction ready for broadcast
    pub fn finalize(&mut self) -> Result<Transaction, PsbtError> {
        if !self.is_complete() {
            return Err(PsbtError::MissingData("PSBT is not complete - missing signatures"));
        }

        let mut tx = self.unsigned_tx.clone();

        // Build script_sigs for all inputs first (to avoid borrow checker issues)
        let mut script_sigs = Vec::new();
        for (i, input) in self.inputs.iter().enumerate() {
            if let Some(ref final_script_sig) = input.final_script_sig {
                // Already finalized
                script_sigs.push(final_script_sig.clone());
            } else if !input.partial_sigs.is_empty() {
                // Build scriptSig from partial sigs
                if let Some(ref redeem_script) = input.redeem_script {
                    // P2SH: build scriptSig with signatures and redeem script
                    let script_sig = self.build_p2sh_script_sig(i, redeem_script)?;
                    script_sigs.push(script_sig);
                } else {
                    // P2PKH: single signature
                    if input.partial_sigs.len() != 1 {
                        return Err(PsbtError::Finalize(format!(
                            "Input {} requires exactly one signature for P2PKH",
                            i
                        )));
                    }

                    // SAFETY: partial_sigs verified len==1 by the check above.
                    let (pubkey, sig) = input
                        .partial_sigs
                        .iter()
                        .next()
                        .expect("partial_sigs checked len==1 above");
                    let script_sig = self.build_p2pkh_script_sig(sig, pubkey);
                    script_sigs.push(script_sig);
                }
            } else {
                return Err(PsbtError::Finalize(format!("Input {} has no signatures", i)));
            }
        }

        // Now apply the script_sigs
        for (i, script_sig) in script_sigs.into_iter().enumerate() {
            tx.inputs[i].script_sig = script_sig.bytes.clone();
            self.inputs[i].final_script_sig = Some(script_sig);
        }

        Ok(tx)
    }

    /// Build P2PKH scriptSig from signature and public key
    fn build_p2pkh_script_sig(&self, sig: &[u8], pubkey: &[u8]) -> Script {
        let mut bytes = Vec::new();

        // Push signature (use OP_PUSHDATA1 for lengths 76-255)
        if sig.len() > 75 {
            bytes.push(0x4c); // OP_PUSHDATA1
        }
        bytes.push(sig.len().min(255) as u8);
        bytes.extend_from_slice(sig);

        // Push public key (use OP_PUSHDATA1 for lengths 76-255)
        if pubkey.len() > 75 {
            bytes.push(0x4c); // OP_PUSHDATA1
        }
        bytes.push(pubkey.len().min(255) as u8);
        bytes.extend_from_slice(pubkey);

        Script::new(bytes)
    }

    /// Build P2SH scriptSig from signatures and redeem script
    fn build_p2sh_script_sig(
        &self,
        input_index: usize,
        redeem_script: &Script,
    ) -> Result<Script, PsbtError> {
        let input = &self.inputs[input_index];

        let mut bytes = Vec::new();

        // For multisig, add OP_0 (bug compatibility)
        if crate::multisig::is_multisig_script(redeem_script) {
            bytes.push(0x00); // OP_0
        }

        // Add signatures
        for sig in input.partial_sigs.values() {
            if sig.len() > 255 {
                return Err(PsbtError::SizeExceeded("Signature too large"));
            }
            bytes.push(sig.len() as u8);
            bytes.extend_from_slice(sig);
        }

        // Add redeem script
        let script_bytes = &redeem_script.bytes;
        if script_bytes.len() > 255 {
            return Err(PsbtError::SizeExceeded("Redeem script too large"));
        }
        bytes.push(script_bytes.len() as u8);
        bytes.extend_from_slice(script_bytes);

        Ok(Script::new(bytes))
    }

    // === BIP-371 Taproot Methods ===

    /// Add Taproot key path signature (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `signature` - 64-byte Schnorr signature
    pub fn add_tap_key_sig(&mut self, index: usize, signature: Vec<u8>) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }
        if signature.len() != 64 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid Schnorr signature length: {} (expected 64)",
                signature.len()
            )));
        }

        self.inputs[index].tap_key_sig = Some(signature);
        Ok(())
    }

    /// Add Taproot script path signature (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `control_block` - Control block for script validation
    /// * `script` - The tapscript being executed
    /// * `signature` - 64 or 65-byte Schnorr signature
    pub fn add_tap_script_sig(
        &mut self,
        index: usize,
        control_block: Vec<u8>,
        script: Vec<u8>,
        signature: Vec<u8>,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }
        if signature.len() != 64 && signature.len() != 65 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid Schnorr signature length: {} (expected 64 or 65)",
                signature.len()
            )));
        }

        self.inputs[index]
            .tap_script_sig
            .insert((control_block, script), signature);
        Ok(())
    }

    /// Add Taproot leaf script (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `control_block` - Control block
    /// * `script` - The tapscript
    /// * `leaf_version` - Leaf version (0xc0 for BIP-342)
    pub fn add_tap_leaf_script(
        &mut self,
        index: usize,
        control_block: Vec<u8>,
        script: Vec<u8>,
        leaf_version: u8,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }

        self.inputs[index]
            .tap_leaf_script
            .insert(control_block, (script, leaf_version));
        Ok(())
    }

    /// Add Taproot BIP-32 derivation (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `pubkey_x_only` - 32-byte x-only public key
    /// * `leaf_hashes` - List of leaf hashes this key is used in
    /// * `fingerprint` - Master key fingerprint
    /// * `path` - Derivation path
    pub fn add_tap_bip32_derivation(
        &mut self,
        index: usize,
        pubkey_x_only: Vec<u8>,
        leaf_hashes: Vec<Vec<u8>>,
        fingerprint: u32,
        path: Vec<u32>,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }
        if pubkey_x_only.len() != 32 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid x-only pubkey length: {} (expected 32)",
                pubkey_x_only.len()
            )));
        }

        self.inputs[index]
            .tap_bip32_derivation
            .insert(pubkey_x_only, (leaf_hashes, (fingerprint, path)));
        Ok(())
    }

    /// Add Taproot internal key (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `internal_key` - 32-byte x-only internal public key
    pub fn add_tap_internal_key(
        &mut self,
        index: usize,
        internal_key: Vec<u8>,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }
        if internal_key.len() != 32 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid internal key length: {} (expected 32)",
                internal_key.len()
            )));
        }

        self.inputs[index].tap_internal_key = Some(internal_key);
        Ok(())
    }

    /// Add Taproot merkle root (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Input index
    /// * `merkle_root` - 32-byte merkle root
    pub fn add_tap_merkle_root(
        &mut self,
        index: usize,
        merkle_root: Vec<u8>,
    ) -> Result<(), PsbtError> {
        if index >= self.inputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Input"));
        }
        if merkle_root.len() != 32 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid merkle root length: {} (expected 32)",
                merkle_root.len()
            )));
        }

        self.inputs[index].tap_merkle_root = Some(merkle_root);
        Ok(())
    }

    /// Add Taproot internal key to output (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Output index
    /// * `internal_key` - 32-byte x-only internal public key
    pub fn add_output_tap_internal_key(
        &mut self,
        index: usize,
        internal_key: Vec<u8>,
    ) -> Result<(), PsbtError> {
        if index >= self.outputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Output"));
        }
        if internal_key.len() != 32 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid internal key length: {} (expected 32)",
                internal_key.len()
            )));
        }

        self.outputs[index].tap_internal_key = Some(internal_key);
        Ok(())
    }

    /// Add Taproot script tree to output (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Output index
    /// * `control_block` - Control block
    /// * `script` - The tapscript
    /// * `leaf_version` - Leaf version
    pub fn add_output_tap_tree(
        &mut self,
        index: usize,
        control_block: Vec<u8>,
        script: Vec<u8>,
        leaf_version: u8,
    ) -> Result<(), PsbtError> {
        if index >= self.outputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Output"));
        }

        self.outputs[index]
            .tap_tree
            .insert(control_block, (script, leaf_version));
        Ok(())
    }

    /// Add Taproot BIP-32 derivation to output (BIP-371)
    ///
    /// # Arguments
    ///
    /// * `index` - Output index
    /// * `pubkey_x_only` - 32-byte x-only public key
    /// * `leaf_hashes` - List of leaf hashes
    /// * `fingerprint` - Master key fingerprint
    /// * `path` - Derivation path
    pub fn add_output_tap_bip32_derivation(
        &mut self,
        index: usize,
        pubkey_x_only: Vec<u8>,
        leaf_hashes: Vec<Vec<u8>>,
        fingerprint: u32,
        path: Vec<u32>,
    ) -> Result<(), PsbtError> {
        if index >= self.outputs.len() {
            return Err(PsbtError::IndexOutOfBounds("Output"));
        }
        if pubkey_x_only.len() != 32 {
            return Err(PsbtError::InvalidFormat(format!(
                "Invalid x-only pubkey length: {} (expected 32)",
                pubkey_x_only.len()
            )));
        }

        self.outputs[index]
            .tap_bip32_derivation
            .insert(pubkey_x_only, (leaf_hashes, (fingerprint, path)));
        Ok(())
    }

    /// Serialize PSBT to bytes (BIP-174 format)
    pub fn serialize(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // Magic bytes + separator
        bytes.extend_from_slice(&PSBT_MAGIC);
        bytes.push(PSBT_SEPARATOR);

        // Global: Unsigned transaction (key type 0x00)
        let tx_bytes = self.serialize_transaction(&self.unsigned_tx);
        Self::write_key_value(&mut bytes, &[GlobalType::UnsignedTx as u8], &tx_bytes);

        // Global: Version (if non-zero)
        if self.version > 0 {
            Self::write_key_value(
                &mut bytes,
                &[GlobalType::Version as u8],
                &self.version.to_le_bytes(),
            );
        }

        // Global: Extended public keys
        for (xpub, derivation) in &self.xpubs {
            let mut key = vec![GlobalType::XpubKey as u8];
            key.extend_from_slice(xpub);
            Self::write_key_value(&mut bytes, &key, derivation);
        }

        // Global: Proprietary
        for (key, value) in &self.proprietary {
            let mut full_key = vec![GlobalType::Proprietary as u8];
            full_key.extend_from_slice(key);
            Self::write_key_value(&mut bytes, &full_key, value);
        }

        // Global separator
        bytes.push(0x00);

        // Inputs
        for input in &self.inputs {
            self.serialize_input(&mut bytes, input);
            bytes.push(0x00); // Input separator
        }

        // Outputs
        for output in &self.outputs {
            self.serialize_output(&mut bytes, output);
            bytes.push(0x00); // Output separator
        }

        bytes
    }

    /// Deserialize PSBT from bytes (BIP-174 format)
    pub fn deserialize(bytes: &[u8]) -> Result<Self, PsbtError> {
        if bytes.len() < 5 {
            return Err(PsbtError::Parse("PSBT too short"));
        }

        // Check magic
        if bytes[0..4] != PSBT_MAGIC {
            return Err(PsbtError::Parse("Invalid PSBT magic"));
        }
        if bytes[4] != PSBT_SEPARATOR {
            return Err(PsbtError::Parse("Invalid PSBT separator"));
        }

        let mut cursor = 5;

        // Parse globals
        let mut unsigned_tx: Option<Transaction> = None;
        let mut version = 0u32;
        let mut xpubs = BTreeMap::new();
        let mut proprietary = BTreeMap::new();

        loop {
            if cursor >= bytes.len() {
                return Err(PsbtError::Parse("Unexpected end of PSBT globals"));
            }

            // Check for separator
            let (key_len, key_size) = Self::read_compact_size(&bytes[cursor..])?;
            if key_len == 0 {
                cursor += 1;
                break;
            }
            cursor += key_size;

            if cursor + key_len > bytes.len() {
                return Err(PsbtError::Parse("Key extends past end of data"));
            }

            let key = &bytes[cursor..cursor + key_len];
            cursor += key_len;

            let (value_len, value_size) = Self::read_compact_size(&bytes[cursor..])?;
            cursor += value_size;

            if cursor + value_len > bytes.len() {
                return Err(PsbtError::Parse("Value extends past end of data"));
            }

            let value = &bytes[cursor..cursor + value_len];
            cursor += value_len;

            match key[0] {
                0x00 => {
                    // Unsigned tx
                    unsigned_tx = Some(Self::deserialize_transaction(value)?);
                }
                0x01 => {
                    // xpub
                    xpubs.insert(key[1..].to_vec(), value.to_vec());
                }
                0xfb => {
                    // Version
                    if value.len() >= 4 {
                        version = u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                    }
                }
                0xfc => {
                    // Proprietary
                    proprietary.insert(key[1..].to_vec(), value.to_vec());
                }
                _ => {} // Unknown, skip
            }
        }

        let unsigned_tx = unsigned_tx.ok_or(PsbtError::MissingData("Missing unsigned transaction"))?;
        let input_count = unsigned_tx.inputs.len();
        let output_count = unsigned_tx.outputs.len();

        // Parse inputs
        let mut inputs = Vec::with_capacity(input_count);
        for _ in 0..input_count {
            let (input, new_cursor) = Self::deserialize_input(&bytes[cursor..])?;
            inputs.push(input);
            cursor += new_cursor;
        }

        // Parse outputs
        let mut outputs = Vec::with_capacity(output_count);
        for _ in 0..output_count {
            let (output, new_cursor) = Self::deserialize_output(&bytes[cursor..])?;
            outputs.push(output);
            cursor += new_cursor;
        }

        Ok(Self {
            unsigned_tx,
            version,
            inputs,
            outputs,
            xpubs,
            proprietary,
        })
    }

    // Helper: Write a key-value pair
    fn write_key_value(bytes: &mut Vec<u8>, key: &[u8], value: &[u8]) {
        Self::write_compact_size(bytes, key.len());
        bytes.extend_from_slice(key);
        Self::write_compact_size(bytes, value.len());
        bytes.extend_from_slice(value);
    }

    // Helper: Write compact size
    fn write_compact_size(bytes: &mut Vec<u8>, n: usize) {
        if n < 0xfd {
            bytes.push(n as u8);
        } else if n <= 0xffff {
            bytes.push(0xfd);
            bytes.extend_from_slice(&(n as u16).to_le_bytes());
        } else if n <= 0xffffffff {
            bytes.push(0xfe);
            bytes.extend_from_slice(&(n as u32).to_le_bytes());
        } else {
            bytes.push(0xff);
            bytes.extend_from_slice(&(n as u64).to_le_bytes());
        }
    }

    // Helper: Read compact size
    fn read_compact_size(bytes: &[u8]) -> Result<(usize, usize), PsbtError> {
        if bytes.is_empty() {
            return Err(PsbtError::Parse("Empty data for compact size"));
        }
        match bytes[0] {
            0..=0xfc => Ok((bytes[0] as usize, 1)),
            0xfd => {
                if bytes.len() < 3 {
                    return Err(PsbtError::Parse("Not enough bytes for compact size"));
                }
                Ok((u16::from_le_bytes([bytes[1], bytes[2]]) as usize, 3))
            }
            0xfe => {
                if bytes.len() < 5 {
                    return Err(PsbtError::Parse("Not enough bytes for compact size"));
                }
                Ok((
                    u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]) as usize,
                    5,
                ))
            }
            0xff => {
                if bytes.len() < 9 {
                    return Err(PsbtError::Parse("Not enough bytes for compact size"));
                }
                let size = u64::from_le_bytes([
                    bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                    bytes[8],
                ]);
                if size > usize::MAX as u64 {
                    return Err(PsbtError::Parse("Compact size exceeds platform address space"));
                }
                Ok((size as usize, 9))
            }
        }
    }

    // Helper: Serialize transaction (legacy format without witness)
    fn serialize_transaction(&self, tx: &Transaction) -> Vec<u8> {
        let mut data = Vec::new();

        // Version
        data.extend_from_slice(&tx.version.to_le_bytes());

        // Inputs
        Self::write_compact_size(&mut data, tx.inputs.len());
        for input in &tx.inputs {
            data.extend_from_slice(&input.prev_output.txid);
            data.extend_from_slice(&input.prev_output.vout.to_le_bytes());
            Self::write_compact_size(&mut data, input.script_sig.len());
            data.extend_from_slice(&input.script_sig);
            data.extend_from_slice(&input.sequence.to_le_bytes());
        }

        // Outputs
        Self::write_compact_size(&mut data, tx.outputs.len());
        for output in &tx.outputs {
            data.extend_from_slice(&output.value.to_le_bytes());
            Self::write_compact_size(&mut data, output.script_pubkey.len());
            data.extend_from_slice(&output.script_pubkey);
        }

        // Locktime
        data.extend_from_slice(&tx.lock_time.to_le_bytes());

        data
    }

    // Helper: Deserialize transaction
    fn deserialize_transaction(bytes: &[u8]) -> Result<Transaction, PsbtError> {
        use crate::{OutPoint, TxInput, TxOutput};

        if bytes.len() < 10 {
            return Err(PsbtError::Parse("Transaction too short"));
        }

        let mut cursor = 0;

        // Version
        let _ = i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        cursor += 4;

        // Input count
        let (input_count, size) = Self::read_compact_size(&bytes[cursor..])?;
        cursor += size;

        // Inputs
        let mut inputs = Vec::with_capacity(input_count);
        for _ in 0..input_count {
            if cursor + 36 > bytes.len() {
                return Err(PsbtError::Parse("Input extends past end"));
            }

            let mut txid = [0u8; 32];
            txid.copy_from_slice(&bytes[cursor..cursor + 32]);
            cursor += 32;

            let vout = u32::from_le_bytes([
                bytes[cursor],
                bytes[cursor + 1],
                bytes[cursor + 2],
                bytes[cursor + 3],
            ]);
            cursor += 4;

            let (script_len, size) = Self::read_compact_size(&bytes[cursor..])?;
            cursor += size;

            if cursor + script_len > bytes.len() {
                return Err(PsbtError::Parse("Script extends past end"));
            }

            let script_sig = bytes[cursor..cursor + script_len].to_vec();
            cursor += script_len;

            if cursor + 4 > bytes.len() {
                return Err(PsbtError::Parse("Sequence extends past end"));
            }

            let sequence = u32::from_le_bytes([
                bytes[cursor],
                bytes[cursor + 1],
                bytes[cursor + 2],
                bytes[cursor + 3],
            ]);
            cursor += 4;

            let mut input = TxInput::new(OutPoint::new(txid, vout), script_sig);
            input.sequence = sequence;
            inputs.push(input);
        }

        // Output count
        let (output_count, size) = Self::read_compact_size(&bytes[cursor..])?;
        cursor += size;

        // Outputs
        let mut outputs = Vec::with_capacity(output_count);
        for _ in 0..output_count {
            if cursor + 8 > bytes.len() {
                return Err(PsbtError::Parse("Output value extends past end"));
            }

            let value = u64::from_le_bytes([
                bytes[cursor],
                bytes[cursor + 1],
                bytes[cursor + 2],
                bytes[cursor + 3],
                bytes[cursor + 4],
                bytes[cursor + 5],
                bytes[cursor + 6],
                bytes[cursor + 7],
            ]);
            cursor += 8;

            let (script_len, size) = Self::read_compact_size(&bytes[cursor..])?;
            cursor += size;

            if cursor + script_len > bytes.len() {
                return Err(PsbtError::Parse("Script pubkey extends past end"));
            }

            let script_pubkey = bytes[cursor..cursor + script_len].to_vec();
            cursor += script_len;

            outputs.push(TxOutput::new(value, script_pubkey));
        }

        // Locktime
        if cursor + 4 > bytes.len() {
            return Err(PsbtError::Parse("Locktime extends past end"));
        }
        let lock_time = u32::from_le_bytes([
            bytes[cursor],
            bytes[cursor + 1],
            bytes[cursor + 2],
            bytes[cursor + 3],
        ]);

        Ok(Transaction::new(inputs, outputs, lock_time))
    }

    // Helper: Serialize input
    fn serialize_input(&self, bytes: &mut Vec<u8>, input: &PsbtInput) {
        // Non-witness UTXO (full previous transaction)
        if let Some(ref tx) = input.non_witness_utxo {
            let tx_bytes = self.serialize_transaction(tx);
            Self::write_key_value(bytes, &[InputType::NonWitnessUtxo as u8], &tx_bytes);
        }

        // Witness UTXO
        if let Some(ref utxo) = input.witness_utxo {
            let mut value = Vec::new();
            value.extend_from_slice(&utxo.value.to_le_bytes());
            Self::write_compact_size(&mut value, utxo.script_pubkey.len());
            value.extend_from_slice(&utxo.script_pubkey);
            Self::write_key_value(bytes, &[InputType::WitnessUtxo as u8], &value);
        }

        // Partial signatures
        for (pubkey, sig) in &input.partial_sigs {
            let mut key = vec![InputType::PartialSig as u8];
            key.extend_from_slice(pubkey);
            Self::write_key_value(bytes, &key, sig);
        }

        // Sighash type
        if let Some(sighash) = input.sighash_type {
            Self::write_key_value(
                bytes,
                &[InputType::SighashType as u8],
                &sighash.to_le_bytes(),
            );
        }

        // Redeem script
        if let Some(ref script) = input.redeem_script {
            Self::write_key_value(bytes, &[InputType::RedeemScript as u8], &script.bytes);
        }

        // Witness script
        if let Some(ref script) = input.witness_script {
            Self::write_key_value(bytes, &[InputType::WitnessScript as u8], &script.bytes);
        }

        // BIP-32 derivation
        for (pubkey, (fingerprint, path)) in &input.bip32_derivation {
            let mut key = vec![InputType::Bip32Derivation as u8];
            key.extend_from_slice(pubkey);
            let mut value = Vec::new();
            value.extend_from_slice(&fingerprint.to_le_bytes());
            for index in path {
                value.extend_from_slice(&index.to_le_bytes());
            }
            Self::write_key_value(bytes, &key, &value);
        }

        // Taproot key signature
        if let Some(ref sig) = input.tap_key_sig {
            Self::write_key_value(bytes, &[InputType::TapKeySig as u8], sig);
        }

        // Taproot internal key
        if let Some(ref key) = input.tap_internal_key {
            Self::write_key_value(bytes, &[InputType::TapInternalKey as u8], key);
        }

        // Taproot merkle root
        if let Some(ref root) = input.tap_merkle_root {
            Self::write_key_value(bytes, &[InputType::TapMerkleRoot as u8], root);
        }

        // Final script sig
        if let Some(ref script) = input.final_script_sig {
            Self::write_key_value(bytes, &[InputType::FinalScriptSig as u8], &script.bytes);
        }

        // Final script witness
        if let Some(ref witness) = input.final_script_witness {
            let mut value = Vec::new();
            Self::write_compact_size(&mut value, witness.len());
            for item in witness {
                Self::write_compact_size(&mut value, item.len());
                value.extend_from_slice(item);
            }
            Self::write_key_value(bytes, &[InputType::FinalScriptWitness as u8], &value);
        }

        // Taproot script signatures
        for ((xonly_pk, leaf_hash), sig) in &input.tap_script_sig {
            let mut key = vec![InputType::TapScriptSig as u8];
            key.extend_from_slice(xonly_pk);
            key.extend_from_slice(leaf_hash);
            Self::write_key_value(bytes, &key, sig);
        }

        // Taproot leaf scripts
        for (control_block, (script, leaf_ver)) in &input.tap_leaf_script {
            let mut key = vec![InputType::TapLeafScript as u8];
            key.extend_from_slice(control_block);
            let mut value = Vec::new();
            value.extend_from_slice(script);
            value.push(*leaf_ver);
            Self::write_key_value(bytes, &key, &value);
        }

        // Proprietary
        for (prop_key, prop_value) in &input.proprietary {
            let mut key = vec![InputType::Proprietary as u8];
            key.extend_from_slice(prop_key);
            Self::write_key_value(bytes, &key, prop_value);
        }
    }

    // Helper: Deserialize input
    fn deserialize_input(bytes: &[u8]) -> Result<(PsbtInput, usize), PsbtError> {
        let mut input = PsbtInput::default();
        let mut cursor = 0;

        loop {
            if cursor >= bytes.len() {
                return Err(PsbtError::Parse("Unexpected end of input data"));
            }

            let (key_len, key_size) = Self::read_compact_size(&bytes[cursor..])?;
            if key_len == 0 {
                cursor += 1;
                break;
            }
            cursor += key_size;

            if cursor + key_len > bytes.len() {
                return Err(PsbtError::Parse("Input key extends past end"));
            }

            let key = &bytes[cursor..cursor + key_len];
            cursor += key_len;

            let (value_len, value_size) = Self::read_compact_size(&bytes[cursor..])?;
            cursor += value_size;

            if cursor + value_len > bytes.len() {
                return Err(PsbtError::Parse("Input value extends past end"));
            }

            let value = &bytes[cursor..cursor + value_len];
            cursor += value_len;

            match key[0] {
                0x00 => {
                    // Non-witness UTXO (full previous transaction)
                    input.non_witness_utxo = Some(Self::deserialize_transaction(value)?);
                }
                0x01 => {
                    // Witness UTXO
                    if value.len() >= 9 {
                        let amount = u64::from_le_bytes([
                            value[0], value[1], value[2], value[3], value[4], value[5], value[6],
                            value[7],
                        ]);
                        let (script_len, size) = Self::read_compact_size(&value[8..])?;
                        let script = value[8 + size..8 + size + script_len].to_vec();
                        input.witness_utxo = Some(TxOutput::new(amount, script));
                    }
                }
                0x02 => {
                    // Partial sig
                    input.partial_sigs.insert(key[1..].to_vec(), value.to_vec());
                }
                0x03 => {
                    // Sighash type
                    if value.len() >= 4 {
                        input.sighash_type =
                            Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]));
                    }
                }
                0x04 => {
                    // Redeem script
                    input.redeem_script = Some(Script {
                        bytes: value.to_vec(),
                    });
                }
                0x05 => {
                    // Witness script
                    input.witness_script = Some(Script {
                        bytes: value.to_vec(),
                    });
                }
                0x06 => {
                    // BIP32 derivation
                    if value.len() >= 4 {
                        let fingerprint =
                            u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                        let mut path = Vec::new();
                        let mut i = 4;
                        while i + 4 <= value.len() {
                            path.push(u32::from_le_bytes([
                                value[i],
                                value[i + 1],
                                value[i + 2],
                                value[i + 3],
                            ]));
                            i += 4;
                        }
                        input
                            .bip32_derivation
                            .insert(key[1..].to_vec(), (fingerprint, path));
                    }
                }
                0x07 => {
                    // Final script sig
                    input.final_script_sig = Some(Script {
                        bytes: value.to_vec(),
                    });
                }
                0x08 => {
                    // Final script witness
                    let mut items = Vec::new();
                    let mut pos = 0;
                    if pos < value.len() {
                        let (count, sz) = Self::read_compact_size(&value[pos..])?;
                        pos += sz;
                        for _ in 0..count {
                            let (item_len, isz) = Self::read_compact_size(&value[pos..])?;
                            pos += isz;
                            items.push(value[pos..pos + item_len].to_vec());
                            pos += item_len;
                        }
                    }
                    input.final_script_witness = Some(items);
                }
                0x13 => {
                    // Tap key sig
                    input.tap_key_sig = Some(value.to_vec());
                }
                0x14 => {
                    // Tap script sig — key is [type, xonly_pk(32), leaf_hash(32)]
                    if key.len() >= 65 {
                        let xonly_pk = key[1..33].to_vec();
                        let leaf_hash = key[33..65].to_vec();
                        input
                            .tap_script_sig
                            .insert((xonly_pk, leaf_hash), value.to_vec());
                    }
                }
                0x15 => {
                    // Tap leaf script — key is [type, control_block...]
                    if !value.is_empty() {
                        let control_block = key[1..].to_vec();
                        let leaf_ver = value[value.len() - 1];
                        let script = value[..value.len() - 1].to_vec();
                        input.tap_leaf_script.insert(control_block, (script, leaf_ver));
                    }
                }
                0x17 => {
                    // Tap internal key
                    input.tap_internal_key = Some(value.to_vec());
                }
                0x18 => {
                    // Tap merkle root
                    input.tap_merkle_root = Some(value.to_vec());
                }
                0xfc => {
                    // Proprietary
                    input.proprietary.insert(key[1..].to_vec(), value.to_vec());
                }
                _ => {} // Unknown, skip
            }
        }

        Ok((input, cursor))
    }

    // Helper: Serialize output
    fn serialize_output(&self, bytes: &mut Vec<u8>, output: &PsbtOutput) {
        // Redeem script
        if let Some(ref script) = output.redeem_script {
            Self::write_key_value(bytes, &[OutputType::RedeemScript as u8], &script.bytes);
        }

        // Witness script
        if let Some(ref script) = output.witness_script {
            Self::write_key_value(bytes, &[OutputType::WitnessScript as u8], &script.bytes);
        }

        // BIP-32 derivation
        for (pubkey, (fingerprint, path)) in &output.bip32_derivation {
            let mut key = vec![OutputType::Bip32Derivation as u8];
            key.extend_from_slice(pubkey);
            let mut value = Vec::new();
            value.extend_from_slice(&fingerprint.to_le_bytes());
            for index in path {
                value.extend_from_slice(&index.to_le_bytes());
            }
            Self::write_key_value(bytes, &key, &value);
        }

        // Taproot internal key
        if let Some(ref key) = output.tap_internal_key {
            Self::write_key_value(bytes, &[OutputType::TapInternalKey as u8], key);
        }

        // Taproot tree
        for (control_block, (script, leaf_ver)) in &output.tap_tree {
            let mut key = vec![OutputType::TapTree as u8];
            key.extend_from_slice(control_block);
            let mut value = Vec::new();
            value.extend_from_slice(script);
            value.push(*leaf_ver);
            Self::write_key_value(bytes, &key, &value);
        }

        // Proprietary
        for (prop_key, prop_value) in &output.proprietary {
            let mut key = vec![OutputType::Proprietary as u8];
            key.extend_from_slice(prop_key);
            Self::write_key_value(bytes, &key, prop_value);
        }
    }

    // Helper: Deserialize output
    fn deserialize_output(bytes: &[u8]) -> Result<(PsbtOutput, usize), PsbtError> {
        let mut output = PsbtOutput::default();
        let mut cursor = 0;

        loop {
            if cursor >= bytes.len() {
                return Err(PsbtError::Parse("Unexpected end of output data"));
            }

            let (key_len, key_size) = Self::read_compact_size(&bytes[cursor..])?;
            if key_len == 0 {
                cursor += 1;
                break;
            }
            cursor += key_size;

            if cursor + key_len > bytes.len() {
                return Err(PsbtError::Parse("Output key extends past end"));
            }

            let key = &bytes[cursor..cursor + key_len];
            cursor += key_len;

            let (value_len, value_size) = Self::read_compact_size(&bytes[cursor..])?;
            cursor += value_size;

            if cursor + value_len > bytes.len() {
                return Err(PsbtError::Parse("Output value extends past end"));
            }

            let value = &bytes[cursor..cursor + value_len];
            cursor += value_len;

            match key[0] {
                0x00 => {
                    // Redeem script
                    output.redeem_script = Some(Script {
                        bytes: value.to_vec(),
                    });
                }
                0x01 => {
                    // Witness script
                    output.witness_script = Some(Script {
                        bytes: value.to_vec(),
                    });
                }
                0x02 => {
                    // BIP32 derivation
                    if value.len() >= 4 {
                        let fingerprint =
                            u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                        let mut path = Vec::new();
                        let mut i = 4;
                        while i + 4 <= value.len() {
                            path.push(u32::from_le_bytes([
                                value[i],
                                value[i + 1],
                                value[i + 2],
                                value[i + 3],
                            ]));
                            i += 4;
                        }
                        output
                            .bip32_derivation
                            .insert(key[1..].to_vec(), (fingerprint, path));
                    }
                }
                0x05 => {
                    // Tap internal key
                    output.tap_internal_key = Some(value.to_vec());
                }
                0x06 => {
                    // Tap tree — key is [type, control_block...]
                    if !value.is_empty() {
                        let control_block = key[1..].to_vec();
                        let leaf_ver = value[value.len() - 1];
                        let script = value[..value.len() - 1].to_vec();
                        output.tap_tree.insert(control_block, (script, leaf_ver));
                    }
                }
                0xfc => {
                    // Proprietary
                    output.proprietary.insert(key[1..].to_vec(), value.to_vec());
                }
                _ => {} // Unknown, skip
            }
        }

        Ok((output, cursor))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::OutPoint;

    fn create_test_tx() -> Transaction {
        let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
        let output = TxOutput::new(50_000_000, vec![0x76, 0xa9]); // P2PKH
        Transaction::new(vec![input], vec![output], 0)
    }

    #[test]
    fn test_psbt_creation() {
        let tx = create_test_tx();
        let psbt = Psbt::new(tx.clone());

        assert!(psbt.is_ok());
        let psbt = psbt.unwrap();

        assert_eq!(psbt.inputs.len(), 1);
        assert_eq!(psbt.outputs.len(), 1);
        assert_eq!(psbt.unsigned_tx.txid(), tx.txid());
    }

    #[test]
    fn test_psbt_empty_tx() {
        let tx = Transaction::new(vec![], vec![], 0);
        let psbt = Psbt::new(tx);

        assert!(psbt.is_err());
    }

    #[test]
    fn test_add_witness_utxo() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let utxo = TxOutput::new(100_000_000, vec![]);
        let result = psbt.add_witness_utxo(0, utxo.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.inputs[0].witness_utxo, Some(utxo));
    }

    #[test]
    fn test_add_witness_utxo_invalid_index() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let utxo = TxOutput::new(100_000_000, vec![]);
        let result = psbt.add_witness_utxo(10, utxo);

        assert!(result.is_err());
    }

    #[test]
    fn test_add_redeem_script() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let script = Script::new(vec![0x51]); // OP_1
        let result = psbt.add_redeem_script(0, script.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.inputs[0].redeem_script, Some(script));
    }

    #[test]
    fn test_add_bip32_derivation() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let pubkey = vec![0x02; 33];
        let fingerprint = 0x12345678;
        let path = vec![44, 0, 0];

        let result = psbt.add_bip32_derivation(0, pubkey.clone(), fingerprint, path.clone());

        assert!(result.is_ok());
        assert_eq!(
            psbt.inputs[0].bip32_derivation.get(&pubkey),
            Some(&(fingerprint, path))
        );
    }

    #[test]
    fn test_sign_input() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        // Add UTXO info
        let utxo = TxOutput::new(100_000_000, vec![]);
        psbt.add_witness_utxo(0, utxo).unwrap();

        // Sign
        let private_key = PrivateKey::from_bytes(&[1u8; 32]).unwrap();
        let result = psbt.sign_input(0, &private_key);

        assert!(result.is_ok());
        assert!(!psbt.inputs[0].partial_sigs.is_empty());
    }

    #[test]
    fn test_is_complete_empty() {
        let tx = create_test_tx();
        let psbt = Psbt::new(tx).unwrap();

        assert!(!psbt.is_complete());
    }

    #[test]
    fn test_is_complete_with_sig() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        // Add signature
        let pubkey = vec![0x02; 33];
        let sig = vec![0x30; 70];
        psbt.inputs[0].partial_sigs.insert(pubkey, sig);

        assert!(psbt.is_complete());
    }

    #[test]
    fn test_combine_psbt() {
        let tx = create_test_tx();
        let mut psbt1 = Psbt::new(tx.clone()).unwrap();
        let mut psbt2 = Psbt::new(tx).unwrap();

        // Add different info to each PSBT
        let utxo = TxOutput::new(100_000_000, vec![]);
        psbt1.add_witness_utxo(0, utxo).unwrap();

        let script = Script::new(vec![0x51]);
        psbt2.add_redeem_script(0, script.clone()).unwrap();

        // Combine
        let result = psbt1.combine(&psbt2);

        assert!(result.is_ok());
        assert!(psbt1.inputs[0].witness_utxo.is_some());
        assert_eq!(psbt1.inputs[0].redeem_script, Some(script));
    }

    #[test]
    fn test_combine_different_tx() {
        let tx1 = create_test_tx();
        let tx2 = Transaction::new(
            vec![TxInput::new(OutPoint::new([2u8; 32], 0), vec![])],
            vec![TxOutput::new(25_000_000, vec![])],
            0,
        );

        let mut psbt1 = Psbt::new(tx1).unwrap();
        let psbt2 = Psbt::new(tx2).unwrap();

        let result = psbt1.combine(&psbt2);

        assert!(result.is_err());
    }

    #[test]
    fn test_psbt_serialize() {
        let tx = create_test_tx();
        let psbt = Psbt::new(tx).unwrap();

        let bytes = psbt.serialize();

        // Check magic bytes
        assert_eq!(&bytes[0..4], &PSBT_MAGIC);
        assert_eq!(bytes[4], PSBT_SEPARATOR);
    }

    #[test]
    fn test_psbt_serialize_deserialize_roundtrip() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        // Add some data to test serialization
        let script = vec![
            0x00, 0x14, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12,
            0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12,
        ];
        let utxo = TxOutput::new(100_000_000, script);
        psbt.add_witness_utxo(0, utxo).unwrap();
        psbt.inputs[0].sighash_type = Some(1);

        // Serialize
        let bytes = psbt.serialize();

        // Deserialize
        let restored = Psbt::deserialize(&bytes).unwrap();

        // Check transaction matches
        assert_eq!(restored.unsigned_tx.txid(), psbt.unsigned_tx.txid());
        assert_eq!(restored.inputs.len(), psbt.inputs.len());
        assert_eq!(restored.outputs.len(), psbt.outputs.len());

        // Check witness UTXO
        assert!(restored.inputs[0].witness_utxo.is_some());
        let restored_utxo = restored.inputs[0].witness_utxo.as_ref().unwrap();
        let original_utxo = psbt.inputs[0].witness_utxo.as_ref().unwrap();
        assert_eq!(restored_utxo.value, original_utxo.value);

        // Check sighash type
        assert_eq!(restored.inputs[0].sighash_type, Some(1));
    }

    #[test]
    fn test_psbt_deserialize_invalid_magic() {
        let bad_bytes = vec![0x00, 0x00, 0x00, 0x00, 0xff];
        let result = Psbt::deserialize(&bad_bytes);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid PSBT magic"));
    }

    #[test]
    fn test_psbt_deserialize_too_short() {
        let short_bytes = vec![0x70, 0x73];
        let result = Psbt::deserialize(&short_bytes);
        assert!(result.is_err());
    }

    #[test]
    fn test_finalize_incomplete() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let result = psbt.finalize();

        assert!(result.is_err());
    }

    // === BIP-371 Taproot Tests ===

    #[test]
    fn test_add_tap_key_sig() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let signature = vec![0xAAu8; 64];
        let result = psbt.add_tap_key_sig(0, signature.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.inputs[0].tap_key_sig, Some(signature));
    }

    #[test]
    fn test_add_tap_key_sig_invalid_length() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let signature = vec![0xAAu8; 63]; // Wrong length
        let result = psbt.add_tap_key_sig(0, signature);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid Schnorr signature length"));
    }

    #[test]
    fn test_add_tap_key_sig_out_of_bounds() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let signature = vec![0xAAu8; 64];
        let result = psbt.add_tap_key_sig(5, signature); // Out of bounds

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Input index out of bounds"));
    }

    #[test]
    fn test_add_tap_script_sig() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let control_block = vec![0xC0u8; 33];
        let script = vec![0x51]; // OP_1
        let signature = vec![0xBBu8; 64];

        let result =
            psbt.add_tap_script_sig(0, control_block.clone(), script.clone(), signature.clone());

        assert!(result.is_ok());
        assert_eq!(
            psbt.inputs[0]
                .tap_script_sig
                .get(&(control_block.clone(), script.clone())),
            Some(&signature)
        );
    }

    #[test]
    fn test_add_tap_script_sig_65_bytes() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let control_block = vec![0xC0u8; 33];
        let script = vec![0x51];
        let signature = vec![0xBBu8; 65]; // With sighash flag

        let result = psbt.add_tap_script_sig(0, control_block, script, signature);

        assert!(result.is_ok());
    }

    #[test]
    fn test_add_tap_leaf_script() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let control_block = vec![0xC0u8; 33];
        let script = vec![0x51, 0x63, 0x52, 0x68]; // OP_1 OP_IF OP_2 OP_ENDIF
        let leaf_version = 0xC0u8;

        let result =
            psbt.add_tap_leaf_script(0, control_block.clone(), script.clone(), leaf_version);

        assert!(result.is_ok());
        assert_eq!(
            psbt.inputs[0].tap_leaf_script.get(&control_block),
            Some(&(script, leaf_version))
        );
    }

    #[test]
    fn test_add_tap_bip32_derivation() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let pubkey_x_only = vec![0xCCu8; 32];
        let leaf_hashes = vec![vec![0xDDu8; 32], vec![0xEEu8; 32]];
        let fingerprint = 0x12345678u32;
        let path = vec![0x8000002Cu32, 0x80000001u32, 0x80000000u32];

        let result = psbt.add_tap_bip32_derivation(
            0,
            pubkey_x_only.clone(),
            leaf_hashes.clone(),
            fingerprint,
            path.clone(),
        );

        assert!(result.is_ok());
        assert_eq!(
            psbt.inputs[0].tap_bip32_derivation.get(&pubkey_x_only),
            Some(&(leaf_hashes, (fingerprint, path)))
        );
    }

    #[test]
    fn test_add_tap_bip32_derivation_invalid_key_length() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let pubkey_x_only = vec![0xCCu8; 33]; // Wrong length
        let leaf_hashes = vec![];
        let fingerprint = 0x12345678u32;
        let path = vec![0x80000000u32];

        let result =
            psbt.add_tap_bip32_derivation(0, pubkey_x_only, leaf_hashes, fingerprint, path);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid x-only pubkey length"));
    }

    #[test]
    fn test_add_tap_internal_key() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let internal_key = vec![0xFFu8; 32];
        let result = psbt.add_tap_internal_key(0, internal_key.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.inputs[0].tap_internal_key, Some(internal_key));
    }

    #[test]
    fn test_add_tap_internal_key_invalid_length() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let internal_key = vec![0xFFu8; 31]; // Wrong length
        let result = psbt.add_tap_internal_key(0, internal_key);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid internal key length"));
    }

    #[test]
    fn test_add_tap_merkle_root() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let merkle_root = vec![0x11u8; 32];
        let result = psbt.add_tap_merkle_root(0, merkle_root.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.inputs[0].tap_merkle_root, Some(merkle_root));
    }

    #[test]
    fn test_add_tap_merkle_root_invalid_length() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let merkle_root = vec![0x11u8; 33]; // Wrong length
        let result = psbt.add_tap_merkle_root(0, merkle_root);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid merkle root length"));
    }

    #[test]
    fn test_add_output_tap_internal_key() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let internal_key = vec![0x22u8; 32];
        let result = psbt.add_output_tap_internal_key(0, internal_key.clone());

        assert!(result.is_ok());
        assert_eq!(psbt.outputs[0].tap_internal_key, Some(internal_key));
    }

    #[test]
    fn test_add_output_tap_tree() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let control_block = vec![0xC0u8; 33];
        let script = vec![0x51, 0xAC]; // OP_1 OP_CHECKSIG
        let leaf_version = 0xC0u8;

        let result =
            psbt.add_output_tap_tree(0, control_block.clone(), script.clone(), leaf_version);

        assert!(result.is_ok());
        assert_eq!(
            psbt.outputs[0].tap_tree.get(&control_block),
            Some(&(script, leaf_version))
        );
    }

    #[test]
    fn test_add_output_tap_bip32_derivation() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        let pubkey_x_only = vec![0x33u8; 32];
        let leaf_hashes = vec![vec![0x44u8; 32]];
        let fingerprint = 0xABCD1234u32;
        let path = vec![0x8000002Cu32];

        let result = psbt.add_output_tap_bip32_derivation(
            0,
            pubkey_x_only.clone(),
            leaf_hashes.clone(),
            fingerprint,
            path.clone(),
        );

        assert!(result.is_ok());
        assert_eq!(
            psbt.outputs[0].tap_bip32_derivation.get(&pubkey_x_only),
            Some(&(leaf_hashes, (fingerprint, path)))
        );
    }

    #[test]
    fn test_taproot_psbt_complete_workflow() {
        // Test complete workflow: create PSBT, add Taproot data, verify
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        // Add Taproot input data
        let internal_key = vec![0x55u8; 32];
        psbt.add_tap_internal_key(0, internal_key.clone()).unwrap();

        let merkle_root = vec![0x66u8; 32];
        psbt.add_tap_merkle_root(0, merkle_root.clone()).unwrap();

        let signature = vec![0xAAu8; 64];
        psbt.add_tap_key_sig(0, signature.clone()).unwrap();

        // Add Taproot output data
        let output_internal_key = vec![0x77u8; 32];
        psbt.add_output_tap_internal_key(0, output_internal_key.clone())
            .unwrap();

        // Verify all data is present
        assert_eq!(psbt.inputs[0].tap_internal_key, Some(internal_key));
        assert_eq!(psbt.inputs[0].tap_merkle_root, Some(merkle_root));
        assert_eq!(psbt.inputs[0].tap_key_sig, Some(signature));
        assert_eq!(psbt.outputs[0].tap_internal_key, Some(output_internal_key));
    }

    #[test]
    fn test_psbt_roundtrip_finalized_fields() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();

        // Set final_script_sig
        psbt.inputs[0].final_script_sig = Some(Script {
            bytes: vec![0x48, 0x30, 0x45],
        });

        // Set final_script_witness
        psbt.inputs[0].final_script_witness = Some(vec![
            vec![0x30, 0x44],
            vec![0x02, 0x20],
        ]);

        // Set non_witness_utxo (another transaction)
        let prev_tx = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], 0xFFFF_FFFF), vec![])],
            vec![TxOutput::new(100_000_000, vec![0x76, 0xa9])],
            0,
        );
        psbt.inputs[0].non_witness_utxo = Some(prev_tx.clone());

        // Set proprietary on input and output
        psbt.inputs[0]
            .proprietary
            .insert(b"test_key".to_vec(), b"test_value".to_vec());
        psbt.outputs[0]
            .proprietary
            .insert(b"out_key".to_vec(), b"out_value".to_vec());

        // Roundtrip
        let bytes = psbt.serialize();
        let decoded = Psbt::deserialize(&bytes).unwrap();

        assert!(decoded.inputs[0].final_script_sig.is_some());
        assert_eq!(
            decoded.inputs[0].final_script_sig.as_ref().unwrap().bytes,
            vec![0x48, 0x30, 0x45]
        );
        assert!(decoded.inputs[0].final_script_witness.is_some());
        let witness = decoded.inputs[0].final_script_witness.as_ref().unwrap();
        assert_eq!(witness.len(), 2);
        assert_eq!(witness[0], vec![0x30, 0x44]);
        assert!(decoded.inputs[0].non_witness_utxo.is_some());
        assert_eq!(
            decoded.inputs[0].proprietary.get(&b"test_key".to_vec()),
            Some(&b"test_value".to_vec())
        );
        assert_eq!(
            decoded.outputs[0].proprietary.get(&b"out_key".to_vec()),
            Some(&b"out_value".to_vec())
        );
    }

    // ── PSBT hardening tests ─────────────────────────────────────────────────

    #[test]
    fn test_psbt_new_empty_inputs_rejected() {
        let tx = Transaction::new(vec![], vec![TxOutput::new(1000, vec![0x51])], 0);
        assert!(Psbt::new(tx).is_err(), "PSBT with zero inputs must be rejected");
    }

    #[test]
    fn test_psbt_combine_mismatched_txids_rejected() {
        let tx1 = create_test_tx();
        let tx2 = Transaction::new(
            vec![TxInput::new(OutPoint::new([0xAB; 32], 1), vec![])],
            vec![TxOutput::new(5000, vec![0x51])],
            0,
        );
        let mut psbt1 = Psbt::new(tx1).unwrap();
        let psbt2 = Psbt::new(tx2).unwrap();
        assert!(
            matches!(psbt1.combine(&psbt2), Err(PsbtError::CombineMismatch)),
            "Combining PSBTs with different txids must fail"
        );
    }

    #[test]
    fn test_psbt_combine_merges_partial_sigs() {
        let tx = create_test_tx();
        let mut psbt_a = Psbt::new(tx.clone()).unwrap();
        let mut psbt_b = Psbt::new(tx).unwrap();

        let pubkey_a = vec![0x02u8; 33];
        let sig_a = vec![0x30, 0x44, 0xAA];
        let pubkey_b = vec![0x03u8; 33];
        let sig_b = vec![0x30, 0x44, 0xBB];

        psbt_a.inputs[0].partial_sigs.insert(pubkey_a.clone(), sig_a.clone());
        psbt_b.inputs[0].partial_sigs.insert(pubkey_b.clone(), sig_b.clone());

        psbt_a.combine(&psbt_b).unwrap();
        assert_eq!(psbt_a.inputs[0].partial_sigs.get(&pubkey_a), Some(&sig_a));
        assert_eq!(psbt_a.inputs[0].partial_sigs.get(&pubkey_b), Some(&sig_b));
    }

    #[test]
    fn test_psbt_combine_does_not_overwrite_existing_sig() {
        let tx = create_test_tx();
        let mut psbt_a = Psbt::new(tx.clone()).unwrap();
        let mut psbt_b = Psbt::new(tx).unwrap();

        let pubkey = vec![0x02u8; 33];
        let sig_original = vec![0x30, 0x44, 0xAA];
        let sig_other = vec![0x30, 0x44, 0xCC]; // different

        psbt_a.inputs[0].partial_sigs.insert(pubkey.clone(), sig_original.clone());
        psbt_b.inputs[0].partial_sigs.insert(pubkey.clone(), sig_other);

        psbt_a.combine(&psbt_b).unwrap();
        // Original signature must NOT be replaced
        assert_eq!(psbt_a.inputs[0].partial_sigs.get(&pubkey), Some(&sig_original));
    }

    #[test]
    fn test_psbt_is_complete_false_without_sigs() {
        let tx = create_test_tx();
        let psbt = Psbt::new(tx).unwrap();
        assert!(!psbt.is_complete(), "PSBT without any signatures must not be complete");
    }

    #[test]
    fn test_psbt_is_complete_true_with_final_script_sig() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        psbt.inputs[0].final_script_sig = Some(Script { bytes: vec![0x48] });
        assert!(psbt.is_complete(), "PSBT with finalScriptSig on all inputs must be complete");
    }

    #[test]
    fn test_psbt_finalize_incomplete_rejected() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        assert!(psbt.finalize().is_err(), "finalize on incomplete PSBT must fail");
    }

    #[test]
    fn test_psbt_add_witness_utxo_out_of_bounds_rejected() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        let utxo = TxOutput::new(1000, vec![0x51]);
        // Index 99 doesn't exist
        assert!(psbt.add_witness_utxo(99, utxo).is_err());
    }

    #[test]
    fn test_psbt_witness_utxo_roundtrip() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        let utxo = TxOutput::new(50_000, vec![0x00, 0x14, 0xAB, 0xCD, 0xEF, 0x01, 0x02, 0x03,
            0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
            0x10, 0x11]);
        psbt.add_witness_utxo(0, utxo.clone()).unwrap();
        let bytes = psbt.serialize();
        let decoded = Psbt::deserialize(&bytes).unwrap();
        assert_eq!(decoded.inputs[0].witness_utxo, Some(utxo));
    }

    #[test]
    fn test_psbt_serialize_deserialize_multi_input() {
        // PSBT with 3 inputs must survive full roundtrip
        let tx = Transaction::new(
            vec![
                TxInput::new(OutPoint::new([0x11; 32], 0), vec![]),
                TxInput::new(OutPoint::new([0x22; 32], 1), vec![]),
                TxInput::new(OutPoint::new([0x33; 32], 2), vec![]),
            ],
            vec![TxOutput::new(100_000, vec![0x51])],
            0,
        );
        let psbt = Psbt::new(tx).unwrap();
        let bytes = psbt.serialize();
        let decoded = Psbt::deserialize(&bytes).unwrap();
        assert_eq!(decoded.inputs.len(), 3);
        assert_eq!(decoded.unsigned_tx.inputs.len(), 3);
    }

    #[test]
    fn test_psbt_deserialize_truncated_bytes_rejected() {
        let tx = create_test_tx();
        let psbt = Psbt::new(tx).unwrap();
        let bytes = psbt.serialize();
        // Feed only first 5 bytes → must error
        assert!(Psbt::deserialize(&bytes[..5]).is_err());
    }

    #[test]
    fn test_psbt_deserialize_empty_bytes_rejected() {
        assert!(Psbt::deserialize(&[]).is_err());
    }

    #[test]
    fn test_psbt_proprietary_keys_survive_roundtrip() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        psbt.proprietary.insert(b"kubercoin_version".to_vec(), b"1.0".to_vec());
        let bytes = psbt.serialize();
        let decoded = Psbt::deserialize(&bytes).unwrap();
        assert_eq!(
            decoded.proprietary.get(&b"kubercoin_version".to_vec()),
            Some(&b"1.0".to_vec())
        );
    }

    #[test]
    fn test_psbt_large_proprietary_payload_roundtrip() {
        let tx = create_test_tx();
        let mut psbt = Psbt::new(tx).unwrap();
        let big_value = vec![0xFFu8; 4096];
        psbt.proprietary.insert(b"large".to_vec(), big_value.clone());
        let bytes = psbt.serialize();
        let decoded = Psbt::deserialize(&bytes).unwrap();
        assert_eq!(decoded.proprietary.get(&b"large".to_vec()), Some(&big_value));
    }
}
