//! Payment channel management

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::htlc::Htlc;
use crate::{LightningError, Result};

/// Channel state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChannelState {
    /// Channel is being negotiated
    Pending,
    /// Channel is open and operational
    Open,
    /// Channel is being cooperatively closed
    Closing,
    /// Channel was force-closed
    ForceClosing,
    /// Channel is closed
    Closed,
}

/// Channel configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    /// Minimum HTLC value in satoshis
    pub min_htlc_value: u64,
    /// Maximum HTLC value in satoshis
    pub max_htlc_value: u64,
    /// Maximum number of in-flight HTLCs
    pub max_htlc_count: usize,
    /// Channel reserve (satoshis to keep uncommitted)
    pub channel_reserve: u64,
    /// HTLC timeout in blocks
    pub htlc_timeout_blocks: u32,
    /// Whether anchor outputs are enabled (BOLT-3 option_anchors)
    #[serde(default)]
    pub anchor_outputs: bool,
}

impl Default for ChannelConfig {
    fn default() -> Self {
        Self {
            min_htlc_value: 1_000,          // 1000 satoshis
            max_htlc_value: 100_000_000,     // 1 coin
            max_htlc_count: 30,
            channel_reserve: 10_000,         // 10k satoshis
            htlc_timeout_blocks: 144,        // ~1 day
            anchor_outputs: true,            // default enabled per modern spec
        }
    }
}

/// A payment channel between two parties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    /// Unique channel identifier
    pub channel_id: [u8; 32],
    /// Funding transaction ID
    pub funding_txid: [u8; 32],
    /// Funding output index
    pub funding_vout: u32,
    /// Total channel capacity
    pub capacity: u64,
    /// Local balance
    pub local_balance: u64,
    /// Remote balance
    pub remote_balance: u64,
    /// Channel state
    pub state: ChannelState,
    /// Channel configuration
    pub config: ChannelConfig,
    /// Pending HTLCs
    pub pending_htlcs: VecDeque<Htlc>,
    /// Commitment number
    pub commitment_number: u64,
    /// Local pubkey (hex)
    pub local_pubkey: String,
    /// Remote pubkey (hex)
    pub remote_pubkey: String,
    /// Current feerate (satoshis per kilo-weight)
    pub feerate_per_kw: u32,
}

impl Channel {
    /// Create a new channel
    pub fn new(
        channel_id: [u8; 32],
        funding_txid: [u8; 32],
        funding_vout: u32,
        capacity: u64,
        local_balance: u64,
        local_pubkey: String,
        remote_pubkey: String,
    ) -> Self {
        // Clamp local_balance to capacity to prevent underflow
        let local = local_balance.min(capacity);
        Self {
            channel_id,
            funding_txid,
            funding_vout,
            capacity,
            local_balance: local,
            remote_balance: capacity.saturating_sub(local),
            state: ChannelState::Pending,
            config: ChannelConfig::default(),
            pending_htlcs: VecDeque::new(),
            commitment_number: 0,
            local_pubkey,
            remote_pubkey,
            feerate_per_kw: 253, // minimum relay feerate
        }
    }
    
    /// Mark channel as open
    pub fn set_open(&mut self) {
        self.state = ChannelState::Open;
    }
    
    /// Check if channel can accept HTLC
    pub fn can_add_htlc(&self, amount: u64) -> bool {
        self.state == ChannelState::Open
            && amount >= self.config.min_htlc_value
            && amount <= self.config.max_htlc_value
            && self.pending_htlcs.len() < self.config.max_htlc_count
            && amount.checked_add(self.config.channel_reserve)
                .map_or(false, |required| self.local_balance >= required)
    }
    
    /// Add an outgoing HTLC
    pub fn add_htlc(&mut self, htlc: Htlc) -> Result<()> {
        if !self.can_add_htlc(htlc.amount) {
            return Err(LightningError::InsufficientBalance);
        }
        
        self.local_balance = self.local_balance
            .checked_sub(htlc.amount)
            .ok_or(LightningError::InsufficientBalance)?;
        self.pending_htlcs.push_back(htlc);
        self.commitment_number = self.commitment_number.saturating_add(1);
        
        Ok(())
    }
    
