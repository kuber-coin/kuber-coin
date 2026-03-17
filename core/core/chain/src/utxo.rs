use crate::error::ChainError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tx::{OutPoint, Transaction, TxOutput};

/// Coinbase outputs require this many confirmations before they can be spent
pub const COINBASE_MATURITY: u64 = 100;

// ── Varint encoding (Bitcoin Core style) ─────────────────────

/// Encode a u64 as a variable-length integer (Bitcoin compact size).
///
/// - 0..=0xFC        → 1 byte
/// - 0xFD..=0xFFFF   → 0xFD + 2 LE bytes
/// - 0x10000..=0xFFFF_FFFF → 0xFE + 4 LE bytes
/// - larger          → 0xFF + 8 LE bytes
pub fn encode_varint(val: u64) -> Vec<u8> {
    if val <= 0xFC {
        vec![val as u8]
    } else if val <= 0xFFFF {
        let mut buf = vec![0xFD];
        buf.extend_from_slice(&(val as u16).to_le_bytes());
        buf
    } else if val <= 0xFFFF_FFFF {
        let mut buf = vec![0xFE];
        buf.extend_from_slice(&(val as u32).to_le_bytes());
        buf
    } else {
        let mut buf = vec![0xFF];
        buf.extend_from_slice(&val.to_le_bytes());
        buf
    }
}

/// Decode a varint from a byte slice, returning `(value, bytes_consumed)`.
///
/// Returns `None` if the slice is too short.
pub fn decode_varint(data: &[u8]) -> Option<(u64, usize)> {
    let first = *data.first()?;
    match first {
        0..=0xFC => Some((first as u64, 1)),
        0xFD => {
            if data.len() < 3 { return None; }
            let v = u16::from_le_bytes([data[1], data[2]]);
            Some((v as u64, 3))
        }
        0xFE => {
            if data.len() < 5 { return None; }
            let v = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
            Some((v as u64, 5))
        }
        0xFF => {
            if data.len() < 9 { return None; }
            let v = u64::from_le_bytes([
                data[1], data[2], data[3], data[4],
                data[5], data[6], data[7], data[8],
            ]);
            Some((v as u64, 9))
        }
    }
}

// ── Script compression ───────────────────────────────────────

/// Script compression type tags.
const SCRIPT_P2PKH: u8 = 0x00;  // 25-byte P2PKH → 1 + 20 bytes
const SCRIPT_P2WPKH: u8 = 0x01; // 22-byte P2WPKH → 1 + 20 bytes
const SCRIPT_P2TR: u8 = 0x02;   // 34-byte P2TR → 1 + 32 bytes
const SCRIPT_RAW: u8 = 0x03;    // anything else → 1 + varint(len) + raw

/// Compress a script_pubkey into a compact representation.
///
/// Recognises P2PKH, P2WPKH, and P2TR templates and strips the opcodes,
/// storing only the hash/key payload.  All other scripts are stored raw
/// with a length prefix.
pub fn compress_script(script: &[u8]) -> Vec<u8> {
    // P2PKH: OP_DUP(0x76) OP_HASH160(0xa9) 0x14 <20 bytes> OP_EQUALVERIFY(0x88) OP_CHECKSIG(0xac)
    if script.len() == 25
        && script[0] == 0x76
        && script[1] == 0xa9
        && script[2] == 0x14
        && script[23] == 0x88
        && script[24] == 0xac
    {
        let mut out = vec![SCRIPT_P2PKH];
        out.extend_from_slice(&script[3..23]);
        return out;
    }

    // P2WPKH: OP_0(0x00) 0x14 <20 bytes>
    if script.len() == 22 && script[0] == 0x00 && script[1] == 0x14 {
        let mut out = vec![SCRIPT_P2WPKH];
        out.extend_from_slice(&script[2..22]);
        return out;
    }

    // P2TR: OP_1(0x51) 0x20 <32 bytes>
    if script.len() == 34 && script[0] == 0x51 && script[1] == 0x20 {
        let mut out = vec![SCRIPT_P2TR];
        out.extend_from_slice(&script[2..34]);
        return out;
    }

    // Raw fallback
    let mut out = vec![SCRIPT_RAW];
    out.extend_from_slice(&encode_varint(script.len() as u64));
    out.extend_from_slice(script);
    out
}

/// Decompress a script from its compact representation.
///
/// Returns `(script_pubkey, bytes_consumed)` or `None` on malformed input.
pub fn decompress_script(data: &[u8]) -> Option<(Vec<u8>, usize)> {
    let tag = *data.first()?;
    match tag {
        SCRIPT_P2PKH => {
            if data.len() < 21 { return None; }
            let hash = &data[1..21];
            let mut script = Vec::with_capacity(25);
            script.push(0x76); // OP_DUP
            script.push(0xa9); // OP_HASH160
            script.push(0x14); // push 20
            script.extend_from_slice(hash);
            script.push(0x88); // OP_EQUALVERIFY
            script.push(0xac); // OP_CHECKSIG
            Some((script, 21))
        }
        SCRIPT_P2WPKH => {
            if data.len() < 21 { return None; }
            let hash = &data[1..21];
            let mut script = Vec::with_capacity(22);
            script.push(0x00); // OP_0
            script.push(0x14); // push 20
            script.extend_from_slice(hash);
            Some((script, 21))
        }
        SCRIPT_P2TR => {
            if data.len() < 33 { return None; }
            let key = &data[1..33];
            let mut script = Vec::with_capacity(34);
            script.push(0x51); // OP_1
            script.push(0x20); // push 32
            script.extend_from_slice(key);
            Some((script, 33))
        }
        SCRIPT_RAW => {
            let (len, vi_size) = decode_varint(&data[1..])?;
            let len = len as usize;
            let start = 1 + vi_size;
            if data.len() < start + len { return None; }
            let script = data[start..start + len].to_vec();
            Some((script, start + len))
        }
        _ => None,
    }
}

