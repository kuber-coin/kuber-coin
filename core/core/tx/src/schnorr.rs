// BIP-340: Schnorr Signatures for secp256k1
//
// This module implements Schnorr signatures as specified in BIP-340.
// Schnorr signatures offer several advantages over ECDSA:
// - Provable security
// - Non-malleability
// - Linearity (enables signature aggregation)
// - Smaller signatures (64 bytes vs 71-72 bytes for ECDSA)
//
// BIP-340 Reference: https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki

use rand::rngs::OsRng;
use secp256k1::schnorr::Signature as Secp256k1SchnorrSig;
use secp256k1::{
    Keypair, Message, PublicKey as Secp256k1PublicKey, Secp256k1, SecretKey, XOnlyPublicKey,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Tagged hash for BIP-340 Schnorr signatures
///
/// BIP-340 uses tagged hashes to ensure domain separation:
/// tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
pub fn tagged_hash(tag: &[u8], msg: &[u8]) -> [u8; 32] {
    let tag_hash = Sha256::digest(tag);
    let mut hasher = Sha256::new();
    hasher.update(tag_hash);
    hasher.update(tag_hash);
    hasher.update(msg);
    let result = hasher.finalize();

    let mut output = [0u8; 32];
    output.copy_from_slice(&result);
    output
}

/// BIP-340 Schnorr signature (64 bytes)
///
/// Format: [R (32 bytes) || s (32 bytes)]
/// - R: x-coordinate of the nonce point (32 bytes)
/// - s: signature scalar (32 bytes)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchnorrSignature {
    /// The R component (x-only coordinate)
    pub r: [u8; 32],
    /// The s scalar
    pub s: [u8; 32],
}

impl SchnorrSignature {
    /// Create a new Schnorr signature from R and s components
    pub fn new(r: [u8; 32], s: [u8; 32]) -> Self {
        Self { r, s }
    }

    /// Parse a Schnorr signature from 64 bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, SchnorrError> {
        if bytes.len() != 64 {
            return Err(SchnorrError::InvalidSignatureLength(bytes.len()));
        }

        let mut r = [0u8; 32];
        let mut s = [0u8; 32];
        r.copy_from_slice(&bytes[0..32]);
        s.copy_from_slice(&bytes[32..64]);

        Ok(Self { r, s })
    }

    /// Serialize the signature to 64 bytes
    pub fn to_bytes(&self) -> [u8; 64] {
        let mut bytes = [0u8; 64];
        bytes[0..32].copy_from_slice(&self.r);
        bytes[32..64].copy_from_slice(&self.s);
        bytes
    }

    /// Verify this signature against a message and public key
    ///
    /// Implements BIP-340 verification algorithm using secp256k1:
    /// 1. Compute challenge: e = tagged_hash("BIP0340/challenge", R || P || m)
    /// 2. Compute point: R' = s*G - e*P
    /// 3. Verify: R'.x == R.x and R'.y is even
    pub fn verify(&self, msg: &[u8; 32], pubkey: &SchnorrPublicKey) -> Result<(), SchnorrError> {
        let secp = Secp256k1::new();

        // Parse the x-only public key
        let xonly_pk =
            XOnlyPublicKey::from_slice(&pubkey.x).map_err(|_| SchnorrError::InvalidPublicKey)?;

        // Parse the signature using secp256k1's Schnorr signature type
        let sig = Secp256k1SchnorrSig::from_slice(&self.to_bytes())
            .map_err(|_| SchnorrError::InvalidSignature)?;

        // Create message
        let message = Message::from_digest(*msg);

        // Verify using secp256k1's BIP-340 implementation
        secp.verify_schnorr(&sig, &message, &xonly_pk)
            .map_err(|_| SchnorrError::VerificationFailed)
    }
}

impl fmt::Display for SchnorrSignature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SchnorrSig(r={}, s={})",
            hex::encode(&self.r[..8]),
            hex::encode(&self.s[..8])
        )
    }
}

