/// Bitcoin Script Interpreter
///
/// This module implements the Script execution engine that processes Bitcoin scripts.
/// It maintains a stack and executes opcodes sequentially, implementing the full
/// Bitcoin Script semantics including:
///
/// - Stack operations (push, pop, dup, swap, etc.)
/// - Arithmetic operations (add, sub, equal, etc.)
/// - Cryptographic operations (hash, checksig, checkmultisig)
/// - Flow control (if, else, endif, verify)
/// - Locktime verification (CLTV, CSV)
///
/// # Example
///
/// ```rust
/// use tx::script_interpreter::ScriptInterpreter;
/// use tx::{Script, Transaction, TxInput, TxOutput, OutPoint};
///
/// let mut interpreter = ScriptInterpreter::new();
///
/// // Script: OP_1 OP_1 OP_ADD OP_2 OP_EQUAL
/// let script = Script::new(vec![0x51, 0x51, 0x93, 0x52, 0x87]);
///
/// let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
/// let output = TxOutput::new(50_000_000, vec![]);
/// let transaction = Transaction::new(vec![input], vec![output], 0);
///
/// interpreter.execute(&script, &transaction, 0).unwrap();
/// assert!(interpreter.stack_top_true());
/// ```
use crate::{PublicKey, Script, Transaction};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256};
use thiserror::Error;

/// Errors produced by the script interpreter.
#[derive(Debug, Error)]
pub enum ScriptInterpreterError {
    /// Main stack underflow.
    #[error("Stack underflow")]
    StackUnderflow,

    /// Alt-stack underflow.
    #[error("Alt stack underflow")]
    AltStackUnderflow,

    /// Main stack overflow.
    #[error("Stack overflow")]
    StackOverflow,

    /// Element exceeds maximum allowed size.
    #[error("Element too large")]
    ElementTooLarge,

    /// Script exceeds maximum allowed size.
    #[error("Script too large")]
    ScriptTooLarge,

    /// Operation count exceeds limit.
    #[error("Too many operations")]
    TooManyOps,

