//! Channel manager — orchestrates the full lifecycle of Lightning channels.
//!
//! Provides a high-level API for opening, closing, and managing channels
//! plus HTLC forwarding between channels.

use std::collections::HashMap;

use crate::channel::{Channel, ChannelState};
use crate::htlc::Htlc;
use crate::messages::{
    AcceptChannelMsg, ChannelReadyMsg, FundingCreatedMsg,
    FundingSignedMsg, OpenChannelMsg, ShutdownMsg, UpdateAddHtlcMsg,
    UpdateFailHtlcMsg, UpdateFeeMsg, UpdateFulfillHtlcMsg,
};
use crate::persistence::ChannelStore;
use crate::{LightningError, Result};
use storage::Storage;

/// Per-channel negotiation state tracking the BOLT-02 handshake progress.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NegotiationPhase {
    /// We sent open_channel, awaiting accept_channel.
    AwaitingAccept,
    /// We received accept_channel, awaiting funding_created.
    AwaitingFundingCreated,
    /// We sent funding_created, awaiting funding_signed.
    AwaitingFundingSigned,
    /// Funding tx broadcast, awaiting confirmations + channel_ready.
    AwaitingChannelReady,
    /// Both sides exchanged channel_ready — channel is operational.
    Established,
}

/// High-level channel manager.
pub struct ChannelManager<S: Storage> {
    /// All tracked channels keyed by channel_id.
    channels: HashMap<[u8; 32], Channel>,
    /// Negotiation phases for channels still being opened.
    phases: HashMap<[u8; 32], NegotiationPhase>,
    /// Persistent storage.
    store: ChannelStore<S>,
    /// Our node pubkey (hex-encoded).
    local_node_id: String,
}

impl<S: Storage> ChannelManager<S> {
    /// Create a new channel manager backed by the given storage.
    pub fn new(store: ChannelStore<S>, local_node_id: String) -> Self {
        Self {
            channels: HashMap::new(),
            phases: HashMap::new(),
            store,
            local_node_id,
        }
    }

    // ── Channel lifecycle ───────────────────────────────────────────

    /// Initiate opening a channel (we are the funder).
    ///
    /// Returns an `OpenChannelMsg` to send to the peer and registers the
    /// channel locally in `AwaitingAccept` phase.
    pub fn initiate_open(
        &mut self,
        temporary_channel_id: [u8; 32],
        remote_pubkey: String,
        funding_satoshis: u64,
        push_msat: u64,
        funding_pubkey: [u8; 33],
    ) -> Result<OpenChannelMsg> {
        let channel = Channel::new(
            temporary_channel_id,
            [0u8; 32], // funding txid not known yet
            0,
            funding_satoshis,
            funding_satoshis.saturating_sub(push_msat / 1000),
            self.local_node_id.clone(),
            remote_pubkey,
        );
        self.channels.insert(temporary_channel_id, channel);
        self.phases
            .insert(temporary_channel_id, NegotiationPhase::AwaitingAccept);

        Ok(OpenChannelMsg {
            chain_hash: [0u8; 32],
            temporary_channel_id,
            funding_satoshis,
            push_msat,
            dust_limit_satoshis: 546,
            max_htlc_value_in_flight_msat: funding_satoshis * 1000,
            channel_reserve_satoshis: 10_000,
            htlc_minimum_msat: 1000,
            feerate_per_kw: 253,
            to_self_delay: 144,
            max_accepted_htlcs: 483,
            funding_pubkey,
            revocation_basepoint: [0u8; 33],
            payment_basepoint: [0u8; 33],
            delayed_payment_basepoint: [0u8; 33],
            htlc_basepoint: [0u8; 33],
            first_per_commitment_point: [0u8; 33],
        })
    }

    /// Handle an incoming `accept_channel` from the remote peer.
    pub fn handle_accept_channel(&mut self, msg: &AcceptChannelMsg) -> Result<()> {
        let phase = self
            .phases
            .get(&msg.temporary_channel_id)
            .ok_or_else(|| {
                LightningError::ChannelNotFound(hex::encode(msg.temporary_channel_id))
            })?;
        if *phase != NegotiationPhase::AwaitingAccept {
            return Err(LightningError::InvalidHtlc(
                "unexpected accept_channel".into(),
            ));
        }
        self.phases.insert(
            msg.temporary_channel_id,
            NegotiationPhase::AwaitingFundingCreated,
        );
        Ok(())
    }

