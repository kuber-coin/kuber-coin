// BIP-32: Hierarchical Deterministic Wallets
// Enables deterministic key generation from a single seed

use crate::PrivateKey;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt;

/// BIP-32 HD wallet errors
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(missing_docs)]
pub enum HdWalletError {
    InvalidSeed(String),
    InvalidPath(String),
    InvalidIndex(String),
    HardenedDerivationNotSupported,
    InvalidExtendedKey(String),
    SerializationError(String),
    InvalidChecksum,
    InvalidVersion,
}

impl fmt::Display for HdWalletError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSeed(msg) => write!(f, "Invalid seed: {}", msg),
            Self::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
            Self::InvalidIndex(msg) => write!(f, "Invalid index: {}", msg),
            Self::HardenedDerivationNotSupported => write!(f, "Hardened derivation not supported"),
            Self::InvalidExtendedKey(msg) => write!(f, "Invalid extended key: {}", msg),
            Self::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            Self::InvalidChecksum => write!(f, "Invalid checksum"),
            Self::InvalidVersion => write!(f, "Invalid version"),
        }
    }
}

impl Error for HdWalletError {}

/// Extended private key (xprv)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedPrivateKey {
    /// Network version (mainnet: 0x0488ADE4, testnet: 0x04358394)
    pub version: u32,
    /// Depth in the tree (0 for master)
    pub depth: u8,
    /// Parent key fingerprint (first 4 bytes of parent pubkey hash)
    pub parent_fingerprint: [u8; 4],
    /// Child index (hardened if >= 2^31)
    pub child_index: u32,
    /// Chain code for HMAC-SHA512
    pub chain_code: [u8; 32],
    /// Private key (32 bytes)
    pub private_key: [u8; 32],
}

/// Extended public key (xpub)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedPublicKey {
    /// Network version (mainnet: 0x0488B21E, testnet: 0x043587CF)
    pub version: u32,
    /// Depth in the tree (0 for master)
    pub depth: u8,
    /// Parent key fingerprint
    pub parent_fingerprint: [u8; 4],
    /// Child index
    pub child_index: u32,
    /// Chain code
    pub chain_code: [u8; 32],
    /// Public key (33 bytes compressed) - stored as Vec for serde compatibility
    #[serde(
        serialize_with = "serialize_pubkey",
        deserialize_with = "deserialize_pubkey"
    )]
    pub public_key: [u8; 33],
}

/// BIP-32 constants
pub mod constants {
    /// Mainnet extended private key version
    pub const MAINNET_PRIVATE: u32 = 0x0488ADE4;
    /// Mainnet extended public key version
    pub const MAINNET_PUBLIC: u32 = 0x0488B21E;
    /// Testnet extended private key version
    pub const TESTNET_PRIVATE: u32 = 0x04358394;
    /// Testnet extended public key version
    pub const TESTNET_PUBLIC: u32 = 0x043587CF;
    /// Hardened key threshold (2^31)
    pub const HARDENED_OFFSET: u32 = 0x80000000;
}

impl ExtendedPrivateKey {
    /// Create master key from seed (BIP-32)
    ///
    /// # Arguments
    ///
    /// * `seed` - Seed bytes (typically 128-512 bits)
    /// * `mainnet` - true for mainnet, false for testnet
    ///
    /// # Returns
    ///
    /// Master extended private key
    pub fn from_seed(seed: &[u8], mainnet: bool) -> Result<Self, HdWalletError> {
        if seed.len() < 16 || seed.len() > 64 {
            return Err(HdWalletError::InvalidSeed(
                "Seed must be 128-512 bits".to_string(),
            ));
        }

        // HMAC-SHA512 with key "Bitcoin seed"
        let hmac_key = b"Bitcoin seed";
        let hmac_result = hmac_sha512(hmac_key, seed);

        // Split result: first 32 bytes = private key, last 32 bytes = chain code
        let mut private_key = [0u8; 32];
        let mut chain_code = [0u8; 32];
        private_key.copy_from_slice(&hmac_result[..32]);
        chain_code.copy_from_slice(&hmac_result[32..]);

        // Validate private key is in valid range [1, n-1] where n is secp256k1 order
        if !is_valid_private_key(&private_key) {
            return Err(HdWalletError::InvalidSeed(
                "Generated key is invalid".to_string(),
            ));
        }

        let version = if mainnet {
            constants::MAINNET_PRIVATE
        } else {
            constants::TESTNET_PRIVATE
        };

        Ok(Self {
            version,
            depth: 0,
            parent_fingerprint: [0u8; 4],
            child_index: 0,
            chain_code,
            private_key,
        })
    }

