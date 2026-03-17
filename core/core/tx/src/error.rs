//! Typed errors for core transaction operations.
//!
//! Covers key parsing, address decoding, script execution,
//! multisig validation, and P2SH verification.

use thiserror::Error;

/// Errors produced by core transaction operations.
#[derive(Debug, Error)]
pub enum TxError {
    /// Invalid private or public key (wraps secp256k1 error).
    #[error("invalid key: {0}")]
    InvalidKey(#[from] secp256k1::Error),

    /// Address encoding / decoding failure.
    #[error("invalid address: {0}")]
    InvalidAddress(String),

    /// Input or output index out of range.
    #[error("index out of bounds: {0}")]
    IndexOutOfBounds(String),

    /// Serialization / deserialization failure.
    #[error("serialization error: {0}")]
    Serialization(String),

    /// Script execution or validation failure.
    #[error("script error: {0}")]
    Script(String),

    /// Multisig configuration or verification failure.
    #[error("multisig error: {0}")]
    Multisig(String),

    /// P2SH verification failure.
    #[error("P2SH error: {0}")]
    P2sh(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_variants() {
        let e = TxError::InvalidAddress("bad checksum".into());
        assert!(e.to_string().contains("bad checksum"));

        let e = TxError::Script("stack overflow".into());
        assert!(e.to_string().contains("stack overflow"));

        let e = TxError::Multisig("too many keys".into());
        assert!(e.to_string().contains("too many keys"));

        let e = TxError::P2sh("hash mismatch".into());
        assert!(e.to_string().contains("hash mismatch"));

        let e = TxError::IndexOutOfBounds("input 5 of 3".into());
        assert!(e.to_string().contains("input 5 of 3"));

        let e = TxError::Serialization("bincode failed".into());
        assert!(e.to_string().contains("bincode failed"));
    }

    #[test]
    fn from_secp256k1_error() {
        // Trigger a real secp256k1 error by parsing invalid key bytes
        let bad_key = [0u8; 32];
        let err = secp256k1::SecretKey::from_slice(&bad_key).unwrap_err();
        let tx_err: TxError = err.into();
        assert!(tx_err.to_string().contains("invalid key"));
    }

    // ── Phase 7 hardening ──

    #[test]
    fn display_prefix_invalid_address() {
        let e = TxError::InvalidAddress("xyz".into());
        assert!(e.to_string().starts_with("invalid address:"));
    }

    #[test]
    fn display_prefix_index_out_of_bounds() {
        let e = TxError::IndexOutOfBounds("5 of 3".into());
        assert!(e.to_string().starts_with("index out of bounds:"));
    }

    #[test]
    fn display_prefix_serialization() {
        let e = TxError::Serialization("corrupt".into());
        assert!(e.to_string().starts_with("serialization error:"));
    }

    #[test]
    fn display_prefix_script() {
        let e = TxError::Script("bad opcode".into());
        assert!(e.to_string().starts_with("script error:"));
    }

    #[test]
    fn display_prefix_multisig() {
        let e = TxError::Multisig("threshold".into());
        assert!(e.to_string().starts_with("multisig error:"));
    }

    #[test]
    fn display_prefix_p2sh() {
        let e = TxError::P2sh("mismatch".into());
        assert!(e.to_string().starts_with("P2SH error:"));
    }

    #[test]
    fn debug_format_contains_variant_name() {
        let e = TxError::Script("test".into());
        let dbg = format!("{:?}", e);
        assert!(dbg.contains("Script"));
    }
}