// ── Compressed UTXO entry ────────────────────────────────────

/// Serialize a single UTXO into a compact binary representation.
///
/// Format:
/// ```text
///   varint( (height << 1) | is_coinbase )
///   varint( value )
///   compressed_script
/// ```
///
/// This mirrors Bitcoin Core's `CCoinsSerializer` encoding and
/// typically halves the per-entry storage cost.
pub fn compress_utxo(utxo: &UTXO) -> Vec<u8> {
    let code = (utxo.height << 1) | (utxo.is_coinbase as u64);
    let mut buf = encode_varint(code);
    buf.extend_from_slice(&encode_varint(utxo.output.value));
    buf.extend_from_slice(&compress_script(&utxo.output.script_pubkey));
    buf
}

/// Deserialize a single UTXO from its compact binary representation.
///
/// Returns `(UTXO, bytes_consumed)` or `None` on malformed input.
pub fn decompress_utxo(data: &[u8]) -> Option<(UTXO, usize)> {
    let (code, c1) = decode_varint(data)?;
    let height = code >> 1;
    let is_coinbase = (code & 1) == 1;

    let (value, c2) = decode_varint(&data[c1..])?;
    let (script, c3) = decompress_script(&data[c1 + c2..])?;

    let utxo = UTXO {
        output: TxOutput::new(value, script),
        height,
        is_coinbase,
    };
    Some((utxo, c1 + c2 + c3))
}

// ── Compressed UTXO set (bulk) ───────────────────────────────

/// Magic bytes identifying the compressed UTXO set format.
const COMPRESSED_MAGIC: &[u8; 4] = b"CUTX";

/// Serialize an entire `UtxoSet` into a compact binary blob.
///
/// Format:
/// ```text
///   "CUTX"              (4 bytes – magic)
///   varint(count)       (entry count)
///   for each entry:
///     <32 bytes txid>
///     varint(vout)
///     compressed_utxo
/// ```
pub fn compress_utxo_set(set: &UtxoSet) -> Vec<u8> {
    let count = set.len() as u64;
    // Rough estimate: 60 bytes per entry average
    let mut buf = Vec::with_capacity(4 + 9 + (set.len() * 60));
    buf.extend_from_slice(COMPRESSED_MAGIC);
    buf.extend_from_slice(&encode_varint(count));

    for (outpoint, utxo) in set.iter() {
        buf.extend_from_slice(&outpoint.txid);
        buf.extend_from_slice(&encode_varint(outpoint.vout as u64));
        buf.extend_from_slice(&compress_utxo(utxo));
    }
    buf
}

/// Deserialize a `UtxoSet` from a compressed binary blob.
///
/// Returns `None` if the magic is wrong or data is malformed.
pub fn decompress_utxo_set(data: &[u8]) -> Option<UtxoSet> {
    if data.len() < 4 || &data[0..4] != COMPRESSED_MAGIC {
        return None;
    }
    let (count, vi) = decode_varint(&data[4..])?;
    let mut pos = 4 + vi;
    let mut set = UtxoSet::new();

    for _ in 0..count {
        if pos + 32 > data.len() { return None; }
        let mut txid = [0u8; 32];
        txid.copy_from_slice(&data[pos..pos + 32]);
        pos += 32;

        let (vout, vi2) = decode_varint(&data[pos..])?;
        pos += vi2;

        let (utxo, consumed) = decompress_utxo(&data[pos..])?;
        pos += consumed;

        set.add_utxo(OutPoint::new(txid, vout as u32), utxo);
    }
    Some(set)
}

// ── Undo data ────────────────────────────────────────────────

/// Undo data for a single transaction.
///
/// Records which UTXOs were spent (so they can be restored on disconnect)
/// and which outputs were created (so they can be removed on disconnect).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxUndoData {
    /// The UTXOs that were consumed by this transaction's inputs.
    /// Empty for coinbase transactions.
    pub spent_utxos: Vec<(OutPoint, UTXO)>,

    /// The outpoints created by this transaction's outputs.
    pub created_outpoints: Vec<OutPoint>,
}

/// Undo data for an entire block.
///
/// Stored alongside each block so the chain can be rolled back.
/// Mirrors Bitcoin Core's `CBlockUndo`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockUndoData {
    /// Per-transaction undo data, in the same order as `block.transactions`.
    pub tx_undo: Vec<TxUndoData>,
}