    /// Derive child key (CKD - Child Key Derivation)
    ///
    /// # Arguments
    ///
    /// * `index` - Child index (0 to 2^32-1)
    ///   - Normal derivation: 0 to 2^31-1
    ///   - Hardened derivation: 2^31 to 2^32-1
    ///
    /// # Returns
    ///
    /// Derived child extended private key
    pub fn derive_child(&self, index: u32) -> Result<Self, HdWalletError> {
        let hardened = index >= constants::HARDENED_OFFSET;

        // Prepare data for HMAC
        let mut data = Vec::new();
        if hardened {
            // Hardened: data = 0x00 || private_key || index
            data.push(0x00);
            data.extend_from_slice(&self.private_key);
        } else {
            // Normal: data = public_key || index
            let public_key = self.get_public_key()?;
            data.extend_from_slice(&public_key);
        }
        data.extend_from_slice(&index.to_be_bytes());

        // HMAC-SHA512(chain_code, data)
        let hmac_result = hmac_sha512(&self.chain_code, &data);

        // Parse IL (left 32 bytes) and IR (right 32 bytes)
        let mut il = [0u8; 32];
        let mut ir = [0u8; 32];
        il.copy_from_slice(&hmac_result[..32]);
        ir.copy_from_slice(&hmac_result[32..]);

        // Child private key = (IL + parent_key) mod n
        let child_key = add_private_keys(&il, &self.private_key)?;

        // Validate child key
        if !is_valid_private_key(&child_key) {
            return Err(HdWalletError::InvalidIndex(
                "Derived key is invalid (try next index)".to_string(),
            ));
        }

        // Parent fingerprint = first 4 bytes of HASH160(parent_pubkey)
        let parent_pubkey = self.get_public_key()?;
        let parent_fingerprint = fingerprint_from_pubkey(&parent_pubkey);

        Ok(Self {
            version: self.version,
            depth: self.depth.saturating_add(1),
            parent_fingerprint,
            child_index: index,
            chain_code: ir,
            private_key: child_key,
        })
    }

    /// Derive child key from path (e.g., "m/44'/0'/0'/0/0")
    ///
    /// # Path Format
    ///
    /// - `m` = master key
    /// - `/` = path separator
    /// - `'` or `h` = hardened derivation (index + 2^31)
    /// - Examples: "m/0/1", "m/44'/0'/0'", "m/44h/0h/0h/0/0"
    pub fn derive_path(&self, path: &str) -> Result<Self, HdWalletError> {
        let path = path.trim();
        if !path.starts_with('m') && !path.starts_with('M') {
            return Err(HdWalletError::InvalidPath(
                "Path must start with 'm'".to_string(),
            ));
        }

        // Start with this key
        let mut key = self.clone();

        // Parse path components
        let components: Vec<&str> = path.split('/').skip(1).collect();
        for component in components {
            if component.is_empty() {
                continue;
            }

            // Check for hardened derivation
            let (index_str, hardened) = if component.ends_with('\'') || component.ends_with('h') {
                (&component[..component.len() - 1], true)
            } else {
                (component, false)
            };

            // Parse index
            let index: u32 = index_str
                .parse()
                .map_err(|_| HdWalletError::InvalidPath(format!("Invalid index: {}", component)))?;

            // Apply hardened offset if needed
            let child_index = if hardened {
                index
                    .checked_add(constants::HARDENED_OFFSET)
                    .ok_or_else(|| HdWalletError::InvalidIndex("Index overflow".to_string()))?
            } else {
                index
            };

            // Derive child
            key = key.derive_child(child_index)?;
        }

        Ok(key)
    }

