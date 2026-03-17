#![warn(missing_docs)]
//! Transaction primitives for the KuberCoin blockchain.
//!
//! This crate provides core transaction types (inputs, outputs, scripts),
//! ECDSA key management, address encoding (Base58Check and Bech32m),
//! and advanced Bitcoin-compatible features including P2SH, multisig,
//! SegWit, Taproot, PSBT, BIP-39 mnemonics, and HD wallets.

/// Address encoding and decoding (Base58Check, Bech32m).
pub mod address;

/// BIP-84 native SegWit (P2WPKH) HD wallet derivation.
pub mod bip84;

/// Coin selection algorithms (BnB, knapsack, largest-first).
pub mod coin_select;
/// Output descriptors (BIP-380 family).
pub mod descriptors;
/// Bech32m encoding for SegWit v1+ addresses.
pub mod bech32m;
/// BIP-322 generic message signing.
pub mod bip322;
/// BIP-39 mnemonic seed phrases.
pub mod bip39;
/// BIP-44 multi-account HD wallet paths.
pub mod bip44;
/// BIP-86 Taproot default key derivation.
pub mod bip86;
/// Transaction error types.
pub mod error;
/// BIP-32 hierarchical-deterministic wallets.
pub mod hd_wallet;
/// Transaction input types.
pub mod input;
/// ECDSA / Schnorr key management.
pub mod keys;
/// P2SH multi-signature scripts.
pub mod multisig;
/// Miniscript — structured subset of Bitcoin Script with parsing and compilation.
pub mod miniscript;
/// MuSig2 multi-signature scheme.
pub mod musig2;
/// Script opcodes and extended opcode set.
pub mod opcodes;
/// Transaction outpoint references.
pub mod outpoint;
/// Transaction output types.
pub mod output;
/// Pay-to-Script-Hash support.
pub mod p2sh;
/// Partially Signed Bitcoin Transactions (v0).
pub mod psbt;
/// Partially Signed Bitcoin Transactions v2.
pub mod psbt_v2;
/// Schnorr signature primitives.
pub mod schnorr;
/// Bitcoin Script representation.
pub mod script;
/// Script interpreter and virtual machine.
pub mod script_interpreter;
/// Segregated Witness support.
pub mod segwit;
/// Taproot key-path and script-path spending.
pub mod taproot;
/// Tapscript execution support.
pub mod tapscript;
/// Timelock script builders (CLTV, CSV, HTLC).
pub mod timelock;
/// Wallet encryption (Argon2id + AES-256-GCM).
pub mod wallet_crypto;
/// Wallet file operations (save/load with optional encryption).
pub mod wallet;

pub use address::Address;
pub use address::{AddressType, MAINNET_ADDRESS_VERSION, TESTNET_ADDRESS_VERSION};
pub use error::TxError;
pub use input::TxInput;
pub use input::Witness;
pub use keys::{PrivateKey, PublicKey};
pub use outpoint::OutPoint;
pub use output::TxOutput;
pub use psbt::PsbtError;
pub use script_interpreter::ScriptInterpreterError;
pub use script::Script;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// SIGHASH_ALL — commit to all inputs and all outputs (default).
pub const SIGHASH_ALL: u32 = 0x01;
/// SIGHASH_NONE — commit to all inputs but no outputs.
pub const SIGHASH_NONE: u32 = 0x02;
/// SIGHASH_SINGLE — commit to all inputs and the output at the same index.
pub const SIGHASH_SINGLE: u32 = 0x03;
/// SIGHASH_ANYONECANPAY — OR flag; commit only to the signed input.
pub const SIGHASH_ANYONECANPAY: u32 = 0x80;

/// Transaction structure with inputs and outputs
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Transaction {
    /// Transaction version
    pub version: u32,

    /// Transaction inputs (spending previous outputs)
    pub inputs: Vec<TxInput>,

    /// Transaction outputs (creating new UTXOs)
    pub outputs: Vec<TxOutput>,

    /// Lock time (0 = not locked)
    pub lock_time: u32,
}

