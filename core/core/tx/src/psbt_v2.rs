//! # BIP-370: PSBT Version 2
//!
//! This module implements PSBT Version 2, which extends BIP-174 with:
//! - Separate input and output maps
//! - Modifiable flag for dynamic transaction construction
//! - Better support for fee bumping (RBF)
//! - Proprietary fields for wallet-specific data
//!
//! ## Key Improvements over PSBT v1
//!
//! 1. **Modifiable Flag**: Allows adding/removing inputs/outputs during signing
//! 2. **Version Field**: Explicit version number (0x02)
//! 3. **Separate Maps**: Input/output metadata separated from global map
//! 4. **Better Fee Calculation**: Native support for fee computation
//! 5. **Proprietary Extensions**: Wallet-specific fields with namespace

use crate::{PrivateKey, Transaction, TxInput, TxOutput, OutPoint};
use crate::input::Witness;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// PSBT Version 2
pub const PSBT_VERSION_2: u32 = 2;

/// Taproot BIP-32 derivation for PSBT v2: pubkey -> (leaf_hashes, path, fingerprint)
type TapBip32DerivationV2 = HashMap<Vec<u8>, (Vec<Vec<u8>>, Vec<u32>, [u8; 4])>;

/// Modifiable flags
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ModifiableFlags {
    /// Inputs can be added/removed
    pub inputs_modifiable: bool,

    /// Outputs can be added/removed
    pub outputs_modifiable: bool,

    /// Single signature inputs can be added
    pub sighash_single: bool,
}

/// PSBT v2 global map
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsbtV2Global {
    /// Version number (must be 2)
    pub version: u32,

    /// Transaction version
    pub tx_version: u32,

    /// Fallback locktime (if no input locktime)
    pub fallback_locktime: Option<u32>,

    /// Input count
    pub input_count: usize,

    /// Output count
    pub output_count: usize,

    /// Modifiable flags
    pub modifiable: ModifiableFlags,

    /// Proprietary fields (namespace → key → value)
    pub proprietary: HashMap<Vec<u8>, HashMap<Vec<u8>, Vec<u8>>>,

    /// Unknown fields
    pub unknowns: HashMap<Vec<u8>, Vec<u8>>,
}

/// PSBT v2 input
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PsbtV2Input {
    /// Previous transaction output
    pub previous_txid: [u8; 32],
    /// Previous output index
    pub previous_vout: u32,
    /// Sequence number
    pub sequence: Option<u32>,
    /// Required time-based locktime
    pub required_time_locktime: Option<u32>,
    /// Required height-based locktime
    pub required_height_locktime: Option<u32>,

    /// Witness/signature data
    pub partial_sigs: HashMap<Vec<u8>, Vec<u8>>,
    /// Sighash type
    pub sighash_type: Option<u32>,
    /// Redeem script (P2SH)
    pub redeem_script: Option<Vec<u8>>,
    /// Witness script (P2WSH)
    pub witness_script: Option<Vec<u8>>,

    /// BIP-32 derivation paths
    pub bip32_derivation: HashMap<Vec<u8>, (Vec<u32>, [u8; 4])>,

    /// Final scriptSig/witness
    /// Final scriptSig
    pub final_script_sig: Option<Vec<u8>>,
    /// Final script witness
    pub final_script_witness: Option<Vec<Vec<u8>>>,

    /// UTXO data (v2 requires one of these)
    pub witness_utxo: Option<TxOut>,
    /// Non-witness UTXO data (full previous transaction).
    pub non_witness_utxo: Option<Vec<u8>>,

    /// Taproot fields (BIP-371)
    /// Taproot key signature
    pub tap_key_sig: Option<Vec<u8>>,
    /// Taproot script signatures
    pub tap_script_sig: Vec<(Vec<u8>, Vec<u8>)>,
    /// Taproot leaf scripts
    pub tap_leaf_script: Vec<(Vec<u8>, u8)>,
    /// Taproot BIP-32 derivation paths
    pub tap_bip32_derivation: TapBip32DerivationV2,

    /// Unknown fields
    pub unknowns: HashMap<Vec<u8>, Vec<u8>>,
}