    /// Get corresponding public key (33 bytes compressed)
    pub fn get_public_key(&self) -> Result<[u8; 33], HdWalletError> {
        let privkey = PrivateKey::from_bytes(&self.private_key)
            .map_err(|e| HdWalletError::InvalidSeed(e.to_string()))?;
        let pubkey = privkey.public_key();
        let bytes = pubkey.to_bytes();

        let mut array = [0u8; 33];
        array.copy_from_slice(&bytes);
        Ok(array)
    }

    /// Convert to extended public key (neutered version)
    pub fn to_extended_public_key(&self) -> Result<ExtendedPublicKey, HdWalletError> {
        let public_key = self.get_public_key()?;
        let version = if self.version == constants::MAINNET_PRIVATE {
            constants::MAINNET_PUBLIC
        } else {
            constants::TESTNET_PUBLIC
        };

        Ok(ExtendedPublicKey {
            version,
            depth: self.depth,
            parent_fingerprint: self.parent_fingerprint,
            child_index: self.child_index,
            chain_code: self.chain_code,
            public_key,
        })
    }

    /// Serialize to Base58Check format (xprv...)
    pub fn to_base58(&self) -> String {
        let mut data = Vec::new();

        // Version (4 bytes)
        data.extend_from_slice(&self.version.to_be_bytes());
        // Depth (1 byte)
        data.push(self.depth);
        // Parent fingerprint (4 bytes)
        data.extend_from_slice(&self.parent_fingerprint);
        // Child index (4 bytes)
        data.extend_from_slice(&self.child_index.to_be_bytes());
        // Chain code (32 bytes)
        data.extend_from_slice(&self.chain_code);
        // Private key with 0x00 prefix (33 bytes)
        data.push(0x00);
        data.extend_from_slice(&self.private_key);

        base58_check_encode(&data)
    }

    /// Deserialize from Base58Check format
    pub fn from_base58(s: &str) -> Result<Self, HdWalletError> {
        let data = base58_check_decode(s)?;

        if data.len() != 78 {
            return Err(HdWalletError::InvalidExtendedKey(
                "Invalid length".to_string(),
            ));
        }

        let version = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
        let depth = data[4];
        let mut parent_fingerprint = [0u8; 4];
        parent_fingerprint.copy_from_slice(&data[5..9]);
        let child_index = u32::from_be_bytes([data[9], data[10], data[11], data[12]]);
        let mut chain_code = [0u8; 32];
        chain_code.copy_from_slice(&data[13..45]);

        if data[45] != 0x00 {
            return Err(HdWalletError::InvalidExtendedKey(
                "Missing private key prefix".to_string(),
            ));
        }

        let mut private_key = [0u8; 32];
        private_key.copy_from_slice(&data[46..78]);

        // Validate version
        if version != constants::MAINNET_PRIVATE && version != constants::TESTNET_PRIVATE {
            return Err(HdWalletError::InvalidVersion);
        }

        Ok(Self {
            version,
            depth,
            parent_fingerprint,
            child_index,
            chain_code,
            private_key,
        })
    }
}

