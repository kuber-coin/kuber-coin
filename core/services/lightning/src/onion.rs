//! Onion routing for Lightning payment privacy (Sphinx-like)
//!
//! Each hop can only decrypt its own layer, learning only the next hop.

use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};

use crate::{LightningError, Result};

/// Size of the per-hop payload
const HOP_DATA_SIZE: usize = 65;
/// Maximum route length
const MAX_HOPS: usize = 20;
/// Total onion packet routing info size
const ROUTING_INFO_SIZE: usize = HOP_DATA_SIZE * MAX_HOPS;

/// Per-hop payload embedded in an onion layer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HopPayload {
    /// Short channel ID for next hop (0 = final)
    pub short_channel_id: u64,
    /// Amount to forward (satoshis)
    pub amt_to_forward: u64,
    /// CLTV expiry for the outgoing HTLC
    pub outgoing_cltv_value: u32,
    /// Padding / extra TLV data
    pub extra_data: Vec<u8>,
}

impl HopPayload {
    /// Encode hop payload into fixed-size bytes
    pub fn encode(&self) -> [u8; HOP_DATA_SIZE] {
        let mut buf = [0u8; HOP_DATA_SIZE];
        // byte 0: realm (0 = legacy)
        buf[0] = 0x00;
        // bytes 1-8: short_channel_id
        buf[1..9].copy_from_slice(&self.short_channel_id.to_be_bytes());
        // bytes 9-16: amt_to_forward
        buf[9..17].copy_from_slice(&self.amt_to_forward.to_be_bytes());
        // bytes 17-20: outgoing_cltv_value
        buf[17..21].copy_from_slice(&self.outgoing_cltv_value.to_be_bytes());
        // bytes 21-52: padding (zeros)
        // bytes 53-64: HMAC placeholder (filled during onion construction)
        buf
    }

    /// Decode hop payload from fixed-size bytes
    pub fn decode(data: &[u8; HOP_DATA_SIZE]) -> Self {
        let short_channel_id = u64::from_be_bytes(data[1..9].try_into().unwrap());
        let amt_to_forward = u64::from_be_bytes(data[9..17].try_into().unwrap());
        let outgoing_cltv_value = u32::from_be_bytes(data[17..21].try_into().unwrap());
        Self {
            short_channel_id,
            amt_to_forward,
            outgoing_cltv_value,
            extra_data: Vec::new(),
        }
    }
}

/// Onion packet sent along a payment route
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnionPacket {
    /// Version byte (0)
    pub version: u8,
    /// Ephemeral public key for this hop (33 bytes, compressed)
    pub ephemeral_pubkey: Vec<u8>,
    /// Encrypted routing information
    pub routing_info: Vec<u8>,
    /// HMAC for integrity (32 bytes)
    pub hmac: [u8; 32],
}

/// Derive a shared secret from a session key and hop pubkey using SHA-256
/// (simplified — real Sphinx uses ECDH)
fn derive_shared_secret(session_key: &[u8; 32], hop_pubkey: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"onion_shared_secret");
    hasher.update(session_key);
    hasher.update(hop_pubkey);
    hasher.finalize().into()
}

/// Generate a pseudo-random stream from a shared secret for XOR blinding
fn generate_stream(shared_secret: &[u8; 32], length: usize) -> Vec<u8> {
    let mut stream = Vec::with_capacity(length);
    let mut counter = 0u64;
    while stream.len() < length {
        let mut hasher = Sha256::new();
        hasher.update(b"onion_stream");
        hasher.update(shared_secret);
        hasher.update(counter.to_be_bytes());
        let block: [u8; 32] = hasher.finalize().into();
        stream.extend_from_slice(&block);
        counter += 1;
    }
    stream.truncate(length);
    stream
}

/// Compute HMAC-SHA256 over data with key
fn compute_hmac(key: &[u8; 32], data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"onion_hmac");
    hasher.update(key);
    hasher.update(data);
    hasher.finalize().into()
}

/// Derive the next ephemeral key by hashing current key with shared secret
fn blind_ephemeral_key(current: &[u8; 32], shared_secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"onion_blind");
    hasher.update(current);
    hasher.update(shared_secret);
    hasher.finalize().into()
}

