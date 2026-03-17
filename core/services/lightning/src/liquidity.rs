//! Liquidity management for Lightning channels.
//!
//! Provides helpers for:
//! - Circular rebalancing (move sats between own channels)
//! - Channel balance analysis (identify unbalanced channels)
//! - Swap suggestions (submarine swaps to add/drain liquidity)
//! - Liquidity ads support (advertise/buy inbound liquidity)

use crate::channel::{Channel, ChannelState};


use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Constants ────────────────────────────────────────────────────

/// Default target balance ratio (0.5 = perfectly balanced).
pub const DEFAULT_TARGET_RATIO: f64 = 0.5;

/// Minimum channel capacity (sats) to consider for rebalancing.
pub const MIN_REBALANCE_CAPACITY: u64 = 100_000;

/// Maximum fee we're willing to pay for a rebalance, as fraction of the
/// rebalance amount.
pub const MAX_REBALANCE_FEE_RATIO: f64 = 0.01; // 1%

// ── Types ────────────────────────────────────────────────────────

/// Snapshot of a channel's liquidity state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelLiquidity {
    pub channel_id: [u8; 32],
    pub peer_node_id: String,
    pub capacity: u64,
    pub local_balance: u64,
    pub remote_balance: u64,
    /// Ratio of local balance to capacity (0.0 = all remote, 1.0 = all local).
    pub balance_ratio: f64,
}

impl ChannelLiquidity {
    /// Whether the channel is unbalanced toward the local side (excess outbound).
    pub fn is_local_heavy(&self) -> bool {
        self.balance_ratio > 0.7
    }

    /// Whether the channel is unbalanced toward the remote side (excess inbound).
    pub fn is_remote_heavy(&self) -> bool {
        self.balance_ratio < 0.3
    }
}

/// A suggested rebalance: move `amount` from `source` to `dest` via a
/// circular payment through the network.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebalanceSuggestion {
    /// Channel to drain (high local balance).
    pub source_channel_id: [u8; 32],
    /// Channel to fill (low local balance).
    pub dest_channel_id: [u8; 32],
    /// Amount to move (sats).
    pub amount: u64,
    /// Estimated routing fee (sats).
    pub estimated_fee: u64,
}

/// Liquidity ad: an offer to sell inbound capacity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidityAd {
    /// Our node ID advertising the offer.
    pub node_id: String,
    /// Amount of inbound capacity offered (sats).
    pub capacity: u64,
    /// Fee rate for the lease (ppm per block until expiry).
    pub fee_rate_ppm: u64,
    /// Lease duration in blocks.
    pub lease_blocks: u32,
}

// ── LiquidityManager ────────────────────────────────────────────

/// Analyzes channel liquidity and generates rebalancing suggestions.
pub struct LiquidityManager {
    /// Target balance ratio (default 0.5).
    pub target_ratio: f64,
    /// Own liquidity ads we are advertising.
    pub ads: Vec<LiquidityAd>,
}

impl Default for LiquidityManager {
    fn default() -> Self {
        Self {
            target_ratio: DEFAULT_TARGET_RATIO,
            ads: Vec::new(),
        }
    }
}