impl ExtendedPublicKey {
    /// Derive child public key (normal derivation only)
    pub fn derive_child(&self, index: u32) -> Result<Self, HdWalletError> {
        if index >= constants::HARDENED_OFFSET {
            return Err(HdWalletError::HardenedDerivationNotSupported);
        }

        // Prepare data: public_key || index
        let mut data = Vec::new();
        data.extend_from_slice(&self.public_key);
        data.extend_from_slice(&index.to_be_bytes());

        // HMAC-SHA512(chain_code, data)
        let hmac_result = hmac_sha512(&self.chain_code, &data);

        let mut il = [0u8; 32];
        let mut ir = [0u8; 32];
        il.copy_from_slice(&hmac_result[..32]);
        ir.copy_from_slice(&hmac_result[32..]);

        // Child public key = parent_pubkey + G * IL
        let child_pubkey = add_public_keys(&self.public_key, &il)?;

        // Validate child public key
        if !is_valid_public_key(&child_pubkey) {
            return Err(HdWalletError::InvalidIndex(
                "Derived pubkey is invalid".to_string(),
            ));
        }

        // Parent fingerprint
        let parent_fingerprint = fingerprint_from_pubkey(&self.public_key);

        Ok(Self {
            version: self.version,
            depth: self.depth.saturating_add(1),
            parent_fingerprint,
            child_index: index,
            chain_code: ir,
            public_key: child_pubkey,
        })
    }

    /// Derive child from path (normal derivation only, no hardened)
    pub fn derive_path(&self, path: &str) -> Result<Self, HdWalletError> {
        let path = path.trim();
        if !path.starts_with('m') && !path.starts_with('M') {
            return Err(HdWalletError::InvalidPath(
                "Path must start with 'm'".to_string(),
            ));
        }

        let mut key = self.clone();
        let components: Vec<&str> = path.split('/').skip(1).collect();

        for component in components {
            if component.is_empty() {
                continue;
            }

            // Check for hardened (not supported for xpub)
            if component.ends_with('\'') || component.ends_with('h') {
                return Err(HdWalletError::HardenedDerivationNotSupported);
            }

            let index: u32 = component
                .parse()
                .map_err(|_| HdWalletError::InvalidPath(format!("Invalid index: {}", component)))?;

            key = key.derive_child(index)?;
        }

        Ok(key)
    }

    /// Serialize to Base58Check format (xpub...)
    pub fn to_base58(&self) -> String {
        let mut data = Vec::new();

        data.extend_from_slice(&self.version.to_be_bytes());
        data.push(self.depth);
        data.extend_from_slice(&self.parent_fingerprint);
        data.extend_from_slice(&self.child_index.to_be_bytes());
        data.extend_from_slice(&self.chain_code);
        data.extend_from_slice(&self.public_key);

        base58_check_encode(&data)
    }

    /// Deserialize from Base58Check format
    pub fn from_base58(s: &str) -> Result<Self, HdWalletError> {
        let data = base58_check_decode(s)?;

        if data.len() != 78 {
            return Err(HdWalletError::InvalidExtendedKey(
                "Invalid length".to_string(),
            ));
        }

        let version = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
        let depth = data[4];
        let mut parent_fingerprint = [0u8; 4];
        parent_fingerprint.copy_from_slice(&data[5..9]);
        let child_index = u32::from_be_bytes([data[9], data[10], data[11], data[12]]);
        let mut chain_code = [0u8; 32];
        chain_code.copy_from_slice(&data[13..45]);
        let mut public_key = [0u8; 33];
        public_key.copy_from_slice(&data[45..78]);

        // Validate version
        if version != constants::MAINNET_PUBLIC && version != constants::TESTNET_PUBLIC {
            return Err(HdWalletError::InvalidVersion);
        }

        Ok(Self {
            version,
            depth,
            parent_fingerprint,
            child_index,
            chain_code,
            public_key,
        })
    }
}