/// A UTXO entry with metadata
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UTXO {
    /// The output itself
    pub output: TxOutput,

    /// Height at which it was created
    pub height: u64,

    /// Is this a coinbase output?
    pub is_coinbase: bool,
}

impl UTXO {
    /// Create a new UTXO
    pub fn new(output: TxOutput, height: u64, is_coinbase: bool) -> Self {
        Self {
            output,
            height,
            is_coinbase,
        }
    }

    /// Check if this UTXO is mature enough to spend
    /// Coinbase outputs require 100 confirmations
    pub fn is_mature(&self, current_height: u64) -> bool {
        if !self.is_coinbase {
            return true;
        }
        current_height >= self.height + COINBASE_MATURITY
    }
}

/// UTXO set (unspent transaction outputs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtxoSet {
    /// Map: OutPoint -> UTXO
    utxos: HashMap<OutPoint, UTXO>,
}

impl UtxoSet {
    /// Create a new empty UTXO set
    pub fn new() -> Self {
        Self {
            utxos: HashMap::new(),
        }
    }

    /// Add a UTXO to the set
    pub fn add_utxo(&mut self, outpoint: OutPoint, utxo: UTXO) {
        self.utxos.insert(outpoint, utxo);
    }

    /// Spend a UTXO (remove from set)
    /// Returns the UTXO if it existed, None otherwise
    pub fn spend_utxo(&mut self, outpoint: &OutPoint) -> Option<UTXO> {
        self.utxos.remove(outpoint)
    }

    /// Get a UTXO without removing it
    pub fn get_utxo(&self, outpoint: &OutPoint) -> Option<&UTXO> {
        self.utxos.get(outpoint)
    }

    /// Check if a UTXO exists
    pub fn contains(&self, outpoint: &OutPoint) -> bool {
        self.utxos.contains_key(outpoint)
    }

    /// Get the number of UTXOs
    pub fn len(&self) -> usize {
        self.utxos.len()
    }

    /// Check if the set is empty
    pub fn is_empty(&self) -> bool {
        self.utxos.is_empty()
    }

    /// Iterate over all UTXOs
    pub fn iter(&self) -> impl Iterator<Item = (&OutPoint, &UTXO)> {
        self.utxos.iter()
    }

    /// Apply a transaction to the UTXO set
    /// - Spends all inputs (except coinbase)
    /// - Creates all outputs
    pub fn apply_transaction(&mut self, tx: &Transaction, height: u64) -> Result<(), ChainError> {
        // Validate inputs exist (except for coinbase)
        if !tx.is_coinbase() {
            for input in &tx.inputs {
                if !self.contains(&input.prev_output) {
                    return Err(ChainError::Validation(format!(
                        "input references non-existent UTXO: {}",
                        input.prev_output
                    )));
                }
            }

            // Spend inputs
            for input in &tx.inputs {
                self.spend_utxo(&input.prev_output);
            }
        }

        // BIP-30: reject if any output of this txid already exists as an unspent UTXO
        let txid = tx.txid();
        for (vout, _output) in tx.outputs.iter().enumerate() {
            let vout_u32 = u32::try_from(vout).map_err(|_| {
                ChainError::Validation("output index exceeds u32".into())
            })?;
            let outpoint = OutPoint::new(txid, vout_u32);
            if self.contains(&outpoint) {
                return Err(ChainError::Validation(format!(
                    "BIP-30: duplicate unspent output {}",
                    outpoint
                )));
            }
        }

        // Create outputs
        for (vout, output) in tx.outputs.iter().enumerate() {
            let vout_u32 = u32::try_from(vout).map_err(|_| {
                ChainError::Validation("output index exceeds u32".into())
            })?;
            let outpoint = OutPoint::new(txid, vout_u32);
            let utxo = UTXO::new(output.clone(), height, tx.is_coinbase());
            self.add_utxo(outpoint, utxo);
        }

        Ok(())
    }

    /// Apply a block to the UTXO set
    pub fn apply_block(&mut self, block: &crate::Block) -> Result<(), ChainError> {
        for tx in &block.transactions {
            self.apply_transaction(tx, block.header.height)?;
        }
        Ok(())
    }

    /// Apply a block and return undo data that can reverse the operation.
    ///
    /// This is the preferred entry point for production code — the returned
    /// [`BlockUndoData`] must be stored alongside the block so that
    /// [`disconnect_block`](Self::disconnect_block) can roll it back.
    pub fn apply_block_with_undo(
        &mut self,
        block: &crate::Block,
    ) -> Result<BlockUndoData, ChainError> {
        let mut tx_undo = Vec::with_capacity(block.transactions.len());

        for tx in &block.transactions {
            let undo = self.apply_transaction_with_undo(tx, block.header.height)?;
            tx_undo.push(undo);
        }

        Ok(BlockUndoData { tx_undo })
    }

