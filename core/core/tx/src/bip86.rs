//! # BIP-86: Hierarchical Deterministic Wallets for Taproot
//!
//! Specifies derivation paths for single-key P2TR (Pay-to-Taproot) addresses.
//! This standard builds on BIP-32 (HD wallets) and BIP-340 (Schnorr signatures)
//! to provide a native Taproot wallet structure.
//!
//! ## Derivation Path
//!
//! ```text
//! m / 86' / coin_type' / account' / change / address_index
//!
//! Where:
//! - 86' = Purpose (Taproot, hardened)
//! - coin_type' = 0' for Bitcoin mainnet, 1' for testnet (hardened)
//! - account' = Account number (hardened, default 0')
//! - change = 0 for external (receiving), 1 for internal (change)
//! - address_index = Address index (unhardened, 0, 1, 2, ...)
//!
//! Example paths:
//! - m/86'/0'/0'/0/0 = First receiving address (mainnet)
//! - m/86'/0'/0'/1/0 = First change address (mainnet)
//! - m/86'/1'/0'/0/0 = First receiving address (testnet)
//! ```
//!
//! ## Key Construction
//!
//! 1. Derive private key at derivation path
//! 2. Compute corresponding public key (33-byte compressed)
//! 3. Create x-only public key (drop y-coordinate, 32 bytes)
//! 4. Construct Taproot output key (P with no script path)
//! 5. Generate Bech32m address with witness v1

use hmac::{Hmac, Mac};
use secp256k1::{PublicKey, Secp256k1, SecretKey};
use sha2::{Digest, Sha256, Sha512};

/// BIP-86 wallet for Taproot addresses
#[derive(Debug)]
pub struct Bip86Wallet {
    /// Master extended private key
    master_xpriv: [u8; 78],

    /// Coin type (0 = mainnet, 1 = testnet)
    coin_type: u32,

    /// Account number
    account: u32,
}

/// Extended key information
#[derive(Debug, Clone, PartialEq)]
pub struct ExtendedKey {
    /// Depth in derivation tree (0 = master)
    pub depth: u8,

    /// Parent key fingerprint (first 4 bytes of parent pubkey hash)
    pub parent_fingerprint: [u8; 4],

    /// Child index
    pub child_index: u32,

    /// Chain code (32 bytes)
    pub chain_code: [u8; 32],

    /// Key data (32 bytes for private, 33 for public)
    pub key_data: Vec<u8>,

    /// Is private key (true) or public key (false)
    pub is_private: bool,
}

/// Derived Taproot address
#[derive(Debug, Clone, PartialEq)]
pub struct TaprootAddress {
    /// Output key (32 bytes, x-only pubkey)
    pub output_key: [u8; 32],

    /// Bech32m address string
    pub address: String,

    /// Derivation path
    pub path: String,

    /// Change indicator (0 = external, 1 = internal)
    pub change: bool,

    /// Address index
    pub index: u32,
}

/// BIP-86 errors
#[derive(Debug, Clone, PartialEq)]
pub enum Bip86Error {
    /// Invalid seed length
    InvalidSeedLength,

    /// Invalid seed (invalid for secp256k1)
    InvalidSeed,

    /// Invalid private key (zero or >= group order)
    InvalidKey,

    /// Invalid derivation path
    InvalidPath(String),

    /// Invalid extended key
    InvalidExtendedKey,

    /// Key derivation failed
    DerivationFailed,
}

impl Bip86Wallet {
    /// Create new BIP-86 wallet from seed
    pub fn from_seed(seed: &[u8], coin_type: u32, account: u32) -> Result<Self, Bip86Error> {
        if seed.len() < 16 || seed.len() > 64 {
            return Err(Bip86Error::InvalidSeedLength);
        }

        let master_xpriv = Self::seed_to_master_key(seed)?;

        Ok(Self {
            master_xpriv,
            coin_type,
            account,
        })
    }

    /// Generate receiving address (external chain)
    pub fn get_receiving_address(&self, index: u32) -> Result<TaprootAddress, Bip86Error> {
        self.derive_address(0, index)
    }

    /// Generate change address (internal chain)
    pub fn get_change_address(&self, index: u32) -> Result<TaprootAddress, Bip86Error> {
        self.derive_address(1, index)
    }