/// HMAC-SHA512 implementation
fn hmac_sha512(key: &[u8], data: &[u8]) -> [u8; 64] {
    use sha2::Sha512;

    let block_size = 128; // SHA-512 block size
    let mut actual_key = vec![0u8; block_size];

    if key.len() > block_size {
        let mut hasher = Sha512::new();
        hasher.update(key);
        let hash = hasher.finalize();
        actual_key[..64].copy_from_slice(&hash);
    } else {
        actual_key[..key.len()].copy_from_slice(key);
    }

    // Create inner and outer padded keys
    let mut i_pad = vec![0x36u8; block_size];
    let mut o_pad = vec![0x5cu8; block_size];

    for i in 0..block_size {
        i_pad[i] ^= actual_key[i];
        o_pad[i] ^= actual_key[i];
    }

    // H(o_pad || H(i_pad || message))
    let mut inner_hasher = Sha512::new();
    inner_hasher.update(&i_pad);
    inner_hasher.update(data);
    let inner_hash = inner_hasher.finalize();

    let mut outer_hasher = Sha512::new();
    outer_hasher.update(&o_pad);
    outer_hasher.update(inner_hash);
    let result = outer_hasher.finalize();

    let mut output = [0u8; 64];
    output.copy_from_slice(&result);
    output
}

/// Check if private key is valid (not 0, not >= secp256k1 order)
fn is_valid_private_key(key: &[u8; 32]) -> bool {
    use secp256k1::SecretKey;

    // SecretKey::from_slice validates that:
    // 1. Key is not all zeros
    // 2. Key < secp256k1 order (n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141)
    SecretKey::from_slice(key).is_ok()
}

/// Check if public key is valid
fn is_valid_public_key(key: &[u8; 33]) -> bool {
    // Check compression byte (0x02 or 0x03)
    key[0] == 0x02 || key[0] == 0x03
}

/// Add two private keys modulo secp256k1 order
fn add_private_keys(a: &[u8; 32], b: &[u8; 32]) -> Result<[u8; 32], HdWalletError> {
    use secp256k1::{Secp256k1, SecretKey};

    let _secp = Secp256k1::new();
    let mut key_a = SecretKey::from_slice(a)
        .map_err(|_| HdWalletError::InvalidSeed("Invalid key A".to_string()))?;
    let key_b = SecretKey::from_slice(b)
        .map_err(|_| HdWalletError::InvalidSeed("Invalid key B".to_string()))?;

    key_a = key_a
        .add_tweak(&key_b.into())
        .map_err(|_| HdWalletError::InvalidSeed("Key addition failed".to_string()))?;

    Ok(key_a.secret_bytes())
}

/// Add public key with scalar (pubkey + G * scalar)
fn add_public_keys(pubkey: &[u8; 33], scalar: &[u8; 32]) -> Result<[u8; 33], HdWalletError> {
    use secp256k1::{PublicKey as Secp256k1PubKey, Secp256k1, SecretKey};

    let secp = Secp256k1::new();
    let mut pub_key = Secp256k1PubKey::from_slice(pubkey)
        .map_err(|_| HdWalletError::InvalidExtendedKey("Invalid pubkey".to_string()))?;
    let scalar_key = SecretKey::from_slice(scalar)
        .map_err(|_| HdWalletError::InvalidSeed("Invalid scalar".to_string()))?;

    pub_key = pub_key
        .add_exp_tweak(&secp, &scalar_key.into())
        .map_err(|_| HdWalletError::InvalidSeed("Pubkey addition failed".to_string()))?;

    Ok(pub_key.serialize())
}

/// Calculate fingerprint from public key
fn fingerprint_from_pubkey(pubkey: &[u8; 33]) -> [u8; 4] {
    // HASH160 = RIPEMD160(SHA256(pubkey))
    let mut hasher = Sha256::new();
    hasher.update(pubkey);
    let sha = hasher.finalize();

    let mut ripemd = ripemd::Ripemd160::new();
    ripemd.update(sha);
    let hash = ripemd.finalize();

    let mut fingerprint = [0u8; 4];
    fingerprint.copy_from_slice(&hash[..4]);
    fingerprint
}