impl Transaction {
    /// Create a new transaction (version 2 by default, enabling BIP-68 CSV)
    pub fn new(inputs: Vec<TxInput>, outputs: Vec<TxOutput>, lock_time: u32) -> Self {
        Self {
            version: 2,
            inputs,
            outputs,
            lock_time,
        }
    }

    /// Create a coinbase transaction (version 1; coinbase is exempt from BIP-68)
    pub fn new_coinbase(height: u64, value: u64, script_pubkey: Vec<u8>) -> Self {
        let input = TxInput::new_coinbase(height, b"KuberCoin".to_vec());
        let output = TxOutput::new(value, script_pubkey);

        Self {
            version: 1,
            inputs: vec![input],
            outputs: vec![output],
            lock_time: 0,
        }
    }

    /// Serialize transaction in Bitcoin wire format **without** witness data.
    /// Used for computing the legacy `txid`.
    pub fn serialize_no_witness(&self) -> Vec<u8> {
        let mut data = Vec::with_capacity(self.base_size());
        data.extend_from_slice(&self.version.to_le_bytes());
        write_compact_size(&mut data, self.inputs.len());
        for inp in &self.inputs {
            data.extend_from_slice(&inp.prev_output.txid);
            data.extend_from_slice(&inp.prev_output.vout.to_le_bytes());
            write_compact_size(&mut data, inp.script_sig.len());
            data.extend_from_slice(&inp.script_sig);
            data.extend_from_slice(&inp.sequence.to_le_bytes());
        }
        write_compact_size(&mut data, self.outputs.len());
        for out in &self.outputs {
            data.extend_from_slice(&out.value.to_le_bytes());
            write_compact_size(&mut data, out.script_pubkey.len());
            data.extend_from_slice(&out.script_pubkey);
        }
        data.extend_from_slice(&self.lock_time.to_le_bytes());
        data
    }

    /// Serialize transaction in Bitcoin wire format **with** witness data
    /// (marker `0x00`, flag `0x01`, per-input witness stacks).
    /// For legacy (non-witness) transactions this is identical to
    /// `serialize_no_witness()`.
    pub fn serialize_with_witness(&self) -> Vec<u8> {
        if !self.has_witness() {
            return self.serialize_no_witness();
        }
        let mut data = Vec::with_capacity(self.total_size());
        data.extend_from_slice(&self.version.to_le_bytes());
        // Segregated Witness marker + flag
        data.push(0x00);
        data.push(0x01);
        write_compact_size(&mut data, self.inputs.len());
        for inp in &self.inputs {
            data.extend_from_slice(&inp.prev_output.txid);
            data.extend_from_slice(&inp.prev_output.vout.to_le_bytes());
            write_compact_size(&mut data, inp.script_sig.len());
            data.extend_from_slice(&inp.script_sig);
            data.extend_from_slice(&inp.sequence.to_le_bytes());
        }
        write_compact_size(&mut data, self.outputs.len());
        for out in &self.outputs {
            data.extend_from_slice(&out.value.to_le_bytes());
            write_compact_size(&mut data, out.script_pubkey.len());
            data.extend_from_slice(&out.script_pubkey);
        }
        // Witness stacks
        for inp in &self.inputs {
            let stack = &inp.witness.stack;
            write_compact_size(&mut data, stack.len());
            for item in stack {
                write_compact_size(&mut data, item.len());
                data.extend_from_slice(item);
            }
        }
        data.extend_from_slice(&self.lock_time.to_le_bytes());
        data
    }

    /// Calculate transaction ID — SHA-256d of the wire-format serialization
    /// **without** witness data (BIP-141).
    pub fn txid(&self) -> [u8; 32] {
        let serialized = self.serialize_no_witness();
        let first_hash = Sha256::digest(&serialized);
        let second_hash = Sha256::digest(first_hash);
        second_hash.into()
    }

    /// Alias for txid() - used by some modules
    pub fn id(&self) -> [u8; 32] {
        self.txid()
    }

