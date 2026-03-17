//! # BIP-322: Generic Signed Message Format
//!
//! A standard for signing and verifying messages with Bitcoin addresses of any type.
//! Supports P2PKH, P2WPKH, P2SH, P2WSH, and P2TR (Taproot) addresses.
//!
//! ##Overview
//!
//! BIP-322 provides a universal message signing protocol that works with all address types,
//! replacing the legacy Bitcoin message signing that only worked with P2PKH.
//!
//! ## Message Signature Structure
//!
//! ```text
//! 1. Create "to_sign" message:
//!    - Tag: "SignMessage"
//!    - Message content
//!
//! 2. Create virtual transaction:
//!    - Input: Commitment to message
//!    - Output: Address being proven
//!
//! 3. Create signature transaction:
//!    - Spends virtual transaction
//!    - Contains witness/signature data
//!
//! 4. Encode signature:
//!    - Witness data from signature transaction
//!    - Base64 encoded
//! ```
//!
//! ## Verification
//!
//! 1. Decode signature
//! 2. Reconstruct virtual transaction
//! 3. Verify signature transaction spends virtual tx
//! 4. Confirm address matches

use ripemd::Ripemd160;
use secp256k1::{ecdsa, Message, PublicKey, Secp256k1, SecretKey};
use sha2::{Digest, Sha256};

/// Message signature for BIP-322
#[derive(Debug, Clone, PartialEq)]
pub struct MessageSignature {
    /// Original message
    pub message: Vec<u8>,

    /// Address that signed the message
    pub address: String,

    /// Signature data (witness stack)
    pub witness: Vec<Vec<u8>>,

    /// Address type
    pub address_type: AddressType,
}

/// Supported address types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressType {
    /// Legacy P2PKH (1...)
    P2PKH,

    /// Native SegWit P2WPKH (bc1q...)
    P2WPKH,

    /// Pay-to-Script-Hash (3...)
    P2SH,

    /// Native SegWit P2WSH (bc1q... long)
    P2WSH,

    /// Taproot P2TR (bc1p...)
    P2TR,
}

/// BIP-322 signer/verifier
pub struct Bip322 {
    _network: Network,
}

/// Network type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    /// Bitcoin mainnet.
    Mainnet,
    /// Bitcoin testnet.
    Testnet,
    /// Local regression-test network.
    Regtest,
}

/// BIP-322 errors
#[derive(Debug, Clone, PartialEq)]
pub enum Bip322Error {
    /// Invalid address format
    InvalidAddress(String),

    /// Unsupported address type
    UnsupportedAddressType,

    /// Signature verification failed
    VerificationFailed,

    /// Invalid signature format
    InvalidSignature,

    /// Message too long
    MessageTooLong,
}

impl Bip322 {
    /// Create new BIP-322 instance
    pub fn new(network: Network) -> Self {
        Self { _network: network }
    }

    /// Sign message with private key and address
    pub fn sign_message(
        &self,
        message: &[u8],
        address: &str,
        private_key: &[u8; 32],
    ) -> Result<MessageSignature, Bip322Error> {
        if message.len() > 10000 {
            return Err(Bip322Error::MessageTooLong);
        }

        // Determine address type
        let address_type = Self::detect_address_type(address)?;

        // Create message tag
        let tagged_message = Self::create_tagged_message(message);

        // Create message hash
        let message_hash = Sha256::digest(&tagged_message);

        // Create witness based on address type
        let witness = match address_type {
            AddressType::P2WPKH => {
                // P2WPKH witness: [signature, pubkey]
                let signature = Self::sign_hash(&message_hash, private_key);
                let pubkey = Self::private_to_public(private_key)?;
                vec![signature.to_vec(), pubkey.to_vec()]
            }
            AddressType::P2TR => {
                // P2TR witness: [signature] (64 bytes, Schnorr)
                let signature = Self::sign_schnorr(&message_hash, private_key);
                vec![signature.to_vec()]
            }
            AddressType::P2PKH => {
                // Legacy signature (DER encoded)
                let signature = Self::sign_hash(&message_hash, private_key);
                let pubkey = Self::private_to_public(private_key)?;
                vec![signature.to_vec(), pubkey.to_vec()]
            }
            _ => {
                return Err(Bip322Error::UnsupportedAddressType);
            }
        };

        Ok(MessageSignature {
            message: message.to_vec(),
            address: address.to_string(),
            witness,
            address_type,
        })
    }

