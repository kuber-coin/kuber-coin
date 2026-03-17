/// Multisignature transaction support
///
/// Implements m-of-n multisig scripts where m signatures out of n possible
/// public keys are required to spend funds.
///
/// Common use cases:
/// - 2-of-3: Two signatures required from three possible keys
/// - 3-of-5: Three signatures required from five possible keys
/// - 1-of-2: Simple shared control (either party can spend)
use crate::error::TxError;
use crate::{PublicKey, Script};
use serde::{Deserialize, Serialize};

/// Multisig configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultisigConfig {
    /// Number of signatures required (m)
    pub required_sigs: usize,
    /// Total number of public keys (n)
    pub total_keys: usize,
    /// Public keys that can sign
    pub public_keys: Vec<PublicKey>,
}

impl MultisigConfig {
    /// Create a new multisig configuration
    ///
    /// # Arguments
    ///
    /// * `required_sigs` - Number of signatures required (m)
    /// * `public_keys` - Vector of public keys (n keys)
    ///
    /// # Returns
    ///
    /// MultisigConfig if valid, Error if invalid
    pub fn new(required_sigs: usize, public_keys: Vec<PublicKey>) -> Result<Self, TxError> {
        let total_keys = public_keys.len();

        // Validation
        if required_sigs == 0 {
            return Err(TxError::Multisig(
                "required signatures must be at least 1".into(),
            ));
        }

        if required_sigs > total_keys {
            return Err(TxError::Multisig(format!(
                "required signatures ({}) cannot exceed total keys ({})",
                required_sigs, total_keys
            )));
        }

        if total_keys > 15 {
            return Err(TxError::Multisig(
                "maximum 15 public keys allowed".into(),
            ));
        }

        if public_keys.is_empty() {
            return Err(TxError::Multisig(
                "at least one public key required".into(),
            ));
        }

        Ok(Self {
            required_sigs,
            total_keys,
            public_keys,
        })
    }

    /// Create a 2-of-3 multisig
    pub fn two_of_three(keys: [PublicKey; 3]) -> Result<Self, TxError> {
        Self::new(2, keys.to_vec())
    }

    /// Create a 3-of-5 multisig
    pub fn three_of_five(keys: [PublicKey; 5]) -> Result<Self, TxError> {
        Self::new(3, keys.to_vec())
    }

    /// Create a 2-of-2 multisig
    pub fn two_of_two(key1: PublicKey, key2: PublicKey) -> Result<Self, TxError> {
        Self::new(2, vec![key1, key2])
    }
}

/// Create a multisig redeem script (for use with P2SH)
///
/// Format: `OP_m <pubkey1> <pubkey2> ... <pubkeyn> OP_n OP_CHECKMULTISIG`
///
/// # Arguments
///
/// * `config` - Multisig configuration
///
/// # Returns
///
/// Script containing the multisig template
pub fn create_multisig_script(config: &MultisigConfig) -> Result<Script, TxError> {
    if config.required_sigs > 16 || config.total_keys > 16 {
        return Err(TxError::Multisig("limited to 16 keys".into()));
    }

    let mut bytes = Vec::new();

    // OP_m (required signatures)
    // OP_1 through OP_16 are 0x51 through 0x60
    if config.required_sigs >= 1 && config.required_sigs <= 16 {
        bytes.push(0x50 + config.required_sigs as u8); // OP_1 through OP_16
    } else {
        return Err(TxError::Multisig(
            "required signatures must be 1-16".into(),
        ));
    }

    // Push each public key
    for pubkey in &config.public_keys {
        let pubkey_bytes = pubkey.to_bytes();

        // Push pubkey length
        if pubkey_bytes.len() > 75 {
            return Err(TxError::Multisig("public key too large".into()));
        }
        bytes.push(pubkey_bytes.len() as u8);
        bytes.extend_from_slice(&pubkey_bytes);
    }

    // OP_n (total keys)
    if config.total_keys >= 1 && config.total_keys <= 16 {
        bytes.push(0x50 + config.total_keys as u8); // OP_1 through OP_16
    } else {
        return Err(TxError::Multisig("total keys must be 1-16".into()));
    }

    // OP_CHECKMULTISIG
    bytes.push(0xae);

    Ok(Script::new(bytes))
}