    /// Derive address at specific path
    fn derive_address(&self, change: u32, index: u32) -> Result<TaprootAddress, Bip86Error> {
        // Build derivation path: m/86'/coin_type'/account'/change/index
        let path = format!(
            "m/86'/{}'/{}'/{}/{}",
            self.coin_type, self.account, change, index
        );

        // Derive extended key at path
        let ext_key = self.derive_path(&path)?;

        // Extract private key (last 32 bytes of key_data)
        if ext_key.key_data.len() != 32 {
            return Err(Bip86Error::DerivationFailed);
        }

        let private_key: [u8; 32] = ext_key.key_data[..32]
            .try_into()
            .map_err(|_| Bip86Error::DerivationFailed)?;

        // Derive public key using secp256k1
        let public_key = Self::private_to_public(&private_key)?;

        // Create x-only pubkey (Taproot uses only x-coordinate)
        let output_key = Self::create_taproot_output_key(&public_key)?;

        // Generate Bech32m address
        let address = Self::encode_bech32m_address(&output_key, self.coin_type)?;

        Ok(TaprootAddress {
            output_key,
            address,
            path,
            change: change == 1,
            index,
        })
    }

    /// Derive extended key at derivation path
    fn derive_path(&self, path: &str) -> Result<ExtendedKey, Bip86Error> {
        // Parse path (m/86'/0'/0'/0/0)
        let parts: Vec<&str> = path.split('/').collect();

        if parts.is_empty() || parts[0] != "m" {
            return Err(Bip86Error::InvalidPath("Path must start with 'm'".into()));
        }

        // Start with master key
        let mut current_key = ExtendedKey {
            depth: 0,
            parent_fingerprint: [0; 4],
            child_index: 0,
            chain_code: [0; 32],
            key_data: self.master_xpriv[46..78].to_vec(), // Skip metadata, get key
            is_private: true,
        };

        // Copy chain code from master key
        current_key
            .chain_code
            .copy_from_slice(&self.master_xpriv[13..45]);

        // Derive each level
        for (i, part) in parts.iter().skip(1).enumerate() {
            let (child_index, hardened) = Self::parse_index(part)?;
            current_key = Self::derive_child(&current_key, child_index, hardened)?;
            current_key.depth = (i + 1) as u8;
        }

        Ok(current_key)
    }

    /// Parse derivation index (e.g., "0" or "0'")
    fn parse_index(part: &str) -> Result<(u32, bool), Bip86Error> {
        let hardened = part.ends_with('\'');
        let index_str = if hardened {
            &part[..part.len() - 1]
        } else {
            part
        };

        let index: u32 = index_str
            .parse()
            .map_err(|_| Bip86Error::InvalidPath(format!("Invalid index: {}", part)))?;

        let child_index = if hardened {
            0x80000000 | index // Hardened derivation
        } else {
            index
        };

        Ok((child_index, hardened))
    }

    /// Derive child key (BIP-32 CKD) using HMAC-SHA512
    fn derive_child(
        parent: &ExtendedKey,
        child_index: u32,
        hardened: bool,
    ) -> Result<ExtendedKey, Bip86Error> {
        if !parent.is_private {
            return Err(Bip86Error::DerivationFailed);
        }

        // Build HMAC-SHA512 input data
        let mut data = Vec::new();

        if hardened {
            // Hardened: 0x00 || private_key || index
            data.push(0x00);
            data.extend_from_slice(&parent.key_data);
        } else {
            // Non-hardened: public_key || index
            let pubkey = Self::private_to_public(&parent.key_data[..32].try_into().unwrap())?;
            data.extend_from_slice(&pubkey);
        }
        data.extend_from_slice(&child_index.to_be_bytes());

        // HMAC-SHA512(chain_code, data)
        type HmacSha512 = Hmac<Sha512>;
        // SAFETY: HMAC-SHA512 accepts keys of any length.
        let mut mac =
            HmacSha512::new_from_slice(&parent.chain_code).expect("HMAC accepts any key length");
        mac.update(&data);
        let result = mac.finalize().into_bytes();

        // Split result:
        // - First 32 bytes: key tweak
        // - Last 32 bytes: child chain code
        let mut key_tweak = [0u8; 32];
        key_tweak.copy_from_slice(&result[..32]);

        let mut child_chain_code = [0u8; 32];
        child_chain_code.copy_from_slice(&result[32..]);

        // Add key_tweak to parent key (mod group order)
        // child_key = parent_key + key_tweak
        let parent_key =
            SecretKey::from_slice(&parent.key_data).map_err(|_| Bip86Error::DerivationFailed)?;
        let tweak = SecretKey::from_slice(&key_tweak).map_err(|_| Bip86Error::DerivationFailed)?;
        let child_key = parent_key
            .add_tweak(&tweak.into())
            .map_err(|_| Bip86Error::DerivationFailed)?;

        // Calculate parent fingerprint
        let parent_pubkey = Self::private_to_public(&parent.key_data[..32].try_into().unwrap())?;
        let parent_hash = Sha256::digest(parent_pubkey);
        let mut parent_fingerprint = [0u8; 4];
        parent_fingerprint.copy_from_slice(&parent_hash[..4]);

        Ok(ExtendedKey {
            depth: parent.depth + 1,
            parent_fingerprint,
            child_index,
            chain_code: child_chain_code,
            key_data: child_key.secret_bytes().to_vec(),
            is_private: true,
        })
    }