    /// Push-data bytes extend beyond script boundary.
    #[error("{0}")]
    DataOutOfBounds(&'static str),

    /// Encountered an unsupported opcode.
    #[error("Unknown opcode: 0x{0:02x}")]
    UnknownOpcode(u8),

    /// OP_RETURN was executed.
    #[error("OP_RETURN executed")]
    OpReturn,

    /// Conditional (IF/ELSE/ENDIF) is unbalanced or misplaced.
    #[error("{0}")]
    FlowControl(&'static str),

    /// OP_VERIFY or a *VERIFY opcode failed.
    #[error("OP_VERIFY failed")]
    VerifyFailed,

    /// Cryptographic operation failed (sig/key parsing).
    #[error("{0}")]
    Crypto(String),

    /// OP_CHECKLOCKTIMEVERIFY failure.
    #[error("{0}")]
    Locktime(&'static str),

    /// OP_CHECKSEQUENCEVERIFY failure.
    #[error("{0}")]
    Sequence(&'static str),

    /// OP_CHECKMULTISIG parameter error.
    #[error("{0}")]
    Multisig(&'static str),

    /// Underlying transaction operation error.
    #[error(transparent)]
    Transaction(#[from] crate::TxError),

    /// A disabled opcode was encountered (consensus-invalid).
    #[error("Disabled opcode: 0x{0:02x}")]
    DisabledOpcode(u8),

    /// BIP-147: OP_CHECKMULTISIG dummy element must be empty.
    #[error("BIP-147: NULLDUMMY — OP_CHECKMULTISIG dummy element must be empty")]
    NullDummyViolation,

    /// BIP-62 rule 4: non-minimal scriptnum encoding.
    #[error("Non-minimal script number encoding")]
    NonMinimalScriptNum,

    /// BIP-62 / policy: non-minimal push encoding (MINIMALDATA).
    #[error("Non-minimal push: data could be pushed with a smaller opcode")]
    NonMinimalPush,
}

/// Maximum script size (10,000 bytes)
const MAX_SCRIPT_SIZE: usize = 10000;

/// Maximum stack size (1,000 elements)
const MAX_STACK_SIZE: usize = 1000;

/// Maximum element size (520 bytes)
const MAX_ELEMENT_SIZE: usize = 520;

/// Maximum number of operations per script (201 ops)
const MAX_OPS_PER_SCRIPT: usize = 201;

/// Optional BIP-143 signing context for SegWit v0 script execution.
///
/// When set, `op_checksig` / `op_checkmultisig` call
/// `segwit_v0_signature_hash()` instead of the legacy `signature_hash()`.
#[derive(Debug, Clone)]
pub struct SegwitContext {
    /// The script code used in the BIP-143 digest (witness script for P2WSH).
    pub script_code: Vec<u8>,
    /// Value of the prevout being spent (satoshis).
    pub value: u64,
}

/// Script interpreter with execution stack
#[derive(Debug, Clone)]
pub struct ScriptInterpreter {
    /// Main stack for script execution
    stack: Vec<Vec<u8>>,

    /// Alternate stack (OP_TOALTSTACK, OP_FROMALTSTACK)
    alt_stack: Vec<Vec<u8>>,

    /// Execution condition stack (for IF/ELSE/ENDIF)
    condition_stack: Vec<bool>,

    /// Operation count (for max ops limit)
    op_count: usize,

    /// Position of the last OP_CODESEPARATOR (for sighash).
    last_codeseparator_pos: Option<u32>,

    /// If set, use BIP-143 sighash for OP_CHECKSIG/OP_CHECKMULTISIG.
    segwit_context: Option<SegwitContext>,
}

impl ScriptInterpreter {
    /// Create a new script interpreter
    pub fn new() -> Self {
        Self {
            stack: Vec::new(),
            alt_stack: Vec::new(),
            condition_stack: Vec::new(),
            op_count: 0,
            last_codeseparator_pos: None,
            segwit_context: None,
        }
    }

    /// Set SegWit v0 signing context so that OP_CHECKSIG / OP_CHECKMULTISIG
    /// use the BIP-143 sighash algorithm.
    pub fn set_segwit_context(&mut self, script_code: Vec<u8>, value: u64) {
        self.segwit_context = Some(SegwitContext { script_code, value });
    }

    /// Push raw data onto the main stack (used for SegWit witness items).
    pub fn push_data(&mut self, data: Vec<u8>) {
        self.stack.push(data);
    }

    /// Execute a script
    ///
    /// # Arguments
    ///
    /// * `script` - The script to execute
    /// * `tx` - The transaction being verified
    /// * `input_index` - Index of the input being verified
    pub fn execute(
        &mut self,
        script: &Script,
        tx: &Transaction,
        input_index: usize,
    ) -> Result<(), ScriptInterpreterError> {
        if script.bytes.len() > MAX_SCRIPT_SIZE {
            return Err(ScriptInterpreterError::ScriptTooLarge);
        }

        let mut pc = 0; // Program counter
        let bytes = &script.bytes;

        while pc < bytes.len() {
            let opcode = bytes[pc];
            pc += 1;

            // Count non-push opcodes toward the 201-op limit.
            // Push-data ops (0x00-0x4e, 0x51-0x60) are excluded per Bitcoin consensus.
            if opcode > 0x60 {
                self.op_count += 1;
                if self.op_count > MAX_OPS_PER_SCRIPT {
                    return Err(ScriptInterpreterError::TooManyOps);
                }
            }

            // Skip execution if in false branch
            if !self.should_execute() && !Self::is_flow_control_op(opcode) {
                continue;
            }

            // Execute opcode
            self.execute_opcode(opcode, bytes, &mut pc, tx, input_index)?;
        }

        // Check condition stack is empty
        if !self.condition_stack.is_empty() {
            return Err(ScriptInterpreterError::FlowControl("Unbalanced conditional"));
        }

        Ok(())
    }

    /// Execute a single opcode
    fn execute_opcode(
        &mut self,
        opcode: u8,
        script_bytes: &[u8],
        pc: &mut usize,
        tx: &Transaction,
        input_index: usize,
    ) -> Result<(), ScriptInterpreterError> {
        match opcode {
            // Constants
            0x00 => self.push(&[])?,                     // OP_0 (OP_FALSE)
            0x51..=0x60 => self.push(&[opcode - 0x50])?, // OP_1 through OP_16

            // Push data (with MINIMALDATA enforcement — BIP-62 rule 3)
            0x01..=0x4b => {
                let len = opcode as usize;
                if *pc + len > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("Push data out of bounds"));
                }
                let data = script_bytes[*pc..*pc + len].to_vec();
                *pc += len;
                // MINIMALDATA: single-byte pushes that match OP_0/OP_1..16/OP_1NEGATE
                if len == 1 {
                    let val = data[0];
                    if val == 0 || (val >= 1 && val <= 16) || val == 0x81 {
                        return Err(ScriptInterpreterError::NonMinimalPush);
                    }
                }
                self.push(&data)?;
            }

            0x4c => {
                // OP_PUSHDATA1
                if *pc >= script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA1 missing length"));
                }
                let len = script_bytes[*pc] as usize;
                *pc += 1;
                // MINIMALDATA: OP_PUSHDATA1 should only be used for len > 75
                if len <= 75 {
                    return Err(ScriptInterpreterError::NonMinimalPush);
                }
                if *pc + len > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA1 data out of bounds"));
                }
                let data = script_bytes[*pc..*pc + len].to_vec();
                *pc += len;
                self.push(&data)?;
            }

            0x4d => {
                // OP_PUSHDATA2 — 2-byte little-endian length prefix
                if *pc + 2 > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA2 missing length"));
                }
                let len = u16::from_le_bytes([script_bytes[*pc], script_bytes[*pc + 1]]) as usize;
                *pc += 2;
                // MINIMALDATA: OP_PUSHDATA2 should only be used for len > 255
                if len <= 255 {
                    return Err(ScriptInterpreterError::NonMinimalPush);
                }
                if *pc + len > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA2 data out of bounds"));
                }
                let data = script_bytes[*pc..*pc + len].to_vec();
                *pc += len;
                self.push(&data)?;
            }

            0x4e => {
                // OP_PUSHDATA4 — 4-byte little-endian length prefix
                if *pc + 4 > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA4 missing length"));
                }
                let len = u32::from_le_bytes([
                    script_bytes[*pc],
                    script_bytes[*pc + 1],
                    script_bytes[*pc + 2],
                    script_bytes[*pc + 3],
                ]) as usize;
                *pc += 4;
                // MINIMALDATA: OP_PUSHDATA4 should only be used for len > 65535
                if len <= 65535 {
                    return Err(ScriptInterpreterError::NonMinimalPush);
                }
                if *pc + len > script_bytes.len() {
                    return Err(ScriptInterpreterError::DataOutOfBounds("OP_PUSHDATA4 data out of bounds"));
                }
                let data = script_bytes[*pc..*pc + len].to_vec();
                *pc += len;
                self.push(&data)?;
            }

            0x4f => {
                // OP_1NEGATE — push the value -1
                self.push(&[0x81])?;
            }

            // Flow control
            0x61 => {}                                            // OP_NOP — do nothing
            0x63 => self.op_if()?,                                // OP_IF
            0x64 => self.op_notif()?,                             // OP_NOTIF
            0x67 => self.op_else()?,                              // OP_ELSE
            0x68 => self.op_endif()?,                             // OP_ENDIF
            0x69 => self.op_verify()?,                            // OP_VERIFY
            0x6a => return Err(ScriptInterpreterError::OpReturn), // OP_RETURN

            // Stack operations
            0x6b => self.op_toaltstack()?,   // OP_TOALTSTACK
            0x6c => self.op_fromaltstack()?, // OP_FROMALTSTACK
            0x73 => self.op_ifdup()?,        // OP_IFDUP
            0x74 => self.op_depth()?,        // OP_DEPTH
            0x75 => self.op_drop()?,         // OP_DROP
            0x76 => self.op_dup()?,          // OP_DUP
            0x77 => self.op_nip()?,          // OP_NIP
            0x78 => self.op_over()?,         // OP_OVER
            0x79 => self.op_pick()?,         // OP_PICK
            0x7a => self.op_roll()?,         // OP_ROLL
            0x7b => self.op_rot()?,          // OP_ROT
            0x7c => self.op_swap()?,         // OP_SWAP
            0x7d => self.op_tuck()?,         // OP_TUCK
            0x6d => self.op_2drop()?,        // OP_2DROP
            0x6e => self.op_2dup()?,         // OP_2DUP
            0x6f => self.op_3dup()?,         // OP_3DUP
            0x70 => self.op_2over()?,        // OP_2OVER
            0x71 => self.op_2rot()?,         // OP_2ROT
            0x72 => self.op_2swap()?,        // OP_2SWAP

            // Arithmetic
            0x8b => self.op_1add()?,               // OP_1ADD
            0x8c => self.op_1sub()?,               // OP_1SUB
            0x8f => self.op_negate()?,             // OP_NEGATE
            0x90 => self.op_abs()?,                // OP_ABS
            0x91 => self.op_not()?,                // OP_NOT
            0x92 => self.op_0notequal()?,          // OP_0NOTEQUAL
            0x93 => self.op_add()?,                // OP_ADD
            0x94 => self.op_sub()?,                // OP_SUB
            0x9a => self.op_booland()?,            // OP_BOOLAND
            0x9b => self.op_boolor()?,             // OP_BOOLOR
            0x9c => self.op_numequal()?,           // OP_NUMEQUAL
            0x9d => self.op_numequalverify()?,     // OP_NUMEQUALVERIFY
            0x9e => self.op_numnotequal()?,        // OP_NUMNOTEQUAL
            0x9f => self.op_lessthan()?,           // OP_LESSTHAN
            0xa0 => self.op_greaterthan()?,        // OP_GREATERTHAN
            0xa1 => self.op_lessthanorequal()?,    // OP_LESSTHANOREQUAL
            0xa2 => self.op_greaterthanorequal()?, // OP_GREATERTHANOREQUAL
            0xa3 => self.op_min()?,                // OP_MIN
            0xa4 => self.op_max()?,                // OP_MAX
            0xa5 => self.op_within()?,             // OP_WITHIN

            // Crypto
            0xa6 => self.op_ripemd160()?,               // OP_RIPEMD160
            0xa7 => self.op_sha1()?,                    // OP_SHA1
            0xa8 => self.op_sha256()?,                  // OP_SHA256
            0xa9 => self.op_hash160()?,                 // OP_HASH160
            0xaa => self.op_hash256()?,                 // OP_HASH256
            0xac => self.op_checksig(tx, input_index)?, // OP_CHECKSIG
            0xad => self.op_checksigverify(tx, input_index)?, // OP_CHECKSIGVERIFY
            0xae => self.op_checkmultisig(tx, input_index)?, // OP_CHECKMULTISIG
            0xaf => self.op_checkmultisigverify(tx, input_index)?, // OP_CHECKMULTISIGVERIFY

            // Locktime
            0xb1 => self.op_checklocktimeverify(tx, input_index)?, // OP_CHECKLOCKTIMEVERIFY
            0xb2 => self.op_checksequenceverify(tx, input_index)?, // OP_CHECKSEQUENCEVERIFY

            // OP_NOP1 and OP_NOP4–OP_NOP10: reserved for future soft-fork
            // upgrades.  Must be treated as no-ops so that scripts
            // containing them remain valid.
            0xb0 | 0xb3..=0xb9 => {} // OP_NOP1, OP_NOP4–OP_NOP10

            // OP_CODESEPARATOR — update last-codesep position (needed
            // for correct CHECKSIG sighash in SegWit/Tapscript).
            0xab => {
                self.last_codeseparator_pos = Some((*pc) as u32);
            }

            // BIP-342: OP_CHECKSIGADD is only valid in tapscript.
            // In legacy/SegWit-v0 scripts, treat as disabled opcode.
            0xba => {
                return Err(ScriptInterpreterError::DisabledOpcode(0xba));
            }

            // Bitwise
            0x87 => self.op_equal()?,       // OP_EQUAL
            0x88 => self.op_equalverify()?, // OP_EQUALVERIFY

            // Size
            0x82 => self.op_size()?, // OP_SIZE

            // Disabled opcodes — explicitly reject per Bitcoin consensus
            0x7e | 0x7f | 0x80 | 0x81 | 0x83 | 0x84 | 0x85 | 0x86
            | 0x8d | 0x8e | 0x95 | 0x96 | 0x97 | 0x98 | 0x99 => {
                return Err(ScriptInterpreterError::DisabledOpcode(opcode));
            }

            _ => return Err(ScriptInterpreterError::UnknownOpcode(opcode)),
        }

