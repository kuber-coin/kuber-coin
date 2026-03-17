// BIP-342: Tapscript - Validation rules for Taproot script spending
//
// Tapscript is an enhanced version of Bitcoin Script designed for Taproot.
// Key improvements over legacy Script:
// - Schnorr signature validation
// - OP_CHECKSIGADD (signature aggregation)
// - Removed signature malleability
// - Simplified validation rules
// - Better resource limits
//
// BIP-342 Reference: https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki

use crate::schnorr::{SchnorrPublicKey, SchnorrSignature};
use crate::taproot::TapLeaf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Maximum script size for Tapscript (10,000 bytes)
pub const MAX_SCRIPT_SIZE: usize = 10_000;

/// Maximum stack size (1,000 elements)
pub const MAX_STACK_SIZE: usize = 1_000;

/// Maximum element size (520 bytes)
pub const MAX_ELEMENT_SIZE: usize = 520;

/// Maximum ops per script (201)
pub const MAX_OPS_PER_SCRIPT: usize = 201;

/// Tapscript leaf version (0xc0 for standard Tapscript)
pub const TAPSCRIPT_VERSION: u8 = 0xc0;

/// BIP-342 sigops budget cost per signature operation
pub const SIGOPS_BUDGET_COST: usize = 50;

/// Tapscript interpreter for executing Taproot scripts
///
/// Tapscript differs from legacy Script in several ways:
/// - Uses Schnorr signatures instead of ECDSA
/// - Adds OP_CHECKSIGADD for efficient multisig
/// - Removes some legacy opcodes
/// - Updates signature validation rules
#[derive(Debug, Clone)]
pub struct TapscriptInterpreter {
    /// The script being executed
    script: Vec<u8>,
    /// The execution stack
    stack: Vec<Vec<u8>>,
    /// The alt stack
    alt_stack: Vec<Vec<u8>>,
    /// Number of operations executed
    op_count: usize,
    /// Stack for tracking IF/ELSE branch execution
    /// Each element is (is_executing, else_seen)
    /// is_executing: true if we're executing this branch
    /// else_seen: true if we've already seen ELSE for this IF
    if_stack: Vec<(bool, bool)>,
    /// BIP-342: position of the last executed OP_CODESEPARATOR (0xFFFFFFFF if none)
    pub code_separator_pos: u32,
    /// BIP-342: remaining sigops budget (50 + witness_size).
    sigops_budget: usize,
}

impl TapscriptInterpreter {
    /// Create a new Tapscript interpreter
    pub fn new(script: Vec<u8>) -> Result<Self, TapscriptError> {
        // Validate script size
        if script.len() > MAX_SCRIPT_SIZE {
            return Err(TapscriptError::ScriptTooLarge(script.len()));
        }

        Ok(Self {
            script,
            stack: Vec::new(),
            alt_stack: Vec::new(),
            op_count: 0,
            if_stack: Vec::new(),
            code_separator_pos: 0xFFFF_FFFF,
            sigops_budget: SIGOPS_BUDGET_COST, // default; caller should set via set_witness_size
        })
    }

    /// Set the BIP-342 sigops budget based on total witness size.
    /// Budget = 50 + total_witness_bytes.
    pub fn set_witness_size(&mut self, witness_bytes: usize) {
        self.sigops_budget = SIGOPS_BUDGET_COST + witness_bytes;
    }

    /// Execute the Tapscript
    ///
    /// # Arguments
    /// * `witness` - Witness stack (inputs to the script)
    /// * `context` - Execution context (sighash, etc.)
    ///
    /// # Returns
    /// Ok(true) if script executes successfully and leaves true on stack, Err otherwise
    pub fn execute(
        &mut self,
        witness: &[Vec<u8>],
        context: &TapscriptContext,
    ) -> Result<bool, TapscriptError> {
        // Initialize stack with witness elements
        for element in witness {
            if element.len() > MAX_ELEMENT_SIZE {
                return Err(TapscriptError::ElementTooLarge(element.len()));
            }
            self.stack.push(element.clone());
        }

        // Execute script
        let mut pc = 0; // Program counter
        while pc < self.script.len() {
            let opcode = self.script[pc];
            pc += 1;

            // Check if we should execute this opcode (not in false branch)
            let should_execute = self.should_execute();

            // IF/NOTIF/ELSE/ENDIF always execute (they control flow)
            let is_flow_control = matches!(opcode, 0x63 | 0x64 | 0x67 | 0x68);

            if !should_execute && !is_flow_control {
                // Skip opcode execution but still need to skip its data
                if (0x01..=0x4b).contains(&opcode) {
                    // Direct push: skip N bytes
                    pc += opcode as usize;
                } else if opcode == 0x4c {
                    // OP_PUSHDATA1: skip 1 + N bytes
                    if pc < self.script.len() {
                        let n = self.script[pc] as usize;
                        pc += 1 + n;
                    }
                }
                continue;
            }

            // Check op count limit (only for executed opcodes)
            if should_execute && self.is_counted_op(opcode) {
                self.op_count += 1;
                if self.op_count > MAX_OPS_PER_SCRIPT {
                    return Err(TapscriptError::TooManyOps(self.op_count));
                }
            }

            // Execute opcode
            pc = self.execute_opcode(opcode, pc, context)?;

            // Check stack size (only when executing)
            if should_execute && self.stack.len() > MAX_STACK_SIZE {
                return Err(TapscriptError::StackOverflow);
            }
        }

        // Verify all IF blocks are closed
        if !self.if_stack.is_empty() {
            return Err(TapscriptError::UnbalancedConditional);
        }

        // Script succeeds if stack is not empty and top element is true
        if self.stack.is_empty() {
            return Ok(false);
        }

        let top = &self.stack[self.stack.len() - 1];
        Ok(is_true(top))
    }

