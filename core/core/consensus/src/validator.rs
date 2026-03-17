use chain::{Block, UtxoSet, UTXO};
use rayon::prelude::*;
use tx::{Script, Transaction};
use tx::p2sh;
use tx::script_interpreter::ScriptInterpreter;

use crate::sig_cache::SigCache;

/// Transaction validation errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    /// Input references non-existent UTXO
    MissingInput(String),
    /// Invalid signature
    InvalidSignature(usize),
    /// Coinbase in non-first position
    InvalidCoinbasePosition,
    /// Multiple coinbase transactions
    MultipleCoinbase,
    /// Input sum less than output sum
    InsufficientFunds,
    /// Coinbase output not mature
    ImmatureCoinbase,
    /// Double spend detected
    DoubleSpend,
    /// Invalid script
    InvalidScript(String),
    /// Lock time not yet reached
    LockedUntilFuture,
    /// BIP-68 relative lock-time (CSV) not satisfied
    SequenceLockNotMet,
    /// Block exceeds maximum allowed signature operations
    TooManySigops,
    /// Block exceeds maximum allowed weight (BIP-141)
    BlockTooHeavy,
    /// Coinbase reward exceeds subsidy + fees
    ExcessiveCoinbaseReward,
    /// Merkle root mismatch
    InvalidMerkleRoot,
    /// Block timestamp before median-time-past (BIP-113)
    TimestampBeforeMTP,
    /// Block version too low for current active soft forks
    BadBlockVersion,
    /// Duplicate txid in block (BIP-30)
    DuplicateTxid,
    /// NULLDUMMY violation: multisig dummy must be empty (BIP-147)
    NullDummyViolation,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingInput(s) => write!(f, "Missing input: {}", s),
            Self::InvalidSignature(i) => write!(f, "Invalid signature at input {}", i),
            Self::InvalidCoinbasePosition => write!(f, "Coinbase must be first transaction"),
            Self::MultipleCoinbase => write!(f, "Multiple coinbase transactions"),
            Self::InsufficientFunds => write!(f, "Input sum less than output sum"),
            Self::ImmatureCoinbase => write!(f, "Spending immature coinbase output"),
            Self::DoubleSpend => write!(f, "Double spend detected"),
            Self::InvalidScript(s) => write!(f, "Invalid script: {}", s),
            Self::LockedUntilFuture => write!(
                f,
                "Transaction locked until future block height or timestamp"
            ),
            Self::SequenceLockNotMet => write!(
                f,
                "BIP-68 relative lock-time (CSV) not satisfied"
            ),
            Self::TooManySigops => write!(f, "Block exceeds maximum signature operations"),
            Self::BlockTooHeavy => write!(f, "Block exceeds maximum weight"),
            Self::ExcessiveCoinbaseReward => write!(f, "Coinbase reward exceeds subsidy + fees"),
            Self::InvalidMerkleRoot => write!(f, "Block merkle root does not match transactions"),
            Self::TimestampBeforeMTP => write!(f, "Block timestamp before median-time-past"),
            Self::BadBlockVersion => write!(f, "Block version too low"),
            Self::DuplicateTxid => write!(f, "Duplicate txid in block (BIP-30)"),
            Self::NullDummyViolation => write!(f, "NULLDUMMY: multisig dummy must be empty (BIP-147)"),
        }
    }
}

impl std::error::Error for ValidationError {}

/// Validate a single transaction.
///
/// If `sig_cache` is provided, verified signatures are cached so that
/// re-validation (e.g. when a mempool tx appears in a block) is free.
pub fn validate_transaction(
    tx: &Transaction,
    utxo_set: &UtxoSet,
    current_height: u64,
) -> Result<(), ValidationError> {
    validate_transaction_cached(tx, utxo_set, current_height, None, None)
}

/// Validate a single transaction with an optional signature cache.
///
/// `mtp_at_height` — when provided, returns the Median-Time-Past for a given
/// block height. Used for BIP-68 time-based relative lock-time (CSV).
pub fn validate_transaction_cached(
    tx: &Transaction,
    utxo_set: &UtxoSet,
    current_height: u64,
    sig_cache: Option<&SigCache>,
    mtp_at_height: Option<&(dyn Fn(u64) -> u64 + Sync)>,
) -> Result<(), ValidationError> {
    // Coinbase transactions have special rules
    if tx.is_coinbase() {
        return Ok(()); // Coinbase validation happens at block level
    }

    // ── Transaction version validation ───────────────────────
    // Bitcoin allows versions 1 and 2 (version 2 required for BIP-68 CSV).
    // Reject non-standard versions to prevent future consensus issues.
    if tx.version == 0 || tx.version > 2 {
        return Err(ValidationError::InvalidScript(format!(
            "Non-standard transaction version: {} (expected 1 or 2)",
            tx.version
        )));
    }

    // ── Per-output value range check (MoneyRange) ────────────
    // Each output must be in [0, MAX_SUPPLY]. Since value is u64,
    // it cannot be negative, but it can exceed the total supply.
    for (i, output) in tx.outputs.iter().enumerate() {
        if output.value > crate::params::MAX_SUPPLY {
            return Err(ValidationError::InvalidScript(format!(
                "Output {} value {} exceeds MAX_SUPPLY {}",
                i, output.value, crate::params::MAX_SUPPLY
            )));
        }
    }

    // Validate lock_time (BIP-65 / BIP-113)
    // lock_time enforcement is skipped when ALL inputs have sequence 0xFFFFFFFF.
    // lock_time < 500000000: interpreted as block height
    // lock_time >= 500000000: interpreted as Unix timestamp (compared against MTP per BIP-113)
    let all_sequences_final = tx.inputs.iter().all(|i| i.sequence == 0xFFFFFFFF);
    if tx.lock_time != 0 && !all_sequences_final {
        if tx.lock_time < 500_000_000 {
            // Height-based lock time
            if (tx.lock_time as u64) > current_height {
                return Err(ValidationError::LockedUntilFuture);
            }
        } else {
            // Timestamp-based lock time — BIP-113: compare against MTP, not wall clock
            let current_mtp = mtp_at_height
                .map(|f| f(current_height))
                .unwrap_or_else(|| {
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                });
            if (tx.lock_time as u64) > current_mtp {
                return Err(ValidationError::LockedUntilFuture);
            }
        }
    }

    // Collect prevout amounts and scriptPubKeys for BIP-341 taproot sighash
    // (taproot_signature_hash commits to ALL prevout data, not just the
    // current input's).
    let mut prevout_amounts: Vec<u64> = Vec::with_capacity(tx.inputs.len());
    let mut prevout_scripts: Vec<Vec<u8>> = Vec::with_capacity(tx.inputs.len());
    for input in &tx.inputs {
        let utxo = utxo_set
            .get_utxo(&input.prev_output)
            .ok_or_else(|| ValidationError::MissingInput(input.prev_output.to_string()))?;
        prevout_amounts.push(utxo.output.value);
        prevout_scripts.push(utxo.output.script_pubkey.clone());
    }

    let mut input_sum = 0u64;

    // Validate each input
    for (index, input) in tx.inputs.iter().enumerate() {
        // Check UTXO exists
        let utxo = utxo_set
            .get_utxo(&input.prev_output)
            .ok_or_else(|| ValidationError::MissingInput(input.prev_output.to_string()))?;

        // Check coinbase maturity (100 blocks)
        if utxo.is_coinbase && current_height < utxo.height.saturating_add(100) {
            return Err(ValidationError::ImmatureCoinbase);
        }

        // ── BIP-68: Relative lock-time (CSV) enforcement ─────────
        // BIP-68 only applies to transactions with version >= 2.
        // If the sequence number's disable flag (bit 31) is NOT set,
        // the input is subject to a relative lock-time constraint.
        const SEQUENCE_LOCKTIME_DISABLE_FLAG: u32 = 1 << 31;
        const SEQUENCE_LOCKTIME_TYPE_FLAG: u32 = 1 << 22;
        const SEQUENCE_LOCKTIME_MASK: u32 = 0x0000ffff;

        if tx.version >= 2 && input.sequence & SEQUENCE_LOCKTIME_DISABLE_FLAG == 0 {
            if input.sequence & SEQUENCE_LOCKTIME_TYPE_FLAG != 0 {
                // Time-based relative lock-time (units of 512 seconds).
                // BIP-68: elapsed = MTP(current) - MTP(utxo_block).
                let required_seconds = ((input.sequence & SEQUENCE_LOCKTIME_MASK) as u64)
                    .checked_mul(512)
                    .unwrap_or(u64::MAX);
                if let Some(mtp_fn) = mtp_at_height {
                    let current_mtp = mtp_fn(current_height);
                    let utxo_mtp = mtp_fn(utxo.height);
                    if current_mtp < utxo_mtp.saturating_add(required_seconds) {
                        return Err(ValidationError::SequenceLockNotMet);
                    }
                } else {
                    // MTP function required for time-based CSV — reject without it.
                    return Err(ValidationError::SequenceLockNotMet);
                }
            } else {
                // Height-based relative lock-time (number of blocks)
                let required_blocks = (input.sequence & SEQUENCE_LOCKTIME_MASK) as u64;
                if current_height < utxo.height.saturating_add(required_blocks) {
                    return Err(ValidationError::SequenceLockNotMet);
                }
            }
        }

        // Verify signature (with optional cache lookup)
        verify_input_signature(tx, index, utxo, sig_cache, &prevout_amounts, &prevout_scripts)?;

        input_sum = input_sum
            .checked_add(utxo.output.value)
            .ok_or(ValidationError::InsufficientFunds)?;
    }

    // Check input sum >= output sum
    let output_sum = tx.total_output_value().ok_or(ValidationError::InsufficientFunds)?;
    if input_sum < output_sum {
        return Err(ValidationError::InsufficientFunds);
    }

    Ok(())
}