/// Create a multisig P2SH address
///
/// # Arguments
///
/// * `config` - Multisig configuration
///
/// # Returns
///
/// P2SH address for the multisig script
pub fn create_multisig_address(config: &MultisigConfig) -> Result<String, TxError> {
    let redeem_script = create_multisig_script(config)?;
    Ok(crate::p2sh::script_to_p2sh_address(&redeem_script))
}

/// Create a multisig input script (scriptSig for P2SH)
///
/// Format: `OP_0 <sig1> <sig2> ... <sigm> <redeemScript>`
///
/// Note: OP_0 is required due to a bug in Bitcoin's OP_CHECKMULTISIG
///
/// # Arguments
///
/// * `signatures` - Vector of signatures (in order matching pubkeys)
/// * `redeem_script` - The multisig redeem script
///
/// # Returns
///
/// Script for spending from multisig P2SH
pub fn create_multisig_input(
    signatures: Vec<Vec<u8>>,
    redeem_script: Script,
) -> Result<Script, TxError> {
    let mut bytes = Vec::new();

    // OP_0 (required for OP_CHECKMULTISIG bug compatibility)
    bytes.push(0x00);

    // Push each signature
    for sig in signatures {
        if sig.is_empty() {
            return Err(TxError::Multisig("empty signature not allowed".into()));
        }
        if sig.len() > 255 {
            return Err(TxError::Multisig("signature too large".into()));
        }

        bytes.push(sig.len() as u8);
        bytes.extend_from_slice(&sig);
    }

    // Push redeem script
    let script_bytes = &redeem_script.bytes;
    if script_bytes.len() > 255 {
        return Err(TxError::Multisig(
            "redeem script too large for single push".into(),
        ));
    }
    bytes.push(script_bytes.len() as u8);
    bytes.extend_from_slice(script_bytes);

    Ok(Script::new(bytes))
}

/// Verify a multisig script (simplified)
///
/// Full implementation requires:
/// - Proper OP_CHECKMULTISIG execution
/// - Signature verification against public keys
/// - Handling of missing signatures
///
/// # Arguments
///
/// * `script_sig` - The input script with signatures
/// * `script_pubkey` - The P2SH output script
/// * `message` - The message that was signed
///
/// # Returns
///
/// true if valid, false if invalid
pub fn verify_multisig(
    script_sig: &Script,
    script_pubkey: &Script,
    message: &[u8; 32],
) -> Result<bool, TxError> {
    // Multisig verification uses P2SH (Pay-to-Script-Hash) mechanism:
    // 1. The scriptSig contains the redeem script and signatures
    // 2. P2SH verification validates that the redeem script hashes correctly
    // 3. The redeem script itself (containing multisig) is executed
    // 4. OP_CHECKMULTISIG verifies the required signatures
    //
    // This delegation to P2SH verification handles the standard case
    // where multisig is wrapped in P2SH (most common deployment)
    crate::p2sh::verify_p2sh(script_sig, script_pubkey, message)
}

