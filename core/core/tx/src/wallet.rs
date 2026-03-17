//! Wallet file operations — save/load wallet JSON with optional encryption.
//!
//! Provides a `WalletFile` that serializes/deserializes wallet data (keys,
//! addresses, metadata) to disk, optionally encrypted via Argon2id + AES-256-GCM
//! using the [`wallet_crypto`] module.

use crate::wallet_crypto::{decrypt_wallet, encrypt_wallet, is_encrypted_wallet, WalletCryptoError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// A simple on-disk wallet containing keys and metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WalletFile {
    /// Format version
    pub version: u32,
    /// Display label for this wallet
    pub label: String,
    /// Network: "mainnet", "testnet", "regtest"
    pub network: String,
    /// Private keys (hex-encoded)
    #[serde(default)]
    pub private_keys: Vec<String>,
    /// Addresses derived from the keys
    #[serde(default)]
    pub addresses: Vec<String>,
    /// User-assigned address labels
    #[serde(default)]
    pub address_labels: HashMap<String, String>,
    /// Block height at which this wallet was created (birthday)
    #[serde(default)]
    pub birthday_height: u64,
    /// Whether this is a watch-only wallet (no private keys)
    #[serde(default)]
    pub watch_only: bool,
    /// HD derivation mnemonic (encrypted wallets should protect this)
    #[serde(default)]
    pub mnemonic: Option<String>,
    /// Extended public key (xpub) for watch-only imports
    #[serde(default)]
    pub xpub: Option<String>,
    /// Output descriptors associated with this wallet (BIP-380 family)
    #[serde(default)]
    pub descriptors: Vec<String>,
}

impl Default for WalletFile {
    fn default() -> Self {
        Self {
            version: 1,
            label: "default".to_string(),
            network: "mainnet".to_string(),
            private_keys: Vec::new(),
            addresses: Vec::new(),
            address_labels: HashMap::new(),
            birthday_height: 0,
            watch_only: false,
            mnemonic: None,
            xpub: None,
            descriptors: Vec::new(),
        }
    }
}

/// Errors from wallet file I/O.
#[derive(Debug)]
pub enum WalletFileError {
    /// Underlying filesystem operation failed.
    Io(std::io::Error),
    /// Wallet JSON serialization or parsing failed.
    Json(serde_json::Error),
    /// Wallet encryption or decryption failed.
    Crypto(WalletCryptoError),
}

impl std::fmt::Display for WalletFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "wallet I/O error: {}", e),
            Self::Json(e) => write!(f, "wallet JSON error: {}", e),
            Self::Crypto(e) => write!(f, "wallet crypto error: {}", e),
        }
    }
}

impl std::error::Error for WalletFileError {}

impl From<std::io::Error> for WalletFileError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<serde_json::Error> for WalletFileError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

impl From<WalletCryptoError> for WalletFileError {
    fn from(e: WalletCryptoError) -> Self {
        Self::Crypto(e)
    }
}

impl WalletFile {
    /// Save the wallet to a file. If `password` is provided, the wallet is
    /// encrypted with Argon2id + AES-256-GCM.
    ///
    /// Uses atomic write (write to temp file + rename) to prevent corruption
    /// if the process is interrupted mid-write.
    pub fn save(&self, path: &Path, password: Option<&str>) -> Result<(), WalletFileError> {
        let json = serde_json::to_string_pretty(self)?;

        let data = match password {
            Some(pw) => encrypt_wallet(json.as_bytes(), pw)?,
            None => {
                #[cfg(debug_assertions)]
                eprintln!("[WARN] Saving wallet without encryption — private keys stored in plaintext");
                json.into_bytes()
            }
        };

        // Atomic write: write to a temporary file in the same directory, then rename.
        // This ensures the wallet file is never left in a half-written state.
        let dir = path.parent().unwrap_or(Path::new("."));
        let tmp_name = format!(
            ".{}.tmp",
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
        );
        let tmp_path = dir.join(tmp_name);
        std::fs::write(&tmp_path, &data)?;
        std::fs::rename(&tmp_path, path).map_err(|e| {
            // Clean up temp file on rename failure
            let _ = std::fs::remove_file(&tmp_path);
            e
        })?;
        Ok(())
    }

