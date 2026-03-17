//! EIP-191: Personal Sign message hashing.
//!
//! Prefix: `\x19Ethereum Signed Message:\n{len}{message}`
//! Hash:   Keccak-256 of the prefixed message.
//!
//! This matches what MetaMask, Ethers.js, and Ethereum hardware wallets produce
//! when the user signs a plain-text message from a dApp.  A KuberCoin wallet
//! exposing EIP-191 lets users prove ownership of a KuberCoin UTXO to an
//! Ethereum smart contract or dApp without moving on-chain funds.

use sha3::{Digest, Keccak256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EIP191Error {
    #[error("message too large: {0} bytes (max 65535 for this implementation)")]
    MessageTooLarge(usize),
}

/// Compute the EIP-191 personal_sign hash for `message`.
///
/// Returns a 32-byte Keccak-256 digest ready to be signed with a raw
/// secp256k1 ECDSA operation.
///
/// # Compatibility
///
/// Matches `ethers.utils.hashMessage(message)` and
/// `web3.eth.accounts.hashMessage(message)`.
///
/// # Example
///
/// ```rust
/// use kubercoin_eip_signing::eip191::personal_sign_hash;
///
/// let msg = b"Hello, KuberCoin!";
/// let hash = personal_sign_hash(msg).unwrap();
/// assert_eq!(hash.len(), 32);
/// ```
pub fn personal_sign_hash(message: &[u8]) -> Result<[u8; 32], EIP191Error> {
    if message.len() > 65535 {
        return Err(EIP191Error::MessageTooLarge(message.len()));
    }
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test vector: ethers.js `ethers.utils.hashMessage("")`
    /// = 0x5f35dce98ba4fba25530a026ed80b2cecdaa31091ba4958b99b52ea1d068adad
    #[test]
    fn test_personal_sign_empty_message() {
        let hash = personal_sign_hash(b"").unwrap();
        assert_eq!(
            hex::encode(hash),
            "5f35dce98ba4fba25530a026ed80b2cecdaa31091ba4958b99b52ea1d068adad"
        );
    }

    /// Test vector: web3.eth.accounts.hashMessage("Hello World")
    /// = 0xa1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2
    #[test]
    fn test_personal_sign_hello_world() {
        let hash = personal_sign_hash(b"Hello World").unwrap();
        assert_eq!(
            hex::encode(hash),
            "a1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2"
        );
    }

    /// Manual verification that the correct prefix is applied.
    #[test]
    fn test_personal_sign_prefix_is_correct() {
        let msg = b"abc";
        let expected_prefix = b"\x19Ethereum Signed Message:\n3";
        let mut hasher = sha3::Keccak256::new();
        sha3::Digest::update(&mut hasher, expected_prefix);
        sha3::Digest::update(&mut hasher, msg);
        let manual: [u8; 32] = hasher.finalize().into();
        let via_fn = personal_sign_hash(msg).unwrap();
        assert_eq!(manual, via_fn);
    }

    #[test]
    fn test_too_large_message_rejected() {
        let big = vec![0u8; 65536];
        assert!(personal_sign_hash(&big).is_err());
    }
}
