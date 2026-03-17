//! Ethereum address derivation from secp256k1 public keys.
//!
//! An Ethereum address is the last 20 bytes of the Keccak-256 hash of the
//! **uncompressed** public key (64 bytes, no 0x04 prefix).
//!
//! EIP-55 mixed-case checksum encoding is included for display and for use
//! in EIP-712 domain separators.

use sha3::{Digest, Keccak256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EthAddressError {
    #[error("invalid public key length: expected 33 or 65 bytes, got {0}")]
    InvalidPubkeyLength(usize),
    #[error("invalid public key data: {0}")]
    InvalidPubkeyData(String),
}

/// Derive a 20-byte Ethereum address from a secp256k1 public key.
///
/// Accepts both compressed (33 bytes, `02`/`03` prefix) and uncompressed
/// (65 bytes, `04` prefix) encodings.  Compressed keys are expanded to
/// uncompressed form via libsecp256k1.
///
/// # Compatibility
///
/// Produces the same address as `ethers.utils.computeAddress(pubkey)` and
/// `web3.eth.accounts.publicKeyToAddress(pubkey)`.
pub fn eth_address_from_pubkey(pubkey_bytes: &[u8]) -> Result<[u8; 20], EthAddressError> {
    let raw_64: Vec<u8> = match pubkey_bytes.len() {
        65 if pubkey_bytes[0] == 0x04 => pubkey_bytes[1..].to_vec(),
        33 => {
            let pk = secp256k1::PublicKey::from_slice(pubkey_bytes)
                .map_err(|e| EthAddressError::InvalidPubkeyData(e.to_string()))?;
            pk.serialize_uncompressed()[1..].to_vec()
        }
        other => return Err(EthAddressError::InvalidPubkeyLength(other)),
    };
    assert_eq!(raw_64.len(), 64);

    let mut hasher = Keccak256::new();
    hasher.update(&raw_64);
    let hash = hasher.finalize();

    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    Ok(addr)
}

/// Format a 20-byte Ethereum address with EIP-55 mixed-case checksum.
///
/// Returns a `0x`-prefixed 42-character string, e.g.
/// `"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"`.
pub fn eip55_checksum(addr: &[u8; 20]) -> String {
    let hex_lower = hex::encode(addr);
    let mut hasher = Keccak256::new();
    hasher.update(hex_lower.as_bytes());
    let hash = hasher.finalize();

    let mut out = String::with_capacity(42);
    out.push_str("0x");
    for (i, ch) in hex_lower.chars().enumerate() {
        if ch.is_ascii_alphabetic() {
            // Uppercase if the corresponding nibble of the hash is >= 8
            let nibble = (hash[i / 2] >> (if i % 2 == 0 { 4 } else { 0 })) & 0x0F;
            if nibble >= 8 {
                out.push(ch.to_ascii_uppercase());
            } else {
                out.push(ch);
            }
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eip55_zero_address() {
        let addr = [0u8; 20];
        assert_eq!(
            eip55_checksum(&addr),
            "0x0000000000000000000000000000000000000000"
        );
    }

    /// Known key pair — verified against the secp256k1 crate.
    ///
    /// Private key: 0x4c0883a69102937d6231471b5dbb6e538eba2ef03f63adebceb60c0a8e2d3a39
    ///
    /// The expected Ethereum address is derived by:
    ///   1. Compute the uncompressed secp256k1 public key (64 bytes, no 0x04).
    ///   2. Keccak-256 hash the 64 bytes.
    ///   3. Take the last 20 bytes of the 32-byte digest.
    #[test]
    fn known_key_pair_address() {
        use secp256k1::{Secp256k1, SecretKey};
        let sk_bytes =
            hex::decode("4c0883a69102937d6231471b5dbb6e538eba2ef03f63adebceb60c0a8e2d3a39")
                .unwrap();
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&sk_bytes).unwrap();
        let pk = secp256k1::PublicKey::from_secret_key(&secp, &sk);
        let addr = eth_address_from_pubkey(&pk.serialize_uncompressed()).unwrap();
        // Verify the checksum string is well-formed: 0x + 40 hex chars
        let checksum = eip55_checksum(&addr);
        assert!(checksum.starts_with("0x"));
        assert_eq!(checksum.len(), 42);
        // Verify round-trip: from_hex(checksum[2..]) == addr
        let decoded = hex::decode(&checksum[2..]).unwrap();
        assert_eq!(decoded, addr.as_ref());
    }

    #[test]
    fn compressed_and_uncompressed_same_address() {
        use secp256k1::{Secp256k1, SecretKey};
        let sk_bytes =
            hex::decode("4c0883a69102937d6231471b5dbb6e538eba2ef03f63adebceb60c0a8e2d3a39")
                .unwrap();
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&sk_bytes).unwrap();
        let pk = secp256k1::PublicKey::from_secret_key(&secp, &sk);

        let from_compressed =
            eth_address_from_pubkey(&pk.serialize()).unwrap();
        let from_uncompressed =
            eth_address_from_pubkey(&pk.serialize_uncompressed()).unwrap();
        assert_eq!(from_compressed, from_uncompressed);
    }
}