    /// Convert seed to master extended private key using HMAC-SHA512
    fn seed_to_master_key(seed: &[u8]) -> Result<[u8; 78], Bip86Error> {
        // HMAC-SHA512 with key "Bitcoin seed"
        type HmacSha512 = Hmac<Sha512>;
        // SAFETY: HMAC-SHA512 accepts keys of any length.
        let mut mac =
            HmacSha512::new_from_slice(b"Bitcoin seed").expect("HMAC accepts any key length");
        mac.update(seed);
        let result = mac.finalize().into_bytes();

        // First 32 bytes: master private key
        // Last 32 bytes: master chain code
        let master_key = &result[..32];
        let chain_code = &result[32..];

        // Validate key is valid for secp256k1
        SecretKey::from_slice(master_key).map_err(|_| Bip86Error::InvalidSeed)?;

        // Build extended key structure
        let mut xpriv = [0u8; 78];

        // Version bytes (mainnet private: 0x0488ADE4)
        xpriv[0..4].copy_from_slice(&[0x04, 0x88, 0xAD, 0xE4]);

        // Depth (0 for master)
        xpriv[4] = 0;

        // Parent fingerprint (0x00000000 for master)
        xpriv[5..9].copy_from_slice(&[0, 0, 0, 0]);

        // Child index (0x00000000 for master)
        xpriv[9..13].copy_from_slice(&[0, 0, 0, 0]);

        // Chain code (32 bytes)
        xpriv[13..45].copy_from_slice(chain_code);

        // Private key (0x00 prefix + 32 bytes)
        xpriv[45] = 0x00;
        xpriv[46..78].copy_from_slice(master_key);

        Ok(xpriv)
    }

    /// Derive public key from private key using secp256k1
    fn private_to_public(private_key: &[u8; 32]) -> Result<[u8; 33], Bip86Error> {
        let secp = Secp256k1::new();

        let sk = SecretKey::from_slice(private_key).map_err(|_| Bip86Error::InvalidKey)?;
        let pk = PublicKey::from_secret_key(&secp, &sk);
        Ok(pk.serialize()) // 33-byte compressed format
    }

    /// Create Taproot output key (x-only pubkey, no script path)
    ///
    /// For BIP-86 key-path only spending, we apply the BIP-341 taptweak:
    /// Q = P + H("TapTweak", P)*G where P is the internal key
    fn create_taproot_output_key(public_key: &[u8; 33]) -> Result<[u8; 32], Bip86Error> {
        // Extract x-only internal key (drop y-coordinate prefix)
        let mut internal_key = [0u8; 32];
        internal_key.copy_from_slice(&public_key[1..33]);

        // Apply BIP-341 taptweak for key-path only (no script commitment)
        // This uses proper secp256k1 EC point arithmetic: Q = P + H(P)*G
        crate::taproot::tweak_public_key(&internal_key, None)
            .map_err(|_| Bip86Error::DerivationFailed)
    }

    /// Encode Taproot address as Bech32m, delegating to the shared bech32m module.
    fn encode_bech32m_address(output_key: &[u8; 32], coin_type: u32) -> Result<String, Bip86Error> {
        let network = if coin_type == 0 { "mainnet" } else { "testnet" };
        crate::bech32m::encode_taproot_address(output_key, network)
            .map_err(|_| Bip86Error::DerivationFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_seed() -> Vec<u8> {
        vec![1u8; 32] // 32-byte seed
    }

    #[test]
    fn test_wallet_creation() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        assert_eq!(wallet.coin_type, 0);
        assert_eq!(wallet.account, 0);
    }

    #[test]
    fn test_invalid_seed_length() {
        let short_seed = vec![1u8; 8]; // Too short
        let result = Bip86Wallet::from_seed(&short_seed, 0, 0);
        assert_eq!(result.unwrap_err(), Bip86Error::InvalidSeedLength);
    }

    #[test]
    fn test_receiving_address() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr = wallet.get_receiving_address(0).unwrap();

        assert_eq!(addr.path, "m/86'/0'/0'/0/0");
        assert!(!addr.change);
        assert_eq!(addr.index, 0);
        assert!(addr.address.starts_with("kb1p")); // Taproot mainnet
    }

    #[test]
    fn test_change_address() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr = wallet.get_change_address(0).unwrap();