/// PSBT v2 output
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PsbtV2Output {
    /// Output amount (optional for non-witness outputs)
    pub amount: Option<u64>,

    /// Output script
    pub script_pubkey: Vec<u8>,

    /// Redeem script (P2SH)
    pub redeem_script: Option<Vec<u8>>,

    /// Witness script (P2WSH)
    pub witness_script: Option<Vec<u8>>,

    /// BIP-32 derivation paths
    pub bip32_derivation: HashMap<Vec<u8>, (Vec<u32>, [u8; 4])>,

    /// Taproot fields
    pub tap_internal_key: Option<Vec<u8>>,
    /// Taproot tree serialisation.
    pub tap_tree: Option<Vec<u8>>,
    /// Taproot BIP-32 derivation paths.
    pub tap_bip32_derivation: TapBip32DerivationV2,

    /// Proprietary fields
    pub proprietary: HashMap<Vec<u8>, HashMap<Vec<u8>, Vec<u8>>>,

    /// Unknown fields
    pub unknowns: HashMap<Vec<u8>, Vec<u8>>,
}

/// Transaction output reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxOut {
    /// Output amount in satoshis
    pub amount: u64,
    /// Output script
    pub script_pubkey: Vec<u8>,
}

/// Complete PSBT v2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsbtV2 {
    /// Global fields
    pub global: PsbtV2Global,
    /// Per-input fields
    pub inputs: Vec<PsbtV2Input>,
    /// Per-output fields
    pub outputs: Vec<PsbtV2Output>,
}

/// PSBT v2 errors
#[allow(missing_docs)]
#[derive(Debug, Clone, PartialEq)]
pub enum PsbtV2Error {
    InvalidVersion,
    InputCountMismatch,
    OutputCountMismatch,
    NotModifiable,
    MissingUtxo,
    InvalidSignature,
    IncompletePsbt,
}

impl PsbtV2 {
    /// Create new PSBT v2
    pub fn new(tx_version: u32, input_count: usize, output_count: usize) -> Self {
        Self {
            global: PsbtV2Global {
                version: PSBT_VERSION_2,
                tx_version,
                fallback_locktime: None,
                input_count,
                output_count,
                modifiable: ModifiableFlags {
                    inputs_modifiable: true,
                    outputs_modifiable: true,
                    sighash_single: false,
                },
                proprietary: HashMap::new(),
                unknowns: HashMap::new(),
            },
            inputs: vec![PsbtV2Input::default(); input_count],
            outputs: vec![PsbtV2Output::default(); output_count],
        }
    }

    /// Add input (if modifiable)
    pub fn add_input(&mut self, input: PsbtV2Input) -> Result<(), PsbtV2Error> {
        if !self.global.modifiable.inputs_modifiable {
            return Err(PsbtV2Error::NotModifiable);
        }

        self.inputs.push(input);
        self.global.input_count += 1;
        Ok(())
    }

    /// Add output (if modifiable)
    pub fn add_output(&mut self, output: PsbtV2Output) -> Result<(), PsbtV2Error> {
        if !self.global.modifiable.outputs_modifiable {
            return Err(PsbtV2Error::NotModifiable);
        }

        self.outputs.push(output);
        self.global.output_count += 1;
        Ok(())
    }

    /// Remove input (if modifiable)
    pub fn remove_input(&mut self, index: usize) -> Result<(), PsbtV2Error> {
        if !self.global.modifiable.inputs_modifiable {
            return Err(PsbtV2Error::NotModifiable);
        }

        if index >= self.inputs.len() {
            return Err(PsbtV2Error::InputCountMismatch);
        }

        self.inputs.remove(index);
        self.global.input_count -= 1;
        Ok(())
    }

    /// Calculate total input value
    pub fn total_input_value(&self) -> Result<u64, PsbtV2Error> {
        let mut total = 0u64;
        for input in &self.inputs {
            let amount = if let Some(utxo) = &input.witness_utxo {
                utxo.amount
            } else {
                return Err(PsbtV2Error::MissingUtxo);
            };
            total = total
                .checked_add(amount)
                .ok_or(PsbtV2Error::InvalidSignature)?;
        }
        Ok(total)
    }

    /// Calculate total output value
    pub fn total_output_value(&self) -> u64 {
        self.outputs.iter().filter_map(|o| o.amount).sum()
    }

    /// Calculate fee
    pub fn fee(&self) -> Result<u64, PsbtV2Error> {
        let input_total = self.total_input_value()?;
        let output_total = self.total_output_value();

        input_total
            .checked_sub(output_total)
            .ok_or(PsbtV2Error::InvalidSignature)
    }

    /// Check if ready to finalize
    pub fn is_ready(&self) -> bool {
        self.inputs.iter().all(|input| {
            input.final_script_sig.is_some()
                || input.final_script_witness.is_some()
                || !input.partial_sigs.is_empty()
        })
    }