    /// Get transaction ID as hex string
    pub fn txid_hex(&self) -> String {
        hex::encode(self.txid())
    }

    /// Check whether any input carries witness data (BIP-141).
    pub fn has_witness(&self) -> bool {
        self.inputs.iter().any(|i| i.has_witness())
    }

    /// Witness transaction ID — SHA-256d of the full wire-format
    /// serialization *including* witness data (BIP-141).
    /// For legacy (non-witness) transactions this equals `txid()`.
    pub fn wtxid(&self) -> [u8; 32] {
        if !self.has_witness() {
            return self.txid();
        }
        let serialized = self.serialize_with_witness();
        let first = Sha256::digest(&serialized);
        let second = Sha256::digest(first);
        second.into()
    }

    /// Estimated base size in bytes (excludes witness data).
    ///
    /// This counts version (4) + varint input count + each input's
    /// outpoint (36) + scriptSig + sequence (4) + varint output count +
    /// each output + locktime (4).  Witness bytes are excluded.
    pub fn base_size(&self) -> usize {
        // version(4) + locktime(4)
        let mut s: usize = 8;
        s += compact_size_len(self.inputs.len());
        for inp in &self.inputs {
            // outpoint (32 txid + 4 vout) + scriptSig varint + scriptSig + sequence
            s += 36 + compact_size_len(inp.script_sig.len()) + inp.script_sig.len() + 4;
        }
        s += compact_size_len(self.outputs.len());
        for out in &self.outputs {
            // value(8) + scriptPubKey varint + scriptPubKey
            s += 8 + compact_size_len(out.script_pubkey.len()) + out.script_pubkey.len();
        }
        s
    }

    /// Total serialized size including witness marker/flag and witness
    /// stacks.
    pub fn total_size(&self) -> usize {
        let mut s = self.base_size();
        if self.has_witness() {
            s += 2; // marker (0x00) + flag (0x01)
            for inp in &self.inputs {
                s += inp.witness.size();
            }
        }
        s
    }

    /// Transaction weight in weight units (BIP-141).
    /// `weight = base_size * 3 + total_size`
    pub fn weight(&self) -> usize {
        self.base_size() * 3 + self.total_size()
    }

    /// Virtual size in vbytes.  `vsize = ceil(weight / 4)`
    pub fn vsize(&self) -> usize {
        self.weight().div_ceil(4)
    }

    /// Check if this is a coinbase transaction
    pub fn is_coinbase(&self) -> bool {
        self.inputs.len() == 1 && self.inputs[0].is_coinbase()
    }

    /// Calculate total input value (requires UTXO set lookup)
    /// Returns None for coinbase transactions
    pub fn total_input_value<F>(&self, get_output: F) -> Option<u64>
    where
        F: Fn(&OutPoint) -> Option<&TxOutput>,
    {
        if self.is_coinbase() {
            return None;
        }

        let mut total = 0u64;
        for input in &self.inputs {
            let output = get_output(&input.prev_output)?;
            total = total.checked_add(output.value)?;
        }
        Some(total)
    }

    /// Calculate total output value.
    /// Returns `None` if the sum overflows `u64`.
    pub fn total_output_value(&self) -> Option<u64> {
        self.outputs.iter().try_fold(0u64, |acc, o| acc.checked_add(o.value))
    }

    /// Calculate transaction fee (input_value - output_value)
    /// Returns None for coinbase or if inputs not found
    pub fn fee<F>(&self, get_output: F) -> Option<u64>
    where
        F: Fn(&OutPoint) -> Option<u64>,
    {
        let input_value = self.total_input_value_raw(get_output)?;
        let output_value = self.total_output_value()?;
        input_value.checked_sub(output_value)
    }

    /// Calculate total input value (requires value lookup)
    /// Returns None for coinbase transactions
    fn total_input_value_raw<F>(&self, get_value: F) -> Option<u64>
    where
        F: Fn(&OutPoint) -> Option<u64>,
    {
        if self.is_coinbase() {
            return None;
        }

        let mut total = 0u64;
        for input in &self.inputs {
            let value = get_value(&input.prev_output)?;
            total = total.checked_add(value)?;
        }
        Some(total)
    }