/// Verify the signature for a specific input.
/// If `sig_cache` is `Some`, the result is looked up / stored in the cache.
///
/// `prevout_amounts` and `prevout_scripts` are all-inputs prevout data needed
/// for BIP-341 taproot signature hashing.
fn verify_input_signature(
    tx: &Transaction,
    input_index: usize,
    utxo: &UTXO,
    sig_cache: Option<&SigCache>,
    prevout_amounts: &[u64],
    prevout_scripts: &[Vec<u8>],
) -> Result<(), ValidationError> {
    // Fast path: check cache first
    let cache_key = SigCache::cache_key(&tx.txid(), input_index);
    if let Some(cache) = sig_cache {
        if cache.contains(&cache_key) {
            return Ok(());
        }
    }

    let input = &tx.inputs[input_index];

    let script_sig = Script::new(input.script_sig.clone());
    let script_pubkey = Script::new(utxo.output.script_pubkey.clone());

    // ── SegWit native path (BIP-141): OP_0 <20-byte> or OP_0 <32-byte> ──
    let spk = &utxo.output.script_pubkey;
    let is_witness_v0 = (spk.len() == 22 && spk[0] == 0x00 && spk[1] == 0x14)
        || (spk.len() == 34 && spk[0] == 0x00 && spk[1] == 0x20);

    if is_witness_v0 {
        // Witness data must be present on the input
        if input.witness.is_empty() {
            return Err(ValidationError::InvalidSignature(input_index));
        }

        // Prevout value for this input (needed by BIP-143)
        let prevout_value = prevout_amounts[input_index];

        if spk.len() == 22 {
            // ── P2WPKH: witness = [signature, pubkey] ──
            if input.witness.stack.len() != 2 {
                return Err(ValidationError::InvalidSignature(input_index));
            }
            let pubkey_bytes = &input.witness.stack[1];
            let sig_bytes = &input.witness.stack[0];

            // Verify HASH160(pubkey) == program
            let pubkey_hash = {
                use sha2::Digest as _;
                let sha = sha2::Sha256::digest(pubkey_bytes);
                let rip = ripemd::Ripemd160::digest(sha);
                rip.to_vec()
            };
            if pubkey_hash != spk[2..22] {
                return Err(ValidationError::InvalidSignature(input_index));
            }

            // BIP-143 script code for P2WPKH:
            // OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
            let mut script_code = Vec::with_capacity(25);
            script_code.push(0x76); // OP_DUP
            script_code.push(0xa9); // OP_HASH160
            script_code.push(0x14); // push 20 bytes
            script_code.extend_from_slice(&spk[2..22]);
            script_code.push(0x88); // OP_EQUALVERIFY
            script_code.push(0xac); // OP_CHECKSIG

            let sighash = tx
                .segwit_v0_signature_hash(input_index, &script_code, prevout_value)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

            // Verify ECDSA signature against sighash
            let pubkey = tx::PublicKey::from_bytes(pubkey_bytes)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;
            // DER-encoded signature may have a sighash-type suffix byte — strip it
            let der_sig = if sig_bytes.last() == Some(&0x01) {
                &sig_bytes[..sig_bytes.len() - 1]
            } else {
                sig_bytes
            };
            let sig = secp256k1::ecdsa::Signature::from_der(der_sig)
                .map_err(|_| ValidationError::InvalidSignature(input_index))?;
            if !pubkey.verify(&sighash, &sig) {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        } else {
            // ── P2WSH: witness = [...items, witness_script] ──
            // Last witness item is the witness script.
            // SHA256(witness_script) must equal the 32-byte program.
            let witness_script = input.witness.stack.last()
                .ok_or(ValidationError::InvalidSignature(input_index))?;
            let script_hash = {
                use sha2::Digest as _;
                sha2::Sha256::digest(witness_script)
            };
            if script_hash.as_slice() != &spk[2..34] {
                return Err(ValidationError::InvalidSignature(input_index));
            }

            // Execute the witness script via the interpreter with BIP-143 context
            let ws = Script::new(witness_script.clone());
            let mut interpreter = ScriptInterpreter::new();
            interpreter.set_segwit_context(witness_script.clone(), prevout_value);
            // Push all witness items except the last (the script) onto the stack
            for item in &input.witness.stack[..input.witness.stack.len() - 1] {
                interpreter.push_data(item.clone());
            }
            interpreter
                .execute(&ws, tx, input_index)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;
            // CLEANSTACK: SegWit scripts must leave exactly one element on the stack
            if interpreter.stack_len() != 1 {
                return Err(ValidationError::InvalidScript(
                    "CLEANSTACK: witness script must leave exactly one stack element".to_string(),
                ));
            }
            if !interpreter.stack_top_true() {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        }
    } else if spk.len() == 34 && spk[0] == 0x51 && spk[1] == 0x20 {
        // ── Taproot / SegWit v1 (BIP-341): OP_1 <32-byte output key> ──
        if input.witness.is_empty() {
            return Err(ValidationError::InvalidSignature(input_index));
        }

        let stack = &input.witness.stack;

        // ── BIP-341 annex detection ─────────────────────────────
        // If the witness has ≥2 items and the last starts with 0x50,
        // that item is the annex (stripped before evaluation).
        let has_annex = stack.len() >= 2
            && !stack.last().unwrap().is_empty()
            && stack.last().unwrap()[0] == 0x50;
        let effective_stack: &[Vec<u8>] = if has_annex {
            &stack[..stack.len() - 1]
        } else {
            stack
        };

        if effective_stack.len() == 1
            && (effective_stack[0].len() == 64 || effective_stack[0].len() == 65)
        {
            // ── Key-path spend ──
            // Witness: [<64-byte schnorr sig>] or [<64-byte sig || sighash_type>]
            let (sig_bytes, sighash_type) = if effective_stack[0].len() == 65 {
                let ht = effective_stack[0][64];
                let base = ht & 0x1f;
                if base > 0x03 || (ht & 0x7e) != 0 {
                    return Err(ValidationError::InvalidSignature(input_index));
                }
                (&effective_stack[0][..64], ht)
            } else {
                (&effective_stack[0][..], 0x00u8)
            };

            let schnorr_sig = tx::schnorr::SchnorrSignature::from_bytes(sig_bytes)
                .map_err(|_| ValidationError::InvalidSignature(input_index))?;

            let mut output_key = [0u8; 32];
            output_key.copy_from_slice(&spk[2..34]);
            let pubkey = tx::schnorr::SchnorrPublicKey { x: output_key };

            let sighash = tx
                .taproot_signature_hash(input_index, prevout_amounts, prevout_scripts, sighash_type)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

            schnorr_sig
                .verify(&sighash, &pubkey)
                .map_err(|_| ValidationError::InvalidSignature(input_index))?;
        } else if effective_stack.len() >= 2 {
            // ── Script-path spend (BIP-341 / BIP-342) ──
            let control_bytes = &effective_stack[effective_stack.len() - 1];
            let script_bytes = &effective_stack[effective_stack.len() - 2];
            let script_inputs: Vec<Vec<u8>> = effective_stack[..effective_stack.len() - 2].to_vec();

            // Parse control block
            let control_block = tx::taproot::ControlBlock::from_bytes(control_bytes)
                .map_err(|e| ValidationError::InvalidScript(format!("bad control block: {}", e)))?;

            // Only accept standard Tapscript leaf version (0xC0)
            if control_block.leaf_version != 0xC0 {
                return Err(ValidationError::InvalidScript(
                    format!("unsupported leaf version 0x{:02x}", control_block.leaf_version),
                ));
            }

            // Verify Merkle proof: compute leaf hash → walk proof → tweak → compare output key
            let leaf = tx::taproot::TapLeaf::tapscript(script_bytes.clone());
            let leaf_hash = leaf.hash();

            let mut current_hash = leaf_hash;
            for proof_hash in &control_block.merkle_proof {
                let branch = tx::taproot::TapBranch::new(current_hash, *proof_hash);
                current_hash = branch.hash();
            }
            let merkle_root = current_hash;

            let expected_output_key = tx::taproot::tweak_public_key(
                &control_block.internal_key,
                Some(&merkle_root),
            ).map_err(|e| ValidationError::InvalidScript(format!("tweak failed: {}", e)))?;

            let mut output_key = [0u8; 32];
            output_key.copy_from_slice(&spk[2..34]);

            if expected_output_key != output_key {
                return Err(ValidationError::InvalidScript(
                    "Taproot output key mismatch".to_string(),
                ));
            }

            // Compute BIP-342 sighash for SIGHASH_DEFAULT (0x00 == ALL in tapscript)
            let sighash = tx
                .taproot_signature_hash(input_index, prevout_amounts, prevout_scripts, 0x00)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

            // Pre-compute all standard sighash types so the tapscript interpreter
            // can validate signatures that use non-default sighash types (BIP-342).
            let mut sighash_map = std::collections::HashMap::new();
            for sht in [0x01u8, 0x02, 0x03, 0x81, 0x82, 0x83] {
                if let Ok(sh) = tx.taproot_signature_hash(
                    input_index, prevout_amounts, prevout_scripts, sht,
                ) {
                    sighash_map.insert(sht, sh);
                }
            }

            // Execute Tapscript
            let mut context = tx::tapscript::TapscriptContext::new(
                sighash,
                control_block.internal_key,
                leaf,
            );
            context.sighash_map = sighash_map;

            let mut interpreter = tx::tapscript::TapscriptInterpreter::new(script_bytes.clone())
                .map_err(|e| ValidationError::InvalidScript(format!("tapscript init: {}", e)))?;

            let result = interpreter.execute(&script_inputs, &context)
                .map_err(|e| ValidationError::InvalidScript(format!("tapscript exec: {}", e)))?;

            if !result {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        } else {
            return Err(ValidationError::InvalidSignature(input_index));
        }
    } else if p2sh::is_p2sh_output(&script_pubkey) {
        // ── P2SH path ──
        // 1. Extract redeem script (last push in scriptSig)
        // 2. Verify HASH160(redeem_script) == hash in scriptPubKey
        // 3. Execute scriptSig to populate the stack
        // 4. Execute redeem script with that stack

        let sighash = tx
            .signature_hash(input_index)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        // Verify hash match first (cheap check)
        let valid_hash = p2sh::verify_p2sh(&script_sig, &script_pubkey, &sighash)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;
        if !valid_hash {
            return Err(ValidationError::InvalidSignature(input_index));
        }

        // Now execute with full interpreter: scriptSig + scriptPubKey
        // Then execute the redeem script on the resulting stack
        let mut interpreter = ScriptInterpreter::new();

        // Step 1: Execute scriptSig to push data onto the stack
        interpreter
            .execute(&script_sig, tx, input_index)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        // Step 2: Execute the scriptPubKey (OP_HASH160 <hash> OP_EQUAL)
        // This will hash the top stack item and compare — verifying the redeem script hash
        interpreter
            .execute(&script_pubkey, tx, input_index)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        if !interpreter.stack_top_true() {
            return Err(ValidationError::InvalidSignature(input_index));
        }

        // Step 3: Now run the redeem script itself against the remaining stack
        // Re-create interpreter with the signature data (everything except the redeem script)
        let mut interpreter2 = ScriptInterpreter::new();

        // Push everything from scriptSig except the last element (redeem script)
        // by re-executing scriptSig and popping the redeem script off
        interpreter2
            .execute(&script_sig, tx, input_index)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        // Pop the redeem script off the stack (it's the last push)
        // and execute it as a script
        let redeem_bytes = interpreter2.pop_top()
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        // ── P2SH-wrapped witness programs (BIP-141 § P2SH) ──────
        // If the redeem script is itself a witness program (OP_0 <20> or
        // OP_0 <32>), treat it as P2SH-P2WPKH or P2SH-P2WSH.
        let is_p2sh_p2wpkh = redeem_bytes.len() == 22
            && redeem_bytes[0] == 0x00
            && redeem_bytes[1] == 0x14;
        let is_p2sh_p2wsh = redeem_bytes.len() == 34
            && redeem_bytes[0] == 0x00
            && redeem_bytes[1] == 0x20;

        if is_p2sh_p2wpkh {
            // ── P2SH-P2WPKH ──
            if input.witness.is_empty() || input.witness.stack.len() != 2 {
                return Err(ValidationError::InvalidSignature(input_index));
            }
            let prevout_value = prevout_amounts[input_index];
            let pubkey_bytes = &input.witness.stack[1];
            let sig_bytes = &input.witness.stack[0];

            let pubkey_hash = {
                use sha2::Digest as _;
                let sha = sha2::Sha256::digest(pubkey_bytes);
                let rip = ripemd::Ripemd160::digest(sha);
                rip.to_vec()
            };
            if pubkey_hash != redeem_bytes[2..22] {
                return Err(ValidationError::InvalidSignature(input_index));
            }

            let mut script_code = Vec::with_capacity(25);
            script_code.push(0x76); // OP_DUP
            script_code.push(0xa9); // OP_HASH160
            script_code.push(0x14); // push 20 bytes
            script_code.extend_from_slice(&redeem_bytes[2..22]);
            script_code.push(0x88); // OP_EQUALVERIFY
            script_code.push(0xac); // OP_CHECKSIG

            let sighash = tx
                .segwit_v0_signature_hash(input_index, &script_code, prevout_value)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

            let pubkey = tx::PublicKey::from_bytes(pubkey_bytes)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;
            let der_sig = if sig_bytes.last() == Some(&0x01) {
                &sig_bytes[..sig_bytes.len() - 1]
            } else {
                sig_bytes
            };
            let sig = secp256k1::ecdsa::Signature::from_der(der_sig)
                .map_err(|_| ValidationError::InvalidSignature(input_index))?;
            if !pubkey.verify(&sighash, &sig) {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        } else if is_p2sh_p2wsh {
            // ── P2SH-P2WSH ──
            if input.witness.is_empty() {
                return Err(ValidationError::InvalidSignature(input_index));
            }
            let prevout_value = prevout_amounts[input_index];
            let witness_script = input.witness.stack.last()
                .ok_or(ValidationError::InvalidSignature(input_index))?;
            let script_hash = {
                use sha2::Digest as _;
                sha2::Sha256::digest(witness_script)
            };
            if script_hash.as_slice() != &redeem_bytes[2..34] {
                return Err(ValidationError::InvalidSignature(input_index));
            }

            let ws = Script::new(witness_script.clone());
            let mut interpreter3 = ScriptInterpreter::new();
            interpreter3.set_segwit_context(witness_script.clone(), prevout_value);
            for item in &input.witness.stack[..input.witness.stack.len() - 1] {
                interpreter3.push_data(item.clone());
            }
            interpreter3
                .execute(&ws, tx, input_index)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;
            // CLEANSTACK: SegWit scripts must leave exactly one element on the stack
            if interpreter3.stack_len() != 1 {
                return Err(ValidationError::InvalidScript(
                    "CLEANSTACK: witness script must leave exactly one stack element".to_string(),
                ));
            }
            if !interpreter3.stack_top_true() {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        } else {
            // Regular P2SH: execute the redeem script
            let redeem_script = Script::new(redeem_bytes);
            interpreter2
                .execute(&redeem_script, tx, input_index)
                .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

            // BIP-62 CLEANSTACK: exactly one element must remain
            if interpreter2.stack_len() != 1 {
                return Err(ValidationError::InvalidScript(
                    "CLEANSTACK: P2SH redeem script must leave exactly one stack element".to_string(),
                ));
            }
            if !interpreter2.stack_top_true() {
                return Err(ValidationError::InvalidSignature(input_index));
            }
        }
    } else {
        // ── P2PKH fast path ──
        let sighash = tx
            .signature_hash(input_index)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        let valid = Script::verify_p2pkh(&script_sig, &script_pubkey, &sighash)
            .map_err(|e| ValidationError::InvalidScript(e.to_string()))?;

        if !valid {
            return Err(ValidationError::InvalidSignature(input_index));
        }
    }

    // Store successful verification in cache
    if let Some(cache) = sig_cache {
        cache.insert(cache_key);
    }

    Ok(())
}

/// Count signature operations in a script by scanning for relevant opcodes.
///
/// OP_CHECKSIG (0xac) and OP_CHECKSIGVERIFY (0xad) count as 1 each.
/// OP_CHECKMULTISIG (0xae) and OP_CHECKMULTISIGVERIFY (0xaf): if the
/// preceding opcode is OP_1..OP_16, count N sigops (the pubkey count);
/// otherwise fall back to the conservative 20.
///
/// If `accurate` is true, examine the byte before CHECKMULTISIG to extract
/// the actual N. When false, always count 20 (legacy pre-P2SH behaviour).
fn count_sigops_internal(script: &[u8], accurate: bool) -> usize {
    let mut count = 0usize;
    let mut last_opcode: u8 = 0xff;
    let mut i = 0;
    while i < script.len() {
        let op = script[i];
        match op {
            // Push-data: skip the payload so we don't mis-count data bytes.
            0x01..=0x4b => {
                // OP_PUSHBYTESn — next `op` bytes are data
                i += op as usize;
            }
            0x4c => {
                // OP_PUSHDATA1
                if i + 1 < script.len() {
                    i += 1 + script[i + 1] as usize;
                }
            }
            0x4d => {
                // OP_PUSHDATA2
                if i + 2 < script.len() {
                    let len = u16::from_le_bytes([script[i + 1], script[i + 2]]) as usize;
                    i += 2 + len;
                }
            }
            0x4e => {
                // OP_PUSHDATA4
                if i + 4 < script.len() {
                    let len = u32::from_le_bytes([
                        script[i + 1],
                        script[i + 2],
                        script[i + 3],
                        script[i + 4],
                    ]) as usize;
                    i += 4 + len;
                }
            }
            0xac | 0xad => count += 1, // OP_CHECKSIG / OP_CHECKSIGVERIFY
            0xae | 0xaf => {
                // OP_CHECKMULTISIG / OP_CHECKMULTISIGVERIFY
                if accurate && (0x51..=0x60).contains(&last_opcode) {
                    // OP_1 (0x51) .. OP_16 (0x60) — use actual N
                    count += (last_opcode - 0x50) as usize;
                } else {
                    count += 20; // Conservative worst-case
                }
            }
            _ => {}
        }
        last_opcode = op;
        i += 1;
    }
    count
}

/// Count sigops conservatively (legacy / scriptPubKey / scriptSig).
pub fn count_sigops(script: &[u8]) -> usize {
    count_sigops_internal(script, false)
}

/// Count sigops accurately (P2SH redeem scripts, witness scripts).
pub fn count_sigops_accurate(script: &[u8]) -> usize {
    count_sigops_internal(script, true)
}

/// Extract the last push-data element from a script (used for P2SH redeem scripts).
pub fn last_push_data(script: &[u8]) -> Option<&[u8]> {
    let mut i = 0;
    let mut last_start = None;
    let mut last_end = None;
    while i < script.len() {
        let op = script[i];
        match op {
            0x01..=0x4b => {
                let len = op as usize;
                if i + 1 + len <= script.len() {
                    last_start = Some(i + 1);
                    last_end = Some(i + 1 + len);
                    i += 1 + len;
                } else {
                    break;
                }
            }
            0x4c => {
                // OP_PUSHDATA1
                if i + 1 < script.len() {
                    let len = script[i + 1] as usize;
                    if i + 2 + len <= script.len() {
                        last_start = Some(i + 2);
                        last_end = Some(i + 2 + len);
                        i += 2 + len;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            0x4d => {
                // OP_PUSHDATA2
                if i + 2 < script.len() {
                    let len = u16::from_le_bytes([script[i + 1], script[i + 2]]) as usize;
                    if i + 3 + len <= script.len() {
                        last_start = Some(i + 3);
                        last_end = Some(i + 3 + len);
                        i += 3 + len;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            0x4e => {
                // OP_PUSHDATA4
                if i + 4 < script.len() {
                    let len = u32::from_le_bytes([
                        script[i + 1],
                        script[i + 2],
                        script[i + 3],
                        script[i + 4],
                    ]) as usize;
                    if i + 5 + len <= script.len() {
                        last_start = Some(i + 5);
                        last_end = Some(i + 5 + len);
                        i += 5 + len;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            _ => {
                i += 1;
            }
        }
    }
    match (last_start, last_end) {
        (Some(s), Some(e)) => Some(&script[s..e]),
        _ => None,
    }
}

/// Compute the BIP-141 weighted sigop cost for a single transaction.
///
/// Returns the total sigop cost in weight units.  
/// Legacy sigops (scriptSig / scriptPubKey) are multiplied by 4;
/// witness sigops (P2WPKH, P2WSH witness scripts) count at ×1.
pub fn tx_sigop_cost(tx: &Transaction, utxo_set: &UtxoSet) -> usize {
    let mut cost = 0usize;
    for input in &tx.inputs {
        cost += count_sigops(&input.script_sig) * 4;

        if let Some(utxo) = utxo_set.get_utxo(&input.prev_output) {
            let spk = &utxo.output.script_pubkey;
            let is_p2sh = spk.len() == 23 && spk[0] == 0xa9 && spk[1] == 0x14 && spk[22] == 0x87;
            if is_p2sh {
                if let Some(redeem) = last_push_data(&input.script_sig) {
                    cost += count_sigops_accurate(redeem) * 4;
                }
            }
            if !input.witness.is_empty() {
                let is_p2wsh = spk.len() == 34 && spk[0] == 0x00 && spk[1] == 0x20;
                let is_p2wpkh = spk.len() == 22 && spk[0] == 0x00 && spk[1] == 0x14;
                let is_p2sh_p2wsh = is_p2sh && {
                    if let Some(r) = last_push_data(&input.script_sig) {
                        r.len() == 34 && r[0] == 0x00 && r[1] == 0x20
                    } else {
                        false
                    }
                };
                if is_p2wsh || is_p2sh_p2wsh {
                    if let Some(ws) = input.witness.stack.last() {
                        cost += count_sigops_accurate(ws);
                    }
                } else if is_p2wpkh {
                    cost += 1;
                }
            }
        }
    }
    for output in &tx.outputs {
        cost += count_sigops(&output.script_pubkey) * 4;
    }
    cost
}

/// Maximum per-transaction sigop cost (policy, not consensus).
pub const MAX_STANDARD_TX_SIGOPS_COST: usize = 16_000;

/// Validate a block's transactions.
pub fn validate_block(block: &Block, utxo_set: &UtxoSet) -> Result<(), ValidationError> {
    validate_block_cached(block, utxo_set, None, None)
}

/// Validate a block but skip script/signature verification.
/// Used for blocks behind the assume-valid point during IBD.
/// Still checks structure, amounts, merkle root, double-spends, sigops, etc.
pub fn validate_block_no_scripts(block: &Block, utxo_set: &UtxoSet) -> Result<(), ValidationError> {
    validate_block_full(block, utxo_set, None, None, true)
}

/// Validate a block without script verification, but with BIP-113 MTP enforcement.
///
/// Like `validate_block_no_scripts` but accepts a `mtp_at_height` closure so
/// that the block timestamp check and timestamp-based lock_time comparisons use
/// Median-Time-Past instead of falling back to wall clock.
pub fn validate_block_no_scripts_with_mtp(
    block: &Block,
    utxo_set: &UtxoSet,
    mtp_at_height: Option<&(dyn Fn(u64) -> u64 + Sync)>,
) -> Result<(), ValidationError> {
    validate_block_full(block, utxo_set, None, mtp_at_height, true)
}

/// Validate a block's transactions with an optional signature cache.
pub fn validate_block_cached(
    block: &Block,
    utxo_set: &UtxoSet,
    sig_cache: Option<&SigCache>,
    mtp_at_height: Option<&(dyn Fn(u64) -> u64 + Sync)>,
) -> Result<(), ValidationError> {
    validate_block_full(block, utxo_set, sig_cache, mtp_at_height, false)
}

/// Core block validation with optional script skipping (assume-valid IBD).
fn validate_block_full(
    block: &Block,
    utxo_set: &UtxoSet,
    sig_cache: Option<&SigCache>,
    mtp_at_height: Option<&(dyn Fn(u64) -> u64 + Sync)>,
    skip_scripts: bool,
) -> Result<(), ValidationError> {
    if block.transactions.is_empty() {
        return Err(ValidationError::InvalidCoinbasePosition);
    }

    // BIP-141: block weight must not exceed MAX_BLOCK_WEIGHT (4,000,000 WU).
    if block.weight() > chain::MAX_BLOCK_WEIGHT {
        return Err(ValidationError::BlockTooHeavy);
    }

    // ── BIP-113: block timestamp must be > median-time-past ──────
    if let Some(ref mtp_fn) = mtp_at_height {
        let height = block.header.height;
        if height > 0 {
            let mtp = mtp_fn(height.saturating_sub(1));
            if block.header.timestamp <= mtp {
                return Err(ValidationError::TimestampBeforeMTP);
            }
        }
    }

    // ── Block version enforcement (BIP-9) ────────────────────────
    // After activation, blocks MUST have the top 3 bits set to 001.
    {
        let v = block.header.version;
        if v < 0 || (v & crate::version_bits::VERSION_BITS_TOP_MASK) == 0 {
            return Err(ValidationError::BadBlockVersion);
        }
    }

    // ── BIP-30: no duplicate txids in UTXO set ──────────────────
    // A block must not contain a txid that already has unspent outputs.
    for tx in &block.transactions {
        let txid = tx.txid();
        // Check if any output of this txid already exists in the UTXO set
        for idx in 0..tx.outputs.len() {
            let op = tx::OutPoint::new(txid, idx as u32);
            if utxo_set.get_utxo(&op).is_some() {
                return Err(ValidationError::DuplicateTxid);
            }
        }
    }

    // First transaction must be coinbase
    if !block.transactions[0].is_coinbase() {
        return Err(ValidationError::InvalidCoinbasePosition);
    }

    // No other transactions should be coinbase
    for tx in &block.transactions[1..] {
        if tx.is_coinbase() {
            return Err(ValidationError::MultipleCoinbase);
        }
    }

    // Per-block sigops budget (BIP-141 weight-based):
    // Legacy sigops (in scriptSig/scriptPubKey) cost 4 weight units each.
    // Witness sigops (in witness scripts) cost 1 weight unit each.
    // Budget: MAX_BLOCK_SIGOPS_COST = 80,000 (weight units).
    const MAX_BLOCK_SIGOPS_COST: usize = 80_000;
    let total_sigops_cost: usize = block.transactions[1..]
        .iter()
        .map(|tx| tx_sigop_cost(tx, utxo_set))
        .sum();
    if total_sigops_cost > MAX_BLOCK_SIGOPS_COST {
        return Err(ValidationError::TooManySigops);
    }

    // Validate each non-coinbase transaction in parallel
    // When skip_scripts is true (assume-valid IBD), we only check amounts/structure.
    if !skip_scripts {
        let validation_results: Vec<Result<(), ValidationError>> = block.transactions[1..]
            .par_iter()
            .map(|tx| validate_transaction_cached(tx, utxo_set, block.header.height, sig_cache, mtp_at_height))
            .collect();

        // Check for any validation errors
        for result in validation_results {
            result?;
        }

        // ── Schnorr batch verification ───────────────────────────────
        // In addition to the per-tx individual verification above (which
        // also uses the sig cache), accumulate all taproot key-path
        // signatures across the block and verify them together.  This
        // enables a future optimisation to a single multi-scalar-
        // multiplication once the underlying EC primitives support it.
        let mut batch = tx::schnorr::BatchVerifier::new();
        for tx in &block.transactions[1..] {
            for (input_index, input) in tx.inputs.iter().enumerate() {
                let utxo = match utxo_set.get_utxo(&input.prev_output) {
                    Some(u) => u,
                    None => continue,
                };
                let spk = &utxo.output.script_pubkey;
                // Only taproot key-path: OP_1 <32-byte-key>, single-sig witness
                if spk.len() != 34 || spk[0] != 0x51 || spk[1] != 0x20 {
                    continue;
                }
                let stack = &input.witness.stack;
                let has_annex = stack.len() >= 2
                    && stack.last().map_or(false, |a| !a.is_empty() && a[0] == 0x50);
                let eff_len = if has_annex { stack.len() - 1 } else { stack.len() };
                if eff_len != 1 {
                    continue; // script-path, handled per-tx above
                }
                let sig_elem = &stack[0];
                if sig_elem.len() != 64 && sig_elem.len() != 65 {
                    continue;
                }

                // Collect prevout data for this tx
                let prevout_amounts: Vec<u64> = tx.inputs.iter()
                    .filter_map(|i| utxo_set.get_utxo(&i.prev_output).map(|u| u.output.value))
                    .collect();
                let prevout_scripts: Vec<Vec<u8>> = tx.inputs.iter()
                    .filter_map(|i| utxo_set.get_utxo(&i.prev_output).map(|u| u.output.script_pubkey.clone()))
                    .collect();
                if prevout_amounts.len() != tx.inputs.len() {
                    continue;
                }

                let (sig_bytes, sighash_type) = if sig_elem.len() == 65 {
                    (&sig_elem[..64], sig_elem[64])
                } else {
                    (&sig_elem[..], 0x00u8)
                };
                let Ok(sig) = tx::schnorr::SchnorrSignature::from_bytes(sig_bytes) else {
                    continue;
                };
                let mut output_key = [0u8; 32];
                output_key.copy_from_slice(&spk[2..34]);
                let pubkey = tx::schnorr::SchnorrPublicKey { x: output_key };
                let Ok(sighash) = tx.taproot_signature_hash(
                    input_index, &prevout_amounts, &prevout_scripts, sighash_type,
                ) else {
                    continue;
                };
                batch.add(sig, sighash, pubkey);
            }
        }
        // Any Schnorr signature that was cached individually above will be
        // re-verified here; this is intentional during the transition period.
        if let Err(_) = batch.verify_all() {
            return Err(ValidationError::InvalidSignature(0));
        }
    }

    // Check for double spends within the block
    let mut spent_outpoints = std::collections::HashSet::new();
    for tx in &block.transactions[1..] {
        for input in &tx.inputs {
            if !spent_outpoints.insert(input.prev_output) {
                return Err(ValidationError::DoubleSpend);
            }
        }
    }

    // ── Coinbase reward validation ───────────────────────────
    // The coinbase output value must not exceed the block subsidy + total
    // fees from included transactions.  Without this check a malicious
    // miner could inflate supply arbitrarily.
    {
        let height = block.header.height;
        let subsidy = crate::params::block_subsidy(height);

        // Sum fees from non-coinbase transactions (inputs - outputs).
        let total_fees: u64 = block.transactions[1..]
            .iter()
            .map(|tx| {
                let input_sum: u64 = tx.inputs.iter().filter_map(|inp| {
                    utxo_set.get_utxo(&inp.prev_output).map(|u| u.output.value)
                }).sum();
                let output_sum: u64 = tx.outputs.iter().map(|o| o.value).sum();
                input_sum.saturating_sub(output_sum)
            })
            .sum();

        let coinbase_value: u64 = block.transactions[0].outputs.iter().map(|o| o.value).sum();
        let max_allowed = subsidy.saturating_add(total_fees);
        if coinbase_value > max_allowed {
            return Err(ValidationError::ExcessiveCoinbaseReward);
        }
    }

    // ── Merkle root verification ─────────────────────────────
    if !block.verify_merkle_root() {
        return Err(ValidationError::InvalidMerkleRoot);
    }

    // ── BIP-141 witness commitment verification ──────────────
    // If any non-coinbase transaction has witness data, the coinbase
    // must contain an OP_RETURN output with the witness commitment:
    //   0x6a 0x24 0xaa21a9ed <SHA256d(witness_merkle_root || nonce)>
    {
        let has_witness = block.transactions[1..]
            .iter()
            .any(|tx| tx.inputs.iter().any(|inp| !inp.witness.is_empty()));

        if has_witness {
            let coinbase = &block.transactions[0];

            // The witness nonce is the first item of the coinbase witness stack
            let nonce = if coinbase.inputs[0].witness.is_empty() {
                [0u8; 32] // Default nonce if no witness data in coinbase
            } else {
                let nonce_data = &coinbase.inputs[0].witness.stack[0];
                if nonce_data.len() != 32 {
                    return Err(ValidationError::InvalidScript(
                        "Witness nonce must be 32 bytes".into(),
                    ));
                }
                let mut n = [0u8; 32];
                n.copy_from_slice(nonce_data);
                n
            };

            let witness_root = Block::calculate_witness_merkle_root(&block.transactions);

            // commitment = SHA256d(witness_merkle_root || nonce)
            use sha2::{Digest, Sha256};
            let mut hasher_input = Vec::with_capacity(64);
            hasher_input.extend_from_slice(&witness_root);
            hasher_input.extend_from_slice(&nonce);
            let h1 = Sha256::digest(&hasher_input);
            let commitment: [u8; 32] = Sha256::digest(h1).into();

            // Expected OP_RETURN output: OP_RETURN(0x6a) PUSH36(0x24) MAGIC(aa21a9ed) commitment
            let mut expected = vec![0x6a, 0x24, 0xaa, 0x21, 0xa9, 0xed];
            expected.extend_from_slice(&commitment);

            let found = coinbase.outputs.iter().any(|out| {
                out.script_pubkey.len() >= 38
                    && out.script_pubkey[0] == 0x6a
                    && out.script_pubkey[1] == 0x24
                    && out.script_pubkey[2..6] == [0xaa, 0x21, 0xa9, 0xed]
                    && out.script_pubkey[6..38] == commitment
            });

            if !found {
                return Err(ValidationError::InvalidScript(
                    "Missing or invalid BIP-141 witness commitment in coinbase".into(),
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tx::{OutPoint, PrivateKey, TxInput, TxOutput};

    fn create_test_utxo_set() -> (UtxoSet, OutPoint, PrivateKey) {
        let mut utxo_set = UtxoSet::new();
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let pubkey_hash = pubkey.hash();

        // Create a UTXO
        let output = TxOutput::new_p2pkh(1000, pubkey_hash);
        let txid = [0x42u8; 32];
        let outpoint = OutPoint::new(txid, 0);
        let utxo = UTXO::new(output, 0, false);

        utxo_set.add_utxo(outpoint, utxo);

        (utxo_set, outpoint, privkey)
    }

    #[test]
    fn test_validate_valid_transaction() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Create a valid transaction
        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(900, vec![0xcd]); // 100 fee
        let mut tx = Transaction::new(vec![input], vec![output], 0);

        // Sign the transaction
        tx.sign_input(0, &privkey).unwrap();

        // Validate
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_missing_input() {
        let utxo_set = UtxoSet::new();

        let input = TxInput::new(OutPoint::new([0x42u8; 32], 0), vec![]);
        let output = TxOutput::new(100, vec![]);
        let tx = Transaction::new(vec![input], vec![output], 0);

        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::MissingInput(_))));
    }

    #[test]
    fn test_validate_insufficient_funds() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Try to spend more than we have
        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(2000, vec![0xcd]); // More than input
        let mut tx = Transaction::new(vec![input], vec![output], 0);

        tx.sign_input(0, &privkey).unwrap();

        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::InsufficientFunds)));
    }

    #[test]
    fn test_validate_immature_coinbase() {
        let mut utxo_set = UtxoSet::new();
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let pubkey_hash = pubkey.hash();

        // Create a coinbase UTXO at height 50
        let output = TxOutput::new_p2pkh(1000, pubkey_hash);
        let outpoint = OutPoint::new([0x42u8; 32], 0);
        let utxo = UTXO::new(output, 50, true); // Coinbase = true
        utxo_set.add_utxo(outpoint, utxo);

        // Try to spend at height 100 (only 50 blocks, need 100)
        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(900, vec![]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);
        tx.sign_input(0, &privkey).unwrap();

        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::ImmatureCoinbase)));

        // Should succeed at height 150
        let result = validate_transaction(&tx, &utxo_set, 150);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_invalid_signature() {
        let (utxo_set, outpoint, _) = create_test_utxo_set();
        let wrong_privkey = PrivateKey::new(); // Different key

        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(900, vec![]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);

        // Sign with wrong key
        tx.sign_input(0, &wrong_privkey).unwrap();

        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::InvalidSignature(_))));
    }

    #[test]
    fn test_validate_coinbase_transaction() {
        let utxo_set = UtxoSet::new();
        let tx = Transaction::new_coinbase(0, 50_000_000, vec![0xab]);

        // Coinbase validation always succeeds (checked at block level)
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_height_based_locktime_future() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Create transaction with lock_time = 200 (height)
        let mut input = TxInput::new(outpoint, vec![]);
        input.sequence = 0xFFFFFFFE; // non-final so lock_time is enforced
        let output = TxOutput::new(900, vec![0xcd]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);
        tx.lock_time = 200; // Locked until height 200
        tx.sign_input(0, &privkey).unwrap();

        // Should fail at height 100
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::LockedUntilFuture)));

        // Should succeed at height 200
        let result = validate_transaction(&tx, &utxo_set, 200);
        assert!(result.is_ok());

        // Should succeed at height 250
        let result = validate_transaction(&tx, &utxo_set, 250);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_timestamp_based_locktime_future() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Create transaction with timestamp lock_time (far future)
        let mut input = TxInput::new(outpoint, vec![]);
        input.sequence = 0xFFFFFFFE; // non-final so lock_time is enforced
        let output = TxOutput::new(900, vec![0xcd]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);

        // Use a timestamp far in the future (year 2100)
        tx.lock_time = 4_102_444_800; // Jan 1, 2100
        tx.sign_input(0, &privkey).unwrap();

        // Should fail with current time
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(matches!(result, Err(ValidationError::LockedUntilFuture)));
    }

    #[test]
    fn test_validate_timestamp_based_locktime_past() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Create transaction with timestamp lock_time (past)
        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(900, vec![0xcd]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);

        // Use a timestamp in the past (year 2020)
        tx.lock_time = 1_577_836_800; // Jan 1, 2020
        tx.sign_input(0, &privkey).unwrap();

        // Should succeed
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_zero_locktime() {
        let (utxo_set, outpoint, privkey) = create_test_utxo_set();

        // Create transaction with lock_time = 0 (not locked)
        let input = TxInput::new(outpoint, vec![]);
        let output = TxOutput::new(900, vec![0xcd]);
        let mut tx = Transaction::new(vec![input], vec![output], 0);
        tx.lock_time = 0; // No lock
        tx.sign_input(0, &privkey).unwrap();

        // Should always succeed
        let result = validate_transaction(&tx, &utxo_set, 100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_block_exceeding_sigops_limit_rejected() {
        use chain::{Block, BlockHeader};

        let utxo_set = UtxoSet::new();

        // Coinbase transaction
        let coinbase_input = TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01]);
        let coinbase = Transaction::new(vec![coinbase_input], vec![TxOutput::new(5000, vec![0xcd])], 0);

        // Each tx has an output containing 1000 OP_CHECKSIG (0xac) opcodes
        // → 1000 sigops per tx.  81 txs × 1000 = 81,000 > 80,000 limit.
        let script_with_sigops: Vec<u8> = vec![0xac; 1000]; // 1000 × OP_CHECKSIG

        let mut transactions = vec![coinbase];
        for i in 0..81u8 {
            let mut txid = [0u8; 32];
            txid[31] = i;
            let input = TxInput::new(OutPoint::new(txid, 0), vec![]);
            let output = TxOutput::new(1, script_with_sigops.clone());
            let tx = Transaction::new(vec![input], vec![output], 0);
            transactions.push(tx);
        }

        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root: [0u8; 32],
                timestamp: 0,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions,
        };

        // 81 txs × 1000 OP_CHECKSIG = 81,000 > 80,000 limit
        let result = validate_block(&block, &utxo_set);
        assert!(
            matches!(result, Err(ValidationError::TooManySigops)),
            "Expected TooManySigops, got: {:?}",
            result,
        );
    }

    #[test]
    fn test_count_sigops_checksig() {
        // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
        let script = vec![0x76, 0xa9, 0x14,
            0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
            0x88, 0xac];
        assert_eq!(count_sigops(&script), 1);
    }

    #[test]
    fn test_count_sigops_multisig_conservative() {
        // OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
        // Legacy counting does NOT look at OP_3 → always 20
        let mut script = vec![0x52]; // OP_2
        for _ in 0..3 {
            script.push(0x21); // push 33 bytes
            script.extend_from_slice(&[0x02; 33]);
        }
        script.push(0x53); // OP_3
        script.push(0xae); // OP_CHECKMULTISIG
        assert_eq!(count_sigops(&script), 20);
    }

    #[test]
    fn test_count_sigops_multisig_accurate() {
        // Same 2-of-3 multisig, accurate mode → should count 3 (the N)
        let mut script = vec![0x52]; // OP_2
        for _ in 0..3 {
            script.push(0x21); // push 33 bytes
            script.extend_from_slice(&[0x02; 33]);
        }
        script.push(0x53); // OP_3
        script.push(0xae); // OP_CHECKMULTISIG
        assert_eq!(count_sigops_accurate(&script), 3);
    }

    #[test]
    fn test_count_sigops_multisig_accurate_15_of_15() {
        // 15-of-15 multisig — OP_15 (0x5f) before OP_CHECKMULTISIG
        let mut script = vec![0x5f]; // OP_15 (M)
        for _ in 0..15 {
            script.push(0x21); // push 33 bytes
            script.extend_from_slice(&[0x02; 33]);
        }
        script.push(0x5f); // OP_15 (N)
        script.push(0xae); // OP_CHECKMULTISIG
        assert_eq!(count_sigops_accurate(&script), 15);
    }

    #[test]
    fn test_last_push_data() {
        // scriptSig: <sig> <redeem_script>
        // Push 4 bytes then push 3 bytes
        let script = vec![0x04, 0xaa, 0xbb, 0xcc, 0xdd, 0x03, 0x11, 0x22, 0x33];
        let last = last_push_data(&script).unwrap();
        assert_eq!(last, &[0x11, 0x22, 0x33]);
    }

    #[test]
    fn test_last_push_data_empty() {
        // OP_TRUE (0x51) — no push data
        let script = vec![0x51];
        assert!(last_push_data(&script).is_none());
    }

    #[test]
    fn test_block_exceeding_weight_limit_rejected() {
        use chain::{Block, BlockHeader};

        let utxo_set = UtxoSet::new();

        // Coinbase transaction
        let coinbase_input = TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01]);
        let coinbase = Transaction::new(
            vec![coinbase_input],
            vec![TxOutput::new(5000, vec![0xcd])],
            0,
        );

        // Create a massive transaction with a huge scriptPubKey to blow past 4 MW.
        // A single non-witness output with ~1.01 MB script → base_size ≈ 1.01 MB
        // → weight ≈ 4.04 MW (all legacy, no witness discount).
        let big_script = vec![0x00; 1_010_000]; // ~1.01 MB
        let big_tx = Transaction::new(
            vec![TxInput::new(OutPoint::new([1u8; 32], 0), vec![])],
            vec![TxOutput::new(1, big_script)],
            0,
        );

        let transactions = vec![coinbase, big_tx];
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root: [0u8; 32],
                timestamp: 0,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions,
        };

        assert!(
            block.weight() > chain::MAX_BLOCK_WEIGHT,
            "Test block should exceed weight limit"
        );

        let result = validate_block(&block, &utxo_set);
        assert!(
            matches!(result, Err(ValidationError::BlockTooHeavy)),
            "Expected BlockTooHeavy, got: {:?}",
            result,
        );
    }

    #[test]
    fn test_block_within_weight_limit_accepted() {
        use chain::{Block, BlockHeader};

        let utxo_set = UtxoSet::new();

        // A small block should pass the weight check (may fail on sigs, but NOT on weight)
        let coinbase_input = TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01]);
        let coinbase = Transaction::new(
            vec![coinbase_input],
            vec![TxOutput::new(5000, vec![0xcd])],
            0,
        );

        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);

        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 0,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };

        assert!(block.weight() < chain::MAX_BLOCK_WEIGHT);

        // Should pass validation (coinbase-only block is valid)
        let result = validate_block(&block, &utxo_set);
        assert!(result.is_ok(), "Single-coinbase block should be valid: {:?}", result);
    }

    #[test]
    fn test_block_timestamp_before_mtp_rejected() {
        use chain::{Block, BlockHeader};

        let utxo_set = UtxoSet::new();
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(5000, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 10,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 100, // deliberately <= MTP
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };

        // MTP callback always returns 200 so timestamp=100 is too old
        let mtp_fn = |_h: u64| -> u64 { 200 };
        let result = validate_block_cached(&block, &utxo_set, None, Some(&mtp_fn));
        assert!(matches!(result, Err(ValidationError::TimestampBeforeMTP)));
    }

    #[test]
    fn test_block_bad_version_rejected() {
        use chain::{Block, BlockHeader};

        let utxo_set = UtxoSet::new();
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(5000, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 1, // old-style version without BIP-9 top bits
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };

        let result = validate_block_cached(&block, &utxo_set, None, None);
        assert!(matches!(result, Err(ValidationError::BadBlockVersion)));
    }

    #[test]
    fn test_bip30_duplicate_txid_rejected() {
        use chain::{Block, BlockHeader};

        let mut utxo_set = UtxoSet::new();

        // Create a coinbase tx and pre-populate UTXO set with its output
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(5000, vec![0xcd])],
            0,
        );
        let txid = coinbase.txid();
        utxo_set.add_utxo(OutPoint::new(txid, 0), chain::utxo::UTXO::new(TxOutput::new(5000, vec![0xcd]), 1, true));

        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 2,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };

        let result = validate_block_cached(&block, &utxo_set, None, None);
        assert!(matches!(result, Err(ValidationError::DuplicateTxid)));
    }

    #[test]
    fn test_tx_sigop_cost_legacy_checksig() {
        // A P2PKH scriptPubKey: OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
        // has 1 sigop in scriptPubKey → 4 weight units
        let utxo_set = UtxoSet::new();
        let tx = Transaction::new(
            vec![TxInput::new(OutPoint::new([1u8; 32], 0), vec![])],
            vec![TxOutput::new(1000, vec![0x76, 0xa9, 0x14,
                0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                0x88, 0xac])],
            0,
        );
        let cost = tx_sigop_cost(&tx, &utxo_set);
        // scriptPubKey has OP_CHECKSIG (0xac) → 1 sigop × 4 = 4
        assert_eq!(cost, 4);
    }

    #[test]
    fn test_tx_sigop_cost_p2wpkh() {
        // P2WPKH input spending from a P2WPKH scriptPubKey (0x00 0x14 <20 bytes>)
        let mut utxo_set = UtxoSet::new();
        let prev_op = OutPoint::new([2u8; 32], 0);
        let p2wpkh_spk = {
            let mut v = vec![0x00, 0x14];
            v.extend_from_slice(&[0xaa; 20]);
            v
        };
        utxo_set.add_utxo(
            prev_op.clone(),
            chain::utxo::UTXO::new(TxOutput::new(5000, p2wpkh_spk), 1, false),
        );

        let mut input = TxInput::new(prev_op, vec![]);
        input.witness = tx::Witness { stack: vec![vec![0x30; 72], vec![0x02; 33]] };

        let tx = Transaction::new(
            vec![input],
            vec![TxOutput::new(4000, vec![0x51])],
            0,
        );
        let cost = tx_sigop_cost(&tx, &utxo_set);
        // P2WPKH: 1 sigop × 1 weight = 1
        assert_eq!(cost, 1);
    }

    #[test]
    fn test_max_standard_tx_sigops_cost() {
        assert_eq!(MAX_STANDARD_TX_SIGOPS_COST, 16_000);
    }

    // ── Validator hardening tests ─────────────────────────────────────────────

    fn make_coinbase_block(height: u64, coinbase_value: u64) -> (Block, UtxoSet) {
        use chain::{Block, BlockHeader};
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(coinbase_value, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        (block, UtxoSet::new())
    }

    #[test]
    fn test_validate_block_wrong_merkle_root_rejected() {
        use chain::{Block, BlockHeader};
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(5_000_000_000, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root: [0xff; 32], // wrong: not the real merkle root
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(
            matches!(result, Err(ValidationError::InvalidMerkleRoot)),
            "Expected InvalidMerkleRoot, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_empty_transactions_rejected() {
        use chain::{Block, BlockHeader};
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root: [0u8; 32],
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: vec![],
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(
            matches!(result, Err(ValidationError::InvalidCoinbasePosition)),
            "Expected InvalidCoinbasePosition for empty block, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_excessive_coinbase_reward_rejected() {
        // subsidy at height 1 = 5_000_000_000; exceeding it should fail
        let (block, utxo) = make_coinbase_block(1, 5_000_000_001);
        // Recalculate merkle root to match the actual coinbase (already done in make_coinbase_block)
        let result = validate_block_cached(&block, &utxo, None, None);
        assert!(
            matches!(result, Err(ValidationError::ExcessiveCoinbaseReward)),
            "Expected ExcessiveCoinbaseReward, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_exact_coinbase_subsidy_accepted() {
        let (block, utxo) = make_coinbase_block(1, 5_000_000_000);
        let result = validate_block_cached(&block, &utxo, None, None);
        assert!(result.is_ok(), "Block with exact subsidy should be valid: {:?}", result);
    }

    #[test]
    fn test_validate_block_zero_coinbase_accepted() {
        // coinbase value of 0 is ≤ subsidy, must be accepted
        let (block, utxo) = make_coinbase_block(1, 0);
        let result = validate_block_cached(&block, &utxo, None, None);
        assert!(result.is_ok(), "Zero-value coinbase should be valid: {:?}", result);
    }

    #[test]
    fn test_validate_block_multiple_coinbases_rejected() {
        use chain::{Block, BlockHeader};
        let coinbase1 = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(1000, vec![0xcd])],
            0,
        );
        // Second coinbase: same null outpoint pattern
        let coinbase2 = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x02])],
            vec![TxOutput::new(1000, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase1, coinbase2];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(
            matches!(result, Err(ValidationError::MultipleCoinbase)),
            "Expected MultipleCoinbase, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_non_coinbase_first_rejected() {
        use chain::{Block, BlockHeader};
        // First tx has a real (non-null) prev outpoint → not a coinbase
        let regular_tx = Transaction::new(
            vec![TxInput::new(OutPoint::new([0xab; 32], 0), vec![])],
            vec![TxOutput::new(1000, vec![0xcd])],
            0,
        );
        let txs = vec![regular_tx];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 1,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(
            matches!(result, Err(ValidationError::InvalidCoinbasePosition)),
            "Expected InvalidCoinbasePosition when first tx is not coinbase, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_double_spend_within_block_rejected() {
        use chain::{Block, BlockHeader};
        let mut utxo_set = UtxoSet::new();

        // Pre-populate the UTXO set with one spendable output
        let prev_op = OutPoint::new([0xcc; 32], 0);
        utxo_set.add_utxo(
            prev_op.clone(),
            chain::utxo::UTXO::new(TxOutput::new(10_000, vec![0x51]), 1, false),
        );

        // Two transactions both spending the same prev_op
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(1000, vec![0xcd])],
            0,
        );
        let spend1 = Transaction::new(
            vec![TxInput::new(prev_op.clone(), vec![0x51])],
            vec![TxOutput::new(9_000, vec![0x51])],
            0,
        );
        let spend2 = Transaction::new(
            vec![TxInput::new(prev_op.clone(), vec![0x51])],
            vec![TxOutput::new(8_000, vec![0x51])],
            0,
        );
        let txs = vec![coinbase, spend1, spend2];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 2,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_no_scripts(&block, &utxo_set);
        assert!(
            matches!(result, Err(ValidationError::DoubleSpend)),
            "Expected DoubleSpend, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_no_scripts_accepts_valid_coinbase() {
        let (block, utxo) = make_coinbase_block(1, 5_000_000_000);
        let result = validate_block_no_scripts(&block, &utxo);
        assert!(result.is_ok(), "validate_block_no_scripts should accept valid coinbase block: {:?}", result);
    }

    #[test]
    fn test_validate_block_halved_subsidy_after_210000_blocks() {
        use chain::{Block, BlockHeader};
        // After first halving, subsidy = 25 * 100_000_000 = 2_500_000_000
        let halved_subsidy = 25 * 100_000_000u64;
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(halved_subsidy, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 210_001,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(result.is_ok(), "Block after first halving with correct subsidy should be valid: {:?}", result);
    }

    #[test]
    fn test_validate_block_pre_halved_subsidy_rejected_post_halving() {
        use chain::{Block, BlockHeader};
        // Post-halving: old pre-halving rate exceeds new subsidy
        let pre_halving_value = 50 * 100_000_000u64; // 5B sats — too much after block 210_000
        let coinbase = Transaction::new(
            vec![TxInput::new(OutPoint::new([0u8; 32], u32::MAX), vec![0x04, 0x01])],
            vec![TxOutput::new(pre_halving_value, vec![0xcd])],
            0,
        );
        let txs = vec![coinbase];
        let merkle_root = Block::calculate_merkle_root(&txs);
        let block = Block {
            header: BlockHeader {
                version: 0x2000_0000,
                height: 210_001,
                prev_hash: [0u8; 32],
                merkle_root,
                timestamp: 1_600_000_000,
                bits: 0x1e0fffff,
                nonce: 0,
            },
            transactions: txs,
        };
        let result = validate_block_cached(&block, &UtxoSet::new(), None, None);
        assert!(
            matches!(result, Err(ValidationError::ExcessiveCoinbaseReward)),
            "Pre-halving value at post-halving height should fail ExcessiveCoinbaseReward, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_bad_version_zero_rejected() {
        let (mut block, utxo) = make_coinbase_block(1, 5_000_000_000);
        block.header.version = 0; // version 0 is not valid
        let result = validate_block_cached(&block, &utxo, None, None);
        assert!(
            matches!(result, Err(ValidationError::BadBlockVersion)),
            "Version 0 should be rejected, got: {:?}",
            result
        );
    }

    #[test]
    fn test_validate_block_version_2_without_bip9_bits_rejected() {
        let (mut block, utxo) = make_coinbase_block(1, 5_000_000_000);
        block.header.version = 2; // lacks required BIP-9 top bits 0x2000_0000
        let result = validate_block_cached(&block, &utxo, None, None);
        assert!(
            matches!(result, Err(ValidationError::BadBlockVersion)),
            "Version 2 without BIP-9 top bits should be rejected, got: {:?}",
            result
        );
    }
}