    /// Add proprietary field to global map
    pub fn add_proprietary_global(&mut self, namespace: Vec<u8>, key: Vec<u8>, value: Vec<u8>) {
        self.global
            .proprietary
            .entry(namespace)
            .or_default()
            .insert(key, value);
    }

    /// Get proprietary field from global map
    pub fn get_proprietary_global(&self, namespace: &[u8], key: &[u8]) -> Option<&[u8]> {
        self.global.proprietary.get(namespace)?.get(key).map(|v| v.as_slice())
    }

    /// Sign a single input (Signer role)
    ///
    /// Constructs an unsigned transaction from v2 fields, computes the
    /// sighash, signs with the given key, and stores the partial signature.
    pub fn sign_input(
        &mut self,
        index: usize,
        private_key: &PrivateKey,
    ) -> Result<(), PsbtV2Error> {
        if index >= self.inputs.len() {
            return Err(PsbtV2Error::InputCountMismatch);
        }

        // Build an unsigned transaction from v2 fields for sighash computation
        let tx = self.to_unsigned_tx()?;
        let sighash = tx
            .signature_hash(index)
            .map_err(|_| PsbtV2Error::InvalidSignature)?;

        let pubkey = private_key.public_key();
        let sig = private_key.sign(&sighash);
        let mut sig_bytes = sig.serialize_der().to_vec();
        sig_bytes.push(0x01); // SIGHASH_ALL

        self.inputs[index]
            .partial_sigs
            .insert(pubkey.to_bytes(), sig_bytes);
        Ok(())
    }

    /// Build an unsigned `Transaction` from the v2 global/input/output maps.
    pub fn to_unsigned_tx(&self) -> Result<Transaction, PsbtV2Error> {
        let inputs: Vec<TxInput> = self
            .inputs
            .iter()
            .map(|inp| {
                let outpoint = OutPoint::new(inp.previous_txid, inp.previous_vout);
                let mut ti = TxInput::new(outpoint, vec![]);
                ti.sequence = inp.sequence.unwrap_or(0xFFFF_FFFF);
                ti
            })
            .collect();

        let outputs: Vec<TxOutput> = self
            .outputs
            .iter()
            .map(|out| TxOutput::new(out.amount.unwrap_or(0), out.script_pubkey.clone()))
            .collect();

        let locktime = self.global.fallback_locktime.unwrap_or(0);
        let mut tx = Transaction::new(inputs, outputs, locktime);
        tx.version = self.global.tx_version;
        Ok(tx)
    }

    /// Finalize the PSBT v2 into a signed `Transaction` (Finalizer role)
    ///
    /// For each input that already has `final_script_sig` or
    /// `final_script_witness` those are used directly. Otherwise a P2PKH
    /// scriptSig is assembled from the single partial signature.
    pub fn finalize(&mut self) -> Result<Transaction, PsbtV2Error> {
        if !self.is_ready() {
            return Err(PsbtV2Error::IncompletePsbt);
        }

        let mut tx = self.to_unsigned_tx()?;

        for (i, input) in self.inputs.iter_mut().enumerate() {
            if let Some(ref final_sig) = input.final_script_sig {
                tx.inputs[i].script_sig = final_sig.clone();
            } else if let Some(ref witness) = input.final_script_witness {
                tx.inputs[i].witness = Witness { stack: witness.clone() };
            } else if !input.partial_sigs.is_empty() {
                // Assemble P2PKH scriptSig: <sig_len> <sig> <pubkey_len> <pubkey>
                let (pubkey, sig) = input.partial_sigs.iter().next().unwrap();
                let mut script_sig = Vec::new();
                script_sig.push(sig.len() as u8);
                script_sig.extend_from_slice(sig);
                script_sig.push(pubkey.len() as u8);
                script_sig.extend_from_slice(pubkey);
                input.final_script_sig = Some(script_sig.clone());
                tx.inputs[i].script_sig = script_sig;
            } else {
                return Err(PsbtV2Error::IncompletePsbt);
            }
        }

        Ok(tx)
    }