    /// Calculate legacy signature hash for a specific input.
    ///
    /// `sighash_type`:
    ///   - `0x01` SIGHASH_ALL (default, commit to all inputs + outputs)
    ///   - `0x02` SIGHASH_NONE (commit to inputs, no outputs)
    ///   - `0x03` SIGHASH_SINGLE (commit to matching-index output only)
    ///   - OR with `0x80` for ANYONECANPAY (commit only to the signed input)
    pub fn signature_hash(&self, input_index: usize) -> Result<[u8; 32], TxError> {
        self.signature_hash_with_type(input_index, SIGHASH_ALL)
    }

    /// Legacy signature hash with explicit sighash type.
    pub fn signature_hash_with_type(&self, input_index: usize, sighash_type: u32) -> Result<[u8; 32], TxError> {
        if input_index >= self.inputs.len() {
            return Err(TxError::IndexOutOfBounds(format!(
                "input {} of {}",
                input_index,
                self.inputs.len()
            )));
        }

        let base_type = sighash_type & 0x1f;
        let anyone_can_pay = sighash_type & SIGHASH_ANYONECANPAY != 0;

        let mut tx_copy = self.clone();

        // Clear all input scripts
        for input in &mut tx_copy.inputs {
            input.script_sig = vec![];
        }

        if anyone_can_pay {
            // Keep only the input being signed
            tx_copy.inputs = vec![tx_copy.inputs[input_index].clone()];
        }

        if base_type == SIGHASH_NONE {
            tx_copy.outputs = vec![];
            // Clear sequences for all other inputs (they're not committed)
            for (i, inp) in tx_copy.inputs.iter_mut().enumerate() {
                if i != input_index && !anyone_can_pay {
                    inp.sequence = 0;
                }
            }
        } else if base_type == SIGHASH_SINGLE {
            if input_index >= self.outputs.len() {
                // Bitcoin returns 1-hash for out-of-range SIGHASH_SINGLE
                let mut one_hash = [0u8; 32];
                one_hash[0] = 1;
                return Ok(one_hash);
            }
            // Keep outputs up to and including input_index, blank earlier ones
            tx_copy.outputs.truncate(input_index + 1);
            for i in 0..input_index {
                tx_copy.outputs[i] = TxOutput::new(u64::MAX, vec![]);
            }
            for (i, inp) in tx_copy.inputs.iter_mut().enumerate() {
                if i != input_index && !anyone_can_pay {
                    inp.sequence = 0;
                }
            }
        }

        // Serialize with sighash_type appended
        let mut serialized = bincode::serialize(&tx_copy)
            .map_err(|e| TxError::Serialization(format!("serialization failed: {}", e)))?;
        serialized.extend_from_slice(&sighash_type.to_le_bytes());

        let first_hash = Sha256::digest(&serialized);
        let second_hash = Sha256::digest(first_hash);

        Ok(second_hash.into())
    }

    /// BIP-143 SegWit v0 signature hash.
    ///
    /// `input_index` — the input being signed.
    /// `script_code` — the script being executed.  For P2WPKH this is
    ///   `OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG`.
    ///   For P2WSH this is the witness script.
    /// `value` — the value (in satoshis) of the prevout being spent by
    ///   this input.
    ///
    /// Returns `SHA256d(msg)` as specified in BIP-143.
    pub fn segwit_v0_signature_hash(
        &self,
        input_index: usize,
        script_code: &[u8],
        value: u64,
    ) -> Result<[u8; 32], TxError> {
        self.segwit_v0_signature_hash_with_type(input_index, script_code, value, SIGHASH_ALL)
    }