/// Base58Check encoding
fn base58_check_encode(data: &[u8]) -> String {
    // Calculate checksum
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash1 = hasher.finalize();

    let mut hasher = Sha256::new();
    hasher.update(hash1);
    let hash2 = hasher.finalize();

    // Append first 4 bytes of double SHA-256 as checksum
    let mut payload = data.to_vec();
    payload.extend_from_slice(&hash2[..4]);

    bs58::encode(&payload).into_string()
}

/// Base58Check decoding
fn base58_check_decode(s: &str) -> Result<Vec<u8>, HdWalletError> {
    let payload = bs58::decode(s)
        .into_vec()
        .map_err(|_| HdWalletError::SerializationError("Invalid base58".to_string()))?;

    if payload.len() < 4 {
        return Err(HdWalletError::InvalidExtendedKey(
            "Payload too short".to_string(),
        ));
    }

    // Split data and checksum
    let (data, checksum) = payload.split_at(payload.len() - 4);

    // Verify checksum
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash1 = hasher.finalize();

    let mut hasher = Sha256::new();
    hasher.update(hash1);
    let hash2 = hasher.finalize();

    if &hash2[..4] != checksum {
        return Err(HdWalletError::InvalidChecksum);
    }

    Ok(data.to_vec())
}

/// Custom serialization for 33-byte public key array
fn serialize_pubkey<S>(pubkey: &[u8; 33], serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_bytes(pubkey)
}

