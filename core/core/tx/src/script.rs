use crate::error::TxError;
use crate::PublicKey;
use secp256k1::ecdsa::Signature;
use serde::{Deserialize, Serialize};

/// Script opcodes (simplified for Sprint 2)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpCode {
    /// Duplicate top stack item
    OpDup = 0x76,
    /// Hash top stack item with SHA256 truncated to 20 bytes
    OpHash160 = 0xa9,
    /// Verify top two items are equal
    OpEqualVerify = 0x88,
    /// Check signature
    OpCheckSig = 0xac,
}

/// Script interpreter for P2PKH
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Script {
    /// Raw script bytes
    pub bytes: Vec<u8>,
}

impl Script {
    /// Create a new script from bytes
    pub fn new(bytes: Vec<u8>) -> Self {
        Self { bytes }
    }

    /// Create a P2PKH output script
    /// OP_DUP OP_HASH160 <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG
    pub fn new_p2pkh(pubkey_hash: &[u8; 20]) -> Self {
        let mut bytes = Vec::new();
        bytes.push(OpCode::OpDup as u8);
        bytes.push(OpCode::OpHash160 as u8);
        bytes.push(20); // Length of pubkey_hash
        bytes.extend_from_slice(pubkey_hash);
        bytes.push(OpCode::OpEqualVerify as u8);
        bytes.push(OpCode::OpCheckSig as u8);
        Self { bytes }
    }

    /// Create a P2WPKH output script (SegWit v0).
    /// `OP_0 <20-byte pubkey_hash>`
    pub fn new_p2wpkh(pubkey_hash: &[u8; 20]) -> Self {
        let mut bytes = Vec::with_capacity(22);
        bytes.push(0x00); // OP_0 (witness version 0)
        bytes.push(20);   // Push 20 bytes
        bytes.extend_from_slice(pubkey_hash);
        Self { bytes }
    }

    /// Create a P2TR output script (SegWit v1, Taproot).
    /// `OP_1 <32-byte output_key>`
    pub fn new_p2tr(output_key: &[u8; 32]) -> Self {
        let mut bytes = Vec::with_capacity(34);
        bytes.push(0x51); // OP_1 (witness version 1)
        bytes.push(32);   // Push 32 bytes
        bytes.extend_from_slice(output_key);
        Self { bytes }
    }

    /// Create a P2PKH input script (signature + public key)
    /// `<signature> <pubkey>`
    pub fn new_p2pkh_sig(signature: &Signature, pubkey: &PublicKey) -> Self {
        let sig_bytes = signature.serialize_der();
        let pubkey_bytes = pubkey.to_bytes();

        let mut bytes = Vec::new();
        bytes.push(sig_bytes.len() as u8);
        bytes.extend_from_slice(&sig_bytes);
        bytes.push(pubkey_bytes.len() as u8);
        bytes.extend_from_slice(&pubkey_bytes);

        Self { bytes }
    }
}

/// Maximum iterations for script verification to prevent infinite loops
const MAX_SCRIPT_ITERATIONS: usize = 10_000;

/// Maximum script size to prevent DOS
const MAX_SCRIPT_SIZE: usize = 10 * 1024; // 10 KB

/// Maximum stack depth to prevent stack overflow
const MAX_STACK_DEPTH: usize = 1000;

/// Maximum script execution time in milliseconds
const MAX_EXECUTION_TIME_MS: u64 = 5000; // 5 seconds

/// Maximum number of signature operations
const MAX_SIG_OPS: usize = 20;

/// Script execution context with resource tracking
struct ScriptExecutionContext {
    iterations: usize,
    stack_depth: usize,
    sig_ops: usize,
    start_time: std::time::Instant,
}

impl ScriptExecutionContext {
    fn new() -> Self {
        Self {
            iterations: 0,
            stack_depth: 0,
            sig_ops: 0,
            start_time: std::time::Instant::now(),
        }
    }

    /// Check if execution should continue
    fn check_limits(&mut self) -> Result<(), TxError> {
        // Check iteration limit
        self.iterations += 1;
        if self.iterations > MAX_SCRIPT_ITERATIONS {
            return Err(TxError::Script(
                "execution exceeded maximum iterations".into(),
            ));
        }

        // Check execution time
        let elapsed = self.start_time.elapsed().as_millis() as u64;
        if elapsed > MAX_EXECUTION_TIME_MS {
            return Err(TxError::Script("execution timeout".into()));
        }

        // Check stack depth
        if self.stack_depth > MAX_STACK_DEPTH {
            return Err(TxError::Script("stack overflow".into()));
        }

        Ok(())
    }

    /// Increment stack depth
    fn push_stack(&mut self) -> Result<(), TxError> {
        self.stack_depth += 1;
        if self.stack_depth > MAX_STACK_DEPTH {
            return Err(TxError::Script("stack overflow".into()));
        }
        Ok(())
    }