    /// BIP-143 SegWit v0 signature hash with explicit sighash type.
    pub fn segwit_v0_signature_hash_with_type(
        &self,
        input_index: usize,
        script_code: &[u8],
        value: u64,
        sighash_type: u32,
    ) -> Result<[u8; 32], TxError> {
        if input_index >= self.inputs.len() {
            return Err(TxError::IndexOutOfBounds(format!(
                "input {} of {}",
                input_index,
                self.inputs.len()
            )));
        }

        let base_type = sighash_type & 0x1f;
        let anyone_can_pay = sighash_type & SIGHASH_ANYONECANPAY != 0;

        // hashPrevouts = SHA256d( for each input: prev_txid || le32(prev_vout) )
        // ANYONECANPAY => zeroed
        let hash_prevouts = if anyone_can_pay {
            [0u8; 32]
        } else {
            let mut data = Vec::with_capacity(self.inputs.len() * 36);
            for inp in &self.inputs {
                data.extend_from_slice(&inp.prev_output.txid);
                data.extend_from_slice(&inp.prev_output.vout.to_le_bytes());
            }
            let h1 = Sha256::digest(&data);
            Sha256::digest(h1).into()
        };

        // hashSequence = SHA256d( for each input: le32(sequence) )
        // ANYONECANPAY or NONE or SINGLE => zeroed
        let hash_sequence = if anyone_can_pay || base_type == SIGHASH_NONE || base_type == SIGHASH_SINGLE {
            [0u8; 32]
        } else {
            let mut data = Vec::with_capacity(self.inputs.len() * 4);
            for inp in &self.inputs {
                data.extend_from_slice(&inp.sequence.to_le_bytes());
            }
            let h1 = Sha256::digest(&data);
            Sha256::digest(h1).into()
        };

        // hashOutputs:
        //   ALL => SHA256d of all outputs
        //   SINGLE => SHA256d of only the output at input_index (or zeroed if out of range)
        //   NONE => zeroed
        let hash_outputs = if base_type == SIGHASH_NONE {
            [0u8; 32]
        } else if base_type == SIGHASH_SINGLE {
            if input_index < self.outputs.len() {
                let out = &self.outputs[input_index];
                let mut data = Vec::new();
                data.extend_from_slice(&out.value.to_le_bytes());
                let len = out.script_pubkey.len();
                if len < 0xfd {
                    data.push(len as u8);
                } else if len <= 0xffff {
                    data.push(0xfd);
                    data.extend_from_slice(&(len as u16).to_le_bytes());
                } else {
                    data.push(0xfe);
                    data.extend_from_slice(&(len as u32).to_le_bytes());
                }
                data.extend_from_slice(&out.script_pubkey);
                let h1 = Sha256::digest(&data);
                Sha256::digest(h1).into()
            } else {
                [0u8; 32]
            }
        } else {
            // SIGHASH_ALL
            let mut data = Vec::new();
            for out in &self.outputs {
                data.extend_from_slice(&out.value.to_le_bytes());
                let len = out.script_pubkey.len();
                if len < 0xfd {
                    data.push(len as u8);
                } else if len <= 0xffff {
                    data.push(0xfd);
                    data.extend_from_slice(&(len as u16).to_le_bytes());
                } else {
                    data.push(0xfe);
                    data.extend_from_slice(&(len as u32).to_le_bytes());
                }
                data.extend_from_slice(&out.script_pubkey);
            }
            let h1 = Sha256::digest(&data);
            Sha256::digest(h1).into()
        };

        let inp = &self.inputs[input_index];

        // Assemble the BIP-143 preimage:
        //   nVersion || hashPrevouts || hashSequence ||
        //   outpoint || scriptCode || value || nSequence ||
        //   hashOutputs || nLockTime || nHashType
        let mut msg = Vec::with_capacity(156 + script_code.len());
        msg.extend_from_slice(&self.version.to_le_bytes());      // 4
        msg.extend_from_slice(&hash_prevouts);                    // 32
        msg.extend_from_slice(&hash_sequence);                    // 32
        // outpoint being signed
        msg.extend_from_slice(&inp.prev_output.txid);             // 32
        msg.extend_from_slice(&inp.prev_output.vout.to_le_bytes()); // 4
        // scriptCode with compact-size length prefix
        let sc_len = script_code.len();
        if sc_len < 0xfd {
            msg.push(sc_len as u8);
        } else if sc_len <= 0xffff {
            msg.push(0xfd);
            msg.extend_from_slice(&(sc_len as u16).to_le_bytes());
        } else {
            msg.push(0xfe);
            msg.extend_from_slice(&(sc_len as u32).to_le_bytes());
        }
        msg.extend_from_slice(script_code);
        msg.extend_from_slice(&value.to_le_bytes());              // 8
        msg.extend_from_slice(&inp.sequence.to_le_bytes());       // 4
        msg.extend_from_slice(&hash_outputs);                     // 32
        msg.extend_from_slice(&self.lock_time.to_le_bytes());     // 4
        msg.extend_from_slice(&sighash_type.to_le_bytes());       // 4

        // Double SHA-256
        let h1 = Sha256::digest(&msg);
        let h2: [u8; 32] = Sha256::digest(h1).into();
        Ok(h2)
    }

