//! Basic watchtower for Lightning channel breach detection and response.
//!
//! Monitors the blockchain for revoked commitment transactions and
//! constructs justice (penalty) transactions to reclaim stolen funds.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use crate::{LightningError, Result};

/// A revoked commitment state that the watchtower monitors for.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevokedState {
    /// Channel ID
    pub channel_id: [u8; 32],
    /// Commitment number that was revoked
    pub commitment_number: u64,
    /// The revocation secret (preimage) for this commitment
    pub revocation_secret: [u8; 32],
    /// The expected txid of the revoked commitment tx (if known)
    pub revoked_txid: Option<[u8; 32]>,
    /// Our pubkey for the justice output
    pub sweep_pubkey: Vec<u8>,
    /// Amount we can claim in a justice tx (satoshis)
    pub penalty_amount: u64,
}

/// Justice transaction details for responding to a breach
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JusticeTx {
    /// The revoked commitment's txid being punished
    pub revoked_txid: [u8; 32],
    /// Output index in the revoked commitment tx to sweep
    pub revoked_vout: u32,
    /// The revocation secret used to claim
    pub revocation_secret: [u8; 32],
    /// Where to send the swept funds
    pub sweep_pubkey: Vec<u8>,
    /// Amount being swept
    pub amount: u64,
    /// Fee for the justice tx
    pub fee: u64,
}

/// Breach detection result
#[derive(Debug, Clone)]
pub struct BreachDetection {
    /// Channel that was breached
    pub channel_id: [u8; 32],
    /// The commitment number that was broadcast
    pub commitment_number: u64,
    /// The revoked txid found on-chain
    pub revoked_txid: [u8; 32],
}

/// Watchtower that monitors channels for breaches.
#[derive(Debug, Default)]
pub struct Watchtower {
    /// Channel ID -> list of revoked states to watch for
    revoked_states: HashMap<[u8; 32], Vec<RevokedState>>,
    /// Txid hints -> channel ID for fast lookup (first 16 bytes of hash)
    txid_index: HashMap<[u8; 16], [u8; 32]>,
    /// Number of breaches detected
    pub breaches_detected: u64,
}

impl Watchtower {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a revoked commitment state for monitoring.
    ///
    /// Called when the remote party provides a revocation secret during
    /// normal channel operation (RevokeAndAck message).
    pub fn register_revoked_state(&mut self, state: RevokedState) {
        let channel_id = state.channel_id;

        // Build txid hint index for fast breach detection
        if let Some(txid) = &state.revoked_txid {
            let mut hint = [0u8; 16];
            hint.copy_from_slice(&txid[..16]);
            self.txid_index.insert(hint, channel_id);
        }

        self.revoked_states
            .entry(channel_id)
            .or_default()
            .push(state);
    }

    /// Check if a transaction is a revoked commitment for any watched channel.
    ///
    /// `txid`: the transaction ID found on-chain  
    /// Returns breach details if the tx matches a revoked state.
    pub fn check_transaction(&self, txid: &[u8; 32]) -> Option<BreachDetection> {
        // Fast path: check the txid hint index
        let mut hint = [0u8; 16];
        hint.copy_from_slice(&txid[..16]);
        if let Some(channel_id) = self.txid_index.get(&hint) {
            if let Some(states) = self.revoked_states.get(channel_id) {
                for state in states {
                    if state.revoked_txid.as_ref() == Some(txid) {
                        return Some(BreachDetection {
                            channel_id: *channel_id,
                            commitment_number: state.commitment_number,
                            revoked_txid: *txid,
                        });
                    }
                }
            }
        }

        // Slow path: scan all channels (handles cases without txid hints)
        for (channel_id, states) in &self.revoked_states {
            for state in states {
                if state.revoked_txid.as_ref() == Some(txid) {
                    return Some(BreachDetection {
                        channel_id: *channel_id,
                        commitment_number: state.commitment_number,
                        revoked_txid: *txid,
                    });
                }
            }
        }

        None
    }

    /// Construct a justice transaction to penalize a breach.
    ///
    /// `breach`: the detected breach  
    /// `revoked_vout`: the output index to sweep  
    /// `fee`: on-chain fee for the justice tx  
    pub fn build_justice_tx(
        &mut self,
        breach: &BreachDetection,
        revoked_vout: u32,
        fee: u64,
    ) -> Result<JusticeTx> {
        let states = self
            .revoked_states
            .get(&breach.channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(breach.channel_id)))?;

        let state = states
            .iter()
            .find(|s| s.commitment_number == breach.commitment_number)
            .ok_or_else(|| {
                LightningError::PaymentFailed("revoked state not found for commitment".into())
            })?;

        if state.penalty_amount <= fee {
            return Err(LightningError::PaymentFailed(
                "penalty amount does not cover fee".into(),
            ));
        }

        self.breaches_detected += 1;

