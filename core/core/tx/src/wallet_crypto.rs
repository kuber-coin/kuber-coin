//! Wallet encryption using Argon2id KDF + AES-256-GCM.
//!
//! Encrypted wallet file format (binary):
//! ```text
//!   "KCWL"              (4 bytes — magic)
//!   version: u8         (currently 0x01)
//!   salt: [u8; 32]      (Argon2 salt)
//!   nonce: [u8; 12]     (AES-GCM nonce)
//!   ciphertext: [u8; …] (AES-256-GCM encrypted payload + 16-byte auth tag)
//! ```

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use zeroize::Zeroize;

/// Magic bytes identifying an encrypted wallet file.
const WALLET_MAGIC: &[u8; 4] = b"KCWL";

/// Current format version.
const WALLET_VERSION: u8 = 0x01;

/// Header size: magic (4) + version (1) + salt (32) + nonce (12) = 49 bytes.
const HEADER_SIZE: usize = 4 + 1 + 32 + 12;

/// Errors from wallet encryption / decryption.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalletCryptoError {
    /// Password is empty or too short.
    WeakPassword,
    /// The ciphertext failed authentication (wrong password or tampered data).
    DecryptionFailed,
    /// The file does not start with the expected magic or has wrong version.
    InvalidFormat,
    /// The file is too short to contain a valid encrypted wallet.
    TruncatedData,
}

impl std::fmt::Display for WalletCryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WeakPassword => write!(f, "password must be at least 8 bytes"),
            Self::DecryptionFailed => write!(f, "decryption failed (wrong password or corrupted data)"),
            Self::InvalidFormat => write!(f, "not a valid encrypted wallet file"),
            Self::TruncatedData => write!(f, "encrypted wallet file is truncated"),
        }
    }
}

impl std::error::Error for WalletCryptoError {}

/// Derive a 32-byte AES-256 key from a password and salt using Argon2id.
fn derive_key(password: &[u8], salt: &[u8; 32]) -> [u8; 32] {
    let mut key = [0u8; 32];
    // Argon2id with default (safe) parameters
    Argon2::default()
        .hash_password_into(password, salt, &mut key)
        .expect("Argon2 key derivation failed");
    key
}

/// Encrypt plaintext wallet data with a password.
///
/// Returns the encrypted blob (magic + version + salt + nonce + ciphertext).
pub fn encrypt_wallet(plaintext: &[u8], password: &str) -> Result<Vec<u8>, WalletCryptoError> {
    if password.len() < 8 {
        return Err(WalletCryptoError::WeakPassword);
    }

    // Generate random salt and nonce
    let mut salt = [0u8; 32];
    let mut nonce_bytes = [0u8; 12];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut salt);
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut nonce_bytes);

    // Derive key
    let mut key = derive_key(password.as_bytes(), &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .expect("AES-256-GCM key init failed");
    key.zeroize();

    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| WalletCryptoError::DecryptionFailed)?;

    // Build output: magic + version + salt + nonce + ciphertext
    let mut out = Vec::with_capacity(HEADER_SIZE + ciphertext.len());
    out.extend_from_slice(WALLET_MAGIC);
    out.push(WALLET_VERSION);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);

    Ok(out)
}

/// Decrypt an encrypted wallet blob with a password.
///
/// Returns the plaintext wallet data.
pub fn decrypt_wallet(blob: &[u8], password: &str) -> Result<Vec<u8>, WalletCryptoError> {
    if blob.len() < HEADER_SIZE + 16 {
        // Minimum: header + 16-byte GCM auth tag (even for empty plaintext)
        return Err(WalletCryptoError::TruncatedData);
    }

    // Verify magic
    if &blob[0..4] != WALLET_MAGIC {
        return Err(WalletCryptoError::InvalidFormat);
    }

    // Check version
    if blob[4] != WALLET_VERSION {
        return Err(WalletCryptoError::InvalidFormat);
    }

    // Extract fields
    let salt: [u8; 32] = blob[5..37].try_into().unwrap();
    let nonce_bytes: [u8; 12] = blob[37..49].try_into().unwrap();
    let ciphertext = &blob[49..];

    // Derive key
    let mut key = derive_key(password.as_bytes(), &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .expect("AES-256-GCM key init failed");
    key.zeroize();

    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| WalletCryptoError::DecryptionFailed)?;

    Ok(plaintext)
}

/// Check whether a byte slice looks like an encrypted wallet (starts with magic).
pub fn is_encrypted_wallet(data: &[u8]) -> bool {
    data.len() >= HEADER_SIZE && &data[0..4] == WALLET_MAGIC
}

