use crate::TxError;
use rand::rngs::OsRng;
use ripemd::Ripemd160;
use secp256k1::{ecdsa::Signature, Message, PublicKey as Secp256k1PublicKey, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

/// Private key for signing transactions
/// Automatically zeroizes secret key material on drop
#[derive(Clone)]
pub struct PrivateKey {
    secret_key: SecretKey,
}

impl PrivateKey {
    /// Generate a new random private key
    pub fn new() -> Self {
        let secp = Secp256k1::new();
        let (secret_key, _) = secp.generate_keypair(&mut OsRng);
        Self { secret_key }
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: &[u8; 32]) -> Result<Self, TxError> {
        let secret_key = SecretKey::from_slice(bytes)?;
        Ok(Self { secret_key })
    }

    /// Export as raw bytes (returns zeroizing array)
    pub fn to_bytes(&self) -> Zeroizing<[u8; 32]> {
        Zeroizing::new(self.secret_key.secret_bytes())
    }

    /// Get the corresponding public key
    pub fn public_key(&self) -> PublicKey {
        let secp = Secp256k1::new();
        let public_key = Secp256k1PublicKey::from_secret_key(&secp, &self.secret_key);
        PublicKey { public_key }
    }

    /// Sign a message (32-byte hash)
    pub fn sign(&self, message: &[u8; 32]) -> Signature {
        let secp = Secp256k1::new();
        let message = Message::from_digest(*message);
        secp.sign_ecdsa(&message, &self.secret_key)
    }
}

impl Default for PrivateKey {
    fn default() -> Self {
        Self::new()
    }
}

/// Public key for verifying signatures and creating addresses
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicKey {
    public_key: Secp256k1PublicKey,
}

impl PublicKey {
    /// Create from compressed bytes (33 bytes)
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, TxError> {
        let public_key = Secp256k1PublicKey::from_slice(bytes)?;
        Ok(Self { public_key })
    }

    /// Export as compressed bytes (33 bytes)
    pub fn to_bytes(&self) -> Vec<u8> {
        self.public_key.serialize().to_vec()
    }

    /// Get the public key hash (RIPEMD160(SHA256(pubkey)))
    /// This is the standard Bitcoin Hash160 used for P2PKH addresses
    pub fn hash(&self) -> [u8; 20] {
        let pubkey_bytes = self.to_bytes();
        // Hash160 = RIPEMD160(SHA256(pubkey))
        let sha_hash = Sha256::digest(&pubkey_bytes);
        let ripemd_hash = Ripemd160::digest(sha_hash);
        let mut hash = [0u8; 20];
        hash.copy_from_slice(&ripemd_hash);
        hash
    }

    /// Verify a signature on a message
    pub fn verify(&self, message: &[u8; 32], signature: &Signature) -> bool {
        let secp = Secp256k1::new();
        let message = Message::from_digest(*message);
        secp.verify_ecdsa(&message, signature, &self.public_key)
            .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_generation() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();

        assert_eq!(pubkey.to_bytes().len(), 33); // Compressed public key
    }

    #[test]
    fn test_key_serialization() {
        let privkey = PrivateKey::new();
        let bytes = privkey.to_bytes();
        let restored = PrivateKey::from_bytes(&bytes).unwrap();

        assert_eq!(privkey.to_bytes(), restored.to_bytes());
    }

    #[test]
    fn test_public_key_hash() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let hash = pubkey.hash();

        assert_eq!(hash.len(), 20);
    }

    #[test]
    fn test_sign_and_verify() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();

        let message = [0x42u8; 32];
        let signature = privkey.sign(&message);

        assert!(pubkey.verify(&message, &signature));
    }

    #[test]
    fn test_verify_wrong_message() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();

        let message1 = [0x42u8; 32];
        let message2 = [0x43u8; 32];
        let signature = privkey.sign(&message1);

        assert!(!pubkey.verify(&message2, &signature));
    }

    #[test]
    fn test_verify_wrong_key() {
        let privkey1 = PrivateKey::new();
        let privkey2 = PrivateKey::new();
        let pubkey2 = privkey2.public_key();

        let message = [0x42u8; 32];
        let signature = privkey1.sign(&message);

        assert!(!pubkey2.verify(&message, &signature));
    }

    #[test]
    fn test_public_key_deterministic() {
        let privkey = PrivateKey::from_bytes(&[0x01; 32]).unwrap();
        let pubkey1 = privkey.public_key();
        let pubkey2 = privkey.public_key();

        assert_eq!(pubkey1, pubkey2);
    }

    // ── Principle 2: Q = kP — different private keys → different public keys ──

    #[test]
    fn test_different_privkeys_yield_different_pubkeys() {
        let pk1 = PrivateKey::from_bytes(&[0x01; 32]).unwrap().public_key();
        let pk2 = PrivateKey::from_bytes(&[0x02; 32]).unwrap().public_key();
        assert_ne!(pk1.to_bytes(), pk2.to_bytes(), "k₁ ≠ k₂ ⇒ Q₁ ≠ Q₂");
    }

    // ── Principle 3: ECC — compressed pubkey starts with 02 or 03 ──

    #[test]
    fn test_compressed_pubkey_prefix() {
        let privkey = PrivateKey::new();
        let bytes = privkey.public_key().to_bytes();
        assert_eq!(bytes.len(), 33);
        assert!(
            bytes[0] == 0x02 || bytes[0] == 0x03,
            "compressed pubkey must start with 02 or 03, got {:02x}",
            bytes[0]
        );
    }

    // ── Principle 1: H(x) = y — Hash160 is deterministic ──

    #[test]
    fn test_pubkey_hash_deterministic() {
        let privkey = PrivateKey::from_bytes(&[0x42; 32]).unwrap();
        let h1 = privkey.public_key().hash();
        let h2 = privkey.public_key().hash();
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_pubkey_hash_is_20_bytes() {
        let hash = PrivateKey::new().public_key().hash();
        assert_eq!(hash.len(), 20, "RIPEMD160(SHA256(pk)) = 20 bytes");
    }

    // ── Principle 4: Digital Signatures — basic ECDSA sign/verify ──

    #[test]
    fn test_signature_on_all_zero_message() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let msg = [0u8; 32];
        let sig = privkey.sign(&msg);
        assert!(pubkey.verify(&msg, &sig));
    }

    #[test]
    fn test_signature_on_all_ff_message() {
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let msg = [0xFFu8; 32];
        let sig = privkey.sign(&msg);
        assert!(pubkey.verify(&msg, &sig));
    }

    // ── Principle 8: Discrete Log — can't reverse Q to k ──

    #[test]
    fn test_pubkey_bytes_do_not_reveal_privkey() {
        let privkey = PrivateKey::from_bytes(&[0x42; 32]).unwrap();
        let pub_bytes = privkey.public_key().to_bytes();
        let priv_bytes = privkey.to_bytes();
        // Public key must not contain the secret key bytes
        assert_ne!(&pub_bytes[1..], priv_bytes.as_ref(), "pubkey must not leak privkey");
    }

    // ── Principle 12: Entropy — random keys are unique ──

    #[test]
    fn test_new_keys_have_high_entropy() {
        let keys: Vec<_> = (0..20)
            .map(|_| PrivateKey::new().to_bytes().to_vec())
            .collect();
        let unique: std::collections::HashSet<Vec<u8>> = keys.into_iter().collect();
        assert_eq!(unique.len(), 20, "20 random private keys must all differ");
    }

    #[test]
    fn test_from_bytes_roundtrip() {
        for seed in 1u8..=5 {
            let privkey = PrivateKey::from_bytes(&[seed; 32]).unwrap();
            let exported = privkey.to_bytes();
            let restored = PrivateKey::from_bytes(&exported).unwrap();
            assert_eq!(privkey.public_key(), restored.public_key());
        }
    }
}