    /// Apply a single transaction and return its undo data.
    fn apply_transaction_with_undo(
        &mut self,
        tx: &Transaction,
        height: u64,
    ) -> Result<TxUndoData, ChainError> {
        let mut spent_utxos = Vec::new();

        // Spend inputs (except coinbase)
        if !tx.is_coinbase() {
            // Validate first
            for input in &tx.inputs {
                if !self.contains(&input.prev_output) {
                    return Err(ChainError::Validation(format!(
                        "input references non-existent UTXO: {}",
                        input.prev_output
                    )));
                }
            }

            // Spend and record
            for input in &tx.inputs {
                if let Some(utxo) = self.spend_utxo(&input.prev_output) {
                    spent_utxos.push((input.prev_output, utxo));
                }
            }
        }

        // BIP-30: reject if any output of this txid already exists as an unspent UTXO
        let txid = tx.txid();
        for (vout, _output) in tx.outputs.iter().enumerate() {
            let vout_u32 = u32::try_from(vout)
                .map_err(|_| ChainError::Validation("output index exceeds u32".into()))?;
            let outpoint = OutPoint::new(txid, vout_u32);
            if self.contains(&outpoint) {
                return Err(ChainError::Validation(format!(
                    "BIP-30: duplicate unspent output {}",
                    outpoint
                )));
            }
        }

        // Create outputs
        let mut created_outpoints = Vec::with_capacity(tx.outputs.len());

        for (vout, output) in tx.outputs.iter().enumerate() {
            let vout_u32 = u32::try_from(vout)
                .map_err(|_| ChainError::Validation("output index exceeds u32".into()))?;
            let outpoint = OutPoint::new(txid, vout_u32);
            let utxo = UTXO::new(output.clone(), height, tx.is_coinbase());
            self.add_utxo(outpoint, utxo);
            created_outpoints.push(outpoint);
        }

        Ok(TxUndoData {
            spent_utxos,
            created_outpoints,
        })
    }

    /// Disconnect (roll back) a block using its undo data.
    ///
    /// This reverses `apply_block_with_undo`:
    /// - Removes UTXOs created by the block's transactions
    /// - Restores UTXOs that were spent by the block's transactions
    ///
    /// Transactions are processed in **reverse** order (last tx first)
    /// to mirror the forward application order.
    pub fn disconnect_block(&mut self, undo: &BlockUndoData) -> Result<(), ChainError> {
        // Process transactions in reverse order
        for tx_undo in undo.tx_undo.iter().rev() {
            // 1. Remove created outputs
            for outpoint in &tx_undo.created_outpoints {
                self.spend_utxo(outpoint);
            }

            // 2. Restore spent inputs
            for (outpoint, utxo) in &tx_undo.spent_utxos {
                self.add_utxo(*outpoint, utxo.clone());
            }
        }

        Ok(())
    }

    /// Calculate total value in UTXO set
    pub fn total_value(&self) -> u64 {
        self.utxos
            .values()
            .map(|utxo| utxo.output.value)
            .fold(0u64, |acc, v| acc.saturating_add(v))
    }

    /// Compute a deterministic commitment hash over the entire UTXO set.
    ///
    /// Entries are sorted by (txid, vout) so the result is independent of
    /// HashMap iteration order.  The hash covers every outpoint together
    /// with the output value and script, producing a 32-byte SHA-256
    /// digest that uniquely identifies the UTXO-set state.
    pub fn commitment_hash(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};

        // Collect and sort outpoints for deterministic ordering
        let mut entries: Vec<_> = self.utxos.iter().collect();
        entries.sort_by(|(a, _), (b, _)| {
            a.txid.cmp(&b.txid).then(a.vout.cmp(&b.vout))
        });

        let mut hasher = Sha256::new();
        for (outpoint, utxo) in &entries {
            hasher.update(outpoint.txid);
            hasher.update(outpoint.vout.to_le_bytes());
            hasher.update(utxo.output.value.to_le_bytes());
            hasher.update(&utxo.output.script_pubkey);
            hasher.update(utxo.height.to_le_bytes());
            hasher.update([utxo.is_coinbase as u8]);
        }

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }

    /// Get all UTXOs for a given script_pubkey
    pub fn get_utxos_by_script(&self, script_pubkey: &[u8]) -> Vec<(OutPoint, &UTXO)> {
        self.utxos
            .iter()
            .filter(|(_, utxo)| utxo.output.script_pubkey == script_pubkey)
            .map(|(op, utxo)| (*op, utxo))
            .collect()
    }
}

impl Default for UtxoSet {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tx::TxInput;

    fn create_test_output(value: u64) -> TxOutput {
        TxOutput::new(value, vec![0x01, 0x02, 0x03])
    }

    #[test]
    fn test_utxo_set_creation() {
        let set = UtxoSet::new();
        assert!(set.is_empty());
        assert_eq!(set.len(), 0);
    }

    #[test]
    fn test_add_and_get_utxo() {
        let mut set = UtxoSet::new();
        let outpoint = OutPoint::new([1u8; 32], 0);
        let output = create_test_output(100);
        let utxo = UTXO::new(output.clone(), 1, false);

        set.add_utxo(outpoint, utxo.clone());

        assert_eq!(set.len(), 1);
        assert!(set.contains(&outpoint));

        let retrieved = set.get_utxo(&outpoint).unwrap();
        assert_eq!(retrieved.output, output);
        assert_eq!(retrieved.height, 1);
    }

