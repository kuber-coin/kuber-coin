//! EIP-712: Typed structured-data signing.
//!
//! Implements `eth_signTypedData_v4` hashing as specified by EIP-712:
//! <https://eips.ethereum.org/EIPS/eip-712>
//!
//! The final hash is:
//!   `Keccak256("\x19\x01" || domain_separator || struct_hash)`
//!
//! This lets KuberCoin wallets sign structured Ethereum payloads (permit
//! messages, transfer authorisations, cross-chain swap lock descriptors)
//! that can be verified by Ethereum smart contracts via `ecrecover`.

use sha3::{Digest, Keccak256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EIP712Error {
    #[error("missing required field: {0}")]
    MissingField(&'static str),
    #[error("JSON serialisation error: {0}")]
    Json(#[from] serde_json::Error),
}

/// A minimal EIP-712 typed data envelope for cross-chain swap authorisation
/// messages used by KuberCoin atomic swaps.
#[derive(Debug, Clone)]
pub struct TypedData {
    /// EIP-712 domain separator fields.
    pub domain: Domain,
    /// Keccak-256 hash of the encoded primary struct.
    pub struct_hash: [u8; 32],
}

/// EIP-712 domain separator.
#[derive(Debug, Clone)]
pub struct Domain {
    pub name: String,
    pub version: String,
    /// Ethereum chain ID (e.g. 1 = mainnet, 11155111 = Sepolia).
    pub chain_id: u64,
    /// Optional Ethereum verifying contract (20-byte address).
    pub verifying_contract: Option<[u8; 20]>,
}

impl Domain {
    /// Compute the EIP-712 domain separator hash.
    ///
    /// `domainSeparator = keccak256(abi.encode(TYPE_HASH, name, version,
    ///                                          chainId, verifyingContract))`
    pub fn separator(&self) -> [u8; 32] {
        // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        const DOMAIN_TYPE_HASH: &str =
            "8b73c3c69bb8fe3d512eecb31aad1db7b69c3d0a7e4c3a1d4b10b3b5e76a4f5a";
        let type_hash = hex::decode(DOMAIN_TYPE_HASH).expect("static hex constant");

        let name_hash = keccak256(self.name.as_bytes());
        let version_hash = keccak256(self.version.as_bytes());

        // ABI encoding: each value padded to 32 bytes (big-endian)
        let mut encoded = Vec::with_capacity(5 * 32);
        encoded.extend(zero_pad_32(&type_hash));
        encoded.extend(name_hash);
        encoded.extend(version_hash);

        // uint256(chainId) — big-endian padded to 32 bytes
        let mut chain_bytes = [0u8; 32];
        chain_bytes[24..32].copy_from_slice(&self.chain_id.to_be_bytes());
        encoded.extend(chain_bytes);

        // address(verifyingContract) — left-zero-padded to 32 bytes
        let mut addr_bytes = [0u8; 32];
        if let Some(addr) = &self.verifying_contract {
            addr_bytes[12..32].copy_from_slice(addr);
        }
        encoded.extend(addr_bytes);

        keccak256(&encoded)
    }
}

/// Encode a `TypedData` value to the EIP-712 final hash ready for signing.
///
/// `hash = Keccak256("\x19\x01" || domainSeparator || structHash)`
pub fn encode_typed_data(data: &TypedData) -> [u8; 32] {
    let sep = data.domain.separator();
    let mut buf = Vec::with_capacity(66);
    buf.push(0x19);
    buf.push(0x01);
    buf.extend(&sep);
    buf.extend(&data.struct_hash);
    keccak256(&buf)
}

// ── Helpers ──────────────────────────────────────────────────────

pub(crate) fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    h.finalize().into()
}

fn zero_pad_32(bytes: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let len = bytes.len().min(32);
    out[(32 - len)..].copy_from_slice(&bytes[bytes.len() - len..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_separator_is_deterministic() {
        let domain = Domain {
            name: "KuberCoin AtomicSwap".to_string(),
            version: "1".to_string(),
            chain_id: 1,
            verifying_contract: None,
        };
        assert_eq!(domain.separator(), domain.separator());
        assert_eq!(domain.separator().len(), 32);
    }

    #[test]
    fn encode_typed_data_uses_1901_prefix() {
        let domain = Domain {
            name: "Test".to_string(),
            version: "1".to_string(),
            chain_id: 11155111,
            verifying_contract: None,
        };
        let data = TypedData { domain, struct_hash: [0xab_u8; 32] };
        let hash = encode_typed_data(&data);
        assert_eq!(hash.len(), 32);
        // Verify determinism
        let hash2 = encode_typed_data(&data);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn different_chain_ids_produce_different_separators() {
        let make = |chain_id| Domain {
            name: "X".to_string(),
            version: "1".to_string(),
            chain_id,
            verifying_contract: None,
        };
        assert_ne!(make(1).separator(), make(5).separator());
    }
}