/// Re-encrypt a wallet with a new password, given the old password.
pub fn change_password(
    blob: &[u8],
    old_password: &str,
    new_password: &str,
) -> Result<Vec<u8>, WalletCryptoError> {
    let plaintext = decrypt_wallet(blob, old_password)?;
    encrypt_wallet(&plaintext, new_password)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let data = b"secret wallet key material";
        let password = "strong_password_123";

        let encrypted = encrypt_wallet(data, password).unwrap();
        let decrypted = decrypt_wallet(&encrypted, password).unwrap();

        assert_eq!(&decrypted, data);
    }

    #[test]
    fn test_wrong_password_fails() {
        let data = b"wallet data";
        let encrypted = encrypt_wallet(data, "correct_password").unwrap();

        let result = decrypt_wallet(&encrypted, "wrong____password");
        assert_eq!(result, Err(WalletCryptoError::DecryptionFailed));
    }

    #[test]
    fn test_weak_password_rejected() {
        let result = encrypt_wallet(b"data", "short");
        assert_eq!(result, Err(WalletCryptoError::WeakPassword));
    }

    #[test]
    fn test_invalid_magic_rejected() {
        let mut blob = vec![0u8; 100];
        blob[0..4].copy_from_slice(b"XXXX");
        assert_eq!(decrypt_wallet(&blob, "password"), Err(WalletCryptoError::InvalidFormat));
    }

    #[test]
    fn test_truncated_data_rejected() {
        let data = b"wallet";
        let encrypted = encrypt_wallet(data, "good_password_here").unwrap();
        // Truncate to just the header
        let truncated = &encrypted[..HEADER_SIZE];
        assert_eq!(decrypt_wallet(truncated, "good_password_here"), Err(WalletCryptoError::TruncatedData));
    }

    #[test]
    fn test_is_encrypted_wallet() {
        let data = b"some wallet data here";
        let encrypted = encrypt_wallet(data, "password12345678").unwrap();
        assert!(is_encrypted_wallet(&encrypted));
        assert!(!is_encrypted_wallet(b"not encrypted"));
        assert!(!is_encrypted_wallet(b""));
    }

    #[test]
    fn test_change_password() {
        let data = b"precious keys";
        let old_pass = "old_password_123";
        let new_pass = "new_password_456";

        let encrypted = encrypt_wallet(data, old_pass).unwrap();
        let re_encrypted = change_password(&encrypted, old_pass, new_pass).unwrap();

        // Old password should no longer work
        assert!(decrypt_wallet(&re_encrypted, old_pass).is_err());

        // New password should work
        let decrypted = decrypt_wallet(&re_encrypted, new_pass).unwrap();
        assert_eq!(&decrypted, data);
    }

    #[test]
    fn test_different_encryptions_differ() {
        let data = b"same data";
        let password = "same_password_here";

        let enc1 = encrypt_wallet(data, password).unwrap();
        let enc2 = encrypt_wallet(data, password).unwrap();

        // Different random salt/nonce means different ciphertext
        assert_ne!(enc1, enc2);

        // Both decrypt to the same plaintext
        assert_eq!(decrypt_wallet(&enc1, password).unwrap(), data);
        assert_eq!(decrypt_wallet(&enc2, password).unwrap(), data);
    }

    #[test]
    fn test_tampered_ciphertext_rejected() {
        let data = b"wallet data";
        let password = "secure_password1";
        let mut encrypted = encrypt_wallet(data, password).unwrap();

        // Flip a bit in the ciphertext
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0x01;

        assert_eq!(decrypt_wallet(&encrypted, password), Err(WalletCryptoError::DecryptionFailed));
    }

    #[test]
    fn test_empty_plaintext() {
        let data = b"";
        let password = "password_for_empty_data";

        let encrypted = encrypt_wallet(data, password).unwrap();
        let decrypted = decrypt_wallet(&encrypted, password).unwrap();

        assert_eq!(&decrypted, data);
    }

    // ── Principle 1: H(x) = y — Encryption uses hash-derived key (salt uniqueness) ──

    #[test]
    fn test_two_encryptions_have_different_salt() {
        let data = b"wallet seed";
        let pass = "p4ssw0rd_salt_test";
        let enc1 = encrypt_wallet(data, pass).unwrap();
        let enc2 = encrypt_wallet(data, pass).unwrap();
        // bytes 4..20 contain the salt (after 4-byte magic)
        assert_ne!(&enc1[4..20], &enc2[4..20], "each encryption must use a fresh salt");
    }

    // ── Principle 12: Entropy — ciphertext looks random ──

    #[test]
    fn test_ciphertext_has_high_byte_diversity() {
        let data = b"some deterministic data for entropy check";
        let pass = "entropy_password1";
        let enc = encrypt_wallet(data, pass).unwrap();
        let unique_bytes: std::collections::HashSet<u8> = enc.iter().copied().collect();
        assert!(
            unique_bytes.len() > 30,
            "ciphertext should use many distinct byte values (got {})",
            unique_bytes.len()
        );
    }

    // ── Principle 7: Modular Arithmetic — password-derived key differs per password ──

    #[test]
    fn test_different_passwords_produce_different_ciphertext() {
        let data = b"same plaintext";
        let enc1 = encrypt_wallet(data, "password_one_xx").unwrap();
        let enc2 = encrypt_wallet(data, "password_two_xx").unwrap();
        // Skip magic (4 bytes) — rest must differ
        assert_ne!(&enc1[4..], &enc2[4..]);
    }

    // ── Principle 8: Discrete Log — can't derive password from ciphertext ──

    #[test]
    fn test_ciphertext_does_not_contain_password() {
        let data = b"wallet";
        let pass = "my_secret_passXY";
        let enc = encrypt_wallet(data, pass).unwrap();
        assert!(
            !enc.windows(pass.len()).any(|w| w == pass.as_bytes()),
            "ciphertext must not contain the password in plaintext"
        );
    }

    #[test]
    fn test_ciphertext_does_not_contain_plaintext() {
        let data = b"extremely sensitive wallet data that must not leak";
        let pass = "secure_password!";
        let enc = encrypt_wallet(data, pass).unwrap();
        assert!(
            !enc.windows(data.len()).any(|w| w == &data[..]),
            "ciphertext must not contain the plaintext verbatim"
        );
    }

    #[test]
    fn test_large_plaintext_roundtrip() {
        let data: Vec<u8> = (0..4096).map(|i| (i % 256) as u8).collect();
        let pass = "large_data_password";
        let enc = encrypt_wallet(&data, pass).unwrap();
        let dec = decrypt_wallet(&enc, pass).unwrap();
        assert_eq!(dec, data);
    }
}