impl LiquidityManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_target_ratio(mut self, ratio: f64) -> Self {
        self.target_ratio = ratio.clamp(0.1, 0.9);
        self
    }

    // ── Analysis ─────────────────────────────────────────────

    /// Generate a liquidity snapshot for each open channel.
    pub fn analyze_channels(&self, channels: &HashMap<[u8; 32], Channel>) -> Vec<ChannelLiquidity> {
        channels
            .iter()
            .filter(|(_, ch)| ch.state == ChannelState::Open)
            .map(|(id, ch)| {
                let capacity = ch.capacity;
                let local = ch.local_balance;
                let remote = capacity.saturating_sub(local);
                let ratio = if capacity > 0 {
                    local as f64 / capacity as f64
                } else {
                    0.5
                };
                ChannelLiquidity {
                    channel_id: *id,
                    peer_node_id: ch.remote_pubkey.clone(),
                    capacity,
                    local_balance: local,
                    remote_balance: remote,
                    balance_ratio: ratio,
                }
            })
            .collect()
    }

    /// Generate rebalance suggestions: pair local-heavy channels with
    /// remote-heavy channels and propose circular payments.
    pub fn suggest_rebalances(
        &self,
        channels: &HashMap<[u8; 32], Channel>,
    ) -> Vec<RebalanceSuggestion> {
        let liquidity = self.analyze_channels(channels);
        let mut sources: Vec<_> = liquidity
            .iter()
            .filter(|l| l.is_local_heavy() && l.capacity >= MIN_REBALANCE_CAPACITY)
            .collect();
        let mut dests: Vec<_> = liquidity
            .iter()
            .filter(|l| l.is_remote_heavy() && l.capacity >= MIN_REBALANCE_CAPACITY)
            .collect();

        // Sort: most imbalanced first
        sources.sort_by(|a, b| b.balance_ratio.partial_cmp(&a.balance_ratio).unwrap_or(std::cmp::Ordering::Equal));
        dests.sort_by(|a, b| a.balance_ratio.partial_cmp(&b.balance_ratio).unwrap_or(std::cmp::Ordering::Equal));

        let mut suggestions = Vec::new();
        let mut si = 0;
        let mut di = 0;

        while si < sources.len() && di < dests.len() {
            let src = &sources[si];
            let dst = &dests[di];

            // How much the source can shed to reach target
            let target_local_src = (src.capacity as f64 * self.target_ratio) as u64;
            let excess = src.local_balance.saturating_sub(target_local_src);

            // How much the dest needs to reach target
            let target_local_dst = (dst.capacity as f64 * self.target_ratio) as u64;
            let deficit = target_local_dst.saturating_sub(dst.local_balance);

            let amount = excess.min(deficit).min(src.capacity / 2);
            if amount > 10_000 {
                // 10k sat minimum
                let estimated_fee = (amount as f64 * MAX_REBALANCE_FEE_RATIO) as u64;
                suggestions.push(RebalanceSuggestion {
                    source_channel_id: src.channel_id,
                    dest_channel_id: dst.channel_id,
                    amount,
                    estimated_fee,
                });
            }

            si += 1;
            di += 1;
        }

        suggestions
    }

    // ── Liquidity ads ────────────────────────────────────────

    /// Advertise inbound liquidity.
    pub fn create_ad(&mut self, node_id: String, capacity: u64, fee_rate_ppm: u64, lease_blocks: u32) -> &LiquidityAd {
        self.ads.push(LiquidityAd {
            node_id,
            capacity,
            fee_rate_ppm,
            lease_blocks,
        });
        self.ads.last().unwrap()
    }

    /// List our current liquidity ads.
    pub fn list_ads(&self) -> &[LiquidityAd] {
        &self.ads
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel::Channel;

    fn make_channel(id: [u8; 32], capacity: u64, local_balance: u64) -> Channel {
        let mut ch = Channel::new(
            id,
            [0u8; 32],
            0,
            capacity,
            local_balance,
            "local_pub".to_string(),
            "peer123".to_string(),
        );
        ch.set_open();
        ch
    }

    #[test]
    fn analyze_detects_imbalance() {
        let mut channels = HashMap::new();
        channels.insert([1u8; 32], make_channel([1u8; 32], 1_000_000, 900_000));
        channels.insert([2u8; 32], make_channel([2u8; 32], 1_000_000, 100_000));

        let mgr = LiquidityManager::new();
        let analysis = mgr.analyze_channels(&channels);
        assert_eq!(analysis.len(), 2);

        let local_heavy: Vec<_> = analysis.iter().filter(|l| l.is_local_heavy()).collect();
        let remote_heavy: Vec<_> = analysis.iter().filter(|l| l.is_remote_heavy()).collect();
        assert_eq!(local_heavy.len(), 1);
        assert_eq!(remote_heavy.len(), 1);
    }

    #[test]
    fn suggest_rebalance_pairs() {
        let mut channels = HashMap::new();
        channels.insert([1u8; 32], make_channel([1u8; 32], 1_000_000, 900_000));
        channels.insert([2u8; 32], make_channel([2u8; 32], 1_000_000, 100_000));

        let mgr = LiquidityManager::new();
        let suggestions = mgr.suggest_rebalances(&channels);
        assert!(!suggestions.is_empty());
        assert!(suggestions[0].amount > 10_000);
    }
}
