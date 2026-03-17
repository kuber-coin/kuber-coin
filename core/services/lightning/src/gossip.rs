//! Gossip relay — processes inbound BOLT-07 gossip messages and keeps the
//! network graph up to date.  Also relays valid gossip to connected peers.

use crate::messages::{
    ChannelAnnouncementMsg, ChannelUpdateMsg, LightningMessage, NodeAnnouncementMsg,
};
use crate::routing::{GraphChannel, GraphNode, NetworkGraph};
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::debug;

// ── Constants ────────────────────────────────────────────────────

/// Maximum age (in seconds) of a gossip message before we discard it.
const MAX_GOSSIP_AGE_SECS: u64 = 14 * 24 * 3600; // 2 weeks

/// Maximum number of relay entries kept in the seen-set (memory cap).
const MAX_SEEN_SET: usize = 100_000;

/// Convert a u64 short_channel_id to a [u8; 32] for use as graph key.
fn scid_to_bytes(scid: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[..8].copy_from_slice(&scid.to_be_bytes());
    out
}

// ── GossipRelay ──────────────────────────────────────────────────

/// Stateful gossip processor that maintains a seen-set to prevent
/// duplicate relay and applies valid gossip to the network graph.
pub struct GossipRelay {
    /// (short_channel_id hash || node_id prefix) -> already seen.
    seen: HashSet<[u8; 32]>,
    /// Timestamp filter: only forward gossip newer than this.
    first_timestamp: u64,
    /// Timestamp range beyond first_timestamp to accept.
    timestamp_range: u64,
}

impl Default for GossipRelay {
    fn default() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Self {
            seen: HashSet::new(),
            first_timestamp: now.saturating_sub(MAX_GOSSIP_AGE_SECS),
            timestamp_range: MAX_GOSSIP_AGE_SECS,
        }
    }
}

impl GossipRelay {
    pub fn new() -> Self {
        Self::default()
    }

    /// Configure the gossip timestamp filter (BOLT-07 `gossip_timestamp_filter`).
    pub fn set_timestamp_filter(&mut self, first_timestamp: u64, timestamp_range: u64) {
        self.first_timestamp = first_timestamp;
        self.timestamp_range = timestamp_range;
    }

    // ── Process incoming gossip ──────────────────────────────

    /// Process a `channel_announcement`, updating the graph and returning
    /// `true` if the message is new and should be relayed.
    pub fn process_channel_announcement(
        &mut self,
        msg: &ChannelAnnouncementMsg,
        graph: &mut NetworkGraph,
    ) -> bool {
        let scid_bytes = scid_to_bytes(msg.short_channel_id);
        if !self.mark_seen(&scid_bytes) {
            return false; // duplicate
        }

        // Add nodes if not already known
        graph.add_node(GraphNode {
            pubkey: hex::encode(&msg.node_id_1),
            alias: String::new(),
            channels: vec![],
            last_update: 0,
        });
        graph.add_node(GraphNode {
            pubkey: hex::encode(&msg.node_id_2),
            alias: String::new(),
            channels: vec![],
            last_update: 0,
        });

        // Add channel (use scid bytes as the [u8;32] channel_id for the graph)
        graph.add_channel(GraphChannel {
            channel_id: scid_bytes,
            node1: hex::encode(&msg.node_id_1),
            node2: hex::encode(&msg.node_id_2),
            capacity: 0, // updated by channel_update
            fee_base_msat: 0,
            fee_rate_millionths: 0,
            cltv_delta: 0,
            enabled: true,
        });

        debug!(scid = msg.short_channel_id, "gossip: new channel announcement");
        true
    }

    /// Process a `channel_update`, returning `true` if it should be relayed.
    pub fn process_channel_update(
        &mut self,
        msg: &ChannelUpdateMsg,
        graph: &mut NetworkGraph,
    ) -> bool {
        // Timestamp filter
        let ts = msg.timestamp as u64;
        if ts < self.first_timestamp
            || ts > self.first_timestamp.saturating_add(self.timestamp_range)
        {
            return false;
        }

        let id = scid_to_bytes(msg.short_channel_id);

        // Update the graph channel's fee policy for the correct direction.
        // channel_flags bit 0: direction (0 = node1→node2, 1 = node2→node1).
        // For simplicity we store the latest update in the flat fields.
        if let Some(ch) = graph.get_channel_mut(&id) {
            ch.fee_base_msat = msg.fee_base_msat;
            ch.fee_rate_millionths = msg.fee_proportional_millionths;
            ch.cltv_delta = msg.cltv_expiry_delta;
            // Disable bit is channel_flags bit 1
            ch.enabled = msg.channel_flags & 2 == 0;
            debug!(scid = msg.short_channel_id, ts, "gossip: channel update");
            true
        } else {
            debug!(scid = msg.short_channel_id, "gossip: update for unknown channel — queued");
            false
        }
    }

