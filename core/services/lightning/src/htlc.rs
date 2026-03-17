//! Hash Time-Locked Contract (HTLC) implementation

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{LightningError, Result};

/// HTLC direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HtlcDirection {
    /// We are sending payment
    Outgoing,
    /// We are receiving payment
    Incoming,
}

/// HTLC state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HtlcState {
    /// HTLC is pending
    Pending,
    /// HTLC is accepted
    Accepted,
    /// HTLC is fulfilled
    Fulfilled,
    /// HTLC failed
    Failed,
    /// HTLC timed out
    TimedOut,
}

/// A Hash Time-Locked Contract
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Htlc {
    /// HTLC ID (unique within channel)
    pub id: u64,
    /// Payment hash (SHA256)
    pub payment_hash: [u8; 32],
    /// Amount in satoshis
    pub amount: u64,
    /// Expiry block height
    pub expiry: u32,
    /// Direction
    pub direction: HtlcDirection,
    /// State
    pub state: HtlcState,
}

impl Htlc {
    /// Create new outgoing HTLC
    pub fn new_outgoing(id: u64, payment_hash: [u8; 32], amount: u64, expiry: u32) -> Self {
        Self {
            id,
            payment_hash,
            amount,
            expiry,
            direction: HtlcDirection::Outgoing,
            state: HtlcState::Pending,
        }
    }
    
    /// Create new incoming HTLC
    pub fn new_incoming(id: u64, payment_hash: [u8; 32], amount: u64, expiry: u32) -> Self {
        Self {
            id,
            payment_hash,
            amount,
            expiry,
            direction: HtlcDirection::Incoming,
            state: HtlcState::Pending,
        }
    }
    
    /// Verify preimage matches payment hash
    pub fn verify_preimage(&self, preimage: &[u8; 32]) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(preimage);
        let hash: [u8; 32] = hasher.finalize().into();
        hash == self.payment_hash
    }
    
    /// Fulfill HTLC with preimage
    pub fn fulfill(&mut self, preimage: &[u8; 32]) -> Result<()> {
        if !self.verify_preimage(preimage) {
            return Err(LightningError::InvalidPreimage);
        }
        self.state = HtlcState::Fulfilled;
        Ok(())
    }
    
    /// Fail the HTLC
    pub fn fail(&mut self) {
        self.state = HtlcState::Failed;
    }
    
    /// Mark as timed out
    pub fn timeout(&mut self) {
        self.state = HtlcState::TimedOut;
    }
    
    /// Check if HTLC is expired at given height
    pub fn is_expired(&self, current_height: u32) -> bool {
        current_height >= self.expiry
    }
}

/// Generate a random preimage and its hash
pub fn generate_preimage() -> ([u8; 32], [u8; 32]) {
    let preimage: [u8; 32] = rand::random();
    let mut hasher = Sha256::new();
    hasher.update(preimage);
    let hash: [u8; 32] = hasher.finalize().into();
    (preimage, hash)
}

/// Compute payment hash from preimage
pub fn hash_preimage(preimage: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(preimage);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_htlc_creation() {
        let htlc = Htlc::new_outgoing(1, [0u8; 32], 10_000, 100);
        assert_eq!(htlc.id, 1);
        assert_eq!(htlc.amount, 10_000);
        assert_eq!(htlc.direction, HtlcDirection::Outgoing);
        assert_eq!(htlc.state, HtlcState::Pending);
    }
    
    #[test]
    fn test_preimage_verification() {
        let (preimage, hash) = generate_preimage();
        let htlc = Htlc::new_outgoing(1, hash, 10_000, 100);
        
        assert!(htlc.verify_preimage(&preimage));
        assert!(!htlc.verify_preimage(&[0u8; 32]));
    }
    
    #[test]
    fn test_htlc_fulfill() {
        let (preimage, hash) = generate_preimage();
        let mut htlc = Htlc::new_outgoing(1, hash, 10_000, 100);
        
        assert!(htlc.fulfill(&preimage).is_ok());
        assert_eq!(htlc.state, HtlcState::Fulfilled);
    }
    
    #[test]
    fn test_htlc_invalid_preimage() {
        let (_, hash) = generate_preimage();
        let mut htlc = Htlc::new_outgoing(1, hash, 10_000, 100);
        
        assert!(htlc.fulfill(&[0u8; 32]).is_err());
        assert_eq!(htlc.state, HtlcState::Pending);
    }
    
    #[test]
    fn test_htlc_expiry() {
        let htlc = Htlc::new_outgoing(1, [0u8; 32], 10_000, 100);
        
        assert!(!htlc.is_expired(50));
        assert!(!htlc.is_expired(99));
        assert!(htlc.is_expired(100));
        assert!(htlc.is_expired(150));
    }
    
    #[test]
    fn test_hash_preimage() {
        let preimage = [1u8; 32];
        let hash1 = hash_preimage(&preimage);
        let hash2 = hash_preimage(&preimage);
        assert_eq!(hash1, hash2);
        
        let different_hash = hash_preimage(&[2u8; 32]);
        assert_ne!(hash1, different_hash);
    }

    #[test]
    fn test_incoming_htlc_direction() {
        let htlc = Htlc::new_incoming(42, [0u8; 32], 5_000, 200);
        assert_eq!(htlc.direction, HtlcDirection::Incoming);
        assert_eq!(htlc.id, 42);
        assert_eq!(htlc.state, HtlcState::Pending);
    }

    #[test]
    fn test_fail_sets_failed_state() {
        let mut htlc = Htlc::new_outgoing(1, [0u8; 32], 1_000, 50);
        htlc.fail();
        assert_eq!(htlc.state, HtlcState::Failed);
    }

    #[test]
    fn test_timeout_sets_timed_out_state() {
        let mut htlc = Htlc::new_outgoing(1, [0u8; 32], 1_000, 50);
        htlc.timeout();
        assert_eq!(htlc.state, HtlcState::TimedOut);
    }

    #[test]
    fn test_generate_preimage_produces_unique_values() {
        let (p1, h1) = generate_preimage();
        let (p2, h2) = generate_preimage();
        // Two random invocations are astronomically unlikely to collide
        assert_ne!(p1, p2);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_wrong_preimage_verify_returns_false() {
        let (_, hash) = generate_preimage();
        let htlc = Htlc::new_outgoing(1, hash, 1_000, 100);
        assert!(!htlc.verify_preimage(&[0u8; 32]));
    }

    #[test]
    fn test_zero_amount_does_not_panic() {
        let htlc = Htlc::new_outgoing(99, [0u8; 32], 0, 10);
        assert_eq!(htlc.amount, 0);
    }

    #[test]
    fn test_is_expired_at_exact_boundary() {
        let htlc = Htlc::new_outgoing(1, [0u8; 32], 1_000, 100);
        assert!(!htlc.is_expired(99));
        assert!(htlc.is_expired(100));
    }

    #[test]
    fn test_fulfill_wrong_preimage_state_unchanged() {
        let (_, hash) = generate_preimage();
        let mut htlc = Htlc::new_outgoing(1, hash, 5_000, 100);
        assert!(htlc.fulfill(&[0u8; 32]).is_err());
        assert_eq!(htlc.state, HtlcState::Pending);
    }
}