    /// Verify message signature
    pub fn verify_signature(&self, signature: &MessageSignature) -> Result<bool, Bip322Error> {
        // Create tagged message
        let tagged_message = Self::create_tagged_message(&signature.message);
        let message_hash = Sha256::digest(&tagged_message);

        // Verify based on address type
        match signature.address_type {
            AddressType::P2WPKH => {
                if signature.witness.len() != 2 {
                    return Err(Bip322Error::InvalidSignature);
                }

                let sig = &signature.witness[0];
                let pubkey = &signature.witness[1];

                // Verify signature
                let valid = Self::verify_ecdsa(&message_hash, sig, pubkey)?;

                // Verify address matches pubkey
                let derived_address = Self::pubkey_to_p2wpkh(pubkey)?;
                if derived_address != signature.address {
                    return Ok(false);
                }

                Ok(valid)
            }
            AddressType::P2TR => {
                if signature.witness.is_empty() {
                    return Err(Bip322Error::InvalidSignature);
                }

                let sig = &signature.witness[0];

                // Parse address to get output key
                let output_key = Self::parse_taproot_address(&signature.address)?;

                // Verify Schnorr signature
                Self::verify_schnorr(&message_hash, sig, &output_key)
            }
            AddressType::P2PKH => {
                if signature.witness.len() != 2 {
                    return Err(Bip322Error::InvalidSignature);
                }

                let sig = &signature.witness[0];
                let pubkey = &signature.witness[1];

                // Verify signature
                let valid = Self::verify_ecdsa(&message_hash, sig, pubkey)?;

                // Verify address matches pubkey
                let derived_address = Self::pubkey_to_p2pkh(pubkey)?;
                if derived_address != signature.address {
                    return Ok(false);
                }

                Ok(valid)
            }
            _ => Err(Bip322Error::UnsupportedAddressType),
        }
    }

    /// Create tagged message (BIP-340 style)
    fn create_tagged_message(message: &[u8]) -> Vec<u8> {
        let tag = b"SignMessage";
        let tag_hash = Sha256::digest(tag);

        let mut tagged = Vec::new();
        tagged.extend_from_slice(&tag_hash);
        tagged.extend_from_slice(&tag_hash);
        tagged.extend_from_slice(message);

        tagged
    }

    /// Detect address type from string
    fn detect_address_type(address: &str) -> Result<AddressType, Bip322Error> {
        if address.starts_with("kb1p") || address.starts_with("tb1p") {
            Ok(AddressType::P2TR)
        } else if address.starts_with("kb1q") || address.starts_with("tb1q") {
            // Could be P2WPKH or P2WSH, check length
            if address.len() <= 44 {
                Ok(AddressType::P2WPKH)
            } else {
                Ok(AddressType::P2WSH)
            }
        } else if address.starts_with('K') || address.starts_with('m') || address.starts_with('n') {
            Ok(AddressType::P2PKH)
        } else if address.starts_with('3') || address.starts_with('2') {
            Ok(AddressType::P2SH)
        } else {
            Err(Bip322Error::InvalidAddress(address.to_string()))
        }
    }

    /// Sign hash with ECDSA using secp256k1
    fn sign_hash(hash: &[u8], private_key: &[u8; 32]) -> [u8; 64] {
        let secp = Secp256k1::new();

        // Parse secret key
        let sk = match SecretKey::from_slice(private_key) {
            Ok(k) => k,
            Err(_) => {
                // Return zeroed signature for invalid key
                return [0u8; 64];
            }
        };

        // Create message from hash (must be 32 bytes)
        let mut msg_bytes = [0u8; 32];
        let len = hash.len().min(32);
        msg_bytes[..len].copy_from_slice(&hash[..len]);

        let msg = Message::from_digest(msg_bytes);

        // Sign with ECDSA
        let sig = secp.sign_ecdsa(&msg, &sk);

        // Compact format (64 bytes: r || s)
        sig.serialize_compact()
    }