    /// Fulfill an HTLC with preimage
    pub fn fulfill_htlc(&mut self, payment_hash: &[u8; 32], preimage: &[u8; 32]) -> Result<u64> {
        let pos = self.pending_htlcs.iter().position(|h| &h.payment_hash == payment_hash)
            .ok_or_else(|| LightningError::InvalidHtlc("HTLC not found".to_string()))?;
        
        // Verify preimage matches payment hash before fulfilling
        if !self.pending_htlcs[pos].verify_preimage(preimage) {
            return Err(LightningError::InvalidPreimage);
        }
        
        let htlc = self.pending_htlcs.remove(pos).unwrap();
        self.remote_balance = self.remote_balance.saturating_add(htlc.amount);
        self.commitment_number = self.commitment_number.saturating_add(1);
        
        Ok(htlc.amount)
    }
    
    /// Fail an HTLC
    pub fn fail_htlc(&mut self, payment_hash: &[u8; 32]) -> Result<u64> {
        let pos = self.pending_htlcs.iter().position(|h| &h.payment_hash == payment_hash)
            .ok_or_else(|| LightningError::InvalidHtlc("HTLC not found".to_string()))?;
        
        let htlc = self.pending_htlcs.remove(pos).unwrap();
        self.local_balance = self.local_balance.saturating_add(htlc.amount);
        self.commitment_number = self.commitment_number.saturating_add(1);
        
        Ok(htlc.amount)
    }
    
    /// Update the channel feerate (only the funder can do this).
    ///
    /// Validates that the new feerate is within acceptable bounds.
    pub fn update_fee(&mut self, new_feerate_per_kw: u32) -> Result<()> {
        if self.state != ChannelState::Open {
            return Err(LightningError::ChannelClosed);
        }
        // Minimum feerate is 253 sat/kw (Bitcoin Core's min relay fee)
        if new_feerate_per_kw < 253 {
            return Err(LightningError::InvalidHtlc(
                format!("feerate {} below minimum 253", new_feerate_per_kw),
            ));
        }
        // Don't accept more than 10x increase in a single update
        if new_feerate_per_kw > self.feerate_per_kw.saturating_mul(10) {
            return Err(LightningError::InvalidHtlc(
                "feerate increase too large".into(),
            ));
        }
        self.feerate_per_kw = new_feerate_per_kw;
        self.commitment_number = self.commitment_number.saturating_add(1);
        Ok(())
    }

    /// Anchor output value per BOLT-3 (330 satoshis).
    pub const ANCHOR_OUTPUT_VALUE: u64 = 330;

    /// Return the number of anchor outputs for this channel (0 or 2).
    pub fn anchor_output_count(&self) -> usize {
        if self.config.anchor_outputs { 2 } else { 0 }
    }

    /// Calculate the weight overhead added by anchor outputs.
    /// Each anchor output is ~43 vbytes (P2WSH anyone-can-spend after 16 blocks CSV).
    pub fn anchor_weight(&self) -> u64 {
        self.anchor_output_count() as u64 * 172 // 43 vbytes * 4 = 172 weight units
    }

    /// Effective capacity after reserving anchor output values.
    pub fn effective_capacity(&self) -> u64 {
        let anchor_cost = Self::ANCHOR_OUTPUT_VALUE * self.anchor_output_count() as u64;
        self.capacity.saturating_sub(anchor_cost)
    }

    /// Initiate cooperative close
    pub fn initiate_close(&mut self) {
        self.state = ChannelState::Closing;
    }
    
    /// Force close the channel
    pub fn force_close(&mut self) {
        self.state = ChannelState::ForceClosing;
    }
    