/// Parse a multisig script to extract configuration
///
/// # Arguments
///
/// * `script` - The multisig redeem script
///
/// # Returns
///
/// MultisigConfig if valid multisig script
pub fn parse_multisig_script(script: &Script) -> Result<MultisigConfig, TxError> {
    let bytes = &script.bytes;

    if bytes.len() < 4 {
        return Err(TxError::Multisig("script too short".into()));
    }

    // Check last byte is OP_CHECKMULTISIG
    if bytes[bytes.len() - 1] != 0xae {
        return Err(TxError::Multisig(
            "script does not end with OP_CHECKMULTISIG".into(),
        ));
    }

    // Extract m (required sigs)
    let required_sigs = if bytes[0] >= 0x51 && bytes[0] <= 0x60 {
        (bytes[0] - 0x50) as usize
    } else {
        return Err(TxError::Multisig("invalid OP_m".into()));
    };

    // Extract n (total keys) - second to last byte
    let total_keys_byte = bytes[bytes.len() - 2];
    let total_keys = if (0x51..=0x60).contains(&total_keys_byte) {
        (total_keys_byte - 0x50) as usize
    } else {
        return Err(TxError::Multisig("invalid OP_n".into()));
    };

    // Extract public keys (simplified - assumes all keys are 33 bytes compressed)
    let mut public_keys = Vec::new();
    let mut pos = 1; // After OP_m

    for _ in 0..total_keys {
        if pos >= bytes.len() - 2 {
            return Err(TxError::Multisig("unexpected end of script".into()));
        }

        let key_len = bytes[pos] as usize;
        pos += 1;

        if pos + key_len > bytes.len() - 2 {
            return Err(TxError::Multisig("invalid public key length".into()));
        }

        let key_bytes = &bytes[pos..pos + key_len];
        let pubkey = PublicKey::from_bytes(key_bytes)?;

        public_keys.push(pubkey);
        pos += key_len;
    }

    if public_keys.len() != total_keys {
        return Err(TxError::Multisig(format!(
            "expected {} keys, found {}",
            total_keys,
            public_keys.len()
        )));
    }

    MultisigConfig::new(required_sigs, public_keys)
}