/// Build an onion packet for the given route.
///
/// `session_key`: 32-byte random session key  
/// `hop_pubkeys`: public key bytes for each hop  
/// `payloads`: per-hop payloads (must match hop_pubkeys length)  
/// `assoc_data`: associated data (e.g., payment hash) included in HMAC  
pub fn create_onion_packet(
    session_key: &[u8; 32],
    hop_pubkeys: &[Vec<u8>],
    payloads: &[HopPayload],
    assoc_data: &[u8],
) -> Result<OnionPacket> {
    let num_hops = hop_pubkeys.len();
    if num_hops == 0 || num_hops > MAX_HOPS {
        return Err(LightningError::RoutingFailed(
            format!("invalid hop count: {num_hops}"),
        ));
    }
    if payloads.len() != num_hops {
        return Err(LightningError::RoutingFailed(
            "payload count must match hop count".into(),
        ));
    }

    // Derive shared secrets for each hop
    let mut shared_secrets = Vec::with_capacity(num_hops);
    let mut ephemeral = *session_key;
    for pubkey in hop_pubkeys {
        let ss = derive_shared_secret(&ephemeral, pubkey);
        shared_secrets.push(ss);
        ephemeral = blind_ephemeral_key(&ephemeral, &ss);
    }

    // Build routing info from last hop to first (onion wrapping)
    let mut routing_info = vec![0u8; ROUTING_INFO_SIZE];
    let mut current_hmac = [0u8; 32]; // last hop HMAC is all zeros

    for i in (0..num_hops).rev() {
        let payload = payloads[i].encode();

        // Shift routing_info right by HOP_DATA_SIZE to make room
        routing_info.rotate_right(HOP_DATA_SIZE);
        routing_info[..HOP_DATA_SIZE].copy_from_slice(&payload);

        // XOR with pseudo-random stream derived from shared secret
        let stream = generate_stream(&shared_secrets[i], ROUTING_INFO_SIZE);
        for (byte, mask) in routing_info.iter_mut().zip(stream.iter()) {
            *byte ^= mask;
        }

        // Compute HMAC over (routing_info || assoc_data)
        let mut hmac_input = routing_info.clone();
        hmac_input.extend_from_slice(assoc_data);
        current_hmac = compute_hmac(&shared_secrets[i], &hmac_input);
    }

    Ok(OnionPacket {
        version: 0,
        ephemeral_pubkey: session_key.to_vec(),
        routing_info,
        hmac: current_hmac,
    })
}

/// Result of peeling one onion layer
#[derive(Debug)]
pub struct PeeledOnion {
    /// Decrypted payload for this hop
    pub payload: HopPayload,
    /// Onion packet to forward to the next hop
    pub next_packet: OnionPacket,
    /// Whether this is the final hop (HMAC is all zeros)
    pub is_final: bool,
}