    /// Get channel ID as hex string
    pub fn id_hex(&self) -> String {
        hex::encode(self.channel_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn create_test_channel() -> Channel {
        Channel::new(
            [1u8; 32],
            [2u8; 32],
            0,
            1_000_000,
            500_000,
            "local_pub".to_string(),
            "remote_pub".to_string(),
        )
    }
    
    #[test]
    fn test_channel_creation() {
        let channel = create_test_channel();
        assert_eq!(channel.capacity, 1_000_000);
        assert_eq!(channel.local_balance, 500_000);
        assert_eq!(channel.remote_balance, 500_000);
        assert_eq!(channel.state, ChannelState::Pending);
    }
    
    #[test]
    fn test_channel_open() {
        let mut channel = create_test_channel();
        channel.set_open();
        assert_eq!(channel.state, ChannelState::Open);
    }
    
    #[test]
    fn test_can_add_htlc() {
        let mut channel = create_test_channel();
        channel.set_open();
        
        // Valid HTLC
        assert!(channel.can_add_htlc(10_000));
        
        // Too small
        assert!(!channel.can_add_htlc(100));
        
        // Too large
        assert!(!channel.can_add_htlc(600_000));
    }
    
    #[test]
    fn test_channel_close() {
        let mut channel = create_test_channel();
        channel.set_open();
        
        channel.initiate_close();
        assert_eq!(channel.state, ChannelState::Closing);
    }
    
    #[test]
    fn test_constructor_clamps_local_balance() {
        // local_balance > capacity → should be clamped
        let ch = Channel::new([1u8;32],[2u8;32],0, 1_000, 5_000, "l".into(), "r".into());
        assert_eq!(ch.local_balance, 1_000);
        assert_eq!(ch.remote_balance, 0);
    }
    
    #[test]
    fn test_can_add_htlc_overflow_guard() {
        // amount + channel_reserve would overflow u64 → should return false
        let mut ch = Channel::new([1u8;32],[2u8;32],0, u64::MAX, u64::MAX, "l".into(), "r".into());
        ch.set_open();
        assert!(!ch.can_add_htlc(u64::MAX));
    }
    
    #[test]
    fn test_add_htlc_checked_sub() {
        let mut ch = create_test_channel();
        ch.set_open();
        // Attempt HTLC larger than balance (but within reserve bounds) must fail
        let htlc = Htlc::new_outgoing(1, [9u8;32], 600_000, 100);
        assert!(ch.add_htlc(htlc).is_err());
    }

    #[test]
    fn test_fulfill_htlc_updates_balances() {
        use sha2::{Digest, Sha256};
        let mut ch = create_test_channel();
        ch.set_open();
        let preimage = [5u8; 32];
        let hash: [u8; 32] = Sha256::digest(preimage).into();
        let htlc = Htlc::new_outgoing(1, hash, 50_000, 100);
        ch.add_htlc(htlc).unwrap();
        let remote_before = ch.remote_balance;
        let amount = ch.fulfill_htlc(&hash, &preimage).unwrap();
        assert_eq!(amount, 50_000);
        assert_eq!(ch.remote_balance, remote_before + 50_000);
        assert!(ch.pending_htlcs.is_empty());
    }

    #[test]
    fn test_fail_htlc_restores_local_balance() {
        use sha2::{Digest, Sha256};
        let mut ch = create_test_channel();
        ch.set_open();
        let preimage = [6u8; 32];
        let hash: [u8; 32] = Sha256::digest(preimage).into();
        let htlc = Htlc::new_outgoing(2, hash, 20_000, 100);
        ch.add_htlc(htlc).unwrap();
        let local_before = ch.local_balance;
        ch.fail_htlc(&hash).unwrap();
        assert_eq!(ch.local_balance, local_before + 20_000);
    }

    #[test]
    fn test_update_fee_valid() {
        let mut ch = create_test_channel();
        ch.set_open();
        assert!(ch.update_fee(500).is_ok());
        assert_eq!(ch.feerate_per_kw, 500);
    }

    #[test]
    fn test_update_fee_below_minimum_fails() {
        let mut ch = create_test_channel();
        ch.set_open();
        // Minimum is 253 sat/kw per Bitcoin Core relay policy
        assert!(ch.update_fee(252).is_err());
    }

    #[test]
    fn test_effective_capacity_accounts_for_anchors() {
        let ch = create_test_channel();
        // anchor_outputs=true by default => 2 anchors x 330 sat = 660 sat reserved
        let expected = ch.capacity - 2 * Channel::ANCHOR_OUTPUT_VALUE;
        assert_eq!(ch.effective_capacity(), expected);
    }

    #[test]
    fn test_id_hex_is_64_char_lowercase() {
        let ch = create_test_channel(); // channel_id = [1u8; 32]
        let hex_str = ch.id_hex();
        assert_eq!(hex_str.len(), 64);
        assert!(hex_str.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
        assert_eq!(hex_str, "01".repeat(32));
    }

    #[test]
    fn test_force_close_sets_force_closing_state() {
        let mut ch = create_test_channel();
        ch.set_open();
        ch.force_close();
        assert_eq!(ch.state, ChannelState::ForceClosing);
    }

    #[test]
    fn test_can_add_htlc_requires_open_state() {
        // Channel starts in Pending state — HTLCs must not be accepted
        let ch = create_test_channel();
        assert!(!ch.can_add_htlc(10_000));
    }
}