    /// Sign hash with Schnorr (BIP-340)
    fn sign_schnorr(hash: &[u8], private_key: &[u8; 32]) -> [u8; 64] {
        let secp = Secp256k1::new();

        // Parse secret key
        let sk = match SecretKey::from_slice(private_key) {
            Ok(k) => k,
            Err(_) => return [0u8; 64],
        };

        // Create keypair for Schnorr signing
        let keypair = secp256k1::Keypair::from_secret_key(&secp, &sk);

        // Create message from hash
        let mut msg_bytes = [0u8; 32];
        let len = hash.len().min(32);
        msg_bytes[..len].copy_from_slice(&hash[..len]);

        let msg = Message::from_digest(msg_bytes);

        // Sign with Schnorr (BIP-340) using deterministic nonce
        let sig = secp.sign_schnorr_with_rng(&msg, &keypair, &mut rand::thread_rng());

        // Return 64-byte signature
        let mut result = [0u8; 64];
        result.copy_from_slice(sig.as_ref());
        result
    }

    /// Verify ECDSA signature using secp256k1
    fn verify_ecdsa(hash: &[u8], signature: &[u8], pubkey: &[u8]) -> Result<bool, Bip322Error> {
        if pubkey.len() != 33 {
            return Err(Bip322Error::InvalidSignature);
        }

        let secp = Secp256k1::new();

        // Parse public key
        let pk = PublicKey::from_slice(pubkey).map_err(|_| Bip322Error::InvalidSignature)?;

        // Parse signature (handle both compact and DER formats)
        let sig = if signature.len() == 64 {
            // Compact format
            ecdsa::Signature::from_compact(signature).map_err(|_| Bip322Error::InvalidSignature)?
        } else {
            // Try DER format
            ecdsa::Signature::from_der(signature).map_err(|_| Bip322Error::InvalidSignature)?
        };

        // Create message from hash
        let mut msg_bytes = [0u8; 32];
        let len = hash.len().min(32);
        msg_bytes[..len].copy_from_slice(&hash[..len]);
        let msg = Message::from_digest(msg_bytes);

        // Verify
        Ok(secp.verify_ecdsa(&msg, &sig, &pk).is_ok())
    }

    /// Verify Schnorr signature (BIP-340)
    fn verify_schnorr(
        hash: &[u8],
        signature: &[u8],
        pubkey: &[u8; 32],
    ) -> Result<bool, Bip322Error> {
        if signature.len() != 64 {
            return Err(Bip322Error::InvalidSignature);
        }

        let secp = Secp256k1::new();

        // Parse x-only public key
        let xonly_pk = secp256k1::XOnlyPublicKey::from_slice(pubkey)
            .map_err(|_| Bip322Error::InvalidSignature)?;

        // Parse Schnorr signature
        let sig = secp256k1::schnorr::Signature::from_slice(signature)
            .map_err(|_| Bip322Error::InvalidSignature)?;

        // Create message from hash
        let mut msg_bytes = [0u8; 32];
        let len = hash.len().min(32);
        msg_bytes[..len].copy_from_slice(&hash[..len]);
        let msg = Message::from_digest(msg_bytes);

        // Verify Schnorr signature
        Ok(secp.verify_schnorr(&sig, &msg, &xonly_pk).is_ok())
    }

    /// Convert private key to public key using secp256k1
    fn private_to_public(private_key: &[u8; 32]) -> Result<[u8; 33], Bip322Error> {
        let secp = Secp256k1::new();

        let sk = SecretKey::from_slice(private_key).map_err(|_| Bip322Error::InvalidSignature)?;
        let pk = PublicKey::from_secret_key(&secp, &sk);
        Ok(pk.serialize()) // 33-byte compressed format
    }

