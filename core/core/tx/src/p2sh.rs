/// Pay-to-Script-Hash (P2SH) implementation - BIP-16
///
/// P2SH allows complex scripts to be represented by a simple 20-byte hash,
/// enabling features like multisig without requiring the sender to know the
/// full script details.
use crate::error::TxError;
use crate::script_interpreter::ScriptInterpreter;
use crate::Script;
use sha2::{Digest, Sha256};

/// P2SH address prefix (version byte) — KuberCoin mainnet
pub const P2SH_VERSION: u8 = 0x32;

/// Create a P2SH output script
///
/// # Arguments
///
/// * `script_hash` - The 20-byte hash of the redeem script
///
/// # Returns
///
/// Script containing: OP_HASH160 <script_hash> OP_EQUAL
pub fn create_p2sh_output(script_hash: &[u8; 20]) -> Script {
    let mut bytes = Vec::with_capacity(23);
    bytes.push(0xa9); // OP_HASH160
    bytes.push(20); // Push 20 bytes
    bytes.extend_from_slice(script_hash);
    bytes.push(0x87); // OP_EQUAL
    Script::new(bytes)
}

/// Create a P2SH input script (scriptSig)
///
/// # Arguments
///
/// * `signatures` - Vector of signatures (DER-encoded)
/// * `redeem_script` - The full redeem script being spent
///
/// # Returns
///
/// Script containing: `<sig1> <sig2> ... <redeemScript>`
pub fn create_p2sh_input(signatures: Vec<Vec<u8>>, redeem_script: Script) -> Script {
    let mut bytes = Vec::new();

    // Push each signature
    for sig in signatures {
        if !sig.is_empty() && sig.len() < 256 {
            bytes.push(sig.len() as u8);
            bytes.extend_from_slice(&sig);
        }
    }

    // Push redeem script
    let script_bytes = &redeem_script.bytes;
    if script_bytes.len() < 76 {
        bytes.push(script_bytes.len() as u8);
        bytes.extend_from_slice(script_bytes);
    } else if script_bytes.len() < 256 {
        bytes.push(0x4c); // OP_PUSHDATA1
        bytes.push(script_bytes.len() as u8);
        bytes.extend_from_slice(script_bytes);
    } else if script_bytes.len() < 65536 {
        bytes.push(0x4d); // OP_PUSHDATA2
        bytes.extend_from_slice(&(script_bytes.len() as u16).to_le_bytes());
        bytes.extend_from_slice(script_bytes);
    }

    Script::new(bytes)
}

/// Hash a script for P2SH (SHA256 then RIPEMD160)
///
/// # Arguments
///
/// * `script` - The script to hash
///
/// # Returns
///
/// 20-byte script hash
pub fn hash_script(script: &Script) -> [u8; 20] {
    let sha = Sha256::digest(&script.bytes);
    hash160(&sha)
}

/// HASH160 operation (SHA256 then RIPEMD160)
fn hash160(data: &[u8]) -> [u8; 20] {
    use ripemd::Ripemd160;
    let sha = Sha256::digest(data);
    let ripemd = Ripemd160::digest(sha);
    let mut result = [0u8; 20];
    result.copy_from_slice(&ripemd);
    result
}

/// Create a P2SH address from a script hash
///
/// # Arguments
///
/// * `script_hash` - The 20-byte hash of the redeem script
///
/// # Returns
///
/// Base58Check encoded P2SH address
pub fn create_p2sh_address(script_hash: &[u8; 20]) -> String {
    let mut data = Vec::with_capacity(21);
    data.push(P2SH_VERSION);
    data.extend_from_slice(script_hash);

    // Add checksum (first 4 bytes of double SHA256)
    let checksum = double_sha256_checksum(&data);
    data.extend_from_slice(&checksum);

    bs58::encode(data).into_string()
}

/// Create P2SH address from redeem script
///
/// # Arguments
///
/// * `redeem_script` - The redeem script
///
/// # Returns
///
/// Base58Check encoded P2SH address
pub fn script_to_p2sh_address(redeem_script: &Script) -> String {
    let script_hash = hash_script(redeem_script);
    create_p2sh_address(&script_hash)
}

