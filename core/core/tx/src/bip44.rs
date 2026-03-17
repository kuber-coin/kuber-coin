//! # BIP-44: Multi-Account Hierarchy for Deterministic Wallets
//!
//! BIP-44 defines a logical hierarchy for deterministic wallets based on BIP-32.
//! It allows the handling of multiple coins, accounts, and addresses from a single seed.
//!
//! ## Hierarchy
//!
//! ```text
//! m / purpose' / coin_type' / account' / change / address_index
//!
//! Levels:
//! - purpose: 44' (BIP-44, hardened)
//! - coin_type: 0' for Bitcoin, 1' for testnet (hardened)
//! - account: Account number, starting from 0' (hardened)
//! - change: 0 for external (receiving), 1 for internal (change)
//! - address_index: Address index, starting from 0 (unhardened)
//!
//! Examples:
//! - m/44'/0'/0'/0/0 = First Bitcoin receiving address
//! - m/44'/0'/0'/1/0 = First Bitcoin change address
//! - m/44'/0'/1'/0/0 = Second account, first receiving address
//! - m/44'/1'/0'/0/0 = Testnet first receiving address
//! ```

use crate::address::Address;
use crate::hd_wallet::{ExtendedPrivateKey, HdWalletError};
use crate::keys::PublicKey;
#[cfg(test)]
use crate::keys::PrivateKey;

/// BIP-44 wallet with multi-account support.
///
/// Wraps a BIP-32 master key and derives keys according to
/// `m/44'/coin_type'/account'/change/address_index`.
pub struct Bip44Wallet {
    /// Master extended private key (BIP-32)
    master: ExtendedPrivateKey,

    /// Coin type (0 = Bitcoin mainnet, 1 = testnet)
    coin_type: u32,

    /// Gap limit for address discovery
    gap_limit: u32,
}

/// BIP-44 account
#[derive(Debug, Clone, PartialEq)]
pub struct Account {
    /// Account number
    pub account_number: u32,

    /// Account extended public key (xpub serialised)
    pub xpub: Vec<u8>,

    /// Derivation path
    pub path: String,
}

/// BIP-44 derived address
#[derive(Debug, Clone, PartialEq)]
pub struct DerivedAddress {
    /// Account number
    pub account: u32,

    /// Change flag (false = external, true = internal)
    pub is_change: bool,

    /// Address index
    pub index: u32,

    /// Full derivation path
    pub path: String,

    /// Private key
    pub private_key: [u8; 32],

    /// Public key (compressed)
    pub public_key: [u8; 33],

    /// Address string
    pub address: String,
}

/// BIP-44 errors
#[derive(Debug, Clone, PartialEq)]
pub enum Bip44Error {
    /// Invalid seed length
    InvalidSeed,

    /// Invalid derivation path
    InvalidPath(String),

    /// Derivation failed
    DerivationFailed,

    /// Account not found
    AccountNotFound,
}

impl From<HdWalletError> for Bip44Error {
    fn from(e: HdWalletError) -> Self {
        match e {
            HdWalletError::InvalidSeed(_) => Bip44Error::InvalidSeed,
            HdWalletError::InvalidPath(s) => Bip44Error::InvalidPath(s),
            _ => Bip44Error::DerivationFailed,
        }
    }
}

impl Bip44Wallet {
    /// Create wallet from BIP-39 seed using real BIP-32 derivation.
    pub fn from_seed(seed: [u8; 64], coin_type: u32) -> Result<Self, Bip44Error> {
        let mainnet = coin_type != 1;
        let master = ExtendedPrivateKey::from_seed(&seed, mainnet)?;
        Ok(Self {
            master,
            coin_type,
            gap_limit: 20,
        })
    }

    /// Set gap limit for address discovery
    pub fn set_gap_limit(&mut self, limit: u32) {
        self.gap_limit = limit;
    }

    /// Get account by number
    pub fn get_account(&self, account_number: u32) -> Result<Account, Bip44Error> {
        let path = format!("m/44'/{}'/{}'", self.coin_type, account_number);
        let account_key = self.master.derive_path(&path)?;
        let xpub_key = account_key.to_extended_public_key()?;
        let xpub = xpub_key.to_base58().into_bytes();

        Ok(Account {
            account_number,
            xpub,
            path,
        })
    }

    /// Derive receiving address
    pub fn derive_receiving_address(
        &self,
        account: u32,
        index: u32,
    ) -> Result<DerivedAddress, Bip44Error> {
        self.derive_address(account, false, index)
    }

    /// Derive change address
    pub fn derive_change_address(
        &self,
        account: u32,
        index: u32,
    ) -> Result<DerivedAddress, Bip44Error> {
        self.derive_address(account, true, index)
    }