/// X-only public key (32 bytes) for Schnorr signatures
///
/// BIP-340 uses x-only public keys where the y-coordinate is implicitly even.
/// This reduces the public key size from 33 bytes (compressed) to 32 bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchnorrPublicKey {
    /// The x-coordinate of the public key point
    pub x: [u8; 32],
}

impl SchnorrPublicKey {
    /// Create a new x-only public key from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, SchnorrError> {
        if bytes.len() != 32 {
            return Err(SchnorrError::InvalidPublicKeyLength(bytes.len()));
        }

        let mut x = [0u8; 32];
        x.copy_from_slice(bytes);

        Ok(Self { x })
    }

    /// Get the bytes representation
    pub fn to_bytes(&self) -> [u8; 32] {
        self.x
    }

    /// Create from a secp256k1 public key
    ///
    /// Extracts the x-coordinate from a compressed public key.
    /// BIP-340 uses x-only public keys (32 bytes) where the y-coordinate is implicitly even.
    pub fn from_secp256k1_pubkey(pubkey: &Secp256k1PublicKey) -> Self {
        let bytes = pubkey.serialize();
        // bytes[0] is the prefix (02 or 03), bytes[1..33] is the x-coordinate
        let mut x = [0u8; 32];
        x.copy_from_slice(&bytes[1..33]);
        Self { x }
    }

    /// Attempt to create a secp256k1 PublicKey
    ///
    /// Note: This assumes even y-coordinate as per BIP-340.
    /// For full validation, you'd need to verify the y-coordinate parity.
    pub fn to_secp256k1_pubkey(&self) -> Result<Secp256k1PublicKey, SchnorrError> {
        // Prepend 0x02 prefix for compressed public key with even y
        let mut bytes = [0u8; 33];
        bytes[0] = 0x02;
        bytes[1..33].copy_from_slice(&self.x);

        Secp256k1PublicKey::from_slice(&bytes).map_err(|_| SchnorrError::InvalidPublicKey)
    }
}

impl fmt::Display for SchnorrPublicKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SchnorrPubKey({}...)", hex::encode(&self.x[..8]))
    }
}

/// Sign a message with a Schnorr signature (BIP-340)
///
/// # Arguments
/// * `secret_key` - The secret key to sign with
/// * `msg` - The 32-byte message hash to sign
///
/// # Returns
/// The 64-byte Schnorr signature using proper secp256k1 curve operations
pub fn sign(secret_key: &SecretKey, msg: &[u8; 32]) -> Result<SchnorrSignature, SchnorrError> {
    let secp = Secp256k1::new();

    // Create keypair for Schnorr signing
    let keypair = Keypair::from_secret_key(&secp, secret_key);

    // Create message
    let message = Message::from_digest(*msg);

    // Sign using secp256k1's BIP-340 implementation
    let sig = secp.sign_schnorr_with_rng(&message, &keypair, &mut OsRng);

    // Convert to our SchnorrSignature type
    let sig_bytes = sig.as_ref();
    let mut r = [0u8; 32];
    let mut s = [0u8; 32];
    r.copy_from_slice(&sig_bytes[0..32]);
    s.copy_from_slice(&sig_bytes[32..64]);

    Ok(SchnorrSignature { r, s })
}

/// Verify a Schnorr signature (BIP-340)
///
/// # Arguments
/// * `sig` - The signature to verify
/// * `msg` - The 32-byte message hash
/// * `pubkey` - The x-only public key
///
/// # Returns
/// Ok(()) if the signature is valid, Err otherwise
///
/// Note: This is simplified verification. Production implementation
/// would perform full elliptic curve point verification.
pub fn verify(
    sig: &SchnorrSignature,
    msg: &[u8; 32],
    pubkey: &SchnorrPublicKey,
) -> Result<(), SchnorrError> {
    sig.verify(msg, pubkey)
}