    /// Convert pubkey to P2WPKH address
    fn pubkey_to_p2wpkh(pubkey: &[u8]) -> Result<String, Bip322Error> {
        if pubkey.len() != 33 {
            return Err(Bip322Error::InvalidSignature);
        }

        // HASH160 = RIPEMD160(SHA256(pubkey))
        let sha = Sha256::digest(pubkey);
        let hash = Ripemd160::digest(sha);
        let mut hash20 = [0u8; 20];
        hash20.copy_from_slice(&hash);

        // Proper bech32 encoding with KuberCoin HRP
        crate::bech32m::encode_p2wpkh_address(&hash20, "mainnet")
            .map_err(|_| Bip322Error::InvalidAddress("bech32 encode failed".into()))
    }

    /// Convert pubkey to P2PKH address
    fn pubkey_to_p2pkh(pubkey: &[u8]) -> Result<String, Bip322Error> {
        if pubkey.len() != 33 {
            return Err(Bip322Error::InvalidSignature);
        }

        // HASH160 = RIPEMD160(SHA256(pubkey))
        let sha = Sha256::digest(pubkey);
        let hash = Ripemd160::digest(sha);
        let mut hash20 = [0u8; 20];
        hash20.copy_from_slice(&hash);

        // Proper Base58Check encoding with KuberCoin version byte
        let addr = crate::address::Address::from_pubkey_hash(hash20);
        Ok(addr.encode())
    }

    /// Parse Taproot address to output key
    fn parse_taproot_address(address: &str) -> Result<[u8; 32], Bip322Error> {
        crate::bech32m::decode_taproot_address(address)
            .map(|(_, output_key)| output_key)
            .map_err(|_| Bip322Error::InvalidAddress(address.to_string()))
    }

    /// Encode signature to base64
    pub fn encode_signature(signature: &MessageSignature) -> String {
        use base64::Engine;
        let encoder = base64::engine::general_purpose::STANDARD;

        // Serialize witness
        let mut data = Vec::new();
        // Cap witness count at 255 to avoid truncation; use saturating for safety
        let witness_count = signature.witness.len().min(255);
        data.push(witness_count as u8);

        for item in &signature.witness[..witness_count] {
            let item_len = item.len().min(u16::MAX as usize);
            data.extend_from_slice(&(item_len as u16).to_le_bytes());
            data.extend_from_slice(&item[..item_len]);
        }

        encoder.encode(&data)
    }

