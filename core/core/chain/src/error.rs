//! Typed error types for the chain crate.

/// Errors produced by chain operations (UTXO database, block application).
#[derive(Debug, thiserror::Error)]
pub enum ChainError {
    /// Sled database I/O error
    #[error("database error: {0}")]
    Database(#[from] sled::Error),

    /// JSON serialization / deserialization failure
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// Bincode serialization / deserialization failure
    #[error("bincode error: {0}")]
    Bincode(String),

    /// File I/O error
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Invalid data format (e.g. wrong outpoint length)
    #[error("invalid format: {0}")]
    InvalidFormat(String),

    /// UTXO validation failure (e.g. missing input)
    #[error("validation error: {0}")]
    Validation(String),

    /// Block does not chain correctly
    #[error("chain error: {0}")]
    Chain(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_database_error() {
        // We can't easily construct a sled::Error, so test the string variants
        let e = ChainError::InvalidFormat("bad outpoint".into());
        assert!(e.to_string().contains("bad outpoint"));
    }

    #[test]
    fn display_validation_error() {
        let e = ChainError::Validation("missing input".into());
        assert!(e.to_string().contains("missing input"));
    }

    #[test]
    fn display_chain_error() {
        let e = ChainError::Chain("does not connect".into());
        assert!(e.to_string().contains("does not connect"));
    }

    #[test]
    fn display_bincode_error() {
        let e = ChainError::Bincode("decode failed".into());
        assert!(e.to_string().contains("decode failed"));
    }

    #[test]
    fn display_invalid_format_prefix() {
        let e = ChainError::InvalidFormat("wrong length".into());
        let s = e.to_string();
        assert!(s.starts_with("invalid format:"));
    }

    #[test]
    fn from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file gone");
        let chain_err: ChainError = io_err.into();
        assert!(chain_err.to_string().contains("file gone"));
    }

    #[test]
    fn debug_format_works() {
        let e = ChainError::Chain("test".into());
        let dbg = format!("{:?}", e);
        assert!(dbg.contains("Chain"));
    }
}