/// Batch verify multiple Schnorr signatures
///
/// This is more efficient than verifying signatures individually.
/// All signatures must be valid for the function to return Ok(()).
///
/// # Arguments
/// * `sigs` - Array of signatures to verify
/// * `msgs` - Array of message hashes (one per signature)
/// * `pubkeys` - Array of public keys (one per signature)
///
/// # Returns
/// Ok(()) if ALL signatures are valid, Err otherwise
pub fn batch_verify(
    sigs: &[SchnorrSignature],
    msgs: &[[u8; 32]],
    pubkeys: &[SchnorrPublicKey],
) -> Result<(), SchnorrError> {
    if sigs.len() != msgs.len() || sigs.len() != pubkeys.len() {
        return Err(SchnorrError::BatchSizeMismatch);
    }

    if sigs.is_empty() {
        return Ok(());
    }

    // Verify each signature individually
    // Note: True batch verification using random linear combinations
    // would be more efficient, but requires more complex implementation
    for i in 0..sigs.len() {
        verify(&sigs[i], &msgs[i], &pubkeys[i])?;
    }

    Ok(())
}

/// Compute the BIP-340 challenge hash
///
/// e = tagged_hash("BIP0340/challenge", R || P || m)
///
/// This is used internally in signature generation and verification.
pub fn compute_challenge(r_x: &[u8; 32], pubkey_x: &[u8; 32], msg: &[u8; 32]) -> [u8; 32] {
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(r_x);
    data.extend_from_slice(pubkey_x);
    data.extend_from_slice(msg);

    tagged_hash(b"BIP0340/challenge", &data)
}

/// Accumulator for deferred batch Schnorr signature verification.
///
/// Collects `(signature, message, pubkey)` tuples during block validation
/// and verifies them all at once. This infrastructure enables future
/// multi-scalar-multiplication optimisation (BIP-340 §batch) when lower-level
/// EC point access becomes available.
pub struct BatchVerifier {
    entries: Vec<(SchnorrSignature, [u8; 32], SchnorrPublicKey)>,
}

impl BatchVerifier {
    /// Create a new empty batch verifier.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Create a batch verifier pre-allocated for `capacity` entries.
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            entries: Vec::with_capacity(capacity),
        }
    }

    /// Queue a Schnorr signature for deferred verification.
    pub fn add(&mut self, sig: SchnorrSignature, msg: [u8; 32], pubkey: SchnorrPublicKey) {
        self.entries.push((sig, msg, pubkey));
    }

    /// Number of queued verification entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the verifier has no queued entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Verify all queued signatures.
    ///
    /// Returns `Ok(())` if every signature is valid, or the first error encountered.
    pub fn verify_all(&self) -> Result<(), SchnorrError> {
        for (sig, msg, pk) in &self.entries {
            verify(sig, msg, pk)?;
        }
        Ok(())
    }

    /// Merge another verifier's entries into this one.
    pub fn merge(&mut self, other: BatchVerifier) {
        self.entries.extend(other.entries);
    }
}

/// Generate a keypair for Schnorr signatures
///
/// This creates a new random keypair suitable for BIP-340 Schnorr signatures.
pub fn generate_keypair() -> Result<(SecretKey, SchnorrPublicKey), SchnorrError> {
    let secp = Secp256k1::new();
    let (secret_key, pubkey) = secp.generate_keypair(&mut OsRng);
    let schnorr_pubkey = SchnorrPublicKey::from_secp256k1_pubkey(&pubkey);

    Ok((secret_key, schnorr_pubkey))
}

/// Errors that can occur during Schnorr signature operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchnorrError {
    /// Invalid signature length (expected 64 bytes)
    InvalidSignatureLength(usize),
    /// Invalid public key length (expected 32 bytes)
    InvalidPublicKeyLength(usize),
    /// Invalid signature format
    InvalidSignature,
    /// Invalid public key
    InvalidPublicKey,
    /// Invalid message format
    InvalidMessage,
    /// Signature verification failed
    VerificationFailed,
    /// Batch verification size mismatch
    BatchSizeMismatch,
    /// Signing failed
    SigningFailed,
}