        Ok(())
    }

    /// Check if opcode is flow control
    fn is_flow_control_op(opcode: u8) -> bool {
        matches!(opcode, 0x63 | 0x64 | 0x67 | 0x68) // IF, NOTIF, ELSE, ENDIF
    }

    /// Check if we should execute (not in false branch)
    fn should_execute(&self) -> bool {
        self.condition_stack.iter().all(|&cond| cond)
    }

    /// Push data onto stack
    fn push(&mut self, data: &[u8]) -> Result<(), ScriptInterpreterError> {
        if data.len() > MAX_ELEMENT_SIZE {
            return Err(ScriptInterpreterError::ElementTooLarge);
        }
        if self.stack.len() >= MAX_STACK_SIZE {
            return Err(ScriptInterpreterError::StackOverflow);
        }
        self.stack.push(data.to_vec());
        Ok(())
    }

    /// Pop data from stack
    fn pop(&mut self) -> Result<Vec<u8>, ScriptInterpreterError> {
        self.stack
            .pop()
            .ok_or(ScriptInterpreterError::StackUnderflow)
    }

    /// Peek at top of stack
    fn peek(&self, depth: usize) -> Result<&[u8], ScriptInterpreterError> {
        if depth >= self.stack.len() {
            return Err(ScriptInterpreterError::StackUnderflow);
        }
        Ok(&self.stack[self.stack.len() - 1 - depth])
    }

    /// Convert bytes to integer (BIP-62 rule 4: enforces minimal encoding).
    fn bytes_to_int(&self, bytes: &[u8]) -> Result<i64, ScriptInterpreterError> {
        if bytes.is_empty() {
            return Ok(0);
        }

        // BIP-62 rule 4: enforce minimal encoding.
        // 1) No leading zero bytes unless the next byte has 0x80 set (sign extension).
        // 2) Negative zero (0x80 alone) is never minimal — canonical zero is [].
        if bytes.len() > 1 {
            let last = bytes[bytes.len() - 1];
            let prev = bytes[bytes.len() - 2];
            // If the last byte is 0x00 or 0x80, the previous byte's MSB must justify it.
            if (last == 0x00 || last == 0x80) && (prev & 0x80 == 0) {
                return Err(ScriptInterpreterError::NonMinimalScriptNum);
            }
        }

        let negative = bytes[bytes.len() - 1] & 0x80 != 0;
        let mut value = 0i64;

        for (i, &byte) in bytes.iter().enumerate() {
            if i == bytes.len() - 1 {
                value |= ((byte & 0x7f) as i64) << (8 * i);
            } else {
                value |= (byte as i64) << (8 * i);
            }
        }

        if negative {
            Ok(-value)
        } else {
            Ok(value)
        }
    }

    /// Convert integer to bytes
    fn int_to_bytes(&self, value: i64) -> Vec<u8> {
        if value == 0 {
            return vec![];
        }

        let negative = value < 0;
        let abs_value = value.unsigned_abs();
        let mut bytes = Vec::new();
        let mut v = abs_value;

        while v > 0 {
            bytes.push((v & 0xff) as u8);
            v >>= 8;
        }

        let last_idx = bytes.len() - 1;
        if bytes[last_idx] & 0x80 != 0 {
            bytes.push(if negative { 0x80 } else { 0x00 });
        } else if negative {
            bytes[last_idx] |= 0x80;
        }

        bytes
    }

    /// Check if stack top is true
    pub fn stack_top_true(&self) -> bool {
        if self.stack.is_empty() {
            return false;
        }

        // SAFETY: stack verified non-empty by the is_empty() check above.
        let top = self.stack.last().expect("stack checked non-empty above");
        if top.is_empty() {
            return false;
        }

        // Check for negative zero
        if top.len() == 1 && top[0] == 0x80 {
            return false;
        }

        // Any non-zero value is true
        top.iter().any(|&b| b != 0)
    }

    /// Pop the top element off the stack (public, for P2SH redeem-script extraction)
    pub fn pop_top(&mut self) -> Result<Vec<u8>, ScriptInterpreterError> {
        self.pop()
    }

    /// Return the current number of elements on the main stack.
    pub fn stack_len(&self) -> usize {
        self.stack.len()
    }

    // Flow control operations

    fn op_if(&mut self) -> Result<(), ScriptInterpreterError> {
        let mut execute = false;

        if self.should_execute() {
            let value = self.pop()?;
            execute = !value.is_empty() && value.iter().any(|&b| b != 0);
        }

        self.condition_stack.push(execute);
        Ok(())
    }

    fn op_notif(&mut self) -> Result<(), ScriptInterpreterError> {
        let mut execute = false;

        if self.should_execute() {
            let value = self.pop()?;
            // NOTIF: execute if value is zero/empty (opposite of IF)
            execute = value.is_empty() || value.iter().all(|&b| b == 0);
        }

        self.condition_stack.push(execute);
        Ok(())
    }

    fn op_else(&mut self) -> Result<(), ScriptInterpreterError> {
        if self.condition_stack.is_empty() {
            return Err(ScriptInterpreterError::FlowControl("OP_ELSE without OP_IF"));
        }

        let last_idx = self.condition_stack.len() - 1;
        self.condition_stack[last_idx] = !self.condition_stack[last_idx];
        Ok(())
    }

    fn op_endif(&mut self) -> Result<(), ScriptInterpreterError> {
        if self.condition_stack.is_empty() {
            return Err(ScriptInterpreterError::FlowControl("OP_ENDIF without OP_IF"));
        }
        self.condition_stack.pop();
        Ok(())
    }

    fn op_verify(&mut self) -> Result<(), ScriptInterpreterError> {
        let value = self.pop()?;
        if value.is_empty() || value.iter().all(|&b| b == 0) {
            return Err(ScriptInterpreterError::VerifyFailed);
        }
        Ok(())
    }

    // Stack operations

    fn op_toaltstack(&mut self) -> Result<(), ScriptInterpreterError> {
        let value = self.pop()?;
        self.alt_stack.push(value);
        Ok(())
    }

    fn op_fromaltstack(&mut self) -> Result<(), ScriptInterpreterError> {
        let value = self.alt_stack.pop().ok_or(ScriptInterpreterError::AltStackUnderflow)?;
        self.push(&value)?;
        Ok(())
    }

    fn op_ifdup(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.peek(0)?.to_vec();
        if !top.is_empty() && top.iter().any(|&b| b != 0) {
            self.push(&top)?;
        }
        Ok(())
    }

    fn op_depth(&mut self) -> Result<(), ScriptInterpreterError> {
        let depth = self.stack.len() as i64;
        self.push(&self.int_to_bytes(depth))?;
        Ok(())
    }

    fn op_drop(&mut self) -> Result<(), ScriptInterpreterError> {
        self.pop()?;
        Ok(())
    }

    fn op_dup(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.peek(0)?.to_vec();
        self.push(&top)?;
        Ok(())
    }

    fn op_nip(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.pop()?;
        self.pop()?;
        self.push(&top)?;
        Ok(())
    }

    fn op_over(&mut self) -> Result<(), ScriptInterpreterError> {
        let second = self.peek(1)?.to_vec();
        self.push(&second)?;
        Ok(())
    }

    fn op_rot(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.pop()?;
        let second = self.pop()?;
        let third = self.pop()?;
        self.push(&second)?;
        self.push(&top)?;
        self.push(&third)?;
        Ok(())
    }

    fn op_swap(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.pop()?;
        let second = self.pop()?;
        self.push(&top)?;
        self.push(&second)?;
        Ok(())
    }

    fn op_tuck(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.pop()?;
        let second = self.pop()?;
        self.push(&top)?;
        self.push(&second)?;
        self.push(&top)?;
        Ok(())
    }

    /// OP_PICK: copy the n-th stack element to the top.
    fn op_pick(&mut self) -> Result<(), ScriptInterpreterError> {
        let n = self.pop()?;
        let n = self.bytes_to_int(&n)? as usize;
        let val = self.peek(n)?.to_vec();
        self.push(&val)?;
        Ok(())
    }

    /// OP_ROLL: move the n-th stack element to the top.
    fn op_roll(&mut self) -> Result<(), ScriptInterpreterError> {
        let n = self.pop()?;
        let n = self.bytes_to_int(&n)? as usize;
        if n >= self.stack.len() {
            return Err(ScriptInterpreterError::StackUnderflow);
        }
        let idx = self.stack.len() - 1 - n;
        let val = self.stack.remove(idx);
        self.stack.push(val);
        Ok(())
    }

    fn op_2drop(&mut self) -> Result<(), ScriptInterpreterError> {
        self.pop()?;
        self.pop()?;
        Ok(())
    }

    fn op_2dup(&mut self) -> Result<(), ScriptInterpreterError> {
        let second = self.peek(1)?.to_vec();
        let first = self.peek(0)?.to_vec();
        self.push(&second)?;
        self.push(&first)?;
        Ok(())
    }

    fn op_3dup(&mut self) -> Result<(), ScriptInterpreterError> {
        let third = self.peek(2)?.to_vec();
        let second = self.peek(1)?.to_vec();
        let first = self.peek(0)?.to_vec();
        self.push(&third)?;
        self.push(&second)?;
        self.push(&first)?;
        Ok(())
    }

    fn op_2over(&mut self) -> Result<(), ScriptInterpreterError> {
        let fourth = self.peek(3)?.to_vec();
        let third = self.peek(2)?.to_vec();
        self.push(&fourth)?;
        self.push(&third)?;
        Ok(())
    }

    fn op_2rot(&mut self) -> Result<(), ScriptInterpreterError> {
        let sixth = self.pop()?;
        let fifth = self.pop()?;
        let fourth = self.pop()?;
        let third = self.pop()?;
        let second = self.pop()?;
        let first = self.pop()?;
        self.push(&third)?;
        self.push(&fourth)?;
        self.push(&fifth)?;
        self.push(&sixth)?;
        self.push(&first)?;
        self.push(&second)?;
        Ok(())
    }

    fn op_2swap(&mut self) -> Result<(), ScriptInterpreterError> {
        let fourth = self.pop()?;
        let third = self.pop()?;
        let second = self.pop()?;
        let first = self.pop()?;
        self.push(&third)?;
        self.push(&fourth)?;
        self.push(&first)?;
        self.push(&second)?;
        Ok(())
    }

    // Arithmetic operations

    fn op_1add(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(a + 1))?;
        Ok(())
    }

    fn op_1sub(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(a - 1))?;
        Ok(())
    }

    fn op_negate(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(-a))?;
        Ok(())
    }

    fn op_abs(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(a.abs()))?;
        Ok(())
    }

    fn op_not(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(if a == 0 { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_0notequal(&mut self) -> Result<(), ScriptInterpreterError> {
        let val = self.pop()?;
        let a = self.bytes_to_int(&val)?;
        self.push(&self.int_to_bytes(if a != 0 { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_add(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(a + b))?;
        Ok(())
    }

    fn op_sub(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(a - b))?;
        Ok(())
    }

    fn op_booland(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a != 0 && b != 0 { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_boolor(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a != 0 || b != 0 { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_numequal(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a == b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_numequalverify(&mut self) -> Result<(), ScriptInterpreterError> {
        self.op_numequal()?;
        self.op_verify()?;
        Ok(())
    }

    fn op_numnotequal(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a != b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_lessthan(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a < b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_greaterthan(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a > b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_lessthanorequal(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a <= b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_greaterthanorequal(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(if a >= b { 1 } else { 0 }))?;
        Ok(())
    }

    fn op_min(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(a.min(b)))?;
        Ok(())
    }

    fn op_max(&mut self) -> Result<(), ScriptInterpreterError> {
        let b_val = self.pop()?;
        let a_val = self.pop()?;
        let b = self.bytes_to_int(&b_val)?;
        let a = self.bytes_to_int(&a_val)?;
        self.push(&self.int_to_bytes(a.max(b)))?;
        Ok(())
    }

    fn op_within(&mut self) -> Result<(), ScriptInterpreterError> {
        let max_val = self.pop()?;
        let min_val = self.pop()?;
        let x_val = self.pop()?;
        let max = self.bytes_to_int(&max_val)?;
        let min = self.bytes_to_int(&min_val)?;
        let x = self.bytes_to_int(&x_val)?;
        self.push(&self.int_to_bytes(if x >= min && x < max { 1 } else { 0 }))?;
        Ok(())
    }

    // Crypto operations

    fn op_ripemd160(&mut self) -> Result<(), ScriptInterpreterError> {
        let data = self.pop()?;
        let hash = Ripemd160::digest(&data);
        self.push(&hash)?;
        Ok(())
    }

    fn op_sha1(&mut self) -> Result<(), ScriptInterpreterError> {
        let data = self.pop()?;
        let hash = sha1::Sha1::digest(&data);
        self.push(&hash)?;
        Ok(())
    }

    fn op_sha256(&mut self) -> Result<(), ScriptInterpreterError> {
        let data = self.pop()?;
        let hash = Sha256::digest(&data);
        self.push(&hash)?;
        Ok(())
    }

    fn op_hash160(&mut self) -> Result<(), ScriptInterpreterError> {
        let data = self.pop()?;
        let sha = Sha256::digest(&data);
        let hash = Ripemd160::digest(sha);
        self.push(&hash)?;
        Ok(())
    }

    fn op_hash256(&mut self) -> Result<(), ScriptInterpreterError> {
        let data = self.pop()?;
        let hash1 = Sha256::digest(&data);
        let hash2 = Sha256::digest(hash1);
        self.push(&hash2)?;
        Ok(())
    }

    fn op_checksig(&mut self, tx: &Transaction, input_index: usize) -> Result<(), ScriptInterpreterError> {
        let pubkey_bytes = self.pop()?;
        let sig_bytes = self.pop()?;

        // Empty signature: push false (NULLFAIL path — no error)
        if sig_bytes.is_empty() {
            self.push(&[])?;
            return Ok(());
        }

        let _sighash_type = sig_bytes[sig_bytes.len() - 1];
        let signature_bytes = &sig_bytes[..sig_bytes.len() - 1];

        // Get signature hash — BIP-143 when SegWit context is set, legacy otherwise
        let sighash = if let Some(ctx) = &self.segwit_context {
            tx.segwit_v0_signature_hash(input_index, &ctx.script_code, ctx.value)?
        } else {
            tx.signature_hash(input_index)?
        };

        // Parse public key
        let pubkey = PublicKey::from_bytes(&pubkey_bytes)
            .map_err(|e| ScriptInterpreterError::Crypto(format!("Invalid public key: {e}")))?;

        // Parse signature (strict DER via secp256k1)
        let signature = secp256k1::ecdsa::Signature::from_der(signature_bytes)
            .map_err(|e| ScriptInterpreterError::Crypto(format!("Invalid signature: {e}")))?;

        // BIP-62 / BIP-146: enforce low-S (S ≤ order/2)
        // normalize_s() mutates in place. Compare serialized before/after to detect high-S.
        let orig_der = signature.serialize_der();
        let mut sig_check = signature;
        sig_check.normalize_s();
        if sig_check.serialize_der() != orig_der {
            return Err(ScriptInterpreterError::Crypto(
                "BIP-146: signature S value is unnecessarily high (non-low-S)".to_string(),
            ));
        }

        // Verify signature
        let valid = pubkey.verify(&sighash, &signature);

        // BIP-146 NULLFAIL: if signature is non-empty but verification fails,
        // the script must fail immediately (not just push false).
        if !valid {
            return Err(ScriptInterpreterError::Crypto(
                "BIP-146 NULLFAIL: non-empty signature failed verification".to_string(),
            ));
        }

        self.push(&[1])?;
        Ok(())
    }

    fn op_checksigverify(&mut self, tx: &Transaction, input_index: usize) -> Result<(), ScriptInterpreterError> {
        self.op_checksig(tx, input_index)?;
        self.op_verify()?;
        Ok(())
    }

    /// BIP-342 OP_CHECKSIGADD — Tapscript multisig primitive.
    ///
    /// Stack: sig n pubkey → n (if sig is empty) or n+1 (if sig is valid)
    /// An invalid non-empty signature is a script failure.
    #[allow(dead_code)]
    fn op_checksigadd(&mut self, tx: &Transaction, input_index: usize) -> Result<(), ScriptInterpreterError> {
        let pubkey_bytes = self.pop()?;
        let n_bytes = self.pop()?;
        let sig_bytes = self.pop()?;

        let n = self.bytes_to_int(&n_bytes)?;

        // Empty signature → skip verification, push n unchanged
        if sig_bytes.is_empty() {
            let result = self.int_to_bytes(n);
            self.push(&result)?;
            return Ok(());
        }

        // Schnorr signature: 64 bytes, or 65 bytes with sighash type suffix
        let schnorr_sig_bytes = if sig_bytes.len() == 65 {
            &sig_bytes[..64]
        } else if sig_bytes.len() == 64 {
            &sig_bytes[..]
        } else {
            return Err(ScriptInterpreterError::Crypto(
                "OP_CHECKSIGADD: invalid signature length".to_string(),
            ));
        };

        if pubkey_bytes.len() != 32 {
            return Err(ScriptInterpreterError::Crypto(
                "OP_CHECKSIGADD: expected 32-byte x-only pubkey".to_string(),
            ));
        }

        let schnorr_sig = crate::schnorr::SchnorrSignature::from_bytes(schnorr_sig_bytes)
            .map_err(|_| ScriptInterpreterError::Crypto("Invalid Schnorr signature".to_string()))?;

        let mut xonly_key = [0u8; 32];
        xonly_key.copy_from_slice(&pubkey_bytes);
        let pubkey = crate::schnorr::SchnorrPublicKey { x: xonly_key };

        let sighash = tx.signature_hash(input_index)?;

        match schnorr_sig.verify(&sighash, &pubkey) {
            Ok(()) => {
                let result = self.int_to_bytes(n + 1);
                self.push(&result)?;
            }
            Err(_) => {
                // Non-empty invalid signature is a script failure in BIP-342
                return Err(ScriptInterpreterError::Crypto(
                    "OP_CHECKSIGADD: Schnorr signature verification failed".to_string(),
                ));
            }
        }

        Ok(())
    }

    fn op_checkmultisig(&mut self, tx: &Transaction, input_index: usize) -> Result<(), ScriptInterpreterError> {
        // Get number of public keys
        let n_val = self.pop()?;
        let n = self.bytes_to_int(&n_val)? as usize;
        if n > 20 {
            return Err(ScriptInterpreterError::Multisig("Too many public keys"));
        }

        // Get public keys
        let mut pubkeys = Vec::new();
        for _ in 0..n {
            pubkeys.push(self.pop()?);
        }

        // Get number of signatures required
        let m_val = self.pop()?;
        let m = self.bytes_to_int(&m_val)? as usize;
        if m > n {
            return Err(ScriptInterpreterError::Multisig("More signatures required than keys available"));
        }

        // Get signatures
        let mut signatures = Vec::new();
        for _ in 0..m {
            signatures.push(self.pop()?);
        }

        // Pop off extra value (OP_CHECKMULTISIG bug).
        // BIP-147 (NULLDUMMY): the dummy element MUST be empty.
        let dummy = self.pop()?;
        if !dummy.is_empty() {
            return Err(ScriptInterpreterError::NullDummyViolation);
        }

        // Get signature hash — BIP-143 when SegWit context is set, legacy otherwise
        let sighash = if let Some(ctx) = &self.segwit_context {
            tx.segwit_v0_signature_hash(input_index, &ctx.script_code, ctx.value)?
        } else {
            tx.signature_hash(input_index)?
        };

        // Verify signatures
        let mut sig_idx = 0;
        let mut key_idx = 0;
        let mut valid_sigs = 0;

        while sig_idx < m && key_idx < n {
            let sig_bytes = &signatures[sig_idx];
            if sig_bytes.is_empty() {
                sig_idx += 1;
                continue;
            }

            let signature_bytes = &sig_bytes[..sig_bytes.len() - 1];
            let pubkey_bytes = &pubkeys[key_idx];

            if let Ok(pubkey) = PublicKey::from_bytes(pubkey_bytes) {
                if let Ok(signature) = secp256k1::ecdsa::Signature::from_der(signature_bytes) {
                    if pubkey.verify(&sighash, &signature) {
                        valid_sigs += 1;
                        sig_idx += 1;
                    }
                }
            }

            key_idx += 1;
        }

        let success = valid_sigs >= m;
        self.push(if success { &[1] } else { &[] })?;
        Ok(())
    }

    fn op_checkmultisigverify(
        &mut self,
        tx: &Transaction,
        input_index: usize,
    ) -> Result<(), ScriptInterpreterError> {
        self.op_checkmultisig(tx, input_index)?;
        self.op_verify()?;
        Ok(())
    }

    fn op_checklocktimeverify(&mut self, tx: &Transaction, input_index: usize) -> Result<(), ScriptInterpreterError> {
        let locktime_val = self.peek(0)?.to_vec();
        let locktime = self.bytes_to_int(&locktime_val)?;

        if locktime < 0 {
            return Err(ScriptInterpreterError::Locktime("Negative locktime"));
        }

        let locktime = locktime as u64;
        let tx_locktime = tx.lock_time as u64;

        // BIP-65: if the spending input's sequence is final (0xFFFFFFFF),
        // nLockTime is disabled, so CLTV must fail.
        if let Some(inp) = tx.inputs.get(input_index) {
            if inp.sequence == 0xFFFF_FFFF {
                return Err(ScriptInterpreterError::Locktime(
                    "Input sequence is final (0xFFFFFFFF); locktime disabled",
                ));
            }
        }

        // BIP-65: Locktime threshold - determines if value is block height or timestamp
        // Values < 500,000,000 are block heights, values >= 500,000,000 are Unix timestamps
        const LOCKTIME_THRESHOLD: u64 = 500_000_000;

        // Both must be the same type (both block heights or both timestamps)
        let script_is_timestamp = locktime >= LOCKTIME_THRESHOLD;
        let tx_is_timestamp = tx_locktime >= LOCKTIME_THRESHOLD;

        if script_is_timestamp != tx_is_timestamp {
            return Err(ScriptInterpreterError::Locktime(
                "Locktime type mismatch: cannot compare block height with timestamp",
            ));
        }

        // Transaction locktime must be >= script locktime
        if tx_locktime < locktime {
            return Err(ScriptInterpreterError::Locktime("Locktime not met"));
        }

        Ok(())
    }

    fn op_checksequenceverify(
        &mut self,
        tx: &Transaction,
        input_index: usize,
    ) -> Result<(), ScriptInterpreterError> {
        let sequence_val = self.peek(0)?.to_vec();
        let sequence = self.bytes_to_int(&sequence_val)?;

        if sequence < 0 {
            return Err(ScriptInterpreterError::Sequence("Negative sequence"));
        }

        if sequence > u32::MAX as i64 {
            return Err(ScriptInterpreterError::Sequence("Sequence value exceeds u32 range"));
        }

        let sequence = sequence as u32;

        // BIP-112 sequence flags
        const SEQUENCE_DISABLE_FLAG: u32 = 1 << 31; // 0x80000000 - if set, skip check
        const SEQUENCE_TYPE_FLAG: u32 = 1 << 22; // 0x00400000 - 0=blocks, 1=time (512s units)
        const SEQUENCE_MASK: u32 = 0x0000FFFF; // Lower 16 bits = value

        // If disable flag is set in script sequence, check is disabled
        if sequence & SEQUENCE_DISABLE_FLAG != 0 {
            return Ok(());
        }

        if input_index >= tx.inputs.len() {
            return Err(ScriptInterpreterError::Sequence("Invalid input index"));
        }

        let input_sequence = tx.inputs[input_index].sequence;

        // If input sequence has disable flag set, CSV fails
        if input_sequence & SEQUENCE_DISABLE_FLAG != 0 {
            return Err(ScriptInterpreterError::Sequence("Input sequence has disable flag set"));
        }

        // Type flags must match (both blocks or both time-based)
        let script_is_time = sequence & SEQUENCE_TYPE_FLAG != 0;
        let input_is_time = input_sequence & SEQUENCE_TYPE_FLAG != 0;

        if script_is_time != input_is_time {
            return Err(ScriptInterpreterError::Sequence(
                "Sequence type mismatch: cannot compare block-based with time-based",
            ));
        }

        // Compare masked values (lower 16 bits)
        let script_value = sequence & SEQUENCE_MASK;
        let input_value = input_sequence & SEQUENCE_MASK;

        if input_value < script_value {
            return Err(ScriptInterpreterError::Sequence("Sequence not met"));
        }

        Ok(())
    }

    // Bitwise operations

    fn op_equal(&mut self) -> Result<(), ScriptInterpreterError> {
        let b = self.pop()?;
        let a = self.pop()?;
        self.push(if a == b { &[1] } else { &[] })?;
        Ok(())
    }

    fn op_equalverify(&mut self) -> Result<(), ScriptInterpreterError> {
        self.op_equal()?;
        self.op_verify()?;
        Ok(())
    }

    fn op_size(&mut self) -> Result<(), ScriptInterpreterError> {
        let top = self.peek(0)?;
        let size = top.len() as i64;
        self.push(&self.int_to_bytes(size))?;
        Ok(())
    }
}

impl Default for ScriptInterpreter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OutPoint, TxInput, TxOutput};

    fn create_test_tx() -> Transaction {
        let input = TxInput::new(OutPoint::new([1u8; 32], 0), vec![]);
        let output = TxOutput::new(50_000_000, vec![]);
        Transaction::new(vec![input], vec![output], 0)
    }

    #[test]
    fn test_push_and_pop() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[1, 2, 3]).unwrap();
        assert_eq!(interp.pop().unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn test_op_dup() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[1, 2, 3]).unwrap();
        interp.op_dup().unwrap();
        assert_eq!(interp.stack.len(), 2);
        assert_eq!(interp.stack[0], interp.stack[1]);
    }

    #[test]
    fn test_op_add() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[2]).unwrap(); // 2
        interp.push(&[3]).unwrap(); // 3
        interp.op_add().unwrap();
        let result_val = interp.pop().unwrap();
        let result = interp.bytes_to_int(&result_val).unwrap();
        assert_eq!(result, 5);
    }

    #[test]
    fn test_op_equal() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[1, 2, 3]).unwrap();
        interp.push(&[1, 2, 3]).unwrap();
        interp.op_equal().unwrap();
        assert!(interp.stack_top_true());
    }

    #[test]
    fn test_op_hash160() {
        let mut interp = ScriptInterpreter::new();
        interp.push(b"hello").unwrap();
        interp.op_hash160().unwrap();
        assert_eq!(interp.stack.len(), 1);
        assert_eq!(interp.stack[0].len(), 20); // RIPEMD160 produces 20 bytes
    }

    #[test]
    fn test_stack_top_true() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[1]).unwrap();
        assert!(interp.stack_top_true());

        interp.pop().unwrap();
        interp.push(&[]).unwrap();
        assert!(!interp.stack_top_true());
    }

    #[test]
    fn test_execute_simple_script() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();

        // Script: OP_1 OP_1 OP_ADD OP_2 OP_EQUAL
        let script = Script::new(vec![0x51, 0x51, 0x93, 0x52, 0x87]);

        interp.execute(&script, &tx, 0).unwrap();
        assert!(interp.stack_top_true());
    }

    // ── Phase 7 hardening ──

    #[test]
    fn test_empty_script_succeeds() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        let script = Script::new(vec![]);
        interp.execute(&script, &tx, 0).unwrap();
        // Empty stack → not true
        assert!(!interp.stack_top_true());
    }

    #[test]
    fn test_op_verify_true() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // OP_1 OP_VERIFY (0x51, 0x69)
        let script = Script::new(vec![0x51, 0x69]);
        interp.execute(&script, &tx, 0).unwrap();
    }

    #[test]
    fn test_op_return_makes_invalid() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // OP_RETURN (0x6a) should fail execution
        let script = Script::new(vec![0x6a]);
        assert!(interp.execute(&script, &tx, 0).is_err());
    }

    #[test]
    fn test_op_0_pushes_empty() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // OP_0 (0x00)
        let script = Script::new(vec![0x00]);
        interp.execute(&script, &tx, 0).unwrap();
        assert!(!interp.stack_top_true()); // empty bytes = false
    }

    #[test]
    fn test_op_1negate() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // OP_1NEGATE (0x4f)
        let script = Script::new(vec![0x4f]);
        interp.execute(&script, &tx, 0).unwrap();
        assert!(interp.stack_top_true()); // -1 is truthy
    }

    #[test]
    fn test_default_is_new() {
        let a = ScriptInterpreter::new();
        let b = ScriptInterpreter::default();
        assert_eq!(a.stack_len(), b.stack_len());
    }

    #[test]
    fn test_stack_len_after_pushes() {
        let mut interp = ScriptInterpreter::new();
        assert_eq!(interp.stack_len(), 0);
        interp.push(&[1]).unwrap();
        interp.push(&[2]).unwrap();
        assert_eq!(interp.stack_len(), 2);
    }

    #[test]
    fn test_pop_top() {
        let mut interp = ScriptInterpreter::new();
        interp.push(&[0xAB]).unwrap();
        interp.push(&[0xCD]).unwrap();
        let top = interp.pop_top().unwrap();
        assert_eq!(top, vec![0xCD]);
        assert_eq!(interp.stack_len(), 1);
    }

    #[test]
    fn test_pop_empty_stack_fails() {
        let mut interp = ScriptInterpreter::new();
        assert!(interp.pop_top().is_err());
    }

    #[test]
    fn test_op_equalverify_success() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // Push two equal items then EQUALVERIFY: OP_1 OP_1 OP_EQUALVERIFY (0x51 0x51 0x88)
        let script = Script::new(vec![0x51, 0x51, 0x88]);
        interp.execute(&script, &tx, 0).unwrap();
    }

    #[test]
    fn test_op_equalverify_failure() {
        let tx = create_test_tx();
        let mut interp = ScriptInterpreter::new();
        // OP_1 OP_2 OP_EQUALVERIFY → should fail
        let script = Script::new(vec![0x51, 0x52, 0x88]);
        assert!(interp.execute(&script, &tx, 0).is_err());
    }

    #[test]
    fn test_push_data_via_method() {
        let mut interp = ScriptInterpreter::new();
        interp.push_data(vec![1, 2, 3]);
        assert_eq!(interp.stack_len(), 1);
        let top = interp.pop_top().unwrap();
        assert_eq!(top, vec![1, 2, 3]);
    }
}