    /// Load a wallet from a file. If the file is encrypted, `password` must be
    /// provided to decrypt it.
    pub fn load(path: &Path, password: Option<&str>) -> Result<Self, WalletFileError> {
        let data = std::fs::read(path)?;

        let json_bytes = if is_encrypted_wallet(&data) {
            let pw = password.ok_or(WalletCryptoError::DecryptionFailed)?;
            decrypt_wallet(&data, pw)?
        } else {
            data
        };

        let wallet: WalletFile = serde_json::from_slice(&json_bytes)?;
        Ok(wallet)
    }

    /// Re-encrypt an existing wallet file with a new password.
    pub fn change_password(
        path: &Path,
        old_password: &str,
        new_password: &str,
    ) -> Result<(), WalletFileError> {
        let wallet = Self::load(path, Some(old_password))?;
        wallet.save(path, Some(new_password))?;
        Ok(())
    }

    /// Check if a file on disk is an encrypted wallet.
    pub fn is_encrypted(path: &Path) -> Result<bool, WalletFileError> {
        let data = std::fs::read(path)?;
        Ok(is_encrypted_wallet(&data))
    }

    /// Add a label for an address.
    pub fn set_label(&mut self, address: &str, label: &str) {
        self.address_labels.insert(address.to_string(), label.to_string());
    }

    /// Get the label for an address.
    pub fn get_label(&self, address: &str) -> Option<&str> {
        self.address_labels.get(address).map(|s| s.as_str())
    }
}

/// Manages multiple wallets in a directory.
pub struct WalletManager {
    /// Directory containing wallet files
    dir: std::path::PathBuf,
}

/// Canonical storage metadata for a managed wallet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletStorageInfo {
    /// Canonical on-disk path for this wallet.
    pub path: std::path::PathBuf,
    /// Whether the canonical wallet file is encrypted.
    pub encrypted: bool,
}

impl WalletManager {
    /// Create a new wallet manager for the given directory.
    /// Creates the directory if it doesn't exist.
    pub fn new(dir: impl Into<std::path::PathBuf>) -> Result<Self, WalletFileError> {
        let dir = dir.into();
        std::fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    /// List all wallet files in the directory (`.json` and `.dat`).
    pub fn list_wallets(&self) -> Result<Vec<String>, WalletFileError> {
        let mut names = Vec::new();
        for entry in std::fs::read_dir(&self.dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") || name.ends_with(".dat") {
                names.push(name);
            }
        }
        names.sort();
        Ok(names)
    }

    /// Create a new wallet with the given name.
    pub fn create_wallet(
        &self,
        name: &str,
        wallet: &WalletFile,
        password: Option<&str>,
    ) -> Result<(), WalletFileError> {
        self.save_wallet(name, wallet, password, password.is_some())
    }