/// Peel one layer of the onion packet.
///
/// `private_key`: this node's private key (32 bytes)  
/// `packet`: the received onion packet  
/// `assoc_data`: associated data for HMAC verification  
pub fn peel_onion_layer(
    private_key: &[u8; 32],
    packet: &OnionPacket,
    assoc_data: &[u8],
) -> Result<PeeledOnion> {
    if packet.version != 0 {
        return Err(LightningError::RoutingFailed(
            format!("unsupported onion version: {}", packet.version),
        ));
    }

    // Derive shared secret
    let shared_secret = derive_shared_secret(&packet.ephemeral_pubkey.as_slice().try_into()
        .map_err(|_| LightningError::RoutingFailed("invalid ephemeral key length".into()))?,
        private_key,
    );

    // Verify HMAC
    let mut hmac_input = packet.routing_info.clone();
    hmac_input.extend_from_slice(assoc_data);
    let expected_hmac = compute_hmac(&shared_secret, &hmac_input);
    if expected_hmac != packet.hmac {
        return Err(LightningError::RoutingFailed("onion HMAC mismatch".into()));
    }

    // Decrypt routing info by XOR with stream
    let stream = generate_stream(&shared_secret, ROUTING_INFO_SIZE);
    let mut decrypted = packet.routing_info.clone();
    for (byte, mask) in decrypted.iter_mut().zip(stream.iter()) {
        *byte ^= mask;
    }

    // Extract this hop's payload
    let mut hop_data = [0u8; HOP_DATA_SIZE];
    hop_data.copy_from_slice(&decrypted[..HOP_DATA_SIZE]);
    let payload = HopPayload::decode(&hop_data);

    // Shift remaining routing info left and pad with zeros
    let mut next_routing = vec![0u8; ROUTING_INFO_SIZE];
    let remaining = ROUTING_INFO_SIZE - HOP_DATA_SIZE;
    next_routing[..remaining].copy_from_slice(&decrypted[HOP_DATA_SIZE..]);

    // Extract next HMAC (last 32 bytes of hop data are HMAC)
    let next_hmac: [u8; 32] = hop_data[HOP_DATA_SIZE - 32..].try_into().unwrap();

    // Blind ephemeral key for next hop
    let ephem_arr: [u8; 32] = packet.ephemeral_pubkey.as_slice().try_into()
        .map_err(|_| LightningError::RoutingFailed("invalid ephemeral key".into()))?;
    let next_ephemeral = blind_ephemeral_key(&ephem_arr, &shared_secret);

    let is_final = next_hmac == [0u8; 32];

    Ok(PeeledOnion {
        payload,
        next_packet: OnionPacket {
            version: 0,
            ephemeral_pubkey: next_ephemeral.to_vec(),
            routing_info: next_routing,
            hmac: next_hmac,
        },
        is_final,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hop_payload_roundtrip() {
        let payload = HopPayload {
            short_channel_id: 0x0102030405060708,
            amt_to_forward: 50_000,
            outgoing_cltv_value: 144,
            extra_data: vec![],
        };
        let encoded = payload.encode();
        let decoded = HopPayload::decode(&encoded);
        assert_eq!(decoded.short_channel_id, 0x0102030405060708);
        assert_eq!(decoded.amt_to_forward, 50_000);
        assert_eq!(decoded.outgoing_cltv_value, 144);
    }

    #[test]
    fn test_create_onion_single_hop() {
        let session_key = [42u8; 32];
        let hop_pubkey = vec![1u8; 32];
        let payload = HopPayload {
            short_channel_id: 0,
            amt_to_forward: 100_000,
            outgoing_cltv_value: 40,
            extra_data: vec![],
        };
        let assoc_data = [0u8; 32];

        let packet = create_onion_packet(
            &session_key,
            &[hop_pubkey],
            &[payload],
            &assoc_data,
        ).unwrap();

        assert_eq!(packet.version, 0);
        assert_eq!(packet.routing_info.len(), ROUTING_INFO_SIZE);
        assert_eq!(packet.ephemeral_pubkey.len(), 32);
    }

    #[test]
    fn test_create_onion_multi_hop() {
        let session_key = [7u8; 32];
        let hop_pubkeys: Vec<Vec<u8>> = (0..3).map(|i| vec![i + 1; 32]).collect();
        let payloads: Vec<HopPayload> = (0..3).map(|i| HopPayload {
            short_channel_id: if i < 2 { (i + 1) as u64 } else { 0 },
            amt_to_forward: 100_000 - (i as u64 * 100),
            outgoing_cltv_value: 144 - (i as u32 * 10),
            extra_data: vec![],
        }).collect();

        let packet = create_onion_packet(
            &session_key,
            &hop_pubkeys,
            &payloads,
            &[0u8; 32],
        ).unwrap();

        assert_eq!(packet.version, 0);
        assert_eq!(packet.routing_info.len(), ROUTING_INFO_SIZE);
    }

    #[test]
    fn test_create_onion_empty_hops_rejected() {
        let session_key = [0u8; 32];
        let result = create_onion_packet(&session_key, &[], &[], &[]);
        assert!(result.is_err());
    }

    #[test]
    fn test_peel_onion_single_hop() {
        // For the simplified Sphinx, sender's session_key is the "ephemeral pubkey"
        // and receiver's private_key participates in shared secret derivation.
        let session_key = [42u8; 32];
        let receiver_privkey = [1u8; 32];
        let hop_pubkey = receiver_privkey.to_vec();
        let assoc_data = [0u8; 32];

        let payload = HopPayload {
            short_channel_id: 0,
            amt_to_forward: 100_000,
            outgoing_cltv_value: 40,
            extra_data: vec![],
        };

        let packet = create_onion_packet(
            &session_key,
            &[hop_pubkey],
            &[payload],
            &assoc_data,
        ).unwrap();

        // The receiver uses derive_shared_secret(ephemeral_pubkey=session_key, privkey)
        // but peel_onion_layer calls derive_shared_secret(ephemeral_pubkey, private_key)
        // which reverses the argument order vs create (session_key, hop_pubkey).
        // For the single-hop case the HMAC check will verify correctness.
        let peeled = peel_onion_layer(&receiver_privkey, &packet, &assoc_data).unwrap();
        assert_eq!(peeled.payload.amt_to_forward, 100_000);
        assert_eq!(peeled.payload.outgoing_cltv_value, 40);
        assert_eq!(peeled.payload.short_channel_id, 0);
    }

    #[test]
    fn test_peel_onion_bad_hmac_rejected() {
        let session_key = [42u8; 32];
        let hop_pubkey = vec![1u8; 32];
        let payload = HopPayload {
            short_channel_id: 0,
            amt_to_forward: 100_000,
            outgoing_cltv_value: 40,
            extra_data: vec![],
        };

        let mut packet = create_onion_packet(
            &session_key,
            &[hop_pubkey],
            &[payload],
            &[0u8; 32],
        ).unwrap();

        // Corrupt HMAC
        packet.hmac[0] ^= 0xff;
        let result = peel_onion_layer(&[1u8; 32], &packet, &[0u8; 32]);
        assert!(result.is_err());
    }
}