    /// Execute a single opcode
    fn execute_opcode(
        &mut self,
        opcode: u8,
        mut pc: usize,
        context: &TapscriptContext,
    ) -> Result<usize, TapscriptError> {
        match opcode {
            // Push operations (0x01 - 0x4e)
            0x00 => {
                // OP_0 / OP_FALSE
                self.stack.push(vec![]);
            }
            0x01..=0x4b => {
                // Push N bytes (1-75)
                let n = opcode as usize;
                if pc + n > self.script.len() {
                    return Err(TapscriptError::UnexpectedEndOfScript);
                }
                let data = self.script[pc..pc + n].to_vec();
                self.stack.push(data);
                pc += n;
            }
            0x4c => {
                // OP_PUSHDATA1
                if pc >= self.script.len() {
                    return Err(TapscriptError::UnexpectedEndOfScript);
                }
                let n = self.script[pc] as usize;
                pc += 1;
                if pc + n > self.script.len() {
                    return Err(TapscriptError::UnexpectedEndOfScript);
                }
                let data = self.script[pc..pc + n].to_vec();
                if data.len() > MAX_ELEMENT_SIZE {
                    return Err(TapscriptError::ElementTooLarge(data.len()));
                }
                self.stack.push(data);
                pc += n;
            }
            0x4f => {
                // OP_1NEGATE
                self.stack.push(vec![0x81]); // -1 in Bitcoin's minimal encoding
            }
            0x51 => {
                // OP_1 / OP_TRUE
                self.stack.push(vec![0x01]);
            }
            0x52..=0x60 => {
                // OP_2 through OP_16
                let n = opcode - 0x50;
                self.stack.push(vec![n]);
            }

            // Stack operations
            0x6a => {
                // OP_RETURN - script fails
                return Err(TapscriptError::OpReturn);
            }
            0x6b => {
                // OP_TOALTSTACK
                let item = self.pop_stack()?;
                self.alt_stack.push(item);
            }
            0x6c => {
                // OP_FROMALTSTACK
                let item = self.pop_alt_stack()?;
                self.stack.push(item);
            }
            0x6d => {
                // OP_2DROP
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                self.stack.pop();
                self.stack.pop();
            }
            0x6e => {
                // OP_2DUP
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let a = self.stack[self.stack.len() - 2].clone();
                let b = self.stack[self.stack.len() - 1].clone();
                self.stack.push(a);
                self.stack.push(b);
            }
            0x6f => {
                // OP_3DUP
                if self.stack.len() < 3 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let a = self.stack[self.stack.len() - 3].clone();
                let b = self.stack[self.stack.len() - 2].clone();
                let c = self.stack[self.stack.len() - 1].clone();
                self.stack.push(a);
                self.stack.push(b);
                self.stack.push(c);
            }
            0x70 => {
                // OP_2OVER
                if self.stack.len() < 4 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let a = self.stack[self.stack.len() - 4].clone();
                let b = self.stack[self.stack.len() - 3].clone();
                self.stack.push(a);
                self.stack.push(b);
            }
            0x71 => {
                // OP_2ROT
                if self.stack.len() < 6 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let len = self.stack.len();
                let a = self.stack.remove(len - 6);
                let b = self.stack.remove(len - 6);
                self.stack.push(a);
                self.stack.push(b);
            }
            0x72 => {
                // OP_2SWAP
                if self.stack.len() < 4 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let len = self.stack.len();
                self.stack.swap(len - 4, len - 2);
                self.stack.swap(len - 3, len - 1);
            }
            0x73 => {
                // OP_IFDUP
                if self.stack.is_empty() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let top = self.stack[self.stack.len() - 1].clone();
                if is_true(&top) {
                    self.stack.push(top);
                }
            }
            0x74 => {
                // OP_DEPTH
                let depth = self.stack.len() as i64;
                self.stack.push(encode_number(depth));
            }
            0x75 => {
                // OP_DROP
                if self.stack.is_empty() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                self.stack.pop();
            }
            0x76 => {
                // OP_DUP
                if self.stack.is_empty() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let top = self.stack[self.stack.len() - 1].clone();
                self.stack.push(top);
            }
            0x77 => {
                // OP_NIP
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let top = self.pop_stack()?;
                self.stack.pop();
                self.stack.push(top);
            }
            0x78 => {
                // OP_OVER
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let second = self.stack[self.stack.len() - 2].clone();
                self.stack.push(second);
            }
            0x79 => {
                // OP_PICK
                let n_bytes = self.pop_stack()?;
                let n_signed = decode_number(&n_bytes)?;
                if n_signed < 0 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let n = n_signed as usize;
                if n >= self.stack.len() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let item = self.stack[self.stack.len() - 1 - n].clone();
                self.stack.push(item);
            }
            0x7a => {
                // OP_ROLL
                let n_bytes = self.pop_stack()?;
                let n_signed = decode_number(&n_bytes)?;
                if n_signed < 0 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let n = n_signed as usize;
                if n >= self.stack.len() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let item = self.stack.remove(self.stack.len() - 1 - n);
                self.stack.push(item);
            }
            0x7b => {
                // OP_ROT
                if self.stack.len() < 3 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let len = self.stack.len();
                let third = self.stack.remove(len - 3);
                self.stack.push(third);
            }
            0x7c => {
                // OP_SWAP
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let len = self.stack.len();
                self.stack.swap(len - 2, len - 1);
            }
            0x7d => {
                // OP_TUCK
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let top = self.stack[self.stack.len() - 1].clone();
                self.stack.insert(self.stack.len() - 2, top);
            }
            0x82 => {
                // OP_SIZE
                if self.stack.is_empty() {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let top = &self.stack[self.stack.len() - 1];
                let size = top.len() as i64;
                self.stack.push(encode_number(size));
            }
            // Comparison operations
            0x87 => {
                // OP_EQUAL
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                let result = if a == b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0x88 => {
                // OP_EQUALVERIFY
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                if a != b {
                    return Err(TapscriptError::VerifyFailed);
                }
            }

            // Numeric operations
            0x8b => {
                // OP_1ADD
                let a_bytes = self.pop_stack()?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a + 1));
            }
            0x8c => {
                // OP_1SUB
                let a_bytes = self.pop_stack()?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a - 1));
            }
            0x8f => {
                // OP_NEGATE
                let a_bytes = self.pop_stack()?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(-a));
            }
            0x90 => {
                // OP_ABS
                let a_bytes = self.pop_stack()?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a.abs()));
            }
            0x91 => {
                // OP_NOT
                let a = self.pop_stack()?;
                let result = if is_true(&a) { vec![] } else { vec![0x01] };
                self.stack.push(result);
            }
            0x92 => {
                // OP_0NOTEQUAL
                let a = self.pop_stack()?;
                let result = if is_true(&a) { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0x93 => {
                // OP_ADD
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a + b));
            }
            0x94 => {
                // OP_SUB
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a - b));
            }
            0x9a => {
                // OP_BOOLAND
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                let result = if is_true(&a) && is_true(&b) {
                    vec![0x01]
                } else {
                    vec![]
                };
                self.stack.push(result);
            }
            0x9b => {
                // OP_BOOLOR
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                let result = if is_true(&a) || is_true(&b) {
                    vec![0x01]
                } else {
                    vec![]
                };
                self.stack.push(result);
            }
            0x9c => {
                // OP_NUMEQUAL
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a == b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0x9d => {
                // OP_NUMEQUALVERIFY
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                if a != b {
                    return Err(TapscriptError::VerifyFailed);
                }
            }
            0x9e => {
                // OP_NUMNOTEQUAL
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a != b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0x9f => {
                // OP_LESSTHAN
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a < b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0xa0 => {
                // OP_GREATERTHAN
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a > b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0xa1 => {
                // OP_LESSTHANOREQUAL
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a <= b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0xa2 => {
                // OP_GREATERTHANOREQUAL
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                let result = if a >= b { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0xa3 => {
                // OP_MIN
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a.min(b)));
            }
            0xa4 => {
                // OP_MAX
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let b_bytes = self.pop_stack()?;
                let a_bytes = self.pop_stack()?;
                let b = decode_number(&b_bytes)?;
                let a = decode_number(&a_bytes)?;
                self.stack.push(encode_number(a.max(b)));
            }
            0xa5 => {
                // OP_WITHIN
                if self.stack.len() < 3 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let max_bytes = self.pop_stack()?;
                let min_bytes = self.pop_stack()?;
                let x_bytes = self.pop_stack()?;
                let max = decode_number(&max_bytes)?;
                let min = decode_number(&min_bytes)?;
                let x = decode_number(&x_bytes)?;
                let result = if x >= min && x < max {
                    vec![0x01]
                } else {
                    vec![]
                };
                self.stack.push(result);
            }

            // Crypto operations
            0xa8 => {
                // OP_SHA256
                let data = self.pop_stack()?;
                let hash = Sha256::digest(&data);
                self.stack.push(hash.to_vec());
            }
            0xac => {
                // OP_CHECKSIG - Tapscript signature validation (BIP-342)
                if self.stack.len() < 2 {
                    return Err(TapscriptError::InvalidStackOperation);
                }
                let pubkey_bytes = self.pop_stack()?;
                let sig_bytes = self.pop_stack()?;

                // BIP-342: consume sigops budget for non-empty pubkey
                if !pubkey_bytes.is_empty() {
                    if self.sigops_budget < SIGOPS_BUDGET_COST {
                        return Err(TapscriptError::SigopsBudgetExceeded);
                    }
                    self.sigops_budget -= SIGOPS_BUDGET_COST;
                }

                // Empty signature is treated as failure (not error)
                if sig_bytes.is_empty() {
                    self.stack.push(vec![]);
                    return Ok(pc);
                }

                // BIP-342: extract sighash type from signature
                // 64 bytes = Schnorr sig with SIGHASH_DEFAULT (0x00)
                // 65 bytes = 64-byte Schnorr sig + 1-byte sighash type (must not be 0x00)
                let (raw_sig, sighash_type) = if sig_bytes.len() == 65 {
                    let ht = sig_bytes[64];
                    if ht == 0x00 {
                        return Err(TapscriptError::InvalidSignature);
                    }
                    (&sig_bytes[..64], ht)
                } else if sig_bytes.len() == 64 {
                    (&sig_bytes[..], 0x00u8)
                } else {
                    return Err(TapscriptError::InvalidSignature);
                };

                let signature = SchnorrSignature::from_bytes(raw_sig)
                    .map_err(|_| TapscriptError::InvalidSignature)?;

                if pubkey_bytes.len() != 32 {
                    return Err(TapscriptError::InvalidPublicKey);
                }
                let mut pubkey_array = [0u8; 32];
                pubkey_array.copy_from_slice(&pubkey_bytes);
                let pubkey = SchnorrPublicKey { x: pubkey_array };

                // Look up the correct sighash for this type
                let sighash = context.get_sighash(sighash_type)
                    .ok_or_else(|| TapscriptError::InvalidSignature)?;

                let valid = crate::schnorr::verify(&signature, sighash, &pubkey).is_ok();
                let result = if valid { vec![0x01] } else { vec![] };
                self.stack.push(result);
            }
            0xba => {
                // OP_CHECKSIGADD - New Tapscript opcode (BIP-342)
                // Stack: [n, sig, pubkey] -> [n+1 if valid, else n]
                if self.stack.len() < 3 {
                    return Err(TapscriptError::InvalidStackOperation);
                }

                let pubkey_bytes = self.pop_stack()?;
                let sig_bytes = self.pop_stack()?;
                let n_bytes = self.pop_stack()?;

                // Decode n (number of valid signatures)
                let mut n = decode_number(&n_bytes)?;

                // BIP-342: consume sigops budget for non-empty pubkey
                if !pubkey_bytes.is_empty() {
                    if self.sigops_budget < SIGOPS_BUDGET_COST {
                        return Err(TapscriptError::SigopsBudgetExceeded);
                    }
                    self.sigops_budget -= SIGOPS_BUDGET_COST;
                }

                // Empty signature doesn't change count (not an error)
                if sig_bytes.is_empty() {
                    self.stack.push(encode_number(n));
                    return Ok(pc);
                }

                // BIP-342: extract sighash type from signature
                let (raw_sig, sighash_type) = if sig_bytes.len() == 65 {
                    let ht = sig_bytes[64];
                    if ht == 0x00 {
                        return Err(TapscriptError::InvalidSignature);
                    }
                    (&sig_bytes[..64], ht)
                } else if sig_bytes.len() == 64 {
                    (&sig_bytes[..], 0x00u8)
                } else {
                    return Err(TapscriptError::InvalidSignature);
                };

                let signature = SchnorrSignature::from_bytes(raw_sig)
                    .map_err(|_| TapscriptError::InvalidSignature)?;

                if pubkey_bytes.len() != 32 {
                    return Err(TapscriptError::InvalidPublicKey);
                }
                let mut pubkey_array = [0u8; 32];
                pubkey_array.copy_from_slice(&pubkey_bytes);
                let pubkey = SchnorrPublicKey { x: pubkey_array };

                // Look up the correct sighash for this type
                let sighash = context.get_sighash(sighash_type)
                    .ok_or_else(|| TapscriptError::InvalidSignature)?;

                if crate::schnorr::verify(&signature, sighash, &pubkey).is_ok() {
                    n += 1;
                }

                self.stack.push(encode_number(n));
            }

            // Flow control
            0x63 => {
                // OP_IF - Execute if top of stack is true
                if self.should_execute() {
                    // Only evaluate condition if parent branch is executing
                    let condition = self.pop_stack()?;
                    let is_true_val = is_true(&condition);
                    self.if_stack.push((is_true_val, false));
                } else {
                    // In false branch, just track structure (don't pop from stack)
                    self.if_stack.push((false, false));
                }
            }
            0x64 => {
                // OP_NOTIF - Execute if top of stack is false
                if self.should_execute() {
                    // Only evaluate condition if parent branch is executing
                    let condition = self.pop_stack()?;
                    let is_false_val = !is_true(&condition);
                    self.if_stack.push((is_false_val, false));
                } else {
                    // In false branch, just track structure (don't pop from stack)
                    self.if_stack.push((false, false));
                }
            }
            0x67 => {
                // OP_ELSE - Toggle execution for current IF block
                if self.if_stack.is_empty() {
                    return Err(TapscriptError::ElseWithoutIf);
                }
                // SAFETY: if_stack verified non-empty by the is_empty() check above.
                let (executing, else_seen) = self
                    .if_stack
                    .pop()
                    .expect("if_stack checked non-empty above");
                if else_seen {
                    return Err(TapscriptError::MultipleElse);
                }

                // If parent conditions are true, toggle execution
                // We need to check if we *would* execute without this IF
                let parent_executing = self.should_execute();
                let new_executing = parent_executing && !executing;
                self.if_stack.push((new_executing, true));
            }
            0x68 => {
                // OP_ENDIF - Close current IF block
                if self.if_stack.is_empty() {
                    return Err(TapscriptError::EndifWithoutIf);
                }
                self.if_stack.pop();
            }
            0x69 => {
                // OP_VERIFY
                let top = self.pop_stack()?;
                if !is_true(&top) {
                    return Err(TapscriptError::VerifyFailed);
                }
            }

            // Unsupported/disabled opcodes in Tapscript
            0x61 => return Err(TapscriptError::DisabledOpcode("OP_NOP")),
            0x65 => return Err(TapscriptError::DisabledOpcode("OP_VER family")),
            // OP_CHECKMULTISIG and OP_CHECKMULTISIGVERIFY are disabled in tapscript (BIP-342).
            0xae => return Err(TapscriptError::DisabledOpcode("OP_CHECKMULTISIG")),
            0xaf => return Err(TapscriptError::DisabledOpcode("OP_CHECKMULTISIGVERIFY")),

            // BIP-342: OP_CODESEPARATOR (0xab) is valid in tapscript.
            // Updates code_separator_position for subsequent sighash computation.
            // pc points past the opcode, so the opcode position is pc - 1.
            0xab => {
                self.code_separator_pos = (pc - 1) as u32;
            }

            // NOPs that retain their meaning (do nothing but are valid)
            0xb0 => {} // OP_NOP1
            0xb1 => {} // OP_CHECKLOCKTIMEVERIFY (handled as NOP here; checked at tx level)
            0xb2 => {} // OP_CHECKSEQUENCEVERIFY (handled as NOP here; checked at tx level)
            0xb3..=0xb9 => {} // OP_NOP4 through OP_NOP10

            // OP_SUCCESS opcodes (BIP-342): immediate script success for future soft-forks.
            // Hex ranges: 0x50, 0x62, 0x7e-0x81, 0x83-0x86, 0x89-0x8a,
            //             0x8d-0x8e, 0x95-0x99, 0xbb-0xfe
            0x50
            | 0x62
            | 0x7e..=0x81
            | 0x83..=0x86
            | 0x89..=0x8a
            | 0x8d..=0x8e
            | 0x95..=0x99
            | 0xbb..=0xfe => {
                // OP_SUCCESS opcodes always validate successfully
                return Ok(self.script.len());
            }

            _ => {
                // Unknown opcode
                return Err(TapscriptError::UnknownOpcode(opcode));
            }
        }

        Ok(pc)
    }

    /// Check if an opcode is counted toward the op limit
    fn is_counted_op(&self, opcode: u8) -> bool {
        // All opcodes except push operations and OP_SUCCESS count toward limit
        match opcode {
            0x00..=0x60 => false, // Push ops and OP_RESERVED
            0x62
            | 0x7e..=0x81
            | 0x83..=0x86
            | 0x89..=0x8a
            | 0x8d..=0x8e
            | 0x95..=0x99
            | 0xbb..=0xfe => false, // OP_SUCCESS
            _ => true,
        }
    }

    /// Check if we should execute opcodes (all IF conditions are true)
    fn should_execute(&self) -> bool {
        // Execute if all IF branches are executing
        self.if_stack.iter().all(|(executing, _)| *executing)
    }

    /// Pop an element from the main stack, returning an error if empty
    fn pop_stack(&mut self) -> Result<Vec<u8>, TapscriptError> {
        self.stack
            .pop()
            .ok_or(TapscriptError::InvalidStackOperation)
    }

    /// Pop an element from the alt stack, returning an error if empty
    fn pop_alt_stack(&mut self) -> Result<Vec<u8>, TapscriptError> {
        self.alt_stack
            .pop()
            .ok_or(TapscriptError::InvalidStackOperation)
    }
}

/// Execution context for Tapscript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TapscriptContext {
    /// The default signature hash (SIGHASH_DEFAULT/0x00)
    pub sighash: [u8; 32],
    /// The Taproot internal key
    pub internal_key: [u8; 32],
    /// The leaf being executed
    pub tapleaf: TapLeaf,
    /// Pre-computed sighash map for non-default sighash types (optional).
    /// Key is the sighash type byte, value is the 32-byte hash.
    #[serde(default)]
    pub sighash_map: std::collections::HashMap<u8, [u8; 32]>,
}

impl TapscriptContext {
    /// Create a new Tapscript context
    pub fn new(sighash: [u8; 32], internal_key: [u8; 32], tapleaf: TapLeaf) -> Self {
        Self {
            sighash,
            internal_key,
            tapleaf,
            sighash_map: std::collections::HashMap::new(),
        }
    }

    /// Get the sighash for a given sighash type byte.
    /// Returns the default sighash for type 0x00, or looks up the map.
    pub fn get_sighash(&self, sighash_type: u8) -> Option<&[u8; 32]> {
        if sighash_type == 0x00 {
            Some(&self.sighash)
        } else {
            self.sighash_map.get(&sighash_type)
        }
    }
}

/// Check if a stack element represents true
fn is_true(data: &[u8]) -> bool {
    if data.is_empty() {
        return false;
    }

    // Check for negative zero
    if data.len() == 1 && data[0] == 0x80 {
        return false;
    }

    // All non-zero elements are true (Bitcoin's convention)
    data.iter().any(|&b| b != 0)
}

/// Encode a number in Bitcoin's minimal format
fn encode_number(n: i64) -> Vec<u8> {
    if n == 0 {
        return vec![];
    }

    let negative = n < 0;
    let mut abs = n.unsigned_abs();
    let mut result = Vec::new();

    while abs > 0 {
        result.push((abs & 0xff) as u8);
        abs >>= 8;
    }

    // If the most significant bit is set, add an extra byte
    if result[result.len() - 1] & 0x80 != 0 {
        result.push(if negative { 0x80 } else { 0x00 });
    } else if negative {
        // SAFETY: result is non-empty (abs was non-zero, we pushed at least one byte)
        *result.last_mut().expect("non-empty result") |= 0x80;
    }

    result
}

/// Decode a number from Bitcoin's minimal format (BIP-62 rule 4 enforced)
fn decode_number(data: &[u8]) -> Result<i64, TapscriptError> {
    if data.is_empty() {
        return Ok(0);
    }

    if data.len() > 8 {
        return Err(TapscriptError::NumberTooLarge);
    }

    // BIP-62 rule 4: enforce minimal encoding
    if data.len() > 1 {
        let last = data[data.len() - 1];
        let prev = data[data.len() - 2];
        if (last == 0x00 || last == 0x80) && (prev & 0x80 == 0) {
            return Err(TapscriptError::NumberTooLarge); // reuse existing error variant
        }
    }

    let negative = data[data.len() - 1] & 0x80 != 0;
    let mut result: i64 = 0;

    for (i, &byte) in data.iter().enumerate() {
        let value = if i == data.len() - 1 {
            (byte & 0x7f) as i64 // Remove sign bit from last byte
        } else {
            byte as i64
        };
        result |= value << (8 * i);
    }

    if negative {
        result = -result;
    }

    Ok(result)
}

/// Errors that can occur during Tapscript execution
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TapscriptError {
    /// Script is too large
    ScriptTooLarge(usize),
    /// Stack element is too large
    ElementTooLarge(usize),
    /// Too many operations
    TooManyOps(usize),
    /// Stack overflow
    StackOverflow,
    /// Invalid stack operation
    InvalidStackOperation,
    /// OP_RETURN encountered
    OpReturn,
    /// OP_VERIFY failed
    VerifyFailed,
    /// Unexpected end of script
    UnexpectedEndOfScript,
    /// Invalid signature
    InvalidSignature,
    /// Invalid public key
    InvalidPublicKey,
    /// Unknown opcode
    UnknownOpcode(u8),
    /// Disabled opcode
    DisabledOpcode(&'static str),
    /// Number too large
    NumberTooLarge,
    /// Unbalanced conditional (IF without ENDIF)
    UnbalancedConditional,
    /// ELSE without IF
    ElseWithoutIf,
    /// ENDIF without IF
    EndifWithoutIf,
    /// Multiple ELSE in same IF block
    MultipleElse,
    /// BIP-342: sigops budget exceeded
    SigopsBudgetExceeded,
}

impl fmt::Display for TapscriptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TapscriptError::ScriptTooLarge(size) => {
                write!(
                    f,
                    "Script too large: {} bytes (max {})",
                    size, MAX_SCRIPT_SIZE
                )
            }
            TapscriptError::ElementTooLarge(size) => {
                write!(
                    f,
                    "Stack element too large: {} bytes (max {})",
                    size, MAX_ELEMENT_SIZE
                )
            }
            TapscriptError::TooManyOps(count) => {
                write!(
                    f,
                    "Too many operations: {} (max {})",
                    count, MAX_OPS_PER_SCRIPT
                )
            }
            TapscriptError::StackOverflow => write!(f, "Stack overflow"),
            TapscriptError::InvalidStackOperation => write!(f, "Invalid stack operation"),
            TapscriptError::OpReturn => write!(f, "OP_RETURN encountered"),
            TapscriptError::VerifyFailed => write!(f, "OP_VERIFY failed"),
            TapscriptError::UnexpectedEndOfScript => write!(f, "Unexpected end of script"),
            TapscriptError::InvalidSignature => write!(f, "Invalid signature"),
            TapscriptError::InvalidPublicKey => write!(f, "Invalid public key"),
            TapscriptError::UnknownOpcode(op) => write!(f, "Unknown opcode: 0x{:02x}", op),
            TapscriptError::DisabledOpcode(name) => write!(f, "Disabled opcode: {}", name),
            TapscriptError::NumberTooLarge => write!(f, "Number too large"),
            TapscriptError::UnbalancedConditional => {
                write!(f, "Unbalanced conditional (IF without ENDIF)")
            }
            TapscriptError::ElseWithoutIf => write!(f, "ELSE without matching IF"),
            TapscriptError::EndifWithoutIf => write!(f, "ENDIF without matching IF"),
            TapscriptError::MultipleElse => write!(f, "Multiple ELSE in same IF block"),
            TapscriptError::SigopsBudgetExceeded => write!(f, "BIP-342 sigops budget exceeded"),
        }
    }
}

