//! BOLT protocol wire messages (BOLT-01, BOLT-02, BOLT-07).
//!
//! Defines the Lightning Network peer-to-peer message types used for
//! channel lifecycle management, HTLC updates, and gossip.

/// Unique 2-byte message type identifiers (BOLT-01 §3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u16)]
pub enum MessageType {
    // ── Setup & control (BOLT-01) ──
    Init = 16,
    Error = 17,
    Warning = 1,
    Ping = 18,
    Pong = 19,

    // ── Channel lifecycle (BOLT-02) ──
    OpenChannel = 32,
    AcceptChannel = 33,
    FundingCreated = 34,
    FundingSigned = 35,
    ChannelReady = 36,
    Shutdown = 38,
    ClosingSigned = 39,

    // ── Commitment updates (BOLT-02) ──
    UpdateAddHtlc = 128,
    UpdateFulfillHtlc = 130,
    UpdateFailHtlc = 131,
    UpdateFailMalformedHtlc = 135,
    CommitmentSigned = 132,
    RevokeAndAck = 133,
    UpdateFee = 134,
    ChannelReestablish = 136,

    // ── Gossip (BOLT-07) ──
    ChannelAnnouncement = 256,
    NodeAnnouncement = 257,
    ChannelUpdate = 258,
    QueryShortChannelIds = 261,
    ReplyShortChannelIdsEnd = 262,
    QueryChannelRange = 263,
    ReplyChannelRange = 264,
    GossipTimestampFilter = 265,
}

// ── BOLT-01 messages ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InitMsg {
    pub global_features: Vec<u8>,
    pub local_features: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ErrorMsg {
    pub channel_id: [u8; 32],
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct PingMsg {
    pub num_pong_bytes: u16,
    pub byteslen: u16,
}

#[derive(Debug, Clone)]
pub struct PongMsg {
    pub byteslen: u16,
}

// ── BOLT-02 channel lifecycle ───────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OpenChannelMsg {
    pub chain_hash: [u8; 32],
    pub temporary_channel_id: [u8; 32],
    pub funding_satoshis: u64,
    pub push_msat: u64,
    pub dust_limit_satoshis: u64,
    pub max_htlc_value_in_flight_msat: u64,
    pub channel_reserve_satoshis: u64,
    pub htlc_minimum_msat: u64,
    pub feerate_per_kw: u32,
    pub to_self_delay: u16,
    pub max_accepted_htlcs: u16,
    pub funding_pubkey: [u8; 33],
    pub revocation_basepoint: [u8; 33],
    pub payment_basepoint: [u8; 33],
    pub delayed_payment_basepoint: [u8; 33],
    pub htlc_basepoint: [u8; 33],
    pub first_per_commitment_point: [u8; 33],
}

#[derive(Debug, Clone)]
pub struct AcceptChannelMsg {
    pub temporary_channel_id: [u8; 32],
    pub dust_limit_satoshis: u64,
    pub max_htlc_value_in_flight_msat: u64,
    pub channel_reserve_satoshis: u64,
    pub htlc_minimum_msat: u64,
    pub minimum_depth: u32,
    pub to_self_delay: u16,
    pub max_accepted_htlcs: u16,
    pub funding_pubkey: [u8; 33],
    pub revocation_basepoint: [u8; 33],
    pub payment_basepoint: [u8; 33],
    pub delayed_payment_basepoint: [u8; 33],
    pub htlc_basepoint: [u8; 33],
    pub first_per_commitment_point: [u8; 33],
}

#[derive(Debug, Clone)]
pub struct FundingCreatedMsg {
    pub temporary_channel_id: [u8; 32],
    pub funding_txid: [u8; 32],
    pub funding_output_index: u16,
    pub signature: [u8; 64],
}

#[derive(Debug, Clone)]
pub struct FundingSignedMsg {
    pub channel_id: [u8; 32],
    pub signature: [u8; 64],
}

#[derive(Debug, Clone)]
pub struct ChannelReadyMsg {
    pub channel_id: [u8; 32],
    pub next_per_commitment_point: [u8; 33],
}