/// Verify a P2SH transaction
///
/// # Arguments
///
/// * `script_sig` - The input script (contains signatures and redeem script)
/// * `script_pubkey` - The output script (P2SH template)
/// * `message` - The message that was signed
///
/// # Returns
///
/// true if valid, false otherwise
pub fn verify_p2sh(
    script_sig: &Script,
    script_pubkey: &Script,
    _message: &[u8; 32],
) -> Result<bool, TxError> {
    // 1. Verify scriptPubKey matches P2SH template
    if !is_p2sh_output(script_pubkey) {
        return Err(TxError::P2sh("script is not a P2SH output".into()));
    }

    // 2. Extract script hash from scriptPubKey
    let expected_hash = extract_p2sh_hash(script_pubkey)?;

    // 3. Extract redeem script from scriptSig (last item pushed)
    let redeem_script = extract_redeem_script(script_sig)?;

    // 4. Verify redeem script hashes to expected value
    let actual_hash = hash_script(&redeem_script);
    if actual_hash != expected_hash {
        return Err(TxError::P2sh("redeem script hash mismatch".into()));
    }

    // 5. Execute redeem script with remaining stack items
    // Two-phase BIP-16 evaluation:
    //   a) Execute scriptSig to push items onto the stack
    //   b) Pop the redeem script (last push)
    //   c) Execute the redeem script against the remaining stack
    //   d) The final stack must have exactly one true element (CLEANSTACK)
    //
    // NOTE: This standalone function uses a dummy tx for signature ops,
    // so OP_CHECKSIG inside the redeem script will fail here.
    // For full validation (with real tx context), the validator calls
    // verify_input_signature directly. This function is useful for
    // hash-only P2SH scripts (timelocks, hashlocks, etc.).
    let dummy_tx = crate::Transaction::new(vec![], vec![], 0);
    let mut interp = ScriptInterpreter::new();
    interp.execute(script_sig, &dummy_tx, 0)
        .map_err(|e| TxError::P2sh(format!("scriptSig execution failed: {e}")))?;
    let redeem_bytes = interp.pop_top()
        .map_err(|e| TxError::P2sh(format!("failed to pop redeem script: {e}")))?;
    let redeem_as_script = Script::new(redeem_bytes);
    interp.execute(&redeem_as_script, &dummy_tx, 0)
        .map_err(|e| TxError::P2sh(format!("redeem script execution failed: {e}")))?;
    if !interp.stack_top_true() {
        return Err(TxError::P2sh("redeem script evaluated to false".into()));
    }

    Ok(true)
}

/// Check if a script is a P2SH output
pub fn is_p2sh_output(script: &Script) -> bool {
    // P2SH output: OP_HASH160 <20 bytes> OP_EQUAL
    script.bytes.len() == 23
        && script.bytes[0] == 0xa9  // OP_HASH160
        && script.bytes[1] == 20     // Push 20 bytes
        && script.bytes[22] == 0x87 // OP_EQUAL
}

/// Extract script hash from P2SH output
fn extract_p2sh_hash(script: &Script) -> Result<[u8; 20], TxError> {
    if !is_p2sh_output(script) {
        return Err(TxError::P2sh("not a P2SH output".into()));
    }

    let mut hash = [0u8; 20];
    hash.copy_from_slice(&script.bytes[2..22]);
    Ok(hash)
}

/// Extract redeem script from P2SH input (scriptSig)
fn extract_redeem_script(script_sig: &Script) -> Result<Script, TxError> {
    // Redeem script is the last item pushed in scriptSig
    // This is a simplified extraction - full implementation needs proper parsing

    if script_sig.bytes.is_empty() {
        return Err(TxError::P2sh("empty scriptSig".into()));
    }

    let bytes = &script_sig.bytes;
    let mut pos = 0;
    let mut last_script_start = 0;
    let mut last_script_len = 0;

    // Parse through all pushes to find the last one
    while pos < bytes.len() {
        if bytes[pos] == 0 {
            pos += 1;
            continue;
        }

        let _push_len = if bytes[pos] < 0x4c {
            let len = bytes[pos] as usize;
            last_script_start = pos + 1;
            last_script_len = len;
            pos += 1 + len;
            len
        } else if bytes[pos] == 0x4c {
            // OP_PUSHDATA1
            if pos + 1 >= bytes.len() {
                return Err(TxError::P2sh("invalid OP_PUSHDATA1".into()));
            }
            let len = bytes[pos + 1] as usize;
            last_script_start = pos + 2;
            last_script_len = len;
            pos += 2 + len;
            len
        } else {
            return Err(TxError::P2sh("unsupported push opcode".into()));
        };

        if pos > bytes.len() {
            return Err(TxError::P2sh("script parsing overflow".into()));
        }
    }

    if last_script_len == 0 {
        return Err(TxError::P2sh("no redeem script found".into()));
    }

    let redeem_bytes = bytes[last_script_start..last_script_start + last_script_len].to_vec();
    Ok(Script::new(redeem_bytes))
}