    /// Derive address at the full BIP-44 path using real BIP-32 CKD.
    fn derive_address(
        &self,
        account: u32,
        is_change: bool,
        index: u32,
    ) -> Result<DerivedAddress, Bip44Error> {
        let change_value = if is_change { 1 } else { 0 };
        let path = format!(
            "m/44'/{}'/{}'/{}/{}",
            self.coin_type, account, change_value, index
        );

        let child_key = self.master.derive_path(&path)?;
        let private_key = child_key.private_key;
        let public_key = child_key.get_public_key()?;

        // Generate P2PKH address using real secp256k1 public key
        let pk = PublicKey::from_bytes(&public_key)
            .map_err(|_| Bip44Error::DerivationFailed)?;
        let version = if self.coin_type == 1 { 0x6F } else { 0x2D }; // testnet / mainnet
        let addr = Address::from_pubkey_with_version(&pk, version);

        Ok(DerivedAddress {
            account,
            is_change,
            index,
            path,
            private_key,
            public_key,
            address: addr.encode(),
        })
    }

    /// Discover used accounts (gap limit method).
    ///
    /// Without an active blockchain connection, returns account 0 only.
    /// In production, iterate accounts and check addresses 0..gap_limit
    /// for on-chain activity.
    pub fn discover_accounts(&self) -> Vec<u32> {
        vec![0]
    }

    /// Find next unused receiving address (returns index 0 without blockchain).
    pub fn get_next_receiving_address(&self, account: u32) -> Result<DerivedAddress, Bip44Error> {
        self.derive_receiving_address(account, 0)
    }

    /// Find next unused change address (returns index 0 without blockchain).
    pub fn get_next_change_address(&self, account: u32) -> Result<DerivedAddress, Bip44Error> {
        self.derive_change_address(account, 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_seed() -> [u8; 64] {
        [0x42u8; 64]
    }

    #[test]
    fn test_wallet_creation() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        assert_eq!(wallet.coin_type, 0);
        assert_eq!(wallet.gap_limit, 20);
    }

    #[test]
    fn test_set_gap_limit() {
        let seed = create_test_seed();
        let mut wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        wallet.set_gap_limit(50);
        assert_eq!(wallet.gap_limit, 50);
    }

    #[test]
    fn test_get_account() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let account = wallet.get_account(0).unwrap();

        assert_eq!(account.account_number, 0);
        assert_eq!(account.path, "m/44'/0'/0'");
        assert!(!account.xpub.is_empty());
    }

    #[test]
    fn test_derive_receiving_address() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr = wallet.derive_receiving_address(0, 0).unwrap();