impl fmt::Display for SchnorrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SchnorrError::InvalidSignatureLength(len) => {
                write!(f, "Invalid signature length: {} (expected 64)", len)
            }
            SchnorrError::InvalidPublicKeyLength(len) => {
                write!(f, "Invalid public key length: {} (expected 32)", len)
            }
            SchnorrError::InvalidSignature => write!(f, "Invalid signature format"),
            SchnorrError::InvalidPublicKey => write!(f, "Invalid public key"),
            SchnorrError::InvalidMessage => write!(f, "Invalid message format"),
            SchnorrError::VerificationFailed => write!(f, "Signature verification failed"),
            SchnorrError::BatchSizeMismatch => {
                write!(f, "Batch verification: mismatched array sizes")
            }
            SchnorrError::SigningFailed => write!(f, "Signing operation failed"),
        }
    }
}

impl std::error::Error for SchnorrError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tagged_hash() {
        // Test BIP-340 tagged hash
        let tag = b"BIP0340/challenge";
        let msg = b"test message";

        let hash1 = tagged_hash(tag, msg);
        let hash2 = tagged_hash(tag, msg);

        // Same input should produce same output
        assert_eq!(hash1, hash2);

        // Different tag should produce different output
        let hash3 = tagged_hash(b"different", msg);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_schnorr_signature_serialization() {
        let r = [1u8; 32];
        let s = [2u8; 32];

        let sig = SchnorrSignature::new(r, s);
        let bytes = sig.to_bytes();

        assert_eq!(bytes.len(), 64);
        assert_eq!(&bytes[0..32], &r);
        assert_eq!(&bytes[32..64], &s);

        let sig2 = SchnorrSignature::from_bytes(&bytes).unwrap();
        assert_eq!(sig, sig2);
    }