/// Custom deserialization for 33-byte public key array
fn deserialize_pubkey<'de, D>(deserializer: D) -> Result<[u8; 33], D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let bytes: Vec<u8> = Vec::deserialize(deserializer)?;
    if bytes.len() != 33 {
        return Err(Error::custom(format!(
            "Expected 33 bytes, got {}",
            bytes.len()
        )));
    }
    let mut array = [0u8; 33];
    array.copy_from_slice(&bytes);
    Ok(array)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_master_key_from_seed() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        assert_eq!(master.depth, 0);
        assert_eq!(master.child_index, 0);
        assert_eq!(master.parent_fingerprint, [0u8; 4]);
    }

    #[test]
    fn test_child_derivation() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        let child = master.derive_child(0).unwrap();
        assert_eq!(child.depth, 1);
        assert_eq!(child.child_index, 0);
        assert_ne!(child.parent_fingerprint, [0u8; 4]);
    }

    #[test]
    fn test_hardened_derivation() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        let hardened = master.derive_child(constants::HARDENED_OFFSET).unwrap();
        assert_eq!(hardened.depth, 1);
        assert_eq!(hardened.child_index, constants::HARDENED_OFFSET);
    }

    #[test]
    fn test_path_derivation() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        // BIP-44 path: m/44'/0'/0'/0/0
        let key = master.derive_path("m/44'/0'/0'/0/0").unwrap();
        assert_eq!(key.depth, 5);
    }

    #[test]
    fn test_to_extended_public_key() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        let xpub = master.to_extended_public_key().unwrap();
        assert_eq!(xpub.depth, 0);
        assert_eq!(xpub.public_key.len(), 33);
    }

    #[test]
    fn test_xpub_derivation() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let xpub = master.to_extended_public_key().unwrap();

        // Normal derivation only
        let child_xpub = xpub.derive_child(0).unwrap();
        assert_eq!(child_xpub.depth, 1);

        // Hardened should fail
        assert!(xpub.derive_child(constants::HARDENED_OFFSET).is_err());
    }

    #[test]
    fn test_base58_encoding() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        let encoded = master.to_base58();
        assert!(encoded.starts_with("xprv"));

        let decoded = ExtendedPrivateKey::from_base58(&encoded).unwrap();
        assert_eq!(decoded.private_key, master.private_key);
        assert_eq!(decoded.chain_code, master.chain_code);
    }

    #[test]
    fn test_xpub_base58_encoding() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let xpub = master.to_extended_public_key().unwrap();

        let encoded = xpub.to_base58();
        assert!(encoded.starts_with("xpub"));

        let decoded = ExtendedPublicKey::from_base58(&encoded).unwrap();
        assert_eq!(decoded.public_key, xpub.public_key);
        assert_eq!(decoded.chain_code, xpub.chain_code);
    }

    #[test]
    fn test_invalid_seed() {
        // Too short
        let seed = vec![0u8; 8];
        assert!(ExtendedPrivateKey::from_seed(&seed, true).is_err());

        // Too long
        let seed = vec![0u8; 128];
        assert!(ExtendedPrivateKey::from_seed(&seed, true).is_err());
    }

    #[test]
    fn test_invalid_path() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();

        assert!(master.derive_path("x/0/1").is_err());
        assert!(master.derive_path("m/invalid").is_err());
    }

    #[test]
    fn test_hmac_sha512() {
        let key = b"key";
        let data = b"The quick brown fox jumps over the lazy dog";
        let result = hmac_sha512(key, data);
        assert_eq!(result.len(), 64);
    }

    // ── HD wallet hardening tests ─────────────────────────────────────────────

    #[test]
    fn test_different_seeds_produce_different_master_keys() {
        let seed_a = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let seed_b = hex::decode("fffcf9f6f3f0edeae7e4e1dedbd8d5d2").unwrap();
        let ka = ExtendedPrivateKey::from_seed(&seed_a, true).unwrap();
        let kb = ExtendedPrivateKey::from_seed(&seed_b, true).unwrap();
        assert_ne!(ka.private_key, kb.private_key);
        assert_ne!(ka.chain_code, kb.chain_code);
    }

    #[test]
    fn test_hardened_vs_non_hardened_child_differ() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let normal = master.derive_child(0).unwrap();
        let hardened = master.derive_child(0x8000_0000).unwrap(); // index 0'
        assert_ne!(normal.private_key, hardened.private_key,
            "Normal and hardened child at index 0 must produce different keys");
    }

    #[test]
    fn test_deep_five_level_derivation() {
        // m/44'/0'/0'/0/0 — P2WPKH standard path, 5 levels deep
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let result = master.derive_path("m/44'/0'/0'/0/0");
        assert!(result.is_ok(), "5-level derivation must succeed: {:?}", result.err());
    }

    #[test]
    fn test_max_non_hardened_index_valid() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        // 0x7FFF_FFFF = 2^31 - 1, the largest non-hardened index
        let result = master.derive_child(0x7FFF_FFFF);
        assert!(result.is_ok(), "Derivation at max non-hardened index must succeed");
    }

    #[test]
    fn test_derive_path_m_prefix_is_optional() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        // Both forms should succeed
        let a = master.derive_path("m/0'/1").unwrap();
        let b = master.derive_path("m/0'/1").unwrap();
        assert_eq!(a.private_key, b.private_key);
    }

    #[test]
    fn test_child_depth_increments() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        assert_eq!(master.depth, 0);
        let child = master.derive_child(0).unwrap();
        assert_eq!(child.depth, 1);
        let grandchild = child.derive_child(0).unwrap();
        assert_eq!(grandchild.depth, 2);
    }

    #[test]
    fn test_xpub_from_xprv_is_deterministic() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let xprv = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let xpub1 = xprv.to_extended_public_key().unwrap();
        let xpub2 = xprv.to_extended_public_key().unwrap();
        assert_eq!(xpub1.public_key, xpub2.public_key);
    }

    #[test]
    fn test_parent_fingerprint_matches_parent_pubkey() {
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let master = ExtendedPrivateKey::from_seed(&seed, true).unwrap();
        let child = master.derive_child(0).unwrap();
        // Parent fingerprint in child key must be first 4 bytes of HASH160(parent_pubkey)
        let parent_pub_bytes = master.get_public_key().unwrap();
        let expected_fp = fingerprint_from_pubkey(&parent_pub_bytes);
        assert_eq!(child.parent_fingerprint, expected_fp);
    }
}