    /// BIP-341 Taproot key-path signature hash.
    ///
    /// `prevout_amounts` and `prevout_scripts` must have the same length as
    /// `self.inputs` and correspond 1:1 to each input's previous output.
    ///
    /// `hash_type`: `0x00` SIGHASH_DEFAULT, `0x01` ALL, `0x02` NONE,
    /// `0x03` SINGLE, `0x81` ALL|ANYONECANPAY, `0x82` NONE|ANYONECANPAY,
    /// `0x83` SINGLE|ANYONECANPAY.
    ///
    /// Implements BIP-341 §4.1 `tagged_hash("TapSighash", <msg>)`.
    pub fn taproot_signature_hash(
        &self,
        input_index: usize,
        prevout_amounts: &[u64],
        prevout_scripts: &[Vec<u8>],
        hash_type: u8,
    ) -> Result<[u8; 32], TxError> {
        if input_index >= self.inputs.len() {
            return Err(TxError::IndexOutOfBounds(format!(
                "input {} of {}",
                input_index,
                self.inputs.len()
            )));
        }
        if prevout_amounts.len() != self.inputs.len()
            || prevout_scripts.len() != self.inputs.len()
        {
            return Err(TxError::Serialization(
                "prevout_amounts/prevout_scripts length mismatch".into(),
            ));
        }

        let base_type = hash_type & 0x1f; // 0x00/0x01 = ALL, 0x02 = NONE, 0x03 = SINGLE
        let anyone_can_pay = hash_type & 0x80 != 0;
        let is_all = base_type == 0x00 || base_type == 0x01; // DEFAULT or ALL

        // --- assemble sighash message ---
        let mut msg = Vec::with_capacity(250);
        msg.push(0x00); // epoch
        msg.push(hash_type);
        msg.extend_from_slice(&(self.version as u32).to_le_bytes());
        msg.extend_from_slice(&self.lock_time.to_le_bytes());

        // Common input data (only when NOT ANYONECANPAY)
        if !anyone_can_pay {
            // sha_prevouts
            let mut h = Sha256::new();
            for inp in &self.inputs {
                h.update(inp.prev_output.txid);
                h.update(inp.prev_output.vout.to_le_bytes());
            }
            msg.extend_from_slice(&h.finalize());

            // sha_amounts
            let mut h = Sha256::new();
            for &amt in prevout_amounts {
                h.update(amt.to_le_bytes());
            }
            msg.extend_from_slice(&h.finalize());

            // sha_scriptpubkeys
            let mut h = Sha256::new();
            for spk in prevout_scripts {
                let len = spk.len();
                if len < 0xfd {
                    h.update([len as u8]);
                } else if len <= 0xffff {
                    h.update([0xfd]);
                    h.update((len as u16).to_le_bytes());
                } else {
                    h.update([0xfe]);
                    h.update((len as u32).to_le_bytes());
                }
                h.update(spk);
            }
            msg.extend_from_slice(&h.finalize());

            // sha_sequences
            let mut h = Sha256::new();
            for inp in &self.inputs {
                h.update(inp.sequence.to_le_bytes());
            }
            msg.extend_from_slice(&h.finalize());
        }

        // Common output data (only for ALL/DEFAULT)
        if is_all {
            let mut h = Sha256::new();
            for out in &self.outputs {
                h.update(out.value.to_le_bytes());
                let len = out.script_pubkey.len();
                if len < 0xfd {
                    h.update([len as u8]);
                } else if len <= 0xffff {
                    h.update([0xfd]);
                    h.update((len as u16).to_le_bytes());
                } else {
                    h.update([0xfe]);
                    h.update((len as u32).to_le_bytes());
                }
                h.update(&out.script_pubkey);
            }
            msg.extend_from_slice(&h.finalize());
        }

        // spend_type = 0x00 (key-path, no annex)
        msg.push(0x00);

        // Per-input data
        if anyone_can_pay {
            // Serialize just this input's prevout, amount, script, sequence
            let inp = &self.inputs[input_index];
            msg.extend_from_slice(&inp.prev_output.txid);
            msg.extend_from_slice(&inp.prev_output.vout.to_le_bytes());
            msg.extend_from_slice(&prevout_amounts[input_index].to_le_bytes());
            let spk = &prevout_scripts[input_index];
            let len = spk.len();
            if len < 0xfd {
                msg.push(len as u8);
            } else if len <= 0xffff {
                msg.push(0xfd);
                msg.extend_from_slice(&(len as u16).to_le_bytes());
            } else {
                msg.push(0xfe);
                msg.extend_from_slice(&(len as u32).to_le_bytes());
            }
            msg.extend_from_slice(spk);
            msg.extend_from_slice(&inp.sequence.to_le_bytes());
        } else {
            msg.extend_from_slice(&(input_index as u32).to_le_bytes());
        }

        // SIGHASH_SINGLE: include sha of the single output at input_index
        if base_type == 0x03 {
            if input_index < self.outputs.len() {
                let out = &self.outputs[input_index];
                let mut h = Sha256::new();
                h.update(out.value.to_le_bytes());
                let len = out.script_pubkey.len();
                if len < 0xfd {
                    h.update([len as u8]);
                } else if len <= 0xffff {
                    h.update([0xfd]);
                    h.update((len as u16).to_le_bytes());
                } else {
                    h.update([0xfe]);
                    h.update((len as u32).to_le_bytes());
                }
                h.update(&out.script_pubkey);
                msg.extend_from_slice(&h.finalize());
            } else {
                msg.extend_from_slice(&[0u8; 32]);
            }
        }

        Ok(schnorr::tagged_hash(b"TapSighash", &msg))
    }