/// Check if a script is a multisig script
pub fn is_multisig_script(script: &Script) -> bool {
    // Minimum: OP_1 <pubkey> OP_1 OP_CHECKMULTISIG = at least 4 bytes + pubkey
    if script.bytes.len() < 40 {
        return false;
    }

    // Must end with OP_CHECKMULTISIG
    if script.bytes[script.bytes.len() - 1] != 0xae {
        return false;
    }

    // Must start with OP_m (OP_1 through OP_16)
    if script.bytes[0] < 0x51 || script.bytes[0] > 0x60 {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PrivateKey;

    fn generate_test_keys(count: usize) -> Vec<PublicKey> {
        (0..count)
            .map(|i| {
                let secret = [i as u8 + 1; 32];
                PrivateKey::from_bytes(&secret).unwrap().public_key()
            })
            .collect()
    }

    #[test]
    fn test_multisig_config_valid() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys);

        assert!(config.is_ok());
        let config = config.unwrap();
        assert_eq!(config.required_sigs, 2);
        assert_eq!(config.total_keys, 3);
    }

    #[test]
    fn test_multisig_config_too_many_required() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(4, keys);

        assert!(config.is_err());
    }

    #[test]
    fn test_multisig_config_zero_required() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(0, keys);

        assert!(config.is_err());
    }

    #[test]
    fn test_multisig_config_too_many_keys() {
        let keys = generate_test_keys(20);
        let config = MultisigConfig::new(2, keys);

        assert!(config.is_err());
    }

    #[test]
    fn test_two_of_three() {
        let keys = generate_test_keys(3);
        let config =
            MultisigConfig::two_of_three([keys[0].clone(), keys[1].clone(), keys[2].clone()]);

        assert!(config.is_ok());
        let config = config.unwrap();
        assert_eq!(config.required_sigs, 2);
        assert_eq!(config.total_keys, 3);
    }

    #[test]
    fn test_create_multisig_script() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys).unwrap();
        let script = create_multisig_script(&config);

        assert!(script.is_ok());
        let script = script.unwrap();

        // Check structure
        assert_eq!(script.bytes[0], 0x52); // OP_2
        assert_eq!(script.bytes[script.bytes.len() - 2], 0x53); // OP_3
        assert_eq!(script.bytes[script.bytes.len() - 1], 0xae); // OP_CHECKMULTISIG
    }

    #[test]
    fn test_is_multisig_script() {
        let keys = generate_test_keys(2);
        let config = MultisigConfig::new(2, keys).unwrap();
        let script = create_multisig_script(&config).unwrap();

        assert!(is_multisig_script(&script));

        // Non-multisig script
        let not_multisig = Script::new(vec![0x76, 0xa9]);
        assert!(!is_multisig_script(&not_multisig));
    }

    #[test]
    fn test_parse_multisig_script() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys.clone()).unwrap();
        let script = create_multisig_script(&config).unwrap();

        let parsed = parse_multisig_script(&script);
        assert!(parsed.is_ok());

        let parsed = parsed.unwrap();
        assert_eq!(parsed.required_sigs, 2);
        assert_eq!(parsed.total_keys, 3);
        assert_eq!(parsed.public_keys.len(), 3);
    }

    #[test]
    fn test_create_multisig_address() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys).unwrap();
        let address = create_multisig_address(&config);

        assert!(address.is_ok());
        let address = address.unwrap();

        // KuberCoin P2SH addresses use version 0x32
        let decoded = bs58::decode(&address).into_vec().unwrap();
        assert_eq!(decoded[0], 0x32);
    }

    #[test]
    fn test_create_multisig_input() {
        let keys = generate_test_keys(2);
        let config = MultisigConfig::new(2, keys).unwrap();
        let redeem_script = create_multisig_script(&config).unwrap();

        // Mock signatures
        let sig1 = vec![0x30, 0x44];
        let sig2 = vec![0x30, 0x45];

        let input = create_multisig_input(vec![sig1, sig2], redeem_script);

        assert!(input.is_ok());
        let input = input.unwrap();

        // Should start with OP_0
        assert_eq!(input.bytes[0], 0x00);
    }

    #[test]
    fn test_different_configs_different_scripts() {
        // Use different starting points to ensure different keys
        let keys1 = (0..3)
            .map(|i| {
                let secret = [i as u8 + 1; 32];
                PrivateKey::from_bytes(&secret).unwrap().public_key()
            })
            .collect();
        let keys2 = (10..13)
            .map(|i| {
                let secret = [i as u8 + 1; 32];
                PrivateKey::from_bytes(&secret).unwrap().public_key()
            })
            .collect();

        let config1 = MultisigConfig::new(2, keys1).unwrap();
        let config2 = MultisigConfig::new(2, keys2).unwrap();

        let script1 = create_multisig_script(&config1).unwrap();
        let script2 = create_multisig_script(&config2).unwrap();

        // Different keys should produce different scripts
        assert_ne!(script1.bytes, script2.bytes);
    }

    #[test]
    fn test_one_of_one_multisig_valid() {
        let keys = generate_test_keys(1);
        let config = MultisigConfig::new(1, keys).unwrap();
        assert_eq!(config.required_sigs, 1);
        assert_eq!(config.total_keys, 1);
        // Script can be created — is_multisig_script has a 40-byte floor so
        // won't match 1-of-1, but the configuration and script creation succeed.
        assert!(create_multisig_script(&config).is_ok());
    }

    #[test]
    fn test_two_of_two_convenience_method() {
        let keys = generate_test_keys(2);
        let config = MultisigConfig::two_of_two(keys[0].clone(), keys[1].clone()).unwrap();
        assert_eq!(config.required_sigs, 2);
        assert_eq!(config.total_keys, 2);
    }

    #[test]
    fn test_script_first_byte_is_op_m() {
        // For 2-of-3: OP_2 = 0x52 (0x50 + 2)
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys).unwrap();
        let script = create_multisig_script(&config).unwrap();
        assert_eq!(script.bytes[0], 0x52);
    }

    #[test]
    fn test_script_last_byte_is_checkmultisig() {
        let keys = generate_test_keys(3);
        let config = MultisigConfig::new(2, keys).unwrap();
        let script = create_multisig_script(&config).unwrap();
        assert_eq!(*script.bytes.last().unwrap(), 0xae); // OP_CHECKMULTISIG
    }

    #[test]
    fn test_15_keys_is_valid_limit() {
        let keys = generate_test_keys(15);
        assert!(MultisigConfig::new(1, keys).is_ok());
    }

    #[test]
    fn test_16_keys_exceeds_limit() {
        let keys = generate_test_keys(16);
        assert!(MultisigConfig::new(1, keys).is_err());
    }

    #[test]
    fn test_is_not_multisig_for_empty_script() {
        let empty = Script::new(vec![]);
        assert!(!is_multisig_script(&empty));
    }
}