    /// Return the canonical on-disk path and encryption status for a wallet.
    pub fn wallet_storage_info(&self, name: &str) -> Result<WalletStorageInfo, WalletFileError> {
        let dat_path = self.dir.join(format!("{}.dat", name));
        let json_path = self.dir.join(format!("{}.json", name));

        if dat_path.exists() {
            Ok(WalletStorageInfo {
                path: dat_path,
                encrypted: true,
            })
        } else if json_path.exists() {
            Ok(WalletStorageInfo {
                path: json_path,
                encrypted: false,
            })
        } else {
            Err(WalletFileError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("wallet '{}' not found", name),
            )))
        }
    }

    /// Overwrite a wallet while preserving the chosen storage format.
    ///
    /// On success, the alternate extension is removed so encrypted and
    /// plaintext sidecar files cannot diverge.
    pub fn save_wallet(
        &self,
        name: &str,
        wallet: &WalletFile,
        password: Option<&str>,
        encrypted: bool,
    ) -> Result<(), WalletFileError> {
        if encrypted && password.is_none() {
            return Err(WalletFileError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "password required for encrypted wallet save",
            )));
        }

        let target_path = if encrypted {
            self.dir.join(format!("{}.dat", name))
        } else {
            self.dir.join(format!("{}.json", name))
        };
        let alternate_path = if encrypted {
            self.dir.join(format!("{}.json", name))
        } else {
            self.dir.join(format!("{}.dat", name))
        };

        wallet.save(&target_path, if encrypted { password } else { None })?;
        if alternate_path.exists() {
            std::fs::remove_file(alternate_path)?;
        }
        Ok(())
    }

    /// Load a wallet by name (tries `.dat` then `.json`).
    pub fn load_wallet(
        &self,
        name: &str,
        password: Option<&str>,
    ) -> Result<WalletFile, WalletFileError> {
        let info = self.wallet_storage_info(name)?;
        WalletFile::load(&info.path, password)
    }

    /// Delete a wallet by name.
    pub fn delete_wallet(&self, name: &str) -> Result<(), WalletFileError> {
        let dat_path = self.dir.join(format!("{}.dat", name));
        let json_path = self.dir.join(format!("{}.json", name));

        if dat_path.exists() {
            std::fs::remove_file(&dat_path)?;
        }
        if json_path.exists() {
            std::fs::remove_file(&json_path)?;
        }
        Ok(())
    }

    /// Check if a wallet exists.
    pub fn wallet_exists(&self, name: &str) -> bool {
        self.dir.join(format!("{}.dat", name)).exists()
            || self.dir.join(format!("{}.json", name)).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_save_load_plaintext() {
        let dir = std::env::temp_dir();
        let path = dir.join("kubercoin_test_wallet_plain.json");

        let wallet = WalletFile {
            label: "test".to_string(),
            addresses: vec!["kb1qtest123".to_string()],
            ..Default::default()
        };

        wallet.save(&path, None).unwrap();
        let loaded = WalletFile::load(&path, None).unwrap();
        assert_eq!(wallet, loaded);

        assert!(!WalletFile::is_encrypted(&path).unwrap());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_wallet_save_load_encrypted() {
        let dir = std::env::temp_dir();
        let path = dir.join("kubercoin_test_wallet_enc.dat");

        let wallet = WalletFile {
            label: "encrypted_wallet".to_string(),
            private_keys: vec!["deadbeef".repeat(8)],
            ..Default::default()
        };

        let password = "super_strong_password";
        wallet.save(&path, Some(password)).unwrap();

        // Must be encrypted on disk
        assert!(WalletFile::is_encrypted(&path).unwrap());

        // Load with correct password
        let loaded = WalletFile::load(&path, Some(password)).unwrap();
        assert_eq!(wallet, loaded);

        // Load without password should fail
        let err = WalletFile::load(&path, None);
        assert!(err.is_err());

        // Load with wrong password should fail
        let err = WalletFile::load(&path, Some("wrong____password"));
        assert!(err.is_err());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_wallet_change_password() {
        let dir = std::env::temp_dir();
        let path = dir.join("kubercoin_test_wallet_chpw.dat");

        let wallet = WalletFile {
            label: "pw_test".to_string(),
            private_keys: vec!["aabb".to_string()],
            ..Default::default()
        };

        let old_pw = "old_password_1234";
        let new_pw = "new_password_5678";

        wallet.save(&path, Some(old_pw)).unwrap();
        WalletFile::change_password(&path, old_pw, new_pw).unwrap();

        // Old password should fail
        assert!(WalletFile::load(&path, Some(old_pw)).is_err());
        // New password should work
        let loaded = WalletFile::load(&path, Some(new_pw)).unwrap();
        assert_eq!(loaded.label, "pw_test");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_wallet_address_labels() {
        let mut wallet = WalletFile::default();
        wallet.set_label("kb1qaddr1", "Savings");
        wallet.set_label("kb1qaddr2", "Trading");

        assert_eq!(wallet.get_label("kb1qaddr1"), Some("Savings"));
        assert_eq!(wallet.get_label("kb1qaddr2"), Some("Trading"));
        assert_eq!(wallet.get_label("kb1qunknown"), None);
    }

    #[test]
    fn test_wallet_default() {
        let w = WalletFile::default();
        assert_eq!(w.version, 1);
        assert!(!w.watch_only);
        assert_eq!(w.birthday_height, 0);
        assert!(w.private_keys.is_empty());
    }

    #[test]
    fn test_watch_only_wallet() {
        let w = WalletFile {
            watch_only: true,
            xpub: Some("xpub_test_key".to_string()),
            ..Default::default()
        };
        assert!(w.watch_only);
        assert!(w.private_keys.is_empty());
        assert!(w.xpub.is_some());
    }

    #[test]
    fn test_wallet_manager_create_list_load() {
        let dir = std::env::temp_dir().join("kubercoin_test_wm");
        let _ = std::fs::remove_dir_all(&dir);

        let mgr = WalletManager::new(&dir).unwrap();

        let w1 = WalletFile { label: "wallet1".into(), ..Default::default() };
        let w2 = WalletFile { label: "wallet2".into(), ..Default::default() };

        mgr.create_wallet("alice", &w1, None).unwrap();
        mgr.create_wallet("bob", &w2, None).unwrap();

        let names = mgr.list_wallets().unwrap();
        assert!(names.contains(&"alice.json".to_string()));
        assert!(names.contains(&"bob.json".to_string()));

        assert!(mgr.wallet_exists("alice"));
        assert!(!mgr.wallet_exists("charlie"));

        let loaded = mgr.load_wallet("alice", None).unwrap();
        assert_eq!(loaded.label, "wallet1");

        mgr.delete_wallet("alice").unwrap();
        assert!(!mgr.wallet_exists("alice"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_encrypted() {
        let dir = std::env::temp_dir().join("kubercoin_test_wm_enc");
        let _ = std::fs::remove_dir_all(&dir);

        let mgr = WalletManager::new(&dir).unwrap();
        let w = WalletFile { label: "secret".into(), ..Default::default() };

        mgr.create_wallet("vault", &w, Some("strong_pw_12345")).unwrap();

        let names = mgr.list_wallets().unwrap();
        assert!(names.contains(&"vault.dat".to_string()));

        let loaded = mgr.load_wallet("vault", Some("strong_pw_12345")).unwrap();
        assert_eq!(loaded.label, "secret");

        assert!(mgr.load_wallet("vault", Some("wrong__password")).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_not_found() {
        let dir = std::env::temp_dir().join("kubercoin_test_wm_nf");
        let _ = std::fs::remove_dir_all(&dir);

        let mgr = WalletManager::new(&dir).unwrap();
        let result = mgr.load_wallet("nonexistent", None);
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── Wallet hardening tests ────────────────────────────────────────────────

    fn temp_dir(suffix: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("kc_wallet_test_{}_{}",
            suffix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn test_wallet_file_all_fields_survive_plaintext_roundtrip() {
        let dir = temp_dir("all_fields");
        let path = dir.join("wallet.json");
        let mut w = WalletFile::default();
        w.label = "hardened".to_string();
        w.network = "testnet".to_string();
        w.private_keys = vec!["aabbccdd".to_string(), "11223344".to_string()];
        w.addresses = vec!["addr1".to_string(), "addr2".to_string()];
        w.address_labels.insert("addr1".to_string(), "mining".to_string());
        w.birthday_height = 840_000;
        w.watch_only = false;
        w.mnemonic = Some("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string());
        w.xpub = Some("xpub6...truncated".to_string());
        w.descriptors = vec!["wpkh(xpub...)".to_string()];
        w.save(&path, None).unwrap();
        let loaded = WalletFile::load(&path, None).unwrap();
        assert_eq!(loaded, w);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_wrong_password_rejected() {
        let dir = temp_dir("wrong_pw");
        let path = dir.join("wallet.dat");
        let w = WalletFile::default();
        w.save(&path, Some("correct_password_hardening!")).unwrap();
        assert!(
            WalletFile::load(&path, Some("wrong_password_hardening!")).is_err(),
            "Loading with wrong password must fail"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_no_password_on_encrypted_file_rejected() {
        let dir = temp_dir("no_pw");
        let path = dir.join("wallet.dat");
        let w = WalletFile::default();
        w.save(&path, Some("strong_encryption_pass_1!")).unwrap();
        assert!(
            WalletFile::load(&path, None).is_err(),
            "Loading an encrypted wallet without password must fail"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_is_encrypted_flag_correct() {
        let dir = temp_dir("enc_flag");
        let plain_path = dir.join("plain.json");
        let enc_path = dir.join("enc.dat");
        let w = WalletFile::default();
        w.save(&plain_path, None).unwrap();
        w.save(&enc_path, Some("strong_wallet_passphrase!")).unwrap();
        assert!(!WalletFile::is_encrypted(&plain_path).unwrap());
        assert!(WalletFile::is_encrypted(&enc_path).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_save_corrupted_file_rejected() {
        let dir = temp_dir("corrupt");
        let path = dir.join("bad.json");
        std::fs::write(&path, b"{not valid json!!!").unwrap();
        assert!(WalletFile::load(&path, None).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_delete_removes_files() {
        let dir = temp_dir("mgr_delete");
        let mgr = WalletManager::new(&dir).unwrap();
        let w = WalletFile::default();
        mgr.create_wallet("mywallet", &w, None).unwrap();
        assert!(mgr.wallet_exists("mywallet"));
        mgr.delete_wallet("mywallet").unwrap();
        assert!(!mgr.wallet_exists("mywallet"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_load_nonexistent_errors() {
        let dir = temp_dir("mgr_missing");
        let mgr = WalletManager::new(&dir).unwrap();
        assert!(mgr.load_wallet("ghost", None).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_many_wallets_list_sorted() {
        let dir = temp_dir("mgr_list");
        let mgr = WalletManager::new(&dir).unwrap();
        let w = WalletFile::default();
        for name in &["delta", "alpha", "gamma", "beta"] {
            mgr.create_wallet(name, &w, None).unwrap();
        }
        let list = mgr.list_wallets().unwrap();
        // Must be sorted alphabetically
        let mut sorted = list.clone();
        sorted.sort();
        assert_eq!(list, sorted);
        assert_eq!(list.len(), 4);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_set_get_label_roundtrip() {
        let mut w = WalletFile::default();
        w.set_label("1AbcDef", "cold storage");
        assert_eq!(w.get_label("1AbcDef"), Some("cold storage"));
        assert_eq!(w.get_label("nonexistent"), None);
    }

    #[test]
    fn test_wallet_overwrite_address_label() {
        let mut w = WalletFile::default();
        w.set_label("addr", "first");
        w.set_label("addr", "second");
        assert_eq!(w.get_label("addr"), Some("second"));
    }

    #[test]
    fn test_wallet_password_change_and_reload() {
        let dir = temp_dir("chpw");
        let path = dir.join("wallet.dat");
        let mut w = WalletFile::default();
        w.label = "pw_change_test".to_string();
        w.save(&path, Some("old_strong_password_1!")).unwrap();
        WalletFile::change_password(&path, "old_strong_password_1!", "new_strong_password_2!").unwrap();
        // Old password must no longer work
        assert!(WalletFile::load(&path, Some("old_strong_password_1!")).is_err());
        // New password must work and preserve data
        let reloaded = WalletFile::load(&path, Some("new_strong_password_2!")).unwrap();
        assert_eq!(reloaded.label, "pw_change_test");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_save_wallet_keeps_encrypted_format() {
        let dir = temp_dir("save_wallet_encrypted");
        let mgr = WalletManager::new(&dir).unwrap();
        let mut wallet = WalletFile {
            label: "vault".to_string(),
            private_keys: vec!["11".repeat(32)],
            addresses: vec!["addr1".to_string()],
            ..Default::default()
        };

        mgr.create_wallet("vault", &wallet, Some("strong_pw_12345")).unwrap();
        wallet.addresses.push("addr2".to_string());
        mgr.save_wallet("vault", &wallet, Some("strong_pw_12345"), true).unwrap();

        assert!(dir.join("vault.dat").exists());
        assert!(!dir.join("vault.json").exists());
        assert!(WalletFile::is_encrypted(&dir.join("vault.dat")).unwrap());
        let reloaded = mgr.load_wallet("vault", Some("strong_pw_12345")).unwrap();
        assert!(reloaded.addresses.contains(&"addr2".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_wallet_manager_save_wallet_removes_alternate_extension() {
        let dir = temp_dir("save_wallet_sidecar");
        let mgr = WalletManager::new(&dir).unwrap();
        let wallet = WalletFile {
            label: "sidecar".to_string(),
            private_keys: vec!["22".repeat(32)],
            ..Default::default()
        };

        mgr.create_wallet("sidecar", &wallet, None).unwrap();
        assert!(dir.join("sidecar.json").exists());
        mgr.save_wallet("sidecar", &wallet, Some("strong_pw_12345"), true).unwrap();

        assert!(dir.join("sidecar.dat").exists());
        assert!(!dir.join("sidecar.json").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