        Ok(JusticeTx {
            revoked_txid: breach.revoked_txid,
            revoked_vout,
            revocation_secret: state.revocation_secret,
            sweep_pubkey: state.sweep_pubkey.clone(),
            amount: state.penalty_amount.saturating_sub(fee),
            fee,
        })
    }

    /// Remove all revoked states for a closed channel.
    pub fn remove_channel(&mut self, channel_id: &[u8; 32]) {
        if let Some(states) = self.revoked_states.remove(channel_id) {
            for state in &states {
                if let Some(txid) = &state.revoked_txid {
                    let mut hint = [0u8; 16];
                    hint.copy_from_slice(&txid[..16]);
                    self.txid_index.remove(&hint);
                }
            }
        }
    }

    /// Get number of channels being watched.
    pub fn watched_channels(&self) -> usize {
        self.revoked_states.len()
    }

    /// Get total number of revoked states being monitored.
    pub fn total_revoked_states(&self) -> usize {
        self.revoked_states.values().map(|v| v.len()).sum()
    }

    /// Compute the revocation hash for a given secret (for verification).
    pub fn revocation_hash(secret: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(secret);
        hasher.finalize().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_revoked_state(channel_id: [u8; 32], commitment: u64, txid: [u8; 32]) -> RevokedState {
        RevokedState {
            channel_id,
            commitment_number: commitment,
            revocation_secret: [commitment as u8; 32],
            revoked_txid: Some(txid),
            sweep_pubkey: vec![0x02; 33],
            penalty_amount: 500_000,
        }
    }

    #[test]
    fn test_register_and_detect_breach() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];
        let revoked_txid = [0xAA; 32];

        wt.register_revoked_state(make_revoked_state(channel_id, 5, revoked_txid));

        assert_eq!(wt.watched_channels(), 1);
        assert_eq!(wt.total_revoked_states(), 1);

        // Detect the breach
        let breach = wt.check_transaction(&revoked_txid);
        assert!(breach.is_some());
        let b = breach.unwrap();
        assert_eq!(b.channel_id, channel_id);
        assert_eq!(b.commitment_number, 5);
    }

    #[test]
    fn test_no_false_positive() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];
        let revoked_txid = [0xAA; 32];
        wt.register_revoked_state(make_revoked_state(channel_id, 5, revoked_txid));

        // Different txid should not trigger breach
        let innocent_txid = [0xBB; 32];
        assert!(wt.check_transaction(&innocent_txid).is_none());
    }

    #[test]
    fn test_build_justice_tx() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];
        let revoked_txid = [0xAA; 32];
        wt.register_revoked_state(make_revoked_state(channel_id, 5, revoked_txid));

        let breach = wt.check_transaction(&revoked_txid).unwrap();
        let justice = wt.build_justice_tx(&breach, 0, 1_000).unwrap();

        assert_eq!(justice.revoked_txid, revoked_txid);
        assert_eq!(justice.revoked_vout, 0);
        assert_eq!(justice.amount, 499_000); // 500_000 - 1_000
        assert_eq!(justice.fee, 1_000);
        assert_eq!(wt.breaches_detected, 1);
    }

    #[test]
    fn test_justice_tx_insufficient_penalty() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];
        let revoked_txid = [0xAA; 32];
        wt.register_revoked_state(make_revoked_state(channel_id, 5, revoked_txid));

        let breach = wt.check_transaction(&revoked_txid).unwrap();
        // Fee exceeds penalty amount
        let result = wt.build_justice_tx(&breach, 0, 600_000);
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_channel() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];
        let revoked_txid = [0xAA; 32];
        wt.register_revoked_state(make_revoked_state(channel_id, 5, revoked_txid));

        wt.remove_channel(&channel_id);
        assert_eq!(wt.watched_channels(), 0);
        assert!(wt.check_transaction(&revoked_txid).is_none());
    }

    #[test]
    fn test_multiple_revoked_states() {
        let mut wt = Watchtower::new();
        let channel_id = [1u8; 32];

        for i in 0..5u8 {
            let mut txid = [0u8; 32];
            txid[0] = i;
            wt.register_revoked_state(make_revoked_state(channel_id, i as u64, txid));
        }

        assert_eq!(wt.total_revoked_states(), 5);

        // Each should be detectable
        for i in 0..5u8 {
            let mut txid = [0u8; 32];
            txid[0] = i;
            assert!(wt.check_transaction(&txid).is_some());
        }
    }

    #[test]
    fn test_revocation_hash() {
        let secret = [42u8; 32];
        let hash = Watchtower::revocation_hash(&secret);
        // Verify it's deterministic
        assert_eq!(hash, Watchtower::revocation_hash(&secret));
        // Verify different secrets produce different hashes
        let secret2 = [43u8; 32];
        assert_ne!(hash, Watchtower::revocation_hash(&secret2));
    }
}
