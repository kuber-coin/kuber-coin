use serde::{Deserialize, Serialize};
use std::fmt;

/// Reference to a transaction output (txid + index)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OutPoint {
    /// Transaction ID containing the output
    pub txid: [u8; 32],

    /// Index of the output in that transaction
    pub vout: u32,
}

impl OutPoint {
    /// Create a new outpoint
    pub fn new(txid: [u8; 32], vout: u32) -> Self {
        Self { txid, vout }
    }

    /// Create a null outpoint (used for coinbase)
    pub fn null() -> Self {
        Self {
            txid: [0u8; 32],
            vout: 0xffffffff,
        }
    }

    /// Check if this is a null outpoint
    pub fn is_null(&self) -> bool {
        self.txid == [0u8; 32] && self.vout == 0xffffffff
    }
}

impl fmt::Display for OutPoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", hex::encode(self.txid), self.vout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_outpoint_creation() {
        let txid = [1u8; 32];
        let outpoint = OutPoint::new(txid, 0);

        assert_eq!(outpoint.txid, txid);
        assert_eq!(outpoint.vout, 0);
    }

    #[test]
    fn test_null_outpoint() {
        let null = OutPoint::null();
        assert!(null.is_null());

        let non_null = OutPoint::new([1u8; 32], 0);
        assert!(!non_null.is_null());
    }

    #[test]
    fn test_outpoint_equality() {
        let op1 = OutPoint::new([1u8; 32], 0);
        let op2 = OutPoint::new([1u8; 32], 0);
        let op3 = OutPoint::new([1u8; 32], 1);

        assert_eq!(op1, op2);
        assert_ne!(op1, op3);
    }

    #[test]
    fn test_outpoint_hash() {
        use std::collections::HashSet;

        let op1 = OutPoint::new([1u8; 32], 0);
        let op2 = OutPoint::new([1u8; 32], 0);

        let mut set = HashSet::new();
        set.insert(op1);
        assert!(set.contains(&op2));
    }

    #[test]
    fn test_null_vout_is_max_u32() {
        assert_eq!(OutPoint::null().vout, 0xffffffff);
    }

    #[test]
    fn test_null_txid_is_all_zeros() {
        assert_eq!(OutPoint::null().txid, [0u8; 32]);
    }

    #[test]
    fn test_zero_vout_all_zeros_txid_not_null() {
        // null requires vout == 0xffffffff; vout=0 is NOT null even if txid is zeros
        let op = OutPoint::new([0u8; 32], 0);
        assert!(!op.is_null());
    }

    #[test]
    fn test_display_contains_colon() {
        let op = OutPoint::new([0u8; 32], 3);
        let s = format!("{op}");
        assert!(s.contains(':'), "display must have colon separator: {s}");
        assert!(s.ends_with(":3"), "display must end with vout: {s}");
    }

    #[test]
    fn test_different_txids_not_equal() {
        let op1 = OutPoint::new([0u8; 32], 0);
        let op2 = OutPoint::new([1u8; 32], 0);
        assert_ne!(op1, op2);
    }

    #[test]
    fn test_copy_semantics() {
        let op1 = OutPoint::new([5u8; 32], 7);
        let op2 = op1; // Copy
        assert_eq!(op1, op2);
    }
}