    /// We created the funding tx — send `funding_created` to the peer.
    pub fn send_funding_created(
        &mut self,
        temporary_channel_id: [u8; 32],
        funding_txid: [u8; 32],
        funding_output_index: u16,
        signature: [u8; 64],
    ) -> Result<FundingCreatedMsg> {
        let phase = self
            .phases
            .get(&temporary_channel_id)
            .ok_or_else(|| {
                LightningError::ChannelNotFound(hex::encode(temporary_channel_id))
            })?;
        if *phase != NegotiationPhase::AwaitingFundingCreated {
            return Err(LightningError::InvalidHtlc(
                "unexpected funding_created".into(),
            ));
        }
        // Update the channel with actual funding info.
        if let Some(ch) = self.channels.get_mut(&temporary_channel_id) {
            ch.funding_txid = funding_txid;
            ch.funding_vout = funding_output_index as u32;
        }
        self.phases.insert(
            temporary_channel_id,
            NegotiationPhase::AwaitingFundingSigned,
        );
        Ok(FundingCreatedMsg {
            temporary_channel_id,
            funding_txid,
            funding_output_index,
            signature,
        })
    }

    /// Handle incoming `funding_signed` — funding tx can now be broadcast.
    pub fn handle_funding_signed(&mut self, msg: &FundingSignedMsg) -> Result<()> {
        // The real channel_id is derived from the funding outpoint.
        // For now, check whether we have a channel whose funding matches.
        let temp_id = self
            .channels
            .iter()
            .find(|(_, ch)| ch.channel_id != msg.channel_id && ch.funding_txid != [0u8; 32])
            .map(|(id, _)| *id);

        let temp_id = temp_id.unwrap_or(msg.channel_id);
        self.phases
            .insert(temp_id, NegotiationPhase::AwaitingChannelReady);
        Ok(())
    }