#[derive(Debug, Clone)]
pub struct ShutdownMsg {
    pub channel_id: [u8; 32],
    pub scriptpubkey: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ClosingSignedMsg {
    pub channel_id: [u8; 32],
    pub fee_satoshis: u64,
    pub signature: [u8; 64],
}

// ── BOLT-02 HTLC updates ───────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct UpdateAddHtlcMsg {
    pub channel_id: [u8; 32],
    pub htlc_id: u64,
    pub amount_msat: u64,
    pub payment_hash: [u8; 32],
    pub cltv_expiry: u32,
    pub onion_routing_packet: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct UpdateFulfillHtlcMsg {
    pub channel_id: [u8; 32],
    pub htlc_id: u64,
    pub payment_preimage: [u8; 32],
}

#[derive(Debug, Clone)]
pub struct UpdateFailHtlcMsg {
    pub channel_id: [u8; 32],
    pub htlc_id: u64,
    pub reason: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct CommitmentSignedMsg {
    pub channel_id: [u8; 32],
    pub signature: [u8; 64],
    pub num_htlcs: u16,
    pub htlc_signatures: Vec<[u8; 64]>,
}

#[derive(Debug, Clone)]
pub struct RevokeAndAckMsg {
    pub channel_id: [u8; 32],
    pub per_commitment_secret: [u8; 32],
    pub next_per_commitment_point: [u8; 33],
}

#[derive(Debug, Clone)]
pub struct UpdateFeeMsg {
    pub channel_id: [u8; 32],
    pub feerate_per_kw: u32,
}

#[derive(Debug, Clone)]
pub struct ChannelReestablishMsg {
    pub channel_id: [u8; 32],
    pub next_commitment_number: u64,
    pub next_revocation_number: u64,
    pub your_last_per_commitment_secret: [u8; 32],
    pub my_current_per_commitment_point: [u8; 33],
}

// ── BOLT-07 gossip ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ChannelAnnouncementMsg {
    pub node_signature_1: [u8; 64],
    pub node_signature_2: [u8; 64],
    pub bitcoin_signature_1: [u8; 64],
    pub bitcoin_signature_2: [u8; 64],
    pub features: Vec<u8>,
    pub chain_hash: [u8; 32],
    pub short_channel_id: u64,
    pub node_id_1: [u8; 33],
    pub node_id_2: [u8; 33],
    pub bitcoin_key_1: [u8; 33],
    pub bitcoin_key_2: [u8; 33],
}

#[derive(Debug, Clone)]
pub struct NodeAnnouncementMsg {
    pub signature: [u8; 64],
    pub features: Vec<u8>,
    pub timestamp: u32,
    pub node_id: [u8; 33],
    pub rgb_color: [u8; 3],
    pub alias: [u8; 32],
    pub addresses: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ChannelUpdateMsg {
    pub signature: [u8; 64],
    pub chain_hash: [u8; 32],
    pub short_channel_id: u64,
    pub timestamp: u32,
    pub message_flags: u8,
    pub channel_flags: u8,
    pub cltv_expiry_delta: u16,
    pub htlc_minimum_msat: u64,
    pub fee_base_msat: u32,
    pub fee_proportional_millionths: u32,
    pub htlc_maximum_msat: u64,
}

// ── Envelope ────────────────────────────────────────────────────────────

/// A Lightning Network protocol message.
#[derive(Debug, Clone)]
pub enum LightningMessage {
    Init(InitMsg),
    Error(ErrorMsg),
    Ping(PingMsg),
    Pong(PongMsg),
    OpenChannel(OpenChannelMsg),
    AcceptChannel(AcceptChannelMsg),
    FundingCreated(FundingCreatedMsg),
    FundingSigned(FundingSignedMsg),
    ChannelReady(ChannelReadyMsg),
    Shutdown(ShutdownMsg),
    ClosingSigned(ClosingSignedMsg),
    UpdateAddHtlc(UpdateAddHtlcMsg),
    UpdateFulfillHtlc(UpdateFulfillHtlcMsg),
    UpdateFailHtlc(UpdateFailHtlcMsg),
    CommitmentSigned(CommitmentSignedMsg),
    RevokeAndAck(RevokeAndAckMsg),
    UpdateFee(UpdateFeeMsg),
    ChannelReestablish(ChannelReestablishMsg),
    ChannelAnnouncement(ChannelAnnouncementMsg),
    NodeAnnouncement(NodeAnnouncementMsg),
    ChannelUpdate(ChannelUpdateMsg),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_type_values() {
        assert_eq!(MessageType::Init as u16, 16);
        assert_eq!(MessageType::OpenChannel as u16, 32);
        assert_eq!(MessageType::UpdateAddHtlc as u16, 128);
        assert_eq!(MessageType::ChannelAnnouncement as u16, 256);
    }

    #[test]
    fn test_open_channel_msg_construction() {
        let msg = OpenChannelMsg {
            chain_hash: [0u8; 32],
            temporary_channel_id: [1u8; 32],
            funding_satoshis: 1_000_000,
            push_msat: 0,
            dust_limit_satoshis: 546,
            max_htlc_value_in_flight_msat: 500_000_000,
            channel_reserve_satoshis: 10_000,
            htlc_minimum_msat: 1000,
            feerate_per_kw: 253,
            to_self_delay: 144,
            max_accepted_htlcs: 483,
            funding_pubkey: [2u8; 33],
            revocation_basepoint: [3u8; 33],
            payment_basepoint: [4u8; 33],
            delayed_payment_basepoint: [5u8; 33],
            htlc_basepoint: [6u8; 33],
            first_per_commitment_point: [7u8; 33],
        };
        assert_eq!(msg.funding_satoshis, 1_000_000);
        assert_eq!(msg.to_self_delay, 144);
        assert_eq!(msg.max_accepted_htlcs, 483);
    }

    #[test]
    fn test_lightning_message_enum_variants() {
        let msg = LightningMessage::Ping(PingMsg {
            num_pong_bytes: 64,
            byteslen: 0,
        });
        match msg {
            LightningMessage::Ping(p) => assert_eq!(p.num_pong_bytes, 64),
            _ => panic!("expected Ping"),
        }
    }

    #[test]
    fn test_channel_update_fields() {
        let upd = ChannelUpdateMsg {
            signature: [0u8; 64],
            chain_hash: [0u8; 32],
            short_channel_id: 0x0001_0001_0001,
            timestamp: 1700000000,
            message_flags: 1,
            channel_flags: 0,
            cltv_expiry_delta: 40,
            htlc_minimum_msat: 1000,
            fee_base_msat: 1000,
            fee_proportional_millionths: 100,
            htlc_maximum_msat: 500_000_000,
        };
        assert_eq!(upd.cltv_expiry_delta, 40);
        assert_eq!(upd.fee_proportional_millionths, 100);
    }
}