    /// Sign an input with a private key
    /// This modifies the transaction by setting the script_sig for the input
    pub fn sign_input(
        &mut self,
        input_index: usize,
        private_key: &PrivateKey,
    ) -> Result<(), TxError> {
        if input_index >= self.inputs.len() {
            return Err(TxError::IndexOutOfBounds(format!(
                "input {} of {}",
                input_index,
                self.inputs.len()
            )));
        }

        // Calculate signature hash
        let sighash = self.signature_hash(input_index)?;

        // Sign with private key
        let signature = private_key.sign(&sighash);
        let pubkey = private_key.public_key();

        // Create script_sig
        let script = Script::new_p2pkh_sig(&signature, &pubkey);
        self.inputs[input_index].script_sig = script.bytes;

        Ok(())
    }
}

/// Compact-size encoding length (Bitcoin CompactSize).
fn compact_size_len(n: usize) -> usize {
    if n < 0xfd { 1 } else if n <= 0xffff { 3 } else if n <= 0xffff_ffff { 5 } else { 9 }
}

/// Write a compact-size (Bitcoin variable-length integer) to a byte buffer.
fn write_compact_size(data: &mut Vec<u8>, n: usize) {
    if n < 0xfd {
        data.push(n as u8);
    } else if n <= 0xffff {
        data.push(0xfd);
        data.extend_from_slice(&(n as u16).to_le_bytes());
    } else if n <= 0xffff_ffff {
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

    #[test]
    fn test_coinbase_creation() {
        let coinbase = Transaction::new_coinbase(0, 50_000_000, vec![0x01]);

        assert!(coinbase.is_coinbase());
        assert_eq!(coinbase.inputs.len(), 1);
        assert_eq!(coinbase.outputs.len(), 1);
        assert_eq!(coinbase.outputs[0].value, 50_000_000);
    }

    #[test]
    fn test_transaction_creation() {
        let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
        let output = TxOutput::new(100, vec![0x01]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        assert!(!tx.is_coinbase());
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);
    }

    #[test]
    fn test_txid_deterministic() {
        let tx = Transaction::new_coinbase(0, 50_000_000, vec![0x01]);

        let txid1 = tx.txid();
        let txid2 = tx.txid();

        assert_eq!(txid1, txid2);
    }

    #[test]
    fn test_txid_changes() {
        let tx1 = Transaction::new_coinbase(0, 50_000_000, vec![0x01]);
        let tx2 = Transaction::new_coinbase(1, 50_000_000, vec![0x01]);

        assert_ne!(tx1.txid(), tx2.txid());
    }

    #[test]
    fn test_total_output_value() {
        let outputs = vec![
            TxOutput::new(100, vec![]),
            TxOutput::new(200, vec![]),
            TxOutput::new(300, vec![]),
        ];
        let tx = Transaction::new(vec![], outputs, 0);

        assert_eq!(tx.total_output_value(), Some(600));
    }

    #[test]
    fn test_taproot_sighash_default_vs_all_differ() {
        // BIP-341: SIGHASH_DEFAULT (0x00) and SIGHASH_ALL (0x01) commit to
        // the same data but produce distinct digests because the hash_type
        // byte itself is part of the message.
        let input = TxInput::new(OutPoint::new([0xaa; 32], 0), vec![]);
        let output = TxOutput::new(50_000, vec![0x51, 0x20, /* 32-byte key */ 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        let amounts = &[100_000u64];
        let scripts: Vec<Vec<u8>> = vec![vec![0x51, 0x20, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20]];

        let hash_default = tx.taproot_signature_hash(0, amounts, &scripts, 0x00).unwrap();
        let hash_all = tx.taproot_signature_hash(0, amounts, &scripts, 0x01).unwrap();

        assert_ne!(hash_default, hash_all, "SIGHASH_DEFAULT and SIGHASH_ALL must produce different digests");
    }

    #[test]
    fn test_taproot_sighash_deterministic() {
        let input = TxInput::new(OutPoint::new([0xbb; 32], 1), vec![]);
        let output = TxOutput::new(40_000, vec![0x00, 0x14, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        let amounts = &[80_000u64];
        let scripts: Vec<Vec<u8>> = vec![vec![0x51, 0x20, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]];

        let h1 = tx.taproot_signature_hash(0, amounts, &scripts, 0x00).unwrap();
        let h2 = tx.taproot_signature_hash(0, amounts, &scripts, 0x00).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_taproot_sighash_out_of_bounds() {
        let input = TxInput::new(OutPoint::new([0xcc; 32], 0), vec![]);
        let output = TxOutput::new(1000, vec![0x00]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        let amounts = &[2000u64];
        let scripts: Vec<Vec<u8>> = vec![vec![0x00]];

        // input_index out of bounds
        assert!(tx.taproot_signature_hash(5, amounts, &scripts, 0x00).is_err());
    }

    #[test]
    fn test_taproot_sighash_length_mismatch() {
        let input = TxInput::new(OutPoint::new([0xdd; 32], 0), vec![]);
        let output = TxOutput::new(1000, vec![0x00]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        // Mismatched lengths
        let amounts = &[2000u64, 3000u64]; // 2 amounts for 1 input
        let scripts: Vec<Vec<u8>> = vec![vec![0x00]];

        assert!(tx.taproot_signature_hash(0, amounts, &scripts, 0x00).is_err());
    }
}