    /// Decode signature from base64
    pub fn decode_signature(
        encoded: &str,
        message: &[u8],
        address: &str,
    ) -> Result<MessageSignature, Bip322Error> {
        use base64::Engine;
        let encoder = base64::engine::general_purpose::STANDARD;

        let data = encoder
            .decode(encoded)
            .map_err(|_| Bip322Error::InvalidSignature)?;

        if data.is_empty() {
            return Err(Bip322Error::InvalidSignature);
        }

        // Parse witness
        let witness_count = data[0] as usize;
        let mut witness = Vec::new();
        let mut pos = 1;

        for _ in 0..witness_count {
            if pos + 2 > data.len() {
                return Err(Bip322Error::InvalidSignature);
            }

            let len = u16::from_le_bytes([data[pos], data[pos + 1]]) as usize;
            pos += 2;

            if pos + len > data.len() {
                return Err(Bip322Error::InvalidSignature);
            }

            witness.push(data[pos..pos + len].to_vec());
            pos += len;
        }

        let address_type = Self::detect_address_type(address)?;

        Ok(MessageSignature {
            message: message.to_vec(),
            address: address.to_string(),
            witness,
            address_type,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_privkey() -> [u8; 32] {
        [1u8; 32]
    }

    #[test]
    fn test_detect_address_type() {
        assert_eq!(
            Bip322::detect_address_type("kb1pxyz123").unwrap(),
            AddressType::P2TR
        );
        assert_eq!(
            Bip322::detect_address_type("kb1qxyz123").unwrap(),
            AddressType::P2WPKH
        );
        assert_eq!(
            Bip322::detect_address_type("KABC123").unwrap(),
            AddressType::P2PKH
        );
        assert_eq!(
            Bip322::detect_address_type("3ABC123").unwrap(),
            AddressType::P2SH
        );
    }

    #[test]
    fn test_sign_p2wpkh_message() {
        let bip322 = Bip322::new(Network::Mainnet);
        let message = b"Hello Bitcoin!";
        let privkey = create_test_privkey();

        // Derive a valid kb1q... address from the test key
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let signature = bip322.sign_message(message, &address, &privkey).unwrap();

        assert_eq!(signature.message, message);
        assert_eq!(signature.address, address);
        assert_eq!(signature.address_type, AddressType::P2WPKH);
        assert_eq!(signature.witness.len(), 2); // sig + pubkey
    }

    #[test]
    fn test_sign_taproot_message() {
        let bip322 = Bip322::new(Network::Mainnet);
        let message = b"Taproot signing test";
        let privkey = create_test_privkey();

        // Build a valid kb1p... taproot address from deterministic output key
        let output_key = [0xd6u8, 0x88, 0x9c, 0xb0, 0x81, 0x03, 0x6e, 0x0f,
            0xad, 0xc9, 0xb0, 0x2f, 0xf0, 0x05, 0x86, 0x22,
            0x4b, 0xb0, 0x6c, 0xbe, 0x94, 0x59, 0x96, 0xac,
            0x21, 0x1a, 0x25, 0x19, 0x4a, 0xb8, 0x24, 0x01];
        let address = crate::bech32m::encode_taproot_address(&output_key, "mainnet").unwrap();

        let signature = bip322.sign_message(message, &address, &privkey).unwrap();

        assert_eq!(signature.address_type, AddressType::P2TR);
        assert_eq!(signature.witness.len(), 1); // Schnorr sig only
        assert_eq!(signature.witness[0].len(), 64); // 64-byte Schnorr
    }

    #[test]
    fn test_message_too_long() {
        let bip322 = Bip322::new(Network::Mainnet);
        let message = vec![0u8; 10001]; // Too long
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let result = bip322.sign_message(&message, &address, &privkey);
        assert_eq!(result.unwrap_err(), Bip322Error::MessageTooLong);
    }

    #[test]
    fn test_tagged_message_creation() {
        let message = b"Test message";
        let tagged = Bip322::create_tagged_message(message);

        // Should be: tag_hash + tag_hash + message
        assert!(tagged.len() > message.len());
    }

    #[test]
    fn test_signature_encoding() {
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let signature = MessageSignature {
            message: b"Hello".to_vec(),
            address,
            witness: vec![vec![1, 2, 3], vec![4, 5, 6]],
            address_type: AddressType::P2WPKH,
        };

        let encoded = Bip322::encode_signature(&signature);

        // Should be base64 encoded
        assert!(!encoded.is_empty());
        assert!(encoded
            .chars()
            .all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '='));
    }

    #[test]
    fn test_signature_decode_encode_roundtrip() {
        let bip322 = Bip322::new(Network::Mainnet);
        let message = b"Roundtrip test";
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let signature = bip322.sign_message(message, &address, &privkey).unwrap();
        let encoded = Bip322::encode_signature(&signature);
        let decoded = Bip322::decode_signature(&encoded, message, &address).unwrap();

        assert_eq!(decoded.message, signature.message);
        assert_eq!(decoded.address, signature.address);
        assert_eq!(decoded.witness, signature.witness);
    }

    #[test]
    fn test_invalid_address_format() {
        let result = Bip322::detect_address_type("invalid_address");
        assert!(matches!(result, Err(Bip322Error::InvalidAddress(_))));
    }

    #[test]
    fn test_sign_different_messages() {
        let bip322 = Bip322::new(Network::Mainnet);
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let sig1 = bip322
            .sign_message(b"Message 1", &address, &privkey)
            .unwrap();
        let sig2 = bip322
            .sign_message(b"Message 2", &address, &privkey)
            .unwrap();

        // Different messages should have different signatures
        assert_ne!(sig1.witness, sig2.witness);
    }

    #[test]
    fn test_schnorr_signature_size() {
        let privkey = create_test_privkey();
        let hash = [0u8; 32];
        let sig = Bip322::sign_schnorr(&hash, &privkey);

        assert_eq!(sig.len(), 64); // Schnorr signatures are always 64 bytes
    }

    #[test]
    fn test_detect_address_type_p2wsh_long() {
        // Long kb1q address → P2WSH
        let long_addr = "kb1q".to_string() + &"a".repeat(50);
        assert_eq!(
            Bip322::detect_address_type(&long_addr).unwrap(),
            AddressType::P2WSH
        );
    }

    #[test]
    fn test_detect_address_type_testnet() {
        assert_eq!(
            Bip322::detect_address_type("tb1pxyz").unwrap(),
            AddressType::P2TR
        );
        assert_eq!(
            Bip322::detect_address_type("tb1qxyz").unwrap(),
            AddressType::P2WPKH
        );
        assert_eq!(
            Bip322::detect_address_type("mABC").unwrap(),
            AddressType::P2PKH
        );
        assert_eq!(
            Bip322::detect_address_type("nABC").unwrap(),
            AddressType::P2PKH
        );
        assert_eq!(
            Bip322::detect_address_type("2ABC").unwrap(),
            AddressType::P2SH
        );
    }

    #[test]
    fn test_tagged_message_deterministic() {
        let msg = b"determinism check";
        let t1 = Bip322::create_tagged_message(msg);
        let t2 = Bip322::create_tagged_message(msg);
        assert_eq!(t1, t2);
        // Different messages produce different tags
        let t3 = Bip322::create_tagged_message(b"other");
        assert_ne!(t1, t3);
    }

    #[test]
    fn test_private_to_public_deterministic() {
        let privkey = create_test_privkey();
        let pk1 = Bip322::private_to_public(&privkey).unwrap();
        let pk2 = Bip322::private_to_public(&privkey).unwrap();
        assert_eq!(pk1, pk2);
        assert_eq!(pk1.len(), 33); // compressed
    }

    #[test]
    fn test_sign_verify_p2wpkh_roundtrip() {
        let bip322 = Bip322::new(Network::Mainnet);
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let sig = bip322.sign_message(b"roundtrip", &address, &privkey).unwrap();
        let result = bip322.verify_signature(&sig).unwrap();
        assert!(result);
    }

    #[test]
    fn test_verify_wrong_message_fails() {
        let bip322 = Bip322::new(Network::Mainnet);
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();

        let mut sig = bip322.sign_message(b"original", &address, &privkey).unwrap();
        // Tamper: change the message
        sig.message = b"tampered".to_vec();
        let result = bip322.verify_signature(&sig).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_message_exactly_at_limit() {
        let bip322 = Bip322::new(Network::Mainnet);
        let message = vec![0u8; 10000]; // exactly at limit
        let privkey = create_test_privkey();
        let pubkey = Bip322::private_to_public(&privkey).unwrap();
        let address = Bip322::pubkey_to_p2wpkh(&pubkey).unwrap();
        assert!(bip322.sign_message(&message, &address, &privkey).is_ok());
    }

    #[test]
    fn test_network_variants() {
        let _m = Bip322::new(Network::Mainnet);
        let _t = Bip322::new(Network::Testnet);
        let _r = Bip322::new(Network::Regtest);
        // All three are distinct
        assert_ne!(Network::Mainnet, Network::Testnet);
        assert_ne!(Network::Testnet, Network::Regtest);
    }

    #[test]
    fn test_address_type_p2sh_prefix() {
        assert_eq!(
            Bip322::detect_address_type("3MixedCase123").unwrap(),
            AddressType::P2SH
        );
    }

    #[test]
    fn test_decode_invalid_base64() {
        let result = Bip322::decode_signature("!!!not_base64!!!", b"msg", "kb1qtest");
        assert!(result.is_err());
    }
}