    /// Increment signature operation count
    fn count_sig_op(&mut self) -> Result<(), TxError> {
        self.sig_ops += 1;
        if self.sig_ops > MAX_SIG_OPS {
            return Err(TxError::Script(
                "exceeded maximum signature operations".into(),
            ));
        }
        Ok(())
    }
}

impl Script {
    /// Verify a P2PKH script (simplified interpreter with sandboxing)
    /// Returns true if the script is valid
    ///
    /// Sandboxing features:
    /// - Maximum iterations limit (10,000)
    /// - Maximum execution time (5 seconds)
    /// - Stack depth tracking (max 1,000)
    /// - Signature operation counting (max 20)
    pub fn verify_p2pkh(
        script_sig: &Script,
        script_pubkey: &Script,
        message: &[u8; 32],
    ) -> Result<bool, TxError> {
        // Check script sizes to prevent DOS
        if script_sig.bytes.len() > MAX_SCRIPT_SIZE {
            return Err(TxError::Script("signature exceeds maximum size".into()));
        }
        if script_pubkey.bytes.len() > MAX_SCRIPT_SIZE {
            return Err(TxError::Script("pubkey exceeds maximum size".into()));
        }

        // Initialize execution context with resource tracking
        let mut ctx = ScriptExecutionContext::new();

        // Parse script_sig: <sig_len> <signature> <pubkey_len> <pubkey>
        ctx.check_limits()?;
        if script_sig.bytes.len() < 2 {
            return Err(TxError::Script("signature validation failed".into()));
        }

        ctx.check_limits()?;
        let sig_len = script_sig.bytes[0] as usize;

        // Validate signature length bounds
        if sig_len == 0 || sig_len > 256 {
            return Err(TxError::Script("signature validation failed".into()));
        }

        ctx.check_limits()?;
        ctx.push_stack()?; // Track signature on stack
        if script_sig.bytes.len() < 1 + sig_len + 1 {
            return Err(TxError::Script("signature validation failed".into()));
        }

        ctx.check_limits()?;
        let sig_bytes = &script_sig.bytes[1..1 + sig_len];
        let signature = Signature::from_der(sig_bytes)
            .map_err(|_| TxError::Script("signature validation failed".into()))?;

        ctx.check_limits()?;
        let pubkey_len = script_sig.bytes[1 + sig_len] as usize;

        // Validate public key length bounds
        if pubkey_len == 0 || pubkey_len > 256 {
            return Err(TxError::Script("signature validation failed".into()));
        }

        ctx.check_limits()?;
        ctx.push_stack()?; // Track public key on stack
        if script_sig.bytes.len() < 1 + sig_len + 1 + pubkey_len {
            return Err(TxError::Script("signature validation failed".into()));
        }

        ctx.check_limits()?;
        let pubkey_bytes = &script_sig.bytes[1 + sig_len + 1..1 + sig_len + 1 + pubkey_len];
        let pubkey = PublicKey::from_bytes(pubkey_bytes)
            .map_err(|_| TxError::Script("signature validation failed".into()))?;

        // Parse script_pubkey: OP_DUP OP_HASH160 <20> <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG
        ctx.check_limits()?;
        if script_pubkey.bytes.len() != 25 {
            return Err(TxError::Script("validation failed".into()));
        }

        ctx.check_limits()?;
        if script_pubkey.bytes[0] != OpCode::OpDup as u8
            || script_pubkey.bytes[1] != OpCode::OpHash160 as u8
            || script_pubkey.bytes[2] != 20
            || script_pubkey.bytes[23] != OpCode::OpEqualVerify as u8
            || script_pubkey.bytes[24] != OpCode::OpCheckSig as u8
        {
            return Err(TxError::Script("validation failed".into()));
        }

        ctx.check_limits()?;
        let expected_hash: [u8; 20] = script_pubkey.bytes[3..23]
            .try_into()
            .map_err(|_| TxError::Script("validation failed".into()))?;
        let actual_hash = pubkey.hash();

        // Verify pubkey hash matches (constant-time comparison to prevent timing attacks)
        ctx.check_limits()?;
        let mut hash_matches = true;
        for i in 0..20 {
            if expected_hash[i] != actual_hash[i] {
                hash_matches = false;
            }
        }

        if !hash_matches {
            return Ok(false);
        }

        // Verify signature (count as signature operation)
        ctx.check_limits()?;
        ctx.count_sig_op()?;
        Ok(pubkey.verify(message, &signature))
    }