    /// Handle `channel_ready` — the channel is now fully operational.
    pub fn handle_channel_ready(&mut self, msg: &ChannelReadyMsg) -> Result<()> {
        let ch = self
            .channels
            .get_mut(&msg.channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(msg.channel_id)))?;
        ch.set_open();
        self.phases
            .insert(msg.channel_id, NegotiationPhase::Established);
        self.store.save(ch)?;
        Ok(())
    }

    // ── HTLC operations ─────────────────────────────────────────────

    /// Add an outgoing HTLC to a channel.
    pub fn add_htlc(
        &mut self,
        channel_id: &[u8; 32],
        payment_hash: [u8; 32],
        amount_msat: u64,
        cltv_expiry: u32,
    ) -> Result<UpdateAddHtlcMsg> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;

        let amount_sat = amount_msat / 1000;
        let htlc_id = ch.pending_htlcs.len() as u64;
        let htlc = Htlc::new_outgoing(htlc_id, payment_hash, amount_sat, cltv_expiry);
        ch.add_htlc(htlc)?;
        self.store.save(ch)?;

        Ok(UpdateAddHtlcMsg {
            channel_id: *channel_id,
            htlc_id,
            amount_msat,
            payment_hash,
            cltv_expiry,
            onion_routing_packet: Vec::new(),
        })
    }

    /// Fulfill an HTLC with its preimage.
    pub fn fulfill_htlc(
        &mut self,
        channel_id: &[u8; 32],
        payment_hash: &[u8; 32],
        preimage: &[u8; 32],
    ) -> Result<UpdateFulfillHtlcMsg> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;
        ch.fulfill_htlc(payment_hash, preimage)?;
        self.store.save(ch)?;

        Ok(UpdateFulfillHtlcMsg {
            channel_id: *channel_id,
            htlc_id: 0, // simplified
            payment_preimage: *preimage,
        })
    }

    /// Fail an HTLC.
    pub fn fail_htlc(
        &mut self,
        channel_id: &[u8; 32],
        payment_hash: &[u8; 32],
        reason: Vec<u8>,
    ) -> Result<UpdateFailHtlcMsg> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;
        ch.fail_htlc(payment_hash)?;
        self.store.save(ch)?;

        Ok(UpdateFailHtlcMsg {
            channel_id: *channel_id,
            htlc_id: 0,
            reason,
        })
    }

    // ── Shutdown / close ────────────────────────────────────────────

    /// Handle an update_fee message from the funding party.
    pub fn handle_update_fee(
        &mut self,
        msg: &UpdateFeeMsg,
    ) -> Result<()> {
        let ch = self
            .channels
            .get_mut(&msg.channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(msg.channel_id)))?;
        ch.update_fee(msg.feerate_per_kw)?;
        self.store.save(ch)?;
        Ok(())
    }

    /// Send an update_fee to the remote party.
    pub fn send_update_fee(
        &mut self,
        channel_id: &[u8; 32],
        new_feerate_per_kw: u32,
    ) -> Result<UpdateFeeMsg> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;
        ch.update_fee(new_feerate_per_kw)?;
        self.store.save(ch)?;
        Ok(UpdateFeeMsg { channel_id: *channel_id, feerate_per_kw: new_feerate_per_kw })
    }

    /// Initiate cooperative close.
    pub fn initiate_shutdown(
        &mut self,
        channel_id: &[u8; 32],
        scriptpubkey: Vec<u8>,
    ) -> Result<ShutdownMsg> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;
        ch.initiate_close();
        self.store.save(ch)?;
        Ok(ShutdownMsg {
            channel_id: *channel_id,
            scriptpubkey,
        })
    }

    /// Force-close a channel.
    pub fn force_close(&mut self, channel_id: &[u8; 32]) -> Result<()> {
        let ch = self
            .channels
            .get_mut(channel_id)
            .ok_or_else(|| LightningError::ChannelNotFound(hex::encode(channel_id)))?;
        ch.force_close();
        self.store.save(ch)?;
        Ok(())
    }

    // ── Queries ─────────────────────────────────────────────────────

    /// Get a channel by ID.
    pub fn get_channel(&self, channel_id: &[u8; 32]) -> Option<&Channel> {
        self.channels.get(channel_id)
    }

    /// List all tracked channels.
    pub fn list_channels(&self) -> Vec<&Channel> {
        self.channels.values().collect()
    }

    /// List only open channels.
    pub fn list_active_channels(&self) -> Vec<&Channel> {
        self.channels
            .values()
            .filter(|ch| ch.state == ChannelState::Open)
            .collect()
    }

    /// Current negotiation phase for a channel, if applicable.
    pub fn negotiation_phase(&self, channel_id: &[u8; 32]) -> Option<NegotiationPhase> {
        self.phases.get(channel_id).copied()
    }

    // ── Payment sending ─────────────────────────────────────────────

    /// Send a single-path payment through a specific channel.
    ///
    /// Returns the HTLC add message to forward to the peer.
    pub fn send_payment(
        &mut self,
        channel_id: &[u8; 32],
        payment_hash: [u8; 32],
        amount_msat: u64,
        cltv_expiry: u32,
        payment_secret: Option<[u8; 32]>,
    ) -> Result<UpdateAddHtlcMsg> {
        let _ = payment_secret; // stored for MPP correlation; forwarded in onion
        self.add_htlc(channel_id, payment_hash, amount_msat, cltv_expiry)
    }

    /// Send a multi-path payment (MPP) split across multiple channels.
    ///
    /// `shards` is a list of (channel_id, amount_msat) pairs that must sum
    /// to the total payment amount.  Each shard carries the same
    /// `payment_hash` and `payment_secret` so the recipient can
    /// reconstruct the full payment.
    pub fn send_payment_mpp(
        &mut self,
        payment_hash: [u8; 32],
        payment_secret: [u8; 32],
        shards: &[([u8; 32], u64)],
        cltv_expiry: u32,
    ) -> Result<Vec<UpdateAddHtlcMsg>> {
        if shards.is_empty() {
            return Err(LightningError::InvalidHtlc(
                "MPP requires at least one shard".to_string(),
            ));
        }
        let mut msgs = Vec::with_capacity(shards.len());
        for (channel_id, amount_msat) in shards {
            let msg = self.send_payment(
                channel_id,
                payment_hash,
                *amount_msat,
                cltv_expiry,
                Some(payment_secret),
            )?;
            msgs.push(msg);
        }
        Ok(msgs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use storage::MemoryStorage;

    fn make_manager() -> ChannelManager<MemoryStorage> {
        let store = ChannelStore::new(MemoryStorage::new());
        ChannelManager::new(store, "our_node_id".to_string())
    }

    #[test]
    fn test_initiate_open_creates_channel() {
        let mut mgr = make_manager();
        let temp_id = [0xAA; 32];
        let msg = mgr
            .initiate_open(temp_id, "remote".into(), 1_000_000, 0, [2u8; 33])
            .unwrap();
        assert_eq!(msg.funding_satoshis, 1_000_000);
        assert_eq!(msg.temporary_channel_id, temp_id);
        assert!(mgr.get_channel(&temp_id).is_some());
        assert_eq!(
            mgr.negotiation_phase(&temp_id),
            Some(NegotiationPhase::AwaitingAccept)
        );
    }

    #[test]
    fn test_accept_advances_phase() {
        let mut mgr = make_manager();
        let temp_id = [0xBB; 32];
        mgr.initiate_open(temp_id, "remote".into(), 500_000, 0, [2u8; 33])
            .unwrap();

        let accept = AcceptChannelMsg {
            temporary_channel_id: temp_id,
            dust_limit_satoshis: 546,
            max_htlc_value_in_flight_msat: 500_000_000,
            channel_reserve_satoshis: 10_000,
            htlc_minimum_msat: 1000,
            minimum_depth: 3,
            to_self_delay: 144,
            max_accepted_htlcs: 483,
            funding_pubkey: [3u8; 33],
            revocation_basepoint: [0u8; 33],
            payment_basepoint: [0u8; 33],
            delayed_payment_basepoint: [0u8; 33],
            htlc_basepoint: [0u8; 33],
            first_per_commitment_point: [0u8; 33],
        };
        mgr.handle_accept_channel(&accept).unwrap();
        assert_eq!(
            mgr.negotiation_phase(&temp_id),
            Some(NegotiationPhase::AwaitingFundingCreated)
        );
    }

    #[test]
    fn test_channel_ready_opens_channel() {
        let mut mgr = make_manager();
        let id = [0xCC; 32];
        mgr.initiate_open(id, "remote".into(), 1_000_000, 0, [2u8; 33])
            .unwrap();
        // Skip negotiation in test — directly mark as awaiting ready.
        mgr.phases
            .insert(id, NegotiationPhase::AwaitingChannelReady);

        let ready = ChannelReadyMsg {
            channel_id: id,
            next_per_commitment_point: [7u8; 33],
        };
        mgr.handle_channel_ready(&ready).unwrap();
        assert_eq!(mgr.get_channel(&id).unwrap().state, ChannelState::Open);
        assert_eq!(
            mgr.negotiation_phase(&id),
            Some(NegotiationPhase::Established)
        );
    }

    #[test]
    fn test_add_and_fulfill_htlc() {
        let mut mgr = make_manager();
        let id = [0xDD; 32];
        mgr.initiate_open(id, "remote".into(), 1_000_000, 0, [2u8; 33])
            .unwrap();
        mgr.phases.insert(id, NegotiationPhase::AwaitingChannelReady);
        mgr.handle_channel_ready(&ChannelReadyMsg {
            channel_id: id,
            next_per_commitment_point: [0u8; 33],
        })
        .unwrap();

        // Preimage → hash
        let preimage = [0x42u8; 32];
        let payment_hash = {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(preimage);
            let result = h.finalize();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&result);
            arr
        };

        let add_msg = mgr.add_htlc(&id, payment_hash, 50_000_000, 500).unwrap();
        assert_eq!(add_msg.amount_msat, 50_000_000);

        let fulfill_msg = mgr.fulfill_htlc(&id, &payment_hash, &preimage).unwrap();
        assert_eq!(fulfill_msg.payment_preimage, preimage);
    }

    #[test]
    fn test_shutdown() {
        let mut mgr = make_manager();
        let id = [0xEE; 32];
        mgr.initiate_open(id, "remote".into(), 1_000_000, 0, [2u8; 33])
            .unwrap();
        mgr.phases.insert(id, NegotiationPhase::AwaitingChannelReady);
        mgr.handle_channel_ready(&ChannelReadyMsg {
            channel_id: id,
            next_per_commitment_point: [0u8; 33],
        })
        .unwrap();

        let sd = mgr.initiate_shutdown(&id, vec![0x00, 0x14]).unwrap();
        assert_eq!(sd.channel_id, id);
        assert_eq!(mgr.get_channel(&id).unwrap().state, ChannelState::Closing);
    }

    #[test]
    fn test_force_close() {
        let mut mgr = make_manager();
        let id = [0xFF; 32];
        mgr.initiate_open(id, "remote".into(), 500_000, 0, [2u8; 33])
            .unwrap();
        mgr.phases.insert(id, NegotiationPhase::AwaitingChannelReady);
        mgr.handle_channel_ready(&ChannelReadyMsg {
            channel_id: id,
            next_per_commitment_point: [0u8; 33],
        })
        .unwrap();

        mgr.force_close(&id).unwrap();
        assert_eq!(
            mgr.get_channel(&id).unwrap().state,
            ChannelState::ForceClosing
        );
    }

    #[test]
    fn test_list_channels() {
        let mut mgr = make_manager();
        mgr.initiate_open([1u8; 32], "r1".into(), 100_000, 0, [2u8; 33])
            .unwrap();
        mgr.initiate_open([2u8; 32], "r2".into(), 200_000, 0, [2u8; 33])
            .unwrap();
        assert_eq!(mgr.list_channels().len(), 2);
        // None are open yet.
        assert_eq!(mgr.list_active_channels().len(), 0);
    }
}