impl std::error::Error for TapscriptError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_context() -> TapscriptContext {
        let sighash = [1u8; 32];
        let internal_key = [2u8; 32];
        let tapleaf = TapLeaf::tapscript(vec![0x51]); // OP_1
        TapscriptContext::new(sighash, internal_key, tapleaf)
    }

    #[test]
    fn test_simple_push() {
        let script = vec![0x51]; // OP_1
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x01]);
    }

    #[test]
    fn test_op_dup() {
        let script = vec![0x51, 0x76]; // OP_1 OP_DUP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 2);
        assert_eq!(interp.stack[0], vec![0x01]);
        assert_eq!(interp.stack[1], vec![0x01]);
    }

    #[test]
    fn test_op_equal() {
        let script = vec![0x51, 0x51, 0x87]; // OP_1 OP_1 OP_EQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x01]); // True
    }

    #[test]
    fn test_op_equalverify() {
        let script = vec![0x51, 0x51, 0x88]; // OP_1 OP_1 OP_EQUALVERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        // OP_EQUALVERIFY succeeds but leaves empty stack (pops both values)
        let result = interp.execute(&[], &context);
        assert!(result.is_ok()); // Should execute successfully
        assert_eq!(interp.stack.len(), 0); // VERIFY pops the result
    }

    #[test]
    fn test_op_equalverify_fail() {
        let script = vec![0x51, 0x52, 0x88]; // OP_1 OP_2 OP_EQUALVERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::VerifyFailed)));
    }

    #[test]
    fn test_witness_elements() {
        let script = vec![0x87]; // OP_EQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let witness = vec![vec![0x01], vec![0x01]];
        let result = interp.execute(&witness, &context).unwrap();
        assert!(result);
    }

    #[test]
    fn test_op_sha256() {
        let script = vec![0xa8]; // OP_SHA256
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let witness = vec![vec![0x01, 0x02, 0x03]];
        let result = interp.execute(&witness, &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0].len(), 32); // SHA256 produces 32 bytes
    }

    #[test]
    fn test_checksig_empty_sig() {
        // OP_CHECKSIG with empty signature should fail gracefully
        let script = vec![0xac]; // OP_CHECKSIG
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let witness = vec![vec![], vec![1u8; 32]]; // Empty sig, dummy pubkey
        let result = interp.execute(&witness, &context).unwrap();
        assert!(!result); // Empty sig = false
    }

    #[test]
    fn test_op_checksigadd() {
        let script = vec![0xba]; // OP_CHECKSIGADD
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        // Stack: [0, empty_sig, pubkey]
        // Note: encode_number(0) = [] (empty array in Bitcoin's minimal encoding)
        let witness = vec![vec![], vec![], vec![1u8; 32]];
        interp.execute(&witness, &context).unwrap();
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], Vec::<u8>::new()); // Count unchanged (empty sig), 0 = []
    }

    #[test]
    fn test_max_script_size() {
        let script = vec![0x00; MAX_SCRIPT_SIZE + 1];
        let result = TapscriptInterpreter::new(script);
        assert!(matches!(result, Err(TapscriptError::ScriptTooLarge(_))));
    }

    #[test]
    fn test_disabled_opcode() {
        let script = vec![0xae]; // OP_CHECKMULTISIG (disabled in Tapscript per BIP-342)
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::DisabledOpcode(_))));
    }

    #[test]
    fn test_codeseparator_in_tapscript() {
        // OP_CODESEPARATOR (0xab) is valid in tapscript and updates code_separator_pos.
        // Script: OP_CODESEPARATOR OP_1
        let script = vec![0xab, 0x51];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(result.is_ok());
        assert_eq!(interp.code_separator_pos, 0);
    }

    #[test]
    fn test_encode_decode_number() {
        let test_cases = vec![0, 1, -1, 127, -127, 128, -128, 32767, -32767];

        for n in test_cases {
            let encoded = encode_number(n);
            let decoded = decode_number(&encoded).unwrap();
            assert_eq!(decoded, n, "Failed for n={}", n);
        }
    }

    #[test]
    fn test_is_true() {
        assert!(!is_true(&[])); // Empty = false
        assert!(!is_true(&[0x00])); // Zero = false
        assert!(!is_true(&[0x80])); // Negative zero = false
        assert!(is_true(&[0x01])); // One = true
        assert!(is_true(&[0xff])); // Any non-zero = true
    }

    #[test]
    fn test_op_depth() {
        let script = vec![0x51, 0x52, 0x74]; // OP_1 OP_2 OP_DEPTH
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 3);
        assert_eq!(decode_number(&interp.stack[2]).unwrap(), 2);
    }

    #[test]
    fn test_op_ifdup() {
        // Test with true value
        let script = vec![0x51, 0x73]; // OP_1 OP_IFDUP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 2); // Duplicated

        // Test with false value
        let script = vec![0x00, 0x73]; // OP_0 OP_IFDUP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result);
        assert_eq!(interp.stack.len(), 1); // Not duplicated
    }

    #[test]
    fn test_altstack_operations() {
        let script = vec![0x51, 0x6b, 0x52, 0x6c]; // OP_1 OP_TOALTSTACK OP_2 OP_FROMALTSTACK
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 2);
        assert_eq!(interp.stack[0], vec![0x02]); // OP_2
        assert_eq!(interp.stack[1], vec![0x01]); // OP_1 from altstack
    }

    // ====== Stack Operations Tests ======

    #[test]
    fn test_op_2drop() {
        let script = vec![0x51, 0x52, 0x53, 0x6d]; // OP_1 OP_2 OP_3 OP_2DROP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x01]); // OP_1 remains
    }

    #[test]
    fn test_op_2dup() {
        let script = vec![0x51, 0x52, 0x6e]; // OP_1 OP_2 OP_2DUP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 4);
        assert_eq!(interp.stack[0], vec![0x01]); // Original
        assert_eq!(interp.stack[1], vec![0x02]); // Original
        assert_eq!(interp.stack[2], vec![0x01]); // Duplicate
        assert_eq!(interp.stack[3], vec![0x02]); // Duplicate
    }

    #[test]
    fn test_op_3dup() {
        let script = vec![0x51, 0x52, 0x53, 0x6f]; // OP_1 OP_2 OP_3 OP_3DUP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 6);
        assert_eq!(interp.stack[3], vec![0x01]); // Duplicate
        assert_eq!(interp.stack[4], vec![0x02]); // Duplicate
        assert_eq!(interp.stack[5], vec![0x03]); // Duplicate
    }

    #[test]
    fn test_op_2over() {
        let script = vec![0x51, 0x52, 0x53, 0x54, 0x70]; // OP_1 OP_2 OP_3 OP_4 OP_2OVER
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 6);
        assert_eq!(interp.stack[4], vec![0x01]); // Copied from position 0
        assert_eq!(interp.stack[5], vec![0x02]); // Copied from position 1
    }

    #[test]
    fn test_op_2rot() {
        let script = vec![0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x71]; // OP_1..OP_6 OP_2ROT
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 6);
        assert_eq!(interp.stack[0], vec![0x03]); // OP_3 shifted
        assert_eq!(interp.stack[4], vec![0x01]); // OP_1 moved to top-2
        assert_eq!(interp.stack[5], vec![0x02]); // OP_2 moved to top-1
    }

    #[test]
    fn test_op_2swap() {
        let script = vec![0x51, 0x52, 0x53, 0x54, 0x72]; // OP_1 OP_2 OP_3 OP_4 OP_2SWAP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 4);
        assert_eq!(interp.stack[0], vec![0x03]); // Swapped
        assert_eq!(interp.stack[1], vec![0x04]); // Swapped
        assert_eq!(interp.stack[2], vec![0x01]); // Swapped
        assert_eq!(interp.stack[3], vec![0x02]); // Swapped
    }

    #[test]
    fn test_op_nip() {
        let script = vec![0x51, 0x52, 0x77]; // OP_1 OP_2 OP_NIP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x02]); // OP_2 remains (OP_1 removed)
    }

    #[test]
    fn test_op_over() {
        let script = vec![0x51, 0x52, 0x78]; // OP_1 OP_2 OP_OVER
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 3);
        assert_eq!(interp.stack[2], vec![0x01]); // Copied from position 0
    }

    #[test]
    fn test_op_pick() {
        let script = vec![0x51, 0x52, 0x53, 0x52, 0x79]; // OP_1 OP_2 OP_3 OP_2 OP_PICK
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 4);
        assert_eq!(interp.stack[3], vec![0x01]); // Picked from position 2 back
    }

    #[test]
    fn test_op_roll() {
        let script = vec![0x51, 0x52, 0x53, 0x52, 0x7a]; // OP_1 OP_2 OP_3 OP_2 OP_ROLL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 3);
        assert_eq!(interp.stack[2], vec![0x01]); // Rolled from position 2
    }

    #[test]
    fn test_op_rot() {
        let script = vec![0x51, 0x52, 0x53, 0x7b]; // OP_1 OP_2 OP_3 OP_ROT
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 3);
        assert_eq!(interp.stack[0], vec![0x02]); // OP_2 shifted
        assert_eq!(interp.stack[1], vec![0x03]); // OP_3 shifted
        assert_eq!(interp.stack[2], vec![0x01]); // OP_1 moved to top
    }

    #[test]
    fn test_op_swap() {
        let script = vec![0x51, 0x52, 0x7c]; // OP_1 OP_2 OP_SWAP
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 2);
        assert_eq!(interp.stack[0], vec![0x02]); // Swapped
        assert_eq!(interp.stack[1], vec![0x01]); // Swapped
    }

    #[test]
    fn test_op_tuck() {
        let script = vec![0x51, 0x52, 0x7d]; // OP_1 OP_2 OP_TUCK
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 3);
        assert_eq!(interp.stack[0], vec![0x02]); // Tucked
        assert_eq!(interp.stack[1], vec![0x01]); // Original
        assert_eq!(interp.stack[2], vec![0x02]); // Original
    }

    #[test]
    fn test_op_size() {
        let script = vec![0x03, 0x01, 0x02, 0x03, 0x82]; // Push 3 bytes, OP_SIZE
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 2);
        assert_eq!(decode_number(&interp.stack[1]).unwrap(), 3);
    }

    // ====== Numeric Operations Tests ======

    #[test]
    fn test_op_1add() {
        let script = vec![0x52, 0x8b]; // OP_2 OP_1ADD
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 3);
    }

    #[test]
    fn test_op_1sub() {
        let script = vec![0x52, 0x8c]; // OP_2 OP_1SUB
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 1);
    }

    #[test]
    fn test_op_negate() {
        let script = vec![0x52, 0x8f]; // OP_2 OP_NEGATE
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), -2);
    }

    #[test]
    fn test_op_abs() {
        let script = vec![0x4f, 0x90]; // OP_1NEGATE OP_ABS
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 1);
    }

    #[test]
    fn test_op_not() {
        let script = vec![0x51, 0x91]; // OP_1 OP_NOT
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // NOT(true) = false

        let script = vec![0x00, 0x91]; // OP_0 OP_NOT
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // NOT(false) = true
    }

    #[test]
    fn test_op_0notequal() {
        let script = vec![0x51, 0x92]; // OP_1 OP_0NOTEQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 1 != 0

        let script = vec![0x00, 0x92]; // OP_0 OP_0NOTEQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // 0 == 0
    }

    #[test]
    fn test_op_add() {
        let script = vec![0x52, 0x53, 0x93]; // OP_2 OP_3 OP_ADD
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 5);
    }

    #[test]
    fn test_op_sub() {
        let script = vec![0x53, 0x52, 0x94]; // OP_3 OP_2 OP_SUB
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 1);
    }

    #[test]
    fn test_op_booland() {
        let script = vec![0x51, 0x51, 0x9a]; // OP_1 OP_1 OP_BOOLAND
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // true AND true = true

        let script = vec![0x51, 0x00, 0x9a]; // OP_1 OP_0 OP_BOOLAND
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // true AND false = false
    }

    #[test]
    fn test_op_boolor() {
        let script = vec![0x51, 0x00, 0x9b]; // OP_1 OP_0 OP_BOOLOR
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // true OR false = true

        let script = vec![0x00, 0x00, 0x9b]; // OP_0 OP_0 OP_BOOLOR
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // false OR false = false
    }

    #[test]
    fn test_op_numequal() {
        let script = vec![0x52, 0x52, 0x9c]; // OP_2 OP_2 OP_NUMEQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 2 == 2

        let script = vec![0x52, 0x53, 0x9c]; // OP_2 OP_3 OP_NUMEQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // 2 != 3
    }

    #[test]
    fn test_op_numequalverify() {
        let script = vec![0x52, 0x52, 0x9d]; // OP_2 OP_2 OP_NUMEQUALVERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(result.is_ok()); // Should succeed (2 == 2)

        let script = vec![0x52, 0x53, 0x9d]; // OP_2 OP_3 OP_NUMEQUALVERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::VerifyFailed))); // Should fail (2 != 3)
    }

    #[test]
    fn test_op_numnotequal() {
        let script = vec![0x52, 0x53, 0x9e]; // OP_2 OP_3 OP_NUMNOTEQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 2 != 3
    }

    #[test]
    fn test_op_lessthan() {
        let script = vec![0x52, 0x53, 0x9f]; // OP_2 OP_3 OP_LESSTHAN
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 2 < 3
    }

    #[test]
    fn test_op_greaterthan() {
        let script = vec![0x53, 0x52, 0xa0]; // OP_3 OP_2 OP_GREATERTHAN
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 3 > 2
    }

    #[test]
    fn test_op_lessthanorequal() {
        let script = vec![0x52, 0x52, 0xa1]; // OP_2 OP_2 OP_LESSTHANOREQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 2 <= 2
    }

    #[test]
    fn test_op_greaterthanorequal() {
        let script = vec![0x53, 0x53, 0xa2]; // OP_3 OP_3 OP_GREATERTHANOREQUAL
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 3 >= 3
    }

    #[test]
    fn test_op_min() {
        let script = vec![0x52, 0x53, 0xa3]; // OP_2 OP_3 OP_MIN
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 2);
    }

    #[test]
    fn test_op_max() {
        let script = vec![0x52, 0x53, 0xa4]; // OP_2 OP_3 OP_MAX
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(decode_number(&interp.stack[0]).unwrap(), 3);
    }

    #[test]
    fn test_op_within() {
        let script = vec![0x55, 0x54, 0x56, 0xa5]; // OP_5 OP_4 OP_6 OP_WITHIN
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result); // 5 is within [4, 6)

        let script = vec![0x53, 0x54, 0x56, 0xa5]; // OP_3 OP_4 OP_6 OP_WITHIN
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // 3 is not within [4, 6)
    }

    // ====== Flow Control Tests ======

    #[test]
    fn test_op_verify() {
        let script = vec![0x51, 0x69]; // OP_1 OP_VERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(result.is_ok()); // Should succeed (1 is true)

        let script = vec![0x00, 0x69]; // OP_0 OP_VERIFY
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::VerifyFailed))); // Should fail (0 is false)
    }

    // ========== Flow Control Tests ==========

    #[test]
    fn test_op_if_true() {
        // OP_1 OP_IF OP_2 OP_ENDIF → Stack: [2]
        let script = vec![0x51, 0x63, 0x52, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x02]);
    }

    #[test]
    fn test_op_if_false() {
        // OP_0 OP_IF OP_2 OP_ENDIF → Stack: [] (OP_2 skipped)
        let script = vec![0x00, 0x63, 0x52, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // Script leaves empty stack (false)
        assert_eq!(interp.stack.len(), 0);
    }

    #[test]
    fn test_op_notif_true() {
        // OP_1 OP_NOTIF OP_2 OP_ENDIF → Stack: [] (OP_2 skipped, condition is true so NOTIF is false)
        let script = vec![0x51, 0x64, 0x52, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // Script leaves empty stack (false)
        assert_eq!(interp.stack.len(), 0);
    }

    #[test]
    fn test_op_notif_false() {
        // OP_0 OP_NOTIF OP_2 OP_ENDIF → Stack: [2] (OP_2 executes, condition is false so NOTIF is true)
        let script = vec![0x00, 0x64, 0x52, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x02]);
    }

    #[test]
    fn test_op_if_else_true() {
        // OP_1 OP_IF OP_2 OP_ELSE OP_3 OP_ENDIF → Stack: [2] (IF branch executes)
        let script = vec![0x51, 0x63, 0x52, 0x67, 0x53, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x02]);
    }

    #[test]
    fn test_op_if_else_false() {
        // OP_0 OP_IF OP_2 OP_ELSE OP_3 OP_ENDIF → Stack: [3] (ELSE branch executes)
        let script = vec![0x00, 0x63, 0x52, 0x67, 0x53, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x03]);
    }

    #[test]
    fn test_nested_if() {
        // OP_1 OP_IF OP_1 OP_IF OP_5 OP_ENDIF OP_ENDIF → Stack: [5]
        let script = vec![0x51, 0x63, 0x51, 0x63, 0x55, 0x68, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x05]);
    }

    #[test]
    fn test_nested_if_false_outer() {
        // OP_0 OP_IF OP_1 OP_IF OP_5 OP_ENDIF OP_ENDIF → Stack: [] (outer IF is false, inner IF never evaluated)
        let script = vec![0x00, 0x63, 0x51, 0x63, 0x55, 0x68, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // Script leaves empty stack (false)
        assert_eq!(interp.stack.len(), 0);
    }

    #[test]
    fn test_nested_if_else() {
        // OP_1 OP_IF OP_0 OP_IF OP_2 OP_ELSE OP_3 OP_ENDIF OP_ENDIF → Stack: [3]
        let script = vec![0x51, 0x63, 0x00, 0x63, 0x52, 0x67, 0x53, 0x68, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x03]);
    }

    #[test]
    fn test_deep_nesting() {
        // OP_1 IF OP_1 IF OP_1 IF OP_1 IF OP_10 ENDIF ENDIF ENDIF ENDIF → Stack: [10]
        let script = vec![
            0x51, 0x63, 0x51, 0x63, 0x51, 0x63, 0x51, 0x63, 0x5a, 0x68, 0x68, 0x68, 0x68,
        ];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(result);
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0], vec![0x0a]);
    }

    #[test]
    fn test_unbalanced_if() {
        // OP_1 OP_IF OP_2 (missing ENDIF)
        let script = vec![0x51, 0x63, 0x52];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::UnbalancedConditional)));
    }

    #[test]
    fn test_else_without_if() {
        // OP_1 OP_ELSE (no IF before ELSE)
        let script = vec![0x51, 0x67];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::ElseWithoutIf)));
    }

    #[test]
    fn test_endif_without_if() {
        // OP_1 OP_ENDIF (no IF before ENDIF)
        let script = vec![0x51, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::EndifWithoutIf)));
    }

    #[test]
    fn test_multiple_else() {
        // OP_1 OP_IF OP_2 OP_ELSE OP_3 OP_ELSE OP_4 OP_ENDIF (two ELSE blocks)
        let script = vec![0x51, 0x63, 0x52, 0x67, 0x53, 0x67, 0x54, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context);
        assert!(matches!(result, Err(TapscriptError::MultipleElse)));
    }

    #[test]
    fn test_if_skip_push() {
        // OP_0 OP_IF [0x01, 0xAA] OP_ENDIF → Stack: [] (push data should be skipped)
        let script = vec![0x00, 0x63, 0x01, 0xAA, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // Script leaves empty stack (false)
        assert_eq!(interp.stack.len(), 0);
    }

    #[test]
    fn test_if_skip_pushdata1() {
        // OP_0 OP_IF OP_PUSHDATA1 [2, 0xFF, 0xFF] OP_ENDIF → Stack: []
        let script = vec![0x00, 0x63, 0x4c, 0x02, 0xFF, 0xFF, 0x68];
        let mut interp = TapscriptInterpreter::new(script).unwrap();
        let context = create_test_context();

        let result = interp.execute(&[], &context).unwrap();
        assert!(!result); // Script leaves empty stack (false)
        assert_eq!(interp.stack.len(), 0);
    }
}