    /// Check if this is a P2PKH script
    pub fn is_p2pkh(&self) -> bool {
        self.bytes.len() == 25
            && self.bytes[0] == OpCode::OpDup as u8
            && self.bytes[1] == OpCode::OpHash160 as u8
            && self.bytes[2] == 20
            && self.bytes[23] == OpCode::OpEqualVerify as u8
            && self.bytes[24] == OpCode::OpCheckSig as u8
    }

    /// Extract pubkey hash from P2PKH script
    pub fn get_p2pkh_hash(&self) -> Option<[u8; 20]> {
        if !self.is_p2pkh() {
            return None;
        }
        Some(self.bytes[3..23].try_into().unwrap())
    }
}

impl From<Vec<u8>> for Script {
    fn from(bytes: Vec<u8>) -> Self {
        Self { bytes }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PrivateKey;

    #[test]
    fn test_p2pkh_script_creation() {
        let pubkey_hash = [0xabu8; 20];
        let script = Script::new_p2pkh(&pubkey_hash);

        assert_eq!(script.bytes.len(), 25);
        assert!(script.is_p2pkh());
        assert_eq!(script.get_p2pkh_hash().unwrap(), pubkey_hash);
    }

    #[test]
    fn test_p2pkh_sig_script_creation() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let message = [0x42u8; 32];
        let signature = privkey.sign(&message);

        let script = Script::new_p2pkh_sig(&signature, &pubkey);

        assert!(!script.bytes.is_empty());
    }

    #[test]
    fn test_p2pkh_verification_valid() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let pubkey_hash = pubkey.hash();

        let message = [0x42u8; 32];
        let signature = privkey.sign(&message);

        let script_sig = Script::new_p2pkh_sig(&signature, &pubkey);
        let script_pubkey = Script::new_p2pkh(&pubkey_hash);

        let result = Script::verify_p2pkh(&script_sig, &script_pubkey, &message);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_p2pkh_verification_wrong_message() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let pubkey_hash = pubkey.hash();

        let message1 = [0x42u8; 32];
        let message2 = [0x43u8; 32];
        let signature = privkey.sign(&message1);

        let script_sig = Script::new_p2pkh_sig(&signature, &pubkey);
        let script_pubkey = Script::new_p2pkh(&pubkey_hash);

        let result = Script::verify_p2pkh(&script_sig, &script_pubkey, &message2);
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn test_p2pkh_verification_wrong_pubkey_hash() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let wrong_hash = [0xabu8; 20];

        let message = [0x42u8; 32];
        let signature = privkey.sign(&message);

        let script_sig = Script::new_p2pkh_sig(&signature, &pubkey);
        let script_pubkey = Script::new_p2pkh(&wrong_hash);

        let result = Script::verify_p2pkh(&script_sig, &script_pubkey, &message);
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn test_script_is_p2pkh() {
        let pubkey_hash = [0xabu8; 20];
        let script = Script::new_p2pkh(&pubkey_hash);

        assert!(script.is_p2pkh());

        let invalid_script = Script::new(vec![0x01, 0x02, 0x03]);
        assert!(!invalid_script.is_p2pkh());
    }

    #[test]
    fn test_p2wpkh_script_len_is_22() {
        let hash = [0x11u8; 20];
        let script = Script::new_p2wpkh(&hash);
        assert_eq!(script.bytes.len(), 22);
    }

    #[test]
    fn test_p2wpkh_starts_with_op0_push20() {
        let hash = [0x22u8; 20];
        let script = Script::new_p2wpkh(&hash);
        assert_eq!(script.bytes[0], 0x00, "P2WPKH must start with OP_0");
        assert_eq!(script.bytes[1], 20, "P2WPKH second byte must be push-20");
    }

    #[test]
    fn test_p2wpkh_embeds_pubkey_hash() {
        let hash = [0xDEu8; 20];
        let script = Script::new_p2wpkh(&hash);
        assert_eq!(&script.bytes[2..22], &hash);
    }

    #[test]
    fn test_p2tr_script_len_is_34() {
        let key = [0xFFu8; 32];
        let script = Script::new_p2tr(&key);
        assert_eq!(script.bytes.len(), 34);
    }

    #[test]
    fn test_p2tr_starts_with_op1_push32() {
        let key = [0xAAu8; 32];
        let script = Script::new_p2tr(&key);
        assert_eq!(script.bytes[0], 0x51, "P2TR must start with OP_1");
        assert_eq!(script.bytes[1], 32, "P2TR second byte must be push-32");
    }

    #[test]
    fn test_p2tr_embeds_output_key() {
        let key = [0xBBu8; 32];
        let script = Script::new_p2tr(&key);
        assert_eq!(&script.bytes[2..34], &key);
    }

    #[test]
    fn test_get_p2pkh_hash_returns_none_for_empty_script() {
        let script = Script::new(vec![]);
        assert!(script.get_p2pkh_hash().is_none());
    }
}