    #[test]
    fn test_schnorr_signature_invalid_length() {
        let bytes = [0u8; 63]; // Wrong length
        let result = SchnorrSignature::from_bytes(&bytes);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            SchnorrError::InvalidSignatureLength(63)
        );
    }

    #[test]
    fn test_schnorr_pubkey_serialization() {
        let x = [42u8; 32];
        let pubkey = SchnorrPublicKey::from_bytes(&x).unwrap();

        assert_eq!(pubkey.to_bytes(), x);
    }

    #[test]
    fn test_schnorr_pubkey_invalid_length() {
        let bytes = [0u8; 31]; // Wrong length
        let result = SchnorrPublicKey::from_bytes(&bytes);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            SchnorrError::InvalidPublicKeyLength(31)
        );
    }

    #[test]
    fn test_generate_keypair() {
        let result = generate_keypair();
        assert!(result.is_ok());

        let (_secret_key, pubkey) = result.unwrap();

        // Verify the public key is 32 bytes
        assert_eq!(pubkey.to_bytes().len(), 32);
    }

    #[test]
    fn test_sign_and_verify() {
        // Generate a keypair
        let (keypair, pubkey) = generate_keypair().unwrap();

        // Create a message
        let msg = Sha256::digest(b"Hello, Schnorr!").into();

        // Sign the message
        let sig = sign(&keypair, &msg).unwrap();

        // Verify the signature
        let result = verify(&sig, &msg, &pubkey);
        assert!(result.is_ok(), "Signature verification should succeed");
    }

    #[test]
    fn test_verify_invalid_signature() {
        // Generate a keypair
        let (_, pubkey) = generate_keypair().unwrap();

        // Create a message
        let msg = Sha256::digest(b"Hello, Schnorr!").into();

        // Create an invalid signature
        let invalid_sig = SchnorrSignature::new([0u8; 32], [0u8; 32]);

        // Verification should fail
        let result = verify(&invalid_sig, &msg, &pubkey);
        assert!(
            result.is_err(),
            "Invalid signature should fail verification"
        );
    }

    #[test]
    fn test_verify_wrong_message() {
        // Generate a keypair
        let (keypair, pubkey) = generate_keypair().unwrap();

        // Sign a message
        let msg1 = Sha256::digest(b"Message 1").into();
        let sig = sign(&keypair, &msg1).unwrap();

        // Try to verify with a different message
        let msg2 = Sha256::digest(b"Message 2").into();
        let result = verify(&sig, &msg2, &pubkey);

        assert!(result.is_err(), "Wrong message should fail verification");
    }

    #[test]
    fn test_verify_wrong_pubkey() {
        // Generate two keypairs
        let (keypair1, _) = generate_keypair().unwrap();
        let (_, pubkey2) = generate_keypair().unwrap();

        // Sign with keypair1
        let msg = Sha256::digest(b"Test").into();
        let sig = sign(&keypair1, &msg).unwrap();

        // Try to verify with pubkey2
        let result = verify(&sig, &msg, &pubkey2);

        assert!(result.is_err(), "Wrong pubkey should fail verification");
    }

    #[test]
    fn test_batch_verify_all_valid() {
        // Generate 3 keypairs
        let (kp1, pk1) = generate_keypair().unwrap();
        let (kp2, pk2) = generate_keypair().unwrap();
        let (kp3, pk3) = generate_keypair().unwrap();

        // Sign 3 messages
        let msg1 = Sha256::digest(b"Message 1").into();
        let msg2 = Sha256::digest(b"Message 2").into();
        let msg3 = Sha256::digest(b"Message 3").into();

        let sig1 = sign(&kp1, &msg1).unwrap();
        let sig2 = sign(&kp2, &msg2).unwrap();
        let sig3 = sign(&kp3, &msg3).unwrap();

        // Batch verify
        let result = batch_verify(&[sig1, sig2, sig3], &[msg1, msg2, msg3], &[pk1, pk2, pk3]);

        assert!(
            result.is_ok(),
            "All valid signatures should pass batch verification"
        );
    }

    #[test]
    fn test_batch_verify_one_invalid() {
        // Generate 2 keypairs
        let (kp1, pk1) = generate_keypair().unwrap();
        let (_, pk2) = generate_keypair().unwrap();

        // Sign 2 messages
        let msg1 = Sha256::digest(b"Message 1").into();
        let msg2 = Sha256::digest(b"Message 2").into();

        let sig1 = sign(&kp1, &msg1).unwrap();
        let sig2_invalid = SchnorrSignature::new([0u8; 32], [0u8; 32]);

        // Batch verify (one signature is invalid)
        let result = batch_verify(&[sig1, sig2_invalid], &[msg1, msg2], &[pk1, pk2]);

        assert!(
            result.is_err(),
            "One invalid signature should fail batch verification"
        );
    }

    #[test]
    fn test_batch_verify_size_mismatch() {
        let (kp, pk) = generate_keypair().unwrap();
        let msg = Sha256::digest(b"Test").into();
        let sig = sign(&kp, &msg).unwrap();

        // Mismatched sizes
        let result = batch_verify(&[sig], &[msg, msg], &[pk]);

        assert_eq!(result.unwrap_err(), SchnorrError::BatchSizeMismatch);
    }

    #[test]
    fn test_batch_verify_empty() {
        // Empty batch should succeed
        let result = batch_verify(&[], &[], &[]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compute_challenge() {
        let r_x = [1u8; 32];
        let pubkey_x = [2u8; 32];
        let msg = [3u8; 32];

        let challenge1 = compute_challenge(&r_x, &pubkey_x, &msg);
        let challenge2 = compute_challenge(&r_x, &pubkey_x, &msg);

        // Same input should produce same challenge
        assert_eq!(challenge1, challenge2);
        assert_eq!(challenge1.len(), 32);
    }

    #[test]
    fn test_schnorr_display() {
        let sig = SchnorrSignature::new([0xabu8; 32], [0xcdu8; 32]);
        let display = format!("{}", sig);
        assert!(display.contains("SchnorrSig"));

        let pubkey = SchnorrPublicKey { x: [0xefu8; 32] };
        let display = format!("{}", pubkey);
        assert!(display.contains("SchnorrPubKey"));
    }

    #[test]
    fn test_batch_verifier_accumulate_and_verify() {
        let (kp1, pk1) = generate_keypair().unwrap();
        let (kp2, pk2) = generate_keypair().unwrap();

        let msg1: [u8; 32] = Sha256::digest(b"batch msg 1").into();
        let msg2: [u8; 32] = Sha256::digest(b"batch msg 2").into();

        let sig1 = sign(&kp1, &msg1).unwrap();
        let sig2 = sign(&kp2, &msg2).unwrap();

        let mut bv = BatchVerifier::new();
        assert!(bv.is_empty());
        bv.add(sig1, msg1, pk1);
        bv.add(sig2, msg2, pk2);
        assert_eq!(bv.len(), 2);
        assert!(bv.verify_all().is_ok());
    }

    #[test]
    fn test_batch_verifier_fails_on_bad_sig() {
        let (kp, pk) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"good").into();
        let sig = sign(&kp, &msg).unwrap();

        let bad_sig = SchnorrSignature::new([0u8; 32], [0u8; 32]);
        let bad_msg: [u8; 32] = Sha256::digest(b"bad").into();

        let mut bv = BatchVerifier::with_capacity(2);
        bv.add(sig, msg, pk);
        bv.add(bad_sig, bad_msg, pk);
        assert!(bv.verify_all().is_err());
    }

    #[test]
    fn test_batch_verifier_merge() {
        let (kp, pk) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"merge").into();
        let sig = sign(&kp, &msg).unwrap();

        let mut bv1 = BatchVerifier::new();
        bv1.add(sig, msg, pk);

        let mut bv2 = BatchVerifier::new();
        bv2.add(sig, msg, pk);

        bv1.merge(bv2);
        assert_eq!(bv1.len(), 2);
        assert!(bv1.verify_all().is_ok());
    }

    // ── Principle 1: H(x) = y — Cryptographic Hash Functions ──

    #[test]
    fn test_tagged_hash_deterministic() {
        let h1 = tagged_hash(b"BIP0340/challenge", b"message");
        let h2 = tagged_hash(b"BIP0340/challenge", b"message");
        assert_eq!(h1, h2, "H(x) must be deterministic");
    }

    #[test]
    fn test_tagged_hash_different_tags_differ() {
        let h1 = tagged_hash(b"TagA", b"same");
        let h2 = tagged_hash(b"TagB", b"same");
        assert_ne!(h1, h2, "different tags → different domain separation");
    }

    #[test]
    fn test_tagged_hash_different_messages_differ() {
        let h1 = tagged_hash(b"BIP0340/aux", b"msg1");
        let h2 = tagged_hash(b"BIP0340/aux", b"msg2");
        assert_ne!(h1, h2, "H(x) ≠ H(y) when x ≠ y (collision resistance)");
    }

    #[test]
    fn test_tagged_hash_output_is_32_bytes() {
        let h = tagged_hash(b"test", b"data");
        assert_eq!(h.len(), 32);
    }

    // ── Principle 2: Q = kP — Public Key from Secret Key ──

    #[test]
    fn test_generate_keypair_pubkey_32_bytes() {
        let (_sk, pk) = generate_keypair().unwrap();
        assert_eq!(pk.to_bytes().len(), 32, "Schnorr x-only pubkey must be 32 bytes");
    }

    #[test]
    fn test_same_secret_key_same_pubkey() {
        let sk = SecretKey::from_slice(&[0x01; 32]).unwrap();
        let secp = secp256k1::Secp256k1::new();
        let pk1 = secp256k1::PublicKey::from_secret_key(&secp, &sk);
        let pk2 = secp256k1::PublicKey::from_secret_key(&secp, &sk);
        assert_eq!(pk1, pk2, "Q = kP is deterministic");
    }

    #[test]
    fn test_different_secret_keys_different_pubkeys() {
        let (_sk1, pk1) = generate_keypair().unwrap();
        let (_sk2, pk2) = generate_keypair().unwrap();
        assert_ne!(pk1.to_bytes(), pk2.to_bytes(), "different k → different Q");
    }

    // ── Principle 4: Digital Signatures s = k⁻¹(z + rd) mod n ──

    #[test]
    fn test_sign_verify_roundtrip_schnorr() {
        let (sk, pk) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"roundtrip").into();
        let sig = sign(&sk, &msg).unwrap();
        assert!(verify(&sig, &msg, &pk).is_ok(), "valid sig must verify");
    }

    #[test]
    fn test_signature_wrong_message_fails() {
        let (sk, pk) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"ok").into();
        let bad: [u8; 32] = Sha256::digest(b"tampered").into();
        let sig = sign(&sk, &msg).unwrap();
        assert!(verify(&sig, &bad, &pk).is_err(), "wrong message must fail");
    }

    #[test]
    fn test_signature_wrong_pubkey_fails() {
        let (sk, _pk) = generate_keypair().unwrap();
        let (_sk2, pk2) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"auth").into();
        let sig = sign(&sk, &msg).unwrap();
        assert!(verify(&sig, &msg, &pk2).is_err(), "wrong key must fail");
    }

    #[test]
    fn test_signature_is_64_bytes() {
        let (sk, _) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"size").into();
        let sig = sign(&sk, &msg).unwrap();
        assert_eq!(sig.to_bytes().len(), 64);
    }

    #[test]
    fn test_signature_from_bytes_roundtrip() {
        let (sk, _) = generate_keypair().unwrap();
        let msg: [u8; 32] = Sha256::digest(b"serde").into();
        let sig = sign(&sk, &msg).unwrap();
        let bytes = sig.to_bytes();
        let restored = SchnorrSignature::from_bytes(&bytes).unwrap();
        assert_eq!(sig.r, restored.r);
        assert_eq!(sig.s, restored.s);
    }

    // ── Principle 7: a ≡ b (mod n) — Challenge computation ──

    #[test]
    fn test_compute_challenge_deterministic() {
        let r = [0xAAu8; 32];
        let pk = [0xBBu8; 32];
        let msg = [0xCCu8; 32];
        let c1 = compute_challenge(&r, &pk, &msg);
        let c2 = compute_challenge(&r, &pk, &msg);
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_compute_challenge_changes_with_any_input() {
        let base_r = [0x01u8; 32];
        let base_pk = [0x02u8; 32];
        let base_msg = [0x03u8; 32];
        let c_base = compute_challenge(&base_r, &base_pk, &base_msg);

        let mut diff_r = base_r;
        diff_r[0] ^= 0xFF;
        assert_ne!(c_base, compute_challenge(&diff_r, &base_pk, &base_msg));

        let mut diff_pk = base_pk;
        diff_pk[0] ^= 0xFF;
        assert_ne!(c_base, compute_challenge(&base_r, &diff_pk, &base_msg));

        let mut diff_msg = base_msg;
        diff_msg[0] ^= 0xFF;
        assert_ne!(c_base, compute_challenge(&base_r, &base_pk, &diff_msg));
    }

    // ── Principle 12: Entropy — Random keypair uniqueness ──

    #[test]
    fn test_generate_keypair_entropy_10_unique() {
        let keys: Vec<_> = (0..10)
            .map(|_| generate_keypair().unwrap().1.to_bytes())
            .collect();
        let unique: std::collections::HashSet<_> = keys.iter().map(|k| k.to_vec()).collect();
        assert_eq!(unique.len(), 10, "10 random keypairs must all be distinct (entropy)");
    }
}