        assert_eq!(addr.path, "m/86'/0'/0'/1/0");
        assert!(addr.change);
        assert_eq!(addr.index, 0);
        assert!(addr.address.starts_with("kb1p"));
    }

    #[test]
    fn test_multiple_addresses() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr0 = wallet.get_receiving_address(0).unwrap();
        let addr1 = wallet.get_receiving_address(1).unwrap();
        let addr2 = wallet.get_receiving_address(2).unwrap();

        // Should all be different
        assert_ne!(addr0.output_key, addr1.output_key);
        assert_ne!(addr1.output_key, addr2.output_key);
        assert_ne!(addr0.output_key, addr2.output_key);

        assert_eq!(addr1.index, 1);
        assert_eq!(addr2.index, 2);
    }

    #[test]
    fn test_testnet_address() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 1, 0).unwrap(); // coin_type = 1 (testnet)

        let addr = wallet.get_receiving_address(0).unwrap();

        assert!(addr.address.starts_with("tb1p")); // Taproot testnet
        assert_eq!(addr.path, "m/86'/1'/0'/0/0");
    }

    #[test]
    fn test_different_accounts() {
        let seed = create_test_seed();
        let wallet0 = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let wallet1 = Bip86Wallet::from_seed(&seed, 0, 1).unwrap();

        let addr0 = wallet0.get_receiving_address(0).unwrap();
        let addr1 = wallet1.get_receiving_address(0).unwrap();

        // Different accounts should generate different addresses
        assert_ne!(addr0.output_key, addr1.output_key);
        assert_eq!(addr0.path, "m/86'/0'/0'/0/0");
        assert_eq!(addr1.path, "m/86'/0'/1'/0/0");
    }

    #[test]
    fn test_output_key_length() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr = wallet.get_receiving_address(0).unwrap();

        // Taproot output key should be 32 bytes (x-only)
        assert_eq!(addr.output_key.len(), 32);
    }

    #[test]
    fn test_bech32m_address_format() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr = wallet.get_receiving_address(0).unwrap();

        // Should be valid Bech32m format
        assert!(addr.address.starts_with("kb1p"));
        assert!(addr.address.len() > 60); // Taproot addresses are quite long
        assert!(addr
            .address
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }

    #[test]
    fn test_deterministic_derivation() {
        let seed = create_test_seed();
        let wallet1 = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let wallet2 = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();

        let addr1 = wallet1.get_receiving_address(0).unwrap();
        let addr2 = wallet2.get_receiving_address(0).unwrap();

        // Same seed should generate same addresses
        assert_eq!(addr1.output_key, addr2.output_key);
        assert_eq!(addr1.address, addr2.address);
    }

    #[test]
    fn test_output_key_is_always_32_bytes() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let addr = wallet.get_receiving_address(0).unwrap();
        assert_eq!(addr.output_key.len(), 32);
    }

    #[test]
    fn test_address_index_stored_correctly() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        for i in 0u32..5 {
            let addr = wallet.get_receiving_address(i).unwrap();
            assert_eq!(addr.index, i);
        }
    }

    #[test]
    fn test_different_accounts_produce_different_keys() {
        let seed = create_test_seed();
        let wallet0 = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let wallet1 = Bip86Wallet::from_seed(&seed, 0, 1).unwrap();
        let addr0 = wallet0.get_receiving_address(0).unwrap();
        let addr1 = wallet1.get_receiving_address(0).unwrap();
        assert_ne!(addr0.output_key, addr1.output_key);
        assert_ne!(addr0.address, addr1.address);
    }

    #[test]
    fn test_64_byte_seed_accepted() {
        let seed = vec![0xBBu8; 64];
        assert!(Bip86Wallet::from_seed(&seed, 0, 0).is_ok());
    }

    #[test]
    fn test_5_sequential_receiving_addresses_unique() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let addrs: Vec<_> = (0..5)
            .map(|i| wallet.get_receiving_address(i).unwrap().address)
            .collect();
        let unique: std::collections::HashSet<_> = addrs.iter().collect();
        assert_eq!(unique.len(), 5, "addresses must all be distinct");
    }

    #[test]
    fn test_change_address_path_has_change_component() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let addr = wallet.get_change_address(0).unwrap();
        assert!(addr.change);
        assert!(addr.path.contains("/1/"), "change path must contain /1/, got: {}", addr.path);
    }

    #[test]
    fn test_receiving_and_change_index_0_differ() {
        let seed = create_test_seed();
        let wallet = Bip86Wallet::from_seed(&seed, 0, 0).unwrap();
        let recv = wallet.get_receiving_address(0).unwrap();
        let change = wallet.get_change_address(0).unwrap();
        assert_ne!(recv.output_key, change.output_key);
    }
}