        assert_eq!(addr.account, 0);
        assert!(!addr.is_change);
        assert_eq!(addr.index, 0);
        assert_eq!(addr.path, "m/44'/0'/0'/0/0");
        // Real P2PKH address with KuberCoin mainnet version byte
        assert!(addr.address.starts_with('K'));
    }

    #[test]
    fn test_derive_change_address() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr = wallet.derive_change_address(0, 0).unwrap();

        assert_eq!(addr.account, 0);
        assert!(addr.is_change);
        assert_eq!(addr.index, 0);
        assert_eq!(addr.path, "m/44'/0'/0'/1/0");
    }

    #[test]
    fn test_multiple_accounts() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let account0 = wallet.get_account(0).unwrap();
        let account1 = wallet.get_account(1).unwrap();
        let account2 = wallet.get_account(2).unwrap();

        assert_eq!(account0.account_number, 0);
        assert_eq!(account1.account_number, 1);
        assert_eq!(account2.account_number, 2);

        // Different accounts should have different xpubs
        assert_ne!(account0.xpub, account1.xpub);
        assert_ne!(account1.xpub, account2.xpub);
    }

    #[test]
    fn test_sequential_addresses() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr0 = wallet.derive_receiving_address(0, 0).unwrap();
        let addr1 = wallet.derive_receiving_address(0, 1).unwrap();
        let addr2 = wallet.derive_receiving_address(0, 2).unwrap();

        // Sequential addresses should be different
        assert_ne!(addr0.private_key, addr1.private_key);
        assert_ne!(addr1.private_key, addr2.private_key);
        assert_ne!(addr0.address, addr1.address);
    }

    #[test]
    fn test_testnet_addresses() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 1).unwrap(); // coin_type = 1 (testnet)

        let addr = wallet.derive_receiving_address(0, 0).unwrap();

        assert_eq!(addr.path, "m/44'/1'/0'/0/0");
    }

    #[test]
    fn test_receiving_vs_change() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let receiving = wallet.derive_receiving_address(0, 0).unwrap();
        let change = wallet.derive_change_address(0, 0).unwrap();

        // Same index but different chains should produce different addresses
        assert_ne!(receiving.private_key, change.private_key);
        assert_ne!(receiving.address, change.address);
        assert_eq!(receiving.path, "m/44'/0'/0'/0/0");
        assert_eq!(change.path, "m/44'/0'/0'/1/0");
    }

    #[test]
    fn test_deterministic_derivation() {
        let seed = create_test_seed();
        let wallet1 = Bip44Wallet::from_seed(seed, 0).unwrap();
        let wallet2 = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr1 = wallet1.derive_receiving_address(0, 0).unwrap();
        let addr2 = wallet2.derive_receiving_address(0, 0).unwrap();

        // Same seed should produce same addresses
        assert_eq!(addr1.private_key, addr2.private_key);
        assert_eq!(addr1.address, addr2.address);
    }

    #[test]
    fn test_discover_accounts() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let accounts = wallet.discover_accounts();

        assert!(!accounts.is_empty());
        assert!(accounts.contains(&0));
    }

    #[test]
    fn test_get_next_addresses() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let receiving = wallet.get_next_receiving_address(0).unwrap();
        let change = wallet.get_next_change_address(0).unwrap();

        assert!(!receiving.is_change);
        assert!(change.is_change);
    }

    #[test]
    fn test_private_key_length() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr = wallet.derive_receiving_address(0, 0).unwrap();

        assert_eq!(addr.private_key.len(), 32);
        assert_eq!(addr.public_key.len(), 33);
    }

    #[test]
    fn test_real_secp256k1_pubkey() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();

        let addr = wallet.derive_receiving_address(0, 0).unwrap();

        // Compressed public key starts with 0x02 or 0x03
        assert!(addr.public_key[0] == 0x02 || addr.public_key[0] == 0x03);

        // Verify the public key matches the private key via secp256k1
        let pk = PrivateKey::from_bytes(&addr.private_key).unwrap();
        assert_eq!(pk.public_key().to_bytes(), addr.public_key.to_vec());
    }

    #[test]
    fn test_all_zero_seed_returns_result() {
        // from_seed always takes exactly [u8; 64]; verify all-zeros seed doesn't panic
        let zero_seed = [0u8; 64];
        let _ = Bip44Wallet::from_seed(zero_seed, 0);
    }

    #[test]
    fn test_receiving_address_path_format() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let addr = wallet.derive_receiving_address(0, 0).unwrap();
        assert!(addr.path.contains("/0/0"), "receiving path should contain /0/0, got: {}", addr.path);
        assert!(!addr.is_change);
    }

    #[test]
    fn test_change_address_path_format() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let addr = wallet.derive_change_address(0, 0).unwrap();
        assert!(addr.path.contains("/1/0"), "change path should contain /1/0, got: {}", addr.path);
        assert!(addr.is_change);
    }

    #[test]
    fn test_receiving_differs_from_change() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let recv = wallet.derive_receiving_address(0, 0).unwrap();
        let change = wallet.derive_change_address(0, 0).unwrap();
        assert_ne!(recv.address, change.address);
        assert_ne!(recv.private_key, change.private_key);
    }

    #[test]
    fn test_large_index_derives_without_panic() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let addr = wallet.derive_receiving_address(0, 1000).unwrap();
        assert_eq!(addr.index, 1000);
    }

    #[test]
    fn test_sequential_indices_all_unique() {
        let seed = create_test_seed();
        let wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let addrs: Vec<_> = (0..5)
            .map(|i| wallet.derive_receiving_address(0, i).unwrap().address)
            .collect();
        let unique: std::collections::HashSet<_> = addrs.iter().collect();
        assert_eq!(unique.len(), 5, "all sequential addresses must be distinct");
    }

    #[test]
    fn test_mainnet_vs_testnet_address_differs() {
        let seed = create_test_seed();
        let mainnet = Bip44Wallet::from_seed(seed, 0).unwrap();
        let testnet = Bip44Wallet::from_seed(seed, 1).unwrap();
        let m_addr = mainnet.derive_receiving_address(0, 0).unwrap().address;
        let t_addr = testnet.derive_receiving_address(0, 0).unwrap().address;
        assert_ne!(m_addr, t_addr, "mainnet and testnet addresses must differ");
    }

    #[test]
    fn test_gap_limit_can_be_changed() {
        let seed = create_test_seed();
        let mut wallet = Bip44Wallet::from_seed(seed, 0).unwrap();
        wallet.set_gap_limit(50);
        assert_eq!(wallet.gap_limit, 50);
    }
}