    /// Process a `node_announcement`, returning `true` if it should be relayed.
    pub fn process_node_announcement(
        &mut self,
        msg: &NodeAnnouncementMsg,
        graph: &mut NetworkGraph,
    ) -> bool {
        let ts = msg.timestamp as u64;
        if ts < self.first_timestamp
            || ts > self.first_timestamp.saturating_add(self.timestamp_range)
        {
            return false;
        }

        let node_key = hex::encode(&msg.node_id);
        let alias_str = String::from_utf8_lossy(&msg.alias).trim_end_matches('\0').to_string();
        if let Some(node) = graph.get_node_mut(&node_key) {
            if ts <= node.last_update {
                return false; // stale
            }
            node.alias = alias_str.clone();
            node.last_update = ts;
            debug!(node = %node_key, alias = %alias_str, "gossip: node announcement");
            true
        } else {
            // Node not yet in graph — add it
            graph.add_node(GraphNode {
                pubkey: node_key,
                alias: alias_str,
                channels: vec![],
                last_update: ts,
            });
            true
        }
    }

    /// Dispatch any `LightningMessage` — delegates to the appropriate handler.
    /// Returns `true` if the message should be relayed to other peers.
    pub fn process_message(
        &mut self,
        msg: &LightningMessage,
        graph: &mut NetworkGraph,
    ) -> bool {
        match msg {
            LightningMessage::ChannelAnnouncement(m) => self.process_channel_announcement(m, graph),
            LightningMessage::NodeAnnouncement(m) => self.process_node_announcement(m, graph),
            LightningMessage::ChannelUpdate(m) => self.process_channel_update(m, graph),
            _ => false,
        }
    }

    // ── Internal ─────────────────────────────────────────────

    /// Insert into the seen-set.  Returns `true` if new.
    fn mark_seen(&mut self, id: &[u8; 32]) -> bool {
        if self.seen.len() >= MAX_SEEN_SET {
            // Evict oldest half (simple strategy)
            let keep: HashSet<_> = self.seen.iter().skip(MAX_SEEN_SET / 2).cloned().collect();
            self.seen = keep;
        }
        self.seen.insert(*id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_announcement_added_to_graph() {
        let mut relay = GossipRelay::new();
        let mut graph = NetworkGraph::new();

        let ann = ChannelAnnouncementMsg {
            node_signature_1: [0u8; 64],
            node_signature_2: [0u8; 64],
            bitcoin_signature_1: [0u8; 64],
            bitcoin_signature_2: [0u8; 64],
            features: vec![],
            chain_hash: [0u8; 32],
            short_channel_id: 1,
            node_id_1: [0xAA; 33],
            node_id_2: [0xBB; 33],
            bitcoin_key_1: [0u8; 33],
            bitcoin_key_2: [0u8; 33],
        };

        assert!(relay.process_channel_announcement(&ann, &mut graph));
        // Second time is duplicate
        assert!(!relay.process_channel_announcement(&ann, &mut graph));
    }

    #[test]
    fn channel_update_applies_fee_policy() {
        let mut relay = GossipRelay::new();
        let mut graph = NetworkGraph::new();

        // First add the channel
        let ann = ChannelAnnouncementMsg {
            node_signature_1: [0u8; 64],
            node_signature_2: [0u8; 64],
            bitcoin_signature_1: [0u8; 64],
            bitcoin_signature_2: [0u8; 64],
            features: vec![],
            chain_hash: [0u8; 32],
            short_channel_id: 2,
            node_id_1: [0xCC; 33],
            node_id_2: [0xDD; 33],
            bitcoin_key_1: [0u8; 33],
            bitcoin_key_2: [0u8; 33],
        };
        relay.process_channel_announcement(&ann, &mut graph);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as u32;
        let upd = ChannelUpdateMsg {
            signature: [0u8; 64],
            chain_hash: [0u8; 32],
            short_channel_id: 2,
            timestamp: now,
            message_flags: 0,
            channel_flags: 0,
            cltv_expiry_delta: 40,
            htlc_minimum_msat: 1000,
            fee_base_msat: 100,
            fee_proportional_millionths: 50,
            htlc_maximum_msat: u64::MAX,
        };

        assert!(relay.process_channel_update(&upd, &mut graph));
    }
}