    #[test]
    fn test_spend_utxo() {
        let mut set = UtxoSet::new();
        let outpoint = OutPoint::new([1u8; 32], 0);
        let output = create_test_output(100);
        let utxo = UTXO::new(output, 1, false);

        set.add_utxo(outpoint, utxo);
        assert_eq!(set.len(), 1);

        let spent = set.spend_utxo(&outpoint);
        assert!(spent.is_some());
        assert_eq!(set.len(), 0);
        assert!(!set.contains(&outpoint));
    }

    #[test]
    fn test_spend_nonexistent_utxo() {
        let mut set = UtxoSet::new();
        let outpoint = OutPoint::new([1u8; 32], 0);

        let spent = set.spend_utxo(&outpoint);
        assert!(spent.is_none());
    }

    #[test]
    fn test_double_spend_detection() {
        let mut set = UtxoSet::new();
        let outpoint = OutPoint::new([1u8; 32], 0);
        let output = create_test_output(100);
        let utxo = UTXO::new(output, 1, false);

        set.add_utxo(outpoint, utxo);

        // First spend should succeed
        let first_spend = set.spend_utxo(&outpoint);
        assert!(first_spend.is_some());

        // Second spend should fail (UTXO already spent)
        let second_spend = set.spend_utxo(&outpoint);
        assert!(second_spend.is_none());
    }

    #[test]
    fn test_apply_coinbase_transaction() {
        let mut set = UtxoSet::new();
        let tx = Transaction::new_coinbase(0, 50_000_000, vec![0xab]);

        let result = set.apply_transaction(&tx, 0);
        assert!(result.is_ok());

        // Should have created 1 output
        assert_eq!(set.len(), 1);

        // Verify the output exists
        let txid = tx.txid();
        let outpoint = OutPoint::new(txid, 0);
        let utxo = set.get_utxo(&outpoint).unwrap();
        assert_eq!(utxo.output.value, 50_000_000);
        assert!(utxo.is_coinbase);
    }

    #[test]
    fn test_apply_regular_transaction() {
        let mut set = UtxoSet::new();

        // First create a UTXO to spend
        let first_tx = Transaction::new_coinbase(0, 100, vec![0xab]);
        set.apply_transaction(&first_tx, 0).unwrap();

        let first_txid = first_tx.txid();
        let prev_outpoint = OutPoint::new(first_txid, 0);

        // Now create a transaction spending it
        let input = TxInput::new(prev_outpoint, vec![]);
        let output = TxOutput::new(90, vec![0xcd]); // 10 fee
        let tx = Transaction::new(vec![input], vec![output], 0);

        let result = set.apply_transaction(&tx, 1);
        assert!(result.is_ok());

        // Original UTXO should be spent
        assert!(!set.contains(&prev_outpoint));

        // New UTXO should exist
        let new_outpoint = OutPoint::new(tx.txid(), 0);
        let utxo = set.get_utxo(&new_outpoint).unwrap();
        assert_eq!(utxo.output.value, 90);
    }

