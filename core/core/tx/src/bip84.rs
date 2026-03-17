//! # BIP-84: Derivation scheme for P2WPKH based accounts
//!
//! BIP-84 defines the derivation scheme for HD wallets producing
//! native SegWit (P2WPKH) addresses. It uses purpose index `84'`.
//!
//! ## Hierarchy
//!
//! ```text
//! m / 84' / coin_type' / account' / change / address_index
//!
//! - purpose: 84' (hardened, BIP-84)
//! - coin_type: 0' for mainnet, 1' for testnet
//! - account: starting from 0' (hardened)
//! - change: 0 = external (receiving), 1 = internal (change)
//! - address_index: starting from 0 (unhardened)
//!
//! Examples:
//! - m/84'/0'/0'/0/0 = First mainnet receiving address (P2WPKH)
//! - m/84'/0'/0'/1/0 = First mainnet change address
//! - m/84'/1'/0'/0/0 = First testnet receiving address
//! ```

use crate::address::Address;
use crate::hd_wallet::{ExtendedPrivateKey, HdWalletError};
use crate::keys::PublicKey;

/// BIP-84 native SegWit (P2WPKH) HD wallet.
pub struct Bip84Wallet {
    master: ExtendedPrivateKey,
    coin_type: u32,
    gap_limit: u32,
}

/// Account-level information for BIP-84.
#[derive(Debug, Clone, PartialEq)]
pub struct Bip84Account {
    /// Hardened account index under `m/84'/coin_type'/account'`.
    pub account_number: u32,
    /// Extended public key for the account branch.
    pub xpub: String,
    /// Derivation path for the account node.
    pub path: String,
}

/// Derived native-SegWit address from BIP-84 path.
#[derive(Debug, Clone, PartialEq)]
pub struct Bip84Address {
    /// Account index used for derivation.
    pub account: u32,
    /// Whether this address is from the internal/change branch.
    pub is_change: bool,
    /// Address index within the chosen branch.
    pub index: u32,
    /// Full derivation path for this key.
    pub path: String,
    /// Derived child private key bytes.
    pub private_key: [u8; 32],
    /// Compressed public key bytes for the child key.
    pub public_key: [u8; 33],
    /// Encoded native SegWit address.
    pub address: String,
}

/// BIP-84 errors.
#[derive(Debug, Clone, PartialEq)]
pub enum Bip84Error {
    /// The provided seed bytes are invalid for HD wallet creation.
    InvalidSeed,
    /// The requested derivation path is malformed or unsupported.
    InvalidPath(String),
    /// A key or address derivation step failed.
    DerivationFailed,
}

impl From<HdWalletError> for Bip84Error {
    fn from(e: HdWalletError) -> Self {
        match e {
            HdWalletError::InvalidSeed(_) => Bip84Error::InvalidSeed,
            HdWalletError::InvalidPath(s) => Bip84Error::InvalidPath(s),
            _ => Bip84Error::DerivationFailed,
        }
    }
}

impl Bip84Wallet {
    /// Create wallet from a 64-byte BIP-39 seed.
    /// `coin_type` is 0 for mainnet, 1 for testnet.
    pub fn from_seed(seed: [u8; 64], coin_type: u32) -> Result<Self, Bip84Error> {
        let mainnet = coin_type != 1;
        let master = ExtendedPrivateKey::from_seed(&seed, mainnet)?;
        Ok(Self {
            master,
            coin_type,
            gap_limit: 20,
        })
    }

    /// Override the account discovery gap limit.
    pub fn set_gap_limit(&mut self, limit: u32) {
        self.gap_limit = limit;
    }

    /// Return the current account discovery gap limit.
    pub fn gap_limit(&self) -> u32 {
        self.gap_limit
    }

    /// Return account-level xpub at `m/84'/coin_type'/account'`.
    pub fn get_account(&self, account_number: u32) -> Result<Bip84Account, Bip84Error> {
        let path = format!("m/84'/{}'/{}'", self.coin_type, account_number);
        let account_key = self.master.derive_path(&path)?;
        let xpub_key = account_key.to_extended_public_key()?;
        Ok(Bip84Account {
            account_number,
            xpub: xpub_key.to_base58(),
            path,
        })
    }

    /// Derive the `index`-th receiving (external) address for `account`.
    pub fn derive_receiving_address(
        &self,
        account: u32,
        index: u32,
    ) -> Result<Bip84Address, Bip84Error> {
        self.derive_address(account, false, index)
    }

    /// Derive the `index`-th change (internal) address for `account`.
    pub fn derive_change_address(
        &self,
        account: u32,
        index: u32,
    ) -> Result<Bip84Address, Bip84Error> {
        self.derive_address(account, true, index)
    }

    /// Derive a batch of receiving addresses [0..count) for `account`.
    pub fn derive_receiving_addresses(
        &self,
        account: u32,
        count: u32,
    ) -> Result<Vec<Bip84Address>, Bip84Error> {
        (0..count).map(|i| self.derive_receiving_address(account, i)).collect()
    }