    /// Combine another PSBT v2 into this one (Combiner role)
    pub fn combine(&mut self, other: &PsbtV2) -> Result<(), PsbtV2Error> {
        if self.global.input_count != other.global.input_count
            || self.global.output_count != other.global.output_count
        {
            return Err(PsbtV2Error::InputCountMismatch);
        }

        for (i, other_input) in other.inputs.iter().enumerate() {
            let inp = &mut self.inputs[i];
            for (pk, sig) in &other_input.partial_sigs {
                inp.partial_sigs.entry(pk.clone()).or_insert_with(|| sig.clone());
            }
            if inp.witness_utxo.is_none() && other_input.witness_utxo.is_some() {
                inp.witness_utxo = other_input.witness_utxo.clone();
            }
            if inp.redeem_script.is_none() && other_input.redeem_script.is_some() {
                inp.redeem_script = other_input.redeem_script.clone();
            }
            if inp.witness_script.is_none() && other_input.witness_script.is_some() {
                inp.witness_script = other_input.witness_script.clone();
            }
        }
        Ok(())
    }

    // ── BIP-370 binary serialization ──────────────────────────────

    /// Magic bytes for PSBT v2 binary format.
    const MAGIC: &'static [u8; 5] = b"psbt\xff";

    /// Serialize to BIP-370 binary format.
    ///
    /// Layout: `psbt\xff` + global key-value map + per-input maps + per-output maps.
    /// Each map is terminated by 0x00.
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(Self::MAGIC);

        // Global map
        Self::write_kv(&mut buf, 0xFB, &[], &self.global.version.to_le_bytes()); // PSBT_GLOBAL_VERSION
        Self::write_kv(&mut buf, 0x02, &[], &self.global.tx_version.to_le_bytes()); // PSBT_GLOBAL_TX_VERSION
        if let Some(lt) = self.global.fallback_locktime {
            Self::write_kv(&mut buf, 0x03, &[], &lt.to_le_bytes()); // PSBT_GLOBAL_FALLBACK_LOCKTIME
        }
        Self::write_kv(
            &mut buf,
            0x04,
            &[],
            &Self::encode_compact_size(self.global.input_count as u64),
        ); // PSBT_GLOBAL_INPUT_COUNT
        Self::write_kv(
            &mut buf,
            0x05,
            &[],
            &Self::encode_compact_size(self.global.output_count as u64),
        ); // PSBT_GLOBAL_OUTPUT_COUNT
        let mflags: u8 = (self.global.modifiable.inputs_modifiable as u8)
            | ((self.global.modifiable.outputs_modifiable as u8) << 1)
            | ((self.global.modifiable.sighash_single as u8) << 2);
        Self::write_kv(&mut buf, 0x06, &[], &[mflags]); // PSBT_GLOBAL_TX_MODIFIABLE
        buf.push(0x00); // separator

        // Per-input maps
        for inp in &self.inputs {
            Self::write_kv(&mut buf, 0x0e, &[], &inp.previous_txid); // PSBT_IN_PREVIOUS_TXID
            Self::write_kv(&mut buf, 0x0f, &[], &inp.previous_vout.to_le_bytes()); // PSBT_IN_OUTPUT_INDEX
            if let Some(seq) = inp.sequence {
                Self::write_kv(&mut buf, 0x10, &[], &seq.to_le_bytes()); // PSBT_IN_SEQUENCE
            }
            for (pk, sig) in &inp.partial_sigs {
                Self::write_kv(&mut buf, 0x02, pk, sig); // PSBT_IN_PARTIAL_SIG
            }
            if let Some(ref utxo) = inp.witness_utxo {
                let mut v = utxo.amount.to_le_bytes().to_vec();
                v.extend(Self::encode_compact_size(utxo.script_pubkey.len() as u64));
                v.extend(&utxo.script_pubkey);
                Self::write_kv(&mut buf, 0x01, &[], &v); // PSBT_IN_WITNESS_UTXO
            }
            if let Some(ref fs) = inp.final_script_sig {
                Self::write_kv(&mut buf, 0x07, &[], fs); // PSBT_IN_FINAL_SCRIPTSIG
            }
            if let Some(ref fw) = inp.final_script_witness {
                let mut v = Self::encode_compact_size(fw.len() as u64);
                for item in fw {
                    v.extend(Self::encode_compact_size(item.len() as u64));
                    v.extend(item);
                }
                Self::write_kv(&mut buf, 0x08, &[], &v); // PSBT_IN_FINAL_SCRIPTWITNESS
            }
            buf.push(0x00);
        }

        // Per-output maps
        for out in &self.outputs {
            if let Some(amt) = out.amount {
                Self::write_kv(&mut buf, 0x03, &[], &amt.to_le_bytes()); // PSBT_OUT_AMOUNT
            }
            Self::write_kv(&mut buf, 0x04, &[], &out.script_pubkey); // PSBT_OUT_SCRIPT
            buf.push(0x00);
        }