/// Double SHA256 checksum (first 4 bytes)
fn double_sha256_checksum(data: &[u8]) -> [u8; 4] {
    let first = Sha256::digest(data);
    let second = Sha256::digest(first);
    [second[0], second[1], second[2], second[3]]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_p2sh_output() {
        let hash = [0x12; 20];
        let script = create_p2sh_output(&hash);

        assert_eq!(script.bytes.len(), 23);
        assert_eq!(script.bytes[0], 0xa9); // OP_HASH160
        assert_eq!(script.bytes[1], 20);
        assert_eq!(script.bytes[22], 0x87); // OP_EQUAL
    }

    #[test]
    fn test_is_p2sh_output() {
        let hash = [0x12; 20];
        let script = create_p2sh_output(&hash);
        assert!(is_p2sh_output(&script));

        let not_p2sh = Script::new(vec![0x76, 0xa9]); // Partial P2PKH
        assert!(!is_p2sh_output(&not_p2sh));
    }

    #[test]
    fn test_extract_p2sh_hash() {
        let expected_hash = [0x42; 20];
        let script = create_p2sh_output(&expected_hash);
        let extracted = extract_p2sh_hash(&script).unwrap();

        assert_eq!(extracted, expected_hash);
    }

    #[test]
    fn test_hash_script() {
        let script = Script::new(vec![0x51]); // OP_1
        let hash = hash_script(&script);

        assert_eq!(hash.len(), 20);
        // Hash should be deterministic
        let hash2 = hash_script(&script);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_create_p2sh_address() {
        let script_hash = [0x12; 20];
        let address = create_p2sh_address(&script_hash);

        // KuberCoin P2SH addresses use version 0x32
        assert!(address.len() > 25);
        // Verify round-trip via Base58Check
        let decoded = bs58::decode(&address).into_vec().unwrap();
        assert_eq!(decoded[0], P2SH_VERSION);
    }

    #[test]
    fn test_script_to_p2sh_address() {
        let script = Script::new(vec![0x51]); // OP_1
        let address = script_to_p2sh_address(&script);

        let decoded = bs58::decode(&address).into_vec().unwrap();
        assert_eq!(decoded[0], P2SH_VERSION);
    }

    #[test]
    fn test_create_p2sh_input() {
        let sig1 = vec![0x30, 0x44]; // Mock DER signature
        let sig2 = vec![0x30, 0x45];
        let redeem_script = Script::new(vec![0x52, 0xae]); // 2-of-2 multisig

        let input = create_p2sh_input(vec![sig1, sig2], redeem_script);

        assert!(!input.bytes.is_empty());
    }

    #[test]
    fn test_different_scripts_different_hashes() {
        let script1 = Script::new(vec![0x51]);
        let script2 = Script::new(vec![0x52]);

        let hash1 = hash_script(&script1);
        let hash2 = hash_script(&script2);

        assert_ne!(hash1, hash2);
    }

    // ── Phase 7 hardening ──

    #[test]
    fn test_p2sh_output_embeds_hash() {
        let hash = [0x42; 20];
        let script = create_p2sh_output(&hash);
        assert_eq!(&script.bytes[2..22], &hash);
    }

    #[test]
    fn test_p2sh_output_not_p2sh_wrong_len() {
        let script = Script::new(vec![0xa9, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        // 22 bytes, not 23
        assert!(!is_p2sh_output(&script));
    }

    #[test]
    fn test_p2sh_output_wrong_opcode() {
        let mut bytes = vec![0x76]; // OP_DUP instead of OP_HASH160
        bytes.push(20);
        bytes.extend_from_slice(&[0u8; 20]);
        bytes.push(0x87);
        assert!(!is_p2sh_output(&Script::new(bytes)));
    }

    #[test]
    fn test_hash_script_is_20_bytes() {
        let script = Script::new(vec![0x51, 0x52, 0x93]);
        let hash = hash_script(&script);
        assert_eq!(hash.len(), 20);
    }

    #[test]
    fn test_p2sh_address_decoded_has_version() {
        let hash = [0xFF; 20];
        let addr = create_p2sh_address(&hash);
        let decoded = bs58::decode(&addr).into_vec().unwrap();
        assert_eq!(decoded[0], P2SH_VERSION);
        // 1 version + 20 hash + 4 checksum = 25
        assert_eq!(decoded.len(), 25);
    }

    #[test]
    fn test_p2sh_address_checksum_valid() {
        let hash = [0x12; 20];
        let addr = create_p2sh_address(&hash);
        let decoded = bs58::decode(&addr).into_vec().unwrap();
        let payload = &decoded[..21];
        let checksum = double_sha256_checksum(payload);
        assert_eq!(&decoded[21..25], &checksum);
    }

    #[test]
    fn test_script_to_p2sh_address_deterministic() {
        let script = Script::new(vec![0x51, 0x52, 0x93, 0x87]);
        let a1 = script_to_p2sh_address(&script);
        let a2 = script_to_p2sh_address(&script);
        assert_eq!(a1, a2);
    }

    #[test]
    fn test_different_hashes_different_addresses() {
        let a1 = create_p2sh_address(&[0x01; 20]);
        let a2 = create_p2sh_address(&[0x02; 20]);
        assert_ne!(a1, a2);
    }

    #[test]
    fn test_verify_p2sh_non_p2sh_output_rejected() {
        let sig = Script::new(vec![0x01, 0x42]);
        let bad_output = Script::new(vec![0x76]);
        let result = verify_p2sh(&sig, &bad_output, &[0u8; 32]);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_p2sh_input_empty_sig() {
        let redeem = Script::new(vec![0x51]);
        let input = create_p2sh_input(vec![], redeem);
        // Should just contain the redeem script push
        assert!(!input.bytes.is_empty());
    }
}