    fn derive_address(
        &self,
        account: u32,
        is_change: bool,
        index: u32,
    ) -> Result<Bip84Address, Bip84Error> {
        let change_val = if is_change { 1 } else { 0 };
        let path = format!(
            "m/84'/{}'/{}'/{}/{}",
            self.coin_type, account, change_val, index
        );

        let child_key = self.master.derive_path(&path)?;
        let private_key = child_key.private_key;
        let public_key = child_key.get_public_key()?;

        let pk = PublicKey::from_bytes(&public_key)
            .map_err(|_| Bip84Error::DerivationFailed)?;

        // P2WPKH address — version byte drives mainnet/testnet HRP
        let version = if self.coin_type == 1 { 0x6F } else { 0x2D };
        let addr = Address::from_pubkey_p2wpkh_with_version(&pk, version);

        Ok(Bip84Address {
            account,
            is_change,
            index,
            path,
            private_key,
            public_key,
            address: addr.encode(),
        })
    }

    /// Discover used accounts up to `gap_limit` (offline stub: returns account 0).
    pub fn discover_accounts(&self) -> Vec<u32> {
        vec![0]
    }

    /// Get the `index`-th key pair at `m/84'/coin_type'/account'/change/index`.
    pub fn get_key_pair(
        &self,
        account: u32,
        is_change: bool,
        index: u32,
    ) -> Result<([u8; 32], [u8; 33]), Bip84Error> {
        let addr = self.derive_address(account, is_change, index)?;
        Ok((addr.private_key, addr.public_key))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bip39::Mnemonic;

    fn test_seed() -> [u8; 64] {
        let m = Mnemonic::from_entropy(&[0xAA; 16]).unwrap();
        m.to_seed("")
    }

    #[test]
    fn test_bip84_derive_receiving_address() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addr = wallet.derive_receiving_address(0, 0).unwrap();
        assert_eq!(addr.path, "m/84'/0'/0'/0/0");
        assert!(!addr.address.is_empty());
        // BIP-84 P2WPKH addresses should start with kb1q (mainnet bech32)
        assert!(addr.address.starts_with("kb1q"), "got: {}", addr.address);
    }

    #[test]
    fn test_bip84_derive_change_address() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addr = wallet.derive_change_address(0, 0).unwrap();
        assert_eq!(addr.path, "m/84'/0'/0'/1/0");
        assert!(addr.address.starts_with("kb1q"), "got: {}", addr.address);
    }

    #[test]
    fn test_bip84_testnet_address() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 1).unwrap();
        let addr = wallet.derive_receiving_address(0, 0).unwrap();
        assert_eq!(addr.path, "m/84'/1'/0'/0/0");
        // testnet P2WPKH should use testnet HRP
        assert!(addr.address.starts_with("tb1q"), "got: {}", addr.address);
    }

    #[test]
    fn test_bip84_deterministic() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let a1 = wallet.derive_receiving_address(0, 0).unwrap();
        let a2 = wallet.derive_receiving_address(0, 0).unwrap();
        assert_eq!(a1, a2);
    }

    #[test]
    fn test_bip84_different_indices_different_addresses() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let a0 = wallet.derive_receiving_address(0, 0).unwrap();
        let a1 = wallet.derive_receiving_address(0, 1).unwrap();
        assert_ne!(a0.address, a1.address);
        assert_ne!(a0.private_key, a1.private_key);
    }

    #[test]
    fn test_bip84_account_xpub() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let acct = wallet.get_account(0).unwrap();
        assert_eq!(acct.path, "m/84'/0'/0'");
        assert!(!acct.xpub.is_empty());
    }

    #[test]
    fn test_bip84_batch_derive() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addrs = wallet.derive_receiving_addresses(0, 5).unwrap();
        assert_eq!(addrs.len(), 5);
        let unique: std::collections::HashSet<_> = addrs.iter().map(|a| &a.address).collect();
        assert_eq!(unique.len(), 5);
    }

    #[test]
    fn test_bip84_key_pair() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let (privkey, pubkey) = wallet.get_key_pair(0, false, 0).unwrap();
        let addr = wallet.derive_receiving_address(0, 0).unwrap();
        assert_eq!(privkey, addr.private_key);
        assert_eq!(pubkey, addr.public_key);
    }

    #[test]
    fn test_gap_limit_default_is_20() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        assert_eq!(wallet.gap_limit(), 20);
    }

    #[test]
    fn test_set_gap_limit_updates_value() {
        let mut wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        wallet.set_gap_limit(30);
        assert_eq!(wallet.gap_limit(), 30);
    }

    #[test]
    fn test_change_address_is_change_flag_true() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addr = wallet.derive_change_address(0, 0).unwrap();
        assert!(addr.is_change);
        assert!(addr.path.contains("/1/0"));
    }

    #[test]
    fn test_receiving_address_is_change_flag_false() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addr = wallet.derive_receiving_address(0, 0).unwrap();
        assert!(!addr.is_change);
        assert!(addr.path.contains("/0/0"));
    }

    #[test]
    fn test_receiving_and_change_same_index_differ() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let recv = wallet.derive_receiving_address(0, 0).unwrap();
        let change = wallet.derive_change_address(0, 0).unwrap();
        assert_ne!(recv.address, change.address);
        assert_ne!(recv.private_key, change.private_key);
    }

    #[test]
    fn test_batch_10_addresses_all_unique() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let addrs = wallet.derive_receiving_addresses(0, 10).unwrap();
        assert_eq!(addrs.len(), 10);
        let unique: std::collections::HashSet<_> = addrs.iter().map(|a| &a.address).collect();
        assert_eq!(unique.len(), 10);
    }

    #[test]
    fn test_account_path_includes_coin_type() {
        let wallet = Bip84Wallet::from_seed(test_seed(), 0).unwrap();
        let acct = wallet.get_account(0).unwrap();
        assert!(acct.path.starts_with("m/84'/0'/"), "path: {}", acct.path);
    }
}