        buf
    }

    /// Deserialize from BIP-370 binary format.
    pub fn deserialize(data: &[u8]) -> Result<Self, PsbtV2Error> {
        if data.len() < 5 || &data[..5] != Self::MAGIC.as_slice() {
            return Err(PsbtV2Error::InvalidVersion);
        }
        let mut cursor = 5;

        // Parse global map
        let mut version = PSBT_VERSION_2;
        let mut tx_version = 2u32;
        let mut fallback_locktime = None;
        let mut input_count = 0usize;
        let mut output_count = 0usize;
        let mut modifiable = ModifiableFlags {
            inputs_modifiable: false,
            outputs_modifiable: false,
            sighash_single: false,
        };

        while cursor < data.len() && data[cursor] != 0x00 {
            let (key_type, key_data, value, new_cursor) = Self::read_kv(data, cursor)?;
            cursor = new_cursor;
            match key_type {
                0xFB => {
                    if value.len() >= 4 {
                        version = u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                    }
                }
                0x02 if key_data.is_empty() => {
                    if value.len() >= 4 {
                        tx_version =
                            u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                    }
                }
                0x03 if key_data.is_empty() => {
                    if value.len() >= 4 {
                        fallback_locktime = Some(u32::from_le_bytes([
                            value[0], value[1], value[2], value[3],
                        ]));
                    }
                }
                0x04 => {
                    let (n, _) = Self::read_compact_size(&value, 0).unwrap_or((0, 0));
                    input_count = n as usize;
                }
                0x05 => {
                    let (n, _) = Self::read_compact_size(&value, 0).unwrap_or((0, 0));
                    output_count = n as usize;
                }
                0x06 => {
                    if !value.is_empty() {
                        modifiable.inputs_modifiable = value[0] & 1 != 0;
                        modifiable.outputs_modifiable = value[0] & 2 != 0;
                        modifiable.sighash_single = value[0] & 4 != 0;
                    }
                }
                _ => {} // skip unknowns
            }
        }
        if cursor < data.len() {
            cursor += 1; // skip separator
        }

        // Parse per-input maps
        let mut inputs = Vec::with_capacity(input_count);
        for _ in 0..input_count {
            let mut inp = PsbtV2Input::default();
            while cursor < data.len() && data[cursor] != 0x00 {
                let (key_type, key_data, value, new_cursor) = Self::read_kv(data, cursor)?;
                cursor = new_cursor;
                match key_type {
                    0x0e => {
                        if value.len() == 32 {
                            inp.previous_txid.copy_from_slice(&value);
                        }
                    }
                    0x0f => {
                        if value.len() >= 4 {
                            inp.previous_vout =
                                u32::from_le_bytes([value[0], value[1], value[2], value[3]]);
                        }
                    }
                    0x10 => {
                        if value.len() >= 4 {
                            inp.sequence = Some(u32::from_le_bytes([
                                value[0], value[1], value[2], value[3],
                            ]));
                        }
                    }
                    0x02 => {
                        inp.partial_sigs.insert(key_data, value);
                    }
                    0x01 if key_data.is_empty() => {
                        if value.len() >= 8 {
                            let amount =
                                u64::from_le_bytes(value[..8].try_into().unwrap());
                            let spk = value[8..].to_vec();
                            // strip compact-size prefix from script
                            let (spk_len, off) =
                                Self::read_compact_size(&spk, 0).unwrap_or((0, 0));
                            let script = if off > 0
                                && off + spk_len as usize <= spk.len()
                            {
                                spk[off..off + spk_len as usize].to_vec()
                            } else {
                                spk
                            };
                            inp.witness_utxo = Some(TxOut {
                                amount,
                                script_pubkey: script,
                            });
                        }
                    }
                    0x07 => inp.final_script_sig = Some(value),
                    0x08 => {
                        // decode witness stack
                        let (count, off) =
                            Self::read_compact_size(&value, 0).unwrap_or((0, 0));
                        let mut wi = off;
                        let mut items = Vec::new();
                        for _ in 0..count {
                            let (ilen, ioff) = Self::read_compact_size(&value, wi)
                                .unwrap_or((0, 0));
                            wi = ioff;
                            if wi + ilen as usize <= value.len() {
                                items.push(value[wi..wi + ilen as usize].to_vec());
                                wi += ilen as usize;
                            }
                        }
                        inp.final_script_witness = Some(items);
                    }
                    _ => {}
                }
            }
            if cursor < data.len() {
                cursor += 1;
            }
            inputs.push(inp);
        }

        // Parse per-output maps
        let mut outputs = Vec::with_capacity(output_count);
        for _ in 0..output_count {
            let mut out = PsbtV2Output::default();
            while cursor < data.len() && data[cursor] != 0x00 {
                let (key_type, _key_data, value, new_cursor) = Self::read_kv(data, cursor)?;
                cursor = new_cursor;
                match key_type {
                    0x03 => {
                        if value.len() >= 8 {
                            out.amount =
                                Some(u64::from_le_bytes(value[..8].try_into().unwrap()));
                        }
                    }
                    0x04 => out.script_pubkey = value,
                    _ => {}
                }
            }
            if cursor < data.len() {
                cursor += 1;
            }
            outputs.push(out);
        }

        Ok(Self {
            global: PsbtV2Global {
                version,
                tx_version,
                fallback_locktime,
                input_count,
                output_count,
                modifiable,
                proprietary: HashMap::new(),
                unknowns: HashMap::new(),
            },
            inputs,
            outputs,
        })
    }

    // ── helpers ────────────────────────────────────────────────────

    fn write_kv(buf: &mut Vec<u8>, key_type: u8, key_data: &[u8], value: &[u8]) {
        // key = compact_size(1 + key_data.len()) ++ key_type ++ key_data
        let key_len = 1 + key_data.len();
        buf.extend(Self::encode_compact_size(key_len as u64));
        buf.push(key_type);
        buf.extend_from_slice(key_data);
        // value
        buf.extend(Self::encode_compact_size(value.len() as u64));
        buf.extend_from_slice(value);
    }

    fn read_kv(data: &[u8], pos: usize) -> Result<(u8, Vec<u8>, Vec<u8>, usize), PsbtV2Error> {
        let (key_len, off) = Self::read_compact_size(data, pos).ok_or(PsbtV2Error::InvalidVersion)?;
        let key_start = off;
        if key_len == 0 || key_start + key_len as usize > data.len() {
            return Err(PsbtV2Error::InvalidVersion);
        }
        let key_type = data[key_start];
        let key_data = data[key_start + 1..key_start + key_len as usize].to_vec();
        let val_pos = key_start + key_len as usize;
        let (val_len, val_off) = Self::read_compact_size(data, val_pos).ok_or(PsbtV2Error::InvalidVersion)?;
        if val_off + val_len as usize > data.len() {
            return Err(PsbtV2Error::InvalidVersion);
        }
        let value = data[val_off..val_off + val_len as usize].to_vec();
        Ok((key_type, key_data, value, val_off + val_len as usize))
    }

    fn encode_compact_size(n: u64) -> Vec<u8> {
        if n < 0xFD {
            vec![n as u8]
        } else if n <= 0xFFFF {
            let mut v = vec![0xFD];
            v.extend(&(n as u16).to_le_bytes());
            v
        } else if n <= 0xFFFF_FFFF {
            let mut v = vec![0xFE];
            v.extend(&(n as u32).to_le_bytes());
            v
        } else {
            let mut v = vec![0xFF];
            v.extend(&n.to_le_bytes());
            v
        }
    }

    fn read_compact_size(data: &[u8], pos: usize) -> Option<(u64, usize)> {
        if pos >= data.len() {
            return None;
        }
        match data[pos] {
            n @ 0..=0xFC => Some((n as u64, pos + 1)),
            0xFD => {
                if pos + 3 > data.len() {
                    return None;
                }
                let v = u16::from_le_bytes([data[pos + 1], data[pos + 2]]);
                Some((v as u64, pos + 3))
            }
            0xFE => {
                if pos + 5 > data.len() {
                    return None;
                }
                let v = u32::from_le_bytes([
                    data[pos + 1],
                    data[pos + 2],
                    data[pos + 3],
                    data[pos + 4],
                ]);
                Some((v as u64, pos + 5))
            }
            0xFF => {
                if pos + 9 > data.len() {
                    return None;
                }
                let v = u64::from_le_bytes([
                    data[pos + 1],
                    data[pos + 2],
                    data[pos + 3],
                    data[pos + 4],
                    data[pos + 5],
                    data[pos + 6],
                    data[pos + 7],
                    data[pos + 8],
                ]);
                Some((v as u64, pos + 9))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_psbt_v2() {
        let psbt = PsbtV2::new(2, 1, 2);

        assert_eq!(psbt.global.version, 2);
        assert_eq!(psbt.global.tx_version, 2);
        assert_eq!(psbt.global.input_count, 1);
        assert_eq!(psbt.global.output_count, 2);
        assert_eq!(psbt.inputs.len(), 1);
        assert_eq!(psbt.outputs.len(), 2);
    }

    #[test]
    fn test_modifiable_flags() {
        let psbt = PsbtV2::new(2, 0, 0);

        assert!(psbt.global.modifiable.inputs_modifiable);
        assert!(psbt.global.modifiable.outputs_modifiable);
        assert!(!psbt.global.modifiable.sighash_single);
    }

    #[test]
    fn test_add_input() {
        let mut psbt = PsbtV2::new(2, 0, 0);
        let input = PsbtV2Input::default();

        psbt.add_input(input).unwrap();

        assert_eq!(psbt.global.input_count, 1);
        assert_eq!(psbt.inputs.len(), 1);
    }

    #[test]
    fn test_add_output() {
        let mut psbt = PsbtV2::new(2, 0, 0);
        let output = PsbtV2Output::default();

        psbt.add_output(output).unwrap();

        assert_eq!(psbt.global.output_count, 1);
        assert_eq!(psbt.outputs.len(), 1);
    }

    #[test]
    fn test_remove_input() {
        let mut psbt = PsbtV2::new(2, 2, 0);

        psbt.remove_input(0).unwrap();

        assert_eq!(psbt.global.input_count, 1);
        assert_eq!(psbt.inputs.len(), 1);
    }

    #[test]
    fn test_not_modifiable() {
        let mut psbt = PsbtV2::new(2, 0, 0);
        psbt.global.modifiable.inputs_modifiable = false;

        let input = PsbtV2Input::default();
        let result = psbt.add_input(input);

        assert_eq!(result, Err(PsbtV2Error::NotModifiable));
    }

    #[test]
    fn test_fee_calculation() {
        let mut psbt = PsbtV2::new(2, 1, 1);

        // Add input UTXO
        psbt.inputs[0].witness_utxo = Some(TxOut {
            amount: 100_000,
            script_pubkey: vec![],
        });

        // Add output
        psbt.outputs[0].amount = Some(95_000);

        let fee = psbt.fee().unwrap();
        assert_eq!(fee, 5_000);
    }

    #[test]
    fn test_total_input_value() {
        let mut psbt = PsbtV2::new(2, 2, 0);

        psbt.inputs[0].witness_utxo = Some(TxOut {
            amount: 50_000,
            script_pubkey: vec![],
        });

        psbt.inputs[1].witness_utxo = Some(TxOut {
            amount: 75_000,
            script_pubkey: vec![],
        });

        let total = psbt.total_input_value().unwrap();
        assert_eq!(total, 125_000);
    }

    #[test]
    fn test_total_output_value() {
        let mut psbt = PsbtV2::new(2, 0, 2);

        psbt.outputs[0].amount = Some(40_000);
        psbt.outputs[1].amount = Some(50_000);

        let total = psbt.total_output_value();
        assert_eq!(total, 90_000);
    }

    #[test]
    fn test_is_ready() {
        let mut psbt = PsbtV2::new(2, 1, 1);

        assert!(!psbt.is_ready());

        psbt.inputs[0].final_script_sig = Some(vec![]);

        assert!(psbt.is_ready());
    }

    #[test]
    fn test_proprietary_fields() {
        let mut psbt = PsbtV2::new(2, 0, 0);

        let namespace = b"org.kubercoin".to_vec();
        let key = b"metadata".to_vec();
        let value = b"custom_data".to_vec();

        psbt.add_proprietary_global(namespace.clone(), key.clone(), value.clone());

        let retrieved = psbt.get_proprietary_global(&namespace, &key);
        assert_eq!(retrieved, Some(value.as_slice()));
    }

    #[test]
    fn test_missing_utxo_error() {
        let psbt = PsbtV2::new(2, 1, 1);

        let result = psbt.total_input_value();
        assert_eq!(result, Err(PsbtV2Error::MissingUtxo));
    }

    #[test]
    fn test_to_unsigned_tx() {
        let mut psbt = PsbtV2::new(2, 1, 1);
        psbt.inputs[0].previous_txid = [0xAA; 32];
        psbt.inputs[0].previous_vout = 3;
        psbt.inputs[0].sequence = Some(0xFFFFFFFE);
        psbt.outputs[0].amount = Some(42_000);
        psbt.outputs[0].script_pubkey = vec![0x76, 0xa9];

        let tx = psbt.to_unsigned_tx().unwrap();
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);
        assert_eq!(tx.inputs[0].prev_output.txid, [0xAA; 32]);
        assert_eq!(tx.inputs[0].prev_output.vout, 3);
        assert_eq!(tx.inputs[0].sequence, 0xFFFFFFFE);
        assert_eq!(tx.outputs[0].value, 42_000);
    }

    #[test]
    fn test_sign_and_finalize() {
        use crate::PrivateKey;

        let key = PrivateKey::new();
        let mut psbt = PsbtV2::new(2, 1, 1);
        psbt.inputs[0].previous_txid = [0x01; 32];
        psbt.inputs[0].previous_vout = 0;
        psbt.inputs[0].witness_utxo = Some(TxOut {
            amount: 100_000,
            script_pubkey: vec![0x76, 0xa9],
        });
        psbt.outputs[0].amount = Some(90_000);
        psbt.outputs[0].script_pubkey = vec![0x76, 0xa9];

        // Sign
        psbt.sign_input(0, &key).unwrap();
        assert!(!psbt.inputs[0].partial_sigs.is_empty());

        // Finalize
        let tx = psbt.finalize().unwrap();
        assert_eq!(tx.inputs.len(), 1);
        assert!(!tx.inputs[0].script_sig.is_empty());
    }

    #[test]
    fn test_sign_out_of_bounds() {
        use crate::PrivateKey;

        let key = PrivateKey::new();
        let mut psbt = PsbtV2::new(2, 1, 1);
        let result = psbt.sign_input(5, &key);
        assert_eq!(result, Err(PsbtV2Error::InputCountMismatch));
    }

    #[test]
    fn test_finalize_incomplete() {
        let mut psbt = PsbtV2::new(2, 1, 1);
        let result = psbt.finalize();
        assert_eq!(result, Err(PsbtV2Error::IncompletePsbt));
    }

    #[test]
    fn test_combine() {
        use crate::PrivateKey;

        let key_a = PrivateKey::new();
        let key_b = PrivateKey::new();

        let build = || {
            let mut p = PsbtV2::new(2, 2, 1);
            for i in 0..2 {
                p.inputs[i].previous_txid = [i as u8 + 1; 32];
                p.inputs[i].previous_vout = 0;
            }
            p.outputs[0].amount = Some(50_000);
            p.outputs[0].script_pubkey = vec![0x76];
            p
        };

        let mut psbt_a = build();
        psbt_a.sign_input(0, &key_a).unwrap();

        let mut psbt_b = build();
        psbt_b.sign_input(1, &key_b).unwrap();

        psbt_a.combine(&psbt_b).unwrap();

        assert!(!psbt_a.inputs[0].partial_sigs.is_empty());
        assert!(!psbt_a.inputs[1].partial_sigs.is_empty());
    }

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let mut psbt = PsbtV2::new(2, 1, 1);
        psbt.global.fallback_locktime = Some(800_000);
        psbt.inputs[0].previous_txid = [0xBB; 32];
        psbt.inputs[0].previous_vout = 7;
        psbt.inputs[0].sequence = Some(0xFFFFFFFD);
        psbt.inputs[0].witness_utxo = Some(TxOut {
            amount: 200_000,
            script_pubkey: vec![0x00, 0x14, 0xAA],
        });
        psbt.outputs[0].amount = Some(190_000);
        psbt.outputs[0].script_pubkey = vec![0x51, 0x20, 0xCC];

        let bytes = psbt.serialize();
        assert!(bytes.starts_with(b"psbt\xff"));

        let parsed = PsbtV2::deserialize(&bytes).unwrap();
        assert_eq!(parsed.global.version, 2);
        assert_eq!(parsed.global.tx_version, 2);
        assert_eq!(parsed.global.fallback_locktime, Some(800_000));
        assert_eq!(parsed.global.input_count, 1);
        assert_eq!(parsed.global.output_count, 1);
        assert_eq!(parsed.inputs[0].previous_txid, [0xBB; 32]);
        assert_eq!(parsed.inputs[0].previous_vout, 7);
        assert_eq!(parsed.inputs[0].sequence, Some(0xFFFFFFFD));
        assert_eq!(parsed.inputs[0].witness_utxo.as_ref().unwrap().amount, 200_000);
        assert_eq!(parsed.outputs[0].amount, Some(190_000));
        assert_eq!(parsed.outputs[0].script_pubkey, vec![0x51, 0x20, 0xCC]);
    }

    #[test]
    fn test_deserialize_bad_magic() {
        let result = PsbtV2::deserialize(b"bad\xff\x00");
        assert!(result.is_err());
    }
}