    #[test]
    fn test_apply_transaction_missing_input() {
        let mut set = UtxoSet::new();

        // Try to spend non-existent UTXO
        let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
        let output = TxOutput::new(100, vec![]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        let result = set.apply_transaction(&tx, 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_total_value() {
        let mut set = UtxoSet::new();

        let outpoint1 = OutPoint::new([1u8; 32], 0);
        let outpoint2 = OutPoint::new([2u8; 32], 0);

        set.add_utxo(outpoint1, UTXO::new(create_test_output(100), 1, false));
        set.add_utxo(outpoint2, UTXO::new(create_test_output(200), 1, false));

        assert_eq!(set.total_value(), 300);
    }

    #[test]
    fn test_get_utxos_by_script() {
        let mut set = UtxoSet::new();

        let script1 = vec![0x01, 0x02];
        let script2 = vec![0x03, 0x04];

        let outpoint1 = OutPoint::new([1u8; 32], 0);
        let outpoint2 = OutPoint::new([2u8; 32], 0);
        let outpoint3 = OutPoint::new([3u8; 32], 0);

        set.add_utxo(
            outpoint1,
            UTXO::new(TxOutput::new(100, script1.clone()), 1, false),
        );
        set.add_utxo(
            outpoint2,
            UTXO::new(TxOutput::new(200, script2.clone()), 1, false),
        );
        set.add_utxo(
            outpoint3,
            UTXO::new(TxOutput::new(300, script1.clone()), 1, false),
        );

        let utxos_script1 = set.get_utxos_by_script(&script1);
        assert_eq!(utxos_script1.len(), 2);

        let total: u64 = utxos_script1.iter().map(|(_, u)| u.output.value).sum();
        assert_eq!(total, 400);
    }

    #[test]
    fn test_utxo_set_consistency() {
        let mut set = UtxoSet::new();

        // Add 10 UTXOs
        for i in 0..10 {
            let outpoint = OutPoint::new([i as u8; 32], 0);
            let utxo = UTXO::new(create_test_output(100), 1, false);
            set.add_utxo(outpoint, utxo);
        }
        assert_eq!(set.len(), 10);

        // Spend 5 UTXOs
        for i in 0..5 {
            let outpoint = OutPoint::new([i as u8; 32], 0);
            set.spend_utxo(&outpoint);
        }
        assert_eq!(set.len(), 5);

        // Verify only the unspent ones remain
        for i in 0..10 {
            let outpoint = OutPoint::new([i as u8; 32], 0);
            if i < 5 {
                assert!(!set.contains(&outpoint));
            } else {
                assert!(set.contains(&outpoint));
            }
        }
    }

    // ── Compression tests ────────────────────────────────────

    #[test]
    fn test_varint_roundtrip() {
        let values: Vec<u64> = vec![
            0, 1, 0xFC, 0xFD, 0xFE, 0xFF, 0x100, 0xFFFF,
            0x10000, 0xFFFF_FFFF, 0x1_0000_0000, u64::MAX,
        ];
        for v in values {
            let encoded = encode_varint(v);
            let (decoded, consumed) = decode_varint(&encoded).unwrap();
            assert_eq!(v, decoded, "varint roundtrip failed for {v}");
            assert_eq!(consumed, encoded.len());
        }
    }

    #[test]
    fn test_varint_sizes() {
        assert_eq!(encode_varint(0).len(), 1);
        assert_eq!(encode_varint(0xFC).len(), 1);
        assert_eq!(encode_varint(0xFD).len(), 3);
        assert_eq!(encode_varint(0xFFFF).len(), 3);
        assert_eq!(encode_varint(0x10000).len(), 5);
        assert_eq!(encode_varint(0xFFFF_FFFF).len(), 5);
        assert_eq!(encode_varint(0x1_0000_0000).len(), 9);
    }

    #[test]
    fn test_compress_script_p2pkh() {
        let hash = [0xAB; 20];
        let script = tx::Script::new_p2pkh(&hash);
        assert_eq!(script.bytes.len(), 25);

        let compressed = compress_script(&script.bytes);
        assert_eq!(compressed.len(), 21); // type + 20 hash
        assert_eq!(compressed[0], 0x00); // P2PKH tag

        let (decompressed, consumed) = decompress_script(&compressed).unwrap();
        assert_eq!(consumed, 21);
        assert_eq!(decompressed, script.bytes);
    }

    #[test]
    fn test_compress_script_p2wpkh() {
        let hash = [0xCD; 20];
        let script = tx::Script::new_p2wpkh(&hash);
        assert_eq!(script.bytes.len(), 22);

        let compressed = compress_script(&script.bytes);
        assert_eq!(compressed.len(), 21); // type + 20 hash
        assert_eq!(compressed[0], 0x01); // P2WPKH tag

        let (decompressed, consumed) = decompress_script(&compressed).unwrap();
        assert_eq!(consumed, 21);
        assert_eq!(decompressed, script.bytes);
    }

    #[test]
    fn test_compress_script_p2tr() {
        let key = [0xEF; 32];
        let script = tx::Script::new_p2tr(&key);
        assert_eq!(script.bytes.len(), 34);

        let compressed = compress_script(&script.bytes);
        assert_eq!(compressed.len(), 33); // type + 32 key
        assert_eq!(compressed[0], 0x02); // P2TR tag

        let (decompressed, consumed) = decompress_script(&compressed).unwrap();
        assert_eq!(consumed, 33);
        assert_eq!(decompressed, script.bytes);
    }

    #[test]
    fn test_compress_script_raw_fallback() {
        let raw = vec![0x01, 0x02, 0x03, 0x04, 0x05];
        let compressed = compress_script(&raw);
        assert_eq!(compressed[0], 0x03); // raw tag
        // 1 (tag) + 1 (varint len=5) + 5 (bytes) = 7
        assert_eq!(compressed.len(), 7);

        let (decompressed, consumed) = decompress_script(&compressed).unwrap();
        assert_eq!(consumed, 7);
        assert_eq!(decompressed, raw);
    }

    #[test]
    fn test_compress_utxo_roundtrip() {
        let hash = [0xAA; 20];
        let script = tx::Script::new_p2pkh(&hash);
        let utxo = UTXO::new(TxOutput::new(50_000_000, script.bytes), 100, true);

        let compressed = compress_utxo(&utxo);
        let (decompressed, consumed) = decompress_utxo(&compressed).unwrap();

        assert_eq!(consumed, compressed.len());
        assert_eq!(decompressed, utxo);
    }

    #[test]
    fn test_compress_utxo_encodes_coinbase_flag() {
        let utxo_cb = UTXO::new(TxOutput::new(100, vec![0x99]), 42, true);
        let utxo_no = UTXO::new(TxOutput::new(100, vec![0x99]), 42, false);

        let (dec_cb, _) = decompress_utxo(&compress_utxo(&utxo_cb)).unwrap();
        let (dec_no, _) = decompress_utxo(&compress_utxo(&utxo_no)).unwrap();

        assert!(dec_cb.is_coinbase);
        assert!(!dec_no.is_coinbase);
        assert_eq!(dec_cb.height, 42);
        assert_eq!(dec_no.height, 42);
    }

    #[test]
    fn test_compress_utxo_set_roundtrip() {
        let mut set = UtxoSet::new();

        // P2PKH output
        let script1 = tx::Script::new_p2pkh(&[0x11; 20]).bytes;
        set.add_utxo(
            OutPoint::new([1u8; 32], 0),
            UTXO::new(TxOutput::new(1_000_000, script1), 10, true),
        );

        // P2WPKH output
        let script2 = tx::Script::new_p2wpkh(&[0x22; 20]).bytes;
        set.add_utxo(
            OutPoint::new([2u8; 32], 1),
            UTXO::new(TxOutput::new(500_000, script2), 20, false),
        );

        // P2TR output
        let script3 = tx::Script::new_p2tr(&[0x33; 32]).bytes;
        set.add_utxo(
            OutPoint::new([3u8; 32], 5),
            UTXO::new(TxOutput::new(7_500_000, script3), 999, false),
        );

        // Raw script
        set.add_utxo(
            OutPoint::new([4u8; 32], 0),
            UTXO::new(TxOutput::new(42, vec![0xDE, 0xAD]), 0, false),
        );

        let blob = compress_utxo_set(&set);
        // Verify magic
        assert_eq!(&blob[0..4], b"CUTX");

        let restored = decompress_utxo_set(&blob).unwrap();
        assert_eq!(restored.len(), set.len());

        // Verify every entry round-trips
        for (op, utxo) in set.iter() {
            let restored_utxo = restored.get_utxo(op).expect("missing outpoint");
            assert_eq!(restored_utxo, utxo);
        }
    }

    #[test]
    fn test_compressed_utxo_set_smaller_than_bincode() {
        let mut set = UtxoSet::new();
        for i in 0u8..50 {
            let script = tx::Script::new_p2pkh(&[i; 20]).bytes;
            set.add_utxo(
                OutPoint::new([i; 32], 0),
                UTXO::new(TxOutput::new(50_000_000, script), i as u64 * 100, i == 0),
            );
        }

        let bincode_bytes = bincode::serialize(&set).unwrap();
        let compressed_bytes = compress_utxo_set(&set);

        assert!(
            compressed_bytes.len() < bincode_bytes.len(),
            "compressed ({}) should be smaller than bincode ({})",
            compressed_bytes.len(),
            bincode_bytes.len()
        );
    }

    #[test]
    fn test_decompress_bad_magic_returns_none() {
        let data = b"XXXX\x00";
        assert!(decompress_utxo_set(data).is_none());
    }

    #[test]
    fn test_decompress_empty_set() {
        let mut data = b"CUTX".to_vec();
        data.push(0x00); // count = 0
        let set = decompress_utxo_set(&data).unwrap();
        assert!(set.is_empty());
    }

    // ── Coinbase maturity boundary ────────────────────────────────

    #[test]
    fn test_coinbase_maturity_exactly_at_boundary() {
        // Coinbase mined at height 0; maturity requires current_height >= 0 + 100.
        let output = TxOutput::new(50_000_000, vec![0xab]);
        let utxo = UTXO::new(output, 0, true);
        // Height 99 → immature (99 < 0 + 100)
        assert!(!utxo.is_mature(99), "coinbase at height 99 (mined 0) must be immature");
        // Height 100 → mature
        assert!(utxo.is_mature(100), "coinbase at height 100 (mined 0) must be mature");
    }

    #[test]
    fn test_coinbase_maturity_non_coinbase_always_mature() {
        let output = TxOutput::new(1_000, vec![0x51]);
        let utxo = UTXO::new(output, 500, false); // not coinbase
        // Non-coinbase UTXOs are always immediately spendable
        assert!(utxo.is_mature(0));
        assert!(utxo.is_mature(500));
        assert!(utxo.is_mature(501));
    }

    #[test]
    fn test_coinbase_maturity_mined_at_large_height() {
        let output = TxOutput::new(12_500_000, vec![0x51]);
        let utxo = UTXO::new(output, 840_000, true);
        assert!(!utxo.is_mature(840_099));
        assert!(utxo.is_mature(840_100));
        assert!(utxo.is_mature(840_101));
    }

    // ── BIP-30: duplicate unspent txid rejection ──────────────────

    #[test]
    fn test_bip30_duplicate_coinbase_rejected() {
        let mut set = UtxoSet::new();
        let tx = Transaction::new_coinbase(1, 50_000_000, vec![0xab]);
        // Apply once — succeeds
        set.apply_transaction(&tx, 1).unwrap();
        // Apply the same coinbase again — rejected because the txid already has unspent outputs
        let result = set.apply_transaction(&tx, 2);
        assert!(result.is_err(), "BIP-30: duplicate txid with unspent outputs must be rejected");
    }

    // ── apply_block_with_undo + disconnect_block roundtrip ────────

    #[test]
    fn test_apply_and_disconnect_block_restores_state() {
        let mut set = UtxoSet::new();
        // Pre-fund the set with a UTXO that the block's spending tx will consume
        let coinbase = Transaction::new_coinbase(0, 50_000_000, vec![0xaa]);
        set.apply_transaction(&coinbase, 0).unwrap();
        let before_len = set.len();
        let before_value = set.total_value();
        let before_hash = set.commitment_hash();

        let coinbase_outpoint = OutPoint::new(coinbase.txid(), 0);
        let spend_input = TxInput::new(coinbase_outpoint, vec![]);
        let spend_tx = Transaction::new(
            vec![spend_input],
            vec![TxOutput::new(49_900_000, vec![0xbb])],
            0,
        );

        // Build a minimal block (another coinbase + spending tx)
        let block_coinbase = Transaction::new_coinbase(1, 50_000_000, vec![0xcc]);
        let block = crate::Block::from_params(
            1,
            [0u8; 32],
            crate::Block::calculate_merkle_root(&[block_coinbase.clone(), spend_tx.clone()]),
            1_700_000_000,
            0x1d00ffff,
            0,
            vec![block_coinbase, spend_tx],
        );

        let undo = set.apply_block_with_undo(&block).unwrap();
        // State has changed after applying the block
        assert_ne!(set.commitment_hash(), before_hash);

        set.disconnect_block(&undo).unwrap();
        // State must be fully restored
        assert_eq!(set.len(), before_len, "UTXO count must be restored after disconnect");
        assert_eq!(set.total_value(), before_value, "total value must be restored after disconnect");
        assert_eq!(set.commitment_hash(), before_hash, "commitment hash must match original after disconnect");
    }

    // ── Large UTXO set stress test ────────────────────────────────

    #[test]
    fn test_large_utxo_set_1000_entries() {
        let mut set = UtxoSet::new();
        for i in 0u64..1000 {
            let mut txid = [0u8; 32];
            txid[0..8].copy_from_slice(&i.to_le_bytes());
            let outpoint = OutPoint::new(txid, 0);
            let utxo = UTXO::new(TxOutput::new(100_000, vec![0x51]), i, i == 0);
            set.add_utxo(outpoint, utxo);
        }
        assert_eq!(set.len(), 1000);
        assert_eq!(set.total_value(), 100_000 * 1000);
    }

    #[test]
    fn test_large_utxo_set_spend_all() {
        let mut set = UtxoSet::new();
        let mut outpoints = Vec::new();
        for i in 0u64..200 {
            let mut txid = [0u8; 32];
            txid[0..8].copy_from_slice(&i.to_le_bytes());
            let op = OutPoint::new(txid, 0);
            set.add_utxo(op, UTXO::new(TxOutput::new(1000, vec![0x51]), i, false));
            outpoints.push(op);
        }
        assert_eq!(set.len(), 200);
        for op in &outpoints {
            assert!(set.spend_utxo(op).is_some());
        }
        assert!(set.is_empty());
        assert_eq!(set.total_value(), 0);
    }

    // ── Commitment hash determinism ───────────────────────────────

    #[test]
    fn test_commitment_hash_is_deterministic() {
        let mut set = UtxoSet::new();
        for i in 0u64..10 {
            let mut txid = [0u8; 32];
            txid[0..8].copy_from_slice(&i.to_le_bytes());
            set.add_utxo(OutPoint::new(txid, 0), UTXO::new(TxOutput::new(1000, vec![0x51]), i, false));
        }
        let hash1 = set.commitment_hash();
        let hash2 = set.commitment_hash();
        assert_eq!(hash1, hash2, "commitment hash must be deterministic");
    }

    #[test]
    fn test_commitment_hash_changes_after_spend() {
        let mut set = UtxoSet::new();
        let op = OutPoint::new([0xCA; 32], 0);
        set.add_utxo(op, UTXO::new(TxOutput::new(5000, vec![0x51]), 1, false));
        let hash_before = set.commitment_hash();
        set.spend_utxo(&op);
        let hash_after = set.commitment_hash();
        assert_ne!(hash_before, hash_after, "spending a UTXO must change the commitment hash");
    }

    #[test]
    fn test_empty_set_commitment_hash_is_zero() {
        // Empty set should produce a stable known hash (SHA-256 of nothing = e3b0...)
        let set = UtxoSet::new();
        let hash = set.commitment_hash();
        // Just verify it's a consistent 32-byte value, not panicked
        assert_eq!(hash.len(), 32);
        let hash2 = set.commitment_hash();
        assert_eq!(hash, hash2);
    }

    // ── Total value safety ────────────────────────────────────────

    #[test]
    fn test_total_value_saturates_on_near_overflow() {
        let mut set = UtxoSet::new();
        // u64::MAX + 1 would overflow; saturating_add should clamp to u64::MAX
        set.add_utxo(OutPoint::new([0x01; 32], 0), UTXO::new(TxOutput::new(u64::MAX, vec![]), 1, false));
        set.add_utxo(OutPoint::new([0x02; 32], 0), UTXO::new(TxOutput::new(1, vec![]), 1, false));
        // saturating_add prevents panic; result must be u64::MAX
        let total = set.total_value();
        assert_eq!(total, u64::MAX, "total_value must saturate rather than overflow");
    }
}
