//! P2P message types for the KuberCoin network protocol.
//!
//! Messages are length-prefixed bincode: `[u32 BE length][bincode payload]`.

use chain::{Block, BlockHeader};
use chain::compact_blocks::{CompactBlock, BlockTransactions, GetBlockTransactions};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use testnet;
use tx::Transaction;

/// Protocol version spoken by this build.
pub const PROTOCOL_VERSION: u32 = 70_016;

/// Minimum protocol version we accept from peers.
pub const MIN_PROTOCOL_VERSION: u32 = 70_015;

/// User-agent string included in Version messages.
pub const USER_AGENT: &str = concat!("/kubercoin:", env!("CARGO_PKG_VERSION"), "/");

/// Legacy magic bytes — prefer `testnet::Network::magic()` for per-network values.
pub const NETWORK_MAGIC: [u8; 4] = [0x4b, 0x43, 0x4e, 0x01]; // "KCN\x01"

/// Retrieve the network-specific magic bytes.
pub fn network_magic(network: testnet::Network) -> [u8; 4] {
    network.magic()
}

/// Service-bit: peer serves full blocks (BIP-111).
pub const NODE_NETWORK: u64 = 0x01;

/// Service-bit: peer supports SegWit (BIP-144).
pub const NODE_WITNESS: u64 = 0x08;

/// Maximum message payload size (4 MB).
pub const MAX_MESSAGE_SIZE: u32 = 4 * 1024 * 1024;

// ── Message envelope ────────────────────────────────────────────

/// A single P2P message exchanged between peers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Message {
    /// Handshake initiation.
    Version(VersionPayload),
    /// Handshake acknowledgement.
    Verack,

    // ── Peer discovery ──────────────────────────────────────
    /// Request peer addresses.
    GetAddr,
    /// Relay known peer addresses.
    Addr(Vec<AddrEntry>),

    // ── Keep-alive ──────────────────────────────────────────
    Ping(u64),
    Pong(u64),

    // ── Inventory ───────────────────────────────────────────
    /// Advertise known inventory items.
    Inv(Vec<InvItem>),
    /// Request full data for inventory items.
    GetData(Vec<InvItem>),
    /// Requested items not found.
    NotFound(Vec<InvItem>),

    // ── Block relay ─────────────────────────────────────────
    /// Request block hashes starting from locator.
    GetBlocks {
        locator: Vec<[u8; 32]>,
        stop_hash: [u8; 32],
    },
    /// Request block headers starting from locator (headers-first sync).
    GetHeaders {
        locator: Vec<[u8; 32]>,
        stop_hash: [u8; 32],
    },
    /// Response with a batch of block headers (up to 2000).
    Headers(Vec<BlockHeader>),
    /// A full block.
    BlockMsg(Block),

    // ── Transaction relay ───────────────────────────────────
    /// A transaction.
    TxMsg(Transaction),

    // ── Misc ────────────────────────────────────────────────
    /// Reject a previously received message.
    Reject {
        message: String,
        reason: String,
    },

    // ── BIP-152 Compact Block Relay ─────────────────────────
    /// Announce compact block relay preference (version, high-bandwidth mode).
    SendCmpct {
        announce: bool,
        version: u64,
    },
    /// A compact block (header + short txids + prefilled txs).
    CmpctBlock(CompactBlock),
    /// Request missing transactions for a compact block.
    GetBlockTxn(GetBlockTransactions),
    /// Response with missing transactions.
    BlockTxn(BlockTransactions),

    // ── BIP-133 feefilter ───────────────────────────────────
    /// Tell a peer the minimum fee rate (in satoshis per kB)
    /// below which we will not relay transactions.
    FeeFilter(u64),

    // ── BIP-130 sendheaders ─────────────────────────────────
    /// Ask the peer to announce new blocks via `Headers` instead of `Inv`.
    SendHeaders,

    // ── BIP-339 wtxid relay ─────────────────────────────────
    /// Signal that transaction Inv and GetData should use wtxids
    /// instead of txids.
    WtxidRelay,

    // ── BIP-155 addr v2 ─────────────────────────────────────
    /// Signal support for AddrV2 messages (sent after Version, before Verack).
    SendAddrV2,
    /// Relay known peer addresses with extended network-id format (BIP-155).
    AddrV2(Vec<AddrV2Entry>),
}

/// Payload of a Version message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionPayload {
    /// Protocol version.
    pub version: u32,
    /// Bitmask of advertised services.
    pub services: u64,
    /// Unix timestamp of the sender.
    pub timestamp: i64,
    /// Sender's best block height.
    pub start_height: u64,
    /// Random nonce for self-connection detection.
    pub nonce: u64,
    /// Human-readable client identifier.
    pub user_agent: String,
}

/// A peer address with last-seen timestamp.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddrEntry {
    /// Unix timestamp when the address was last seen active.
    pub timestamp: u64,
    /// Services offered.
    pub services: u64,
    /// Peer's reachable socket address.
    pub addr: SocketAddr,
}

// ── BIP-155 AddrV2 ──────────────────────────────────────────────

/// Network identifier for BIP-155 `addrv2` messages.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum NetworkId {
    /// IPv4 (4 bytes).
    Ipv4 = 0x01,
    /// IPv6 (16 bytes).
    Ipv6 = 0x02,
    /// Tor v3 / onion v3 (32 bytes).
    TorV3 = 0x04,
    /// I2P (32 bytes).
    I2p = 0x05,
    /// CJDNS (16 bytes).
    Cjdns = 0x06,
}

impl NetworkId {
    /// Expected address length (in bytes) for this network type.
    pub fn addr_len(self) -> usize {
        match self {
            Self::Ipv4 => 4,
            Self::Ipv6 | Self::Cjdns => 16,
            Self::TorV3 | Self::I2p => 32,
        }
    }

    /// Try to convert a raw `u8` into a known `NetworkId`.
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::Ipv4),
            0x02 => Some(Self::Ipv6),
            0x04 => Some(Self::TorV3),
            0x05 => Some(Self::I2p),
            0x06 => Some(Self::Cjdns),
            _ => None,
        }
    }
}

/// A BIP-155 extended address entry supporting Tor v3, I2P, CJDNS, etc.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddrV2Entry {
    /// Unix timestamp when the address was last seen active.
    pub timestamp: u64,
    /// Services offered (same semantics as `AddrEntry.services`).
    pub services: u64,
    /// Network type.
    pub network_id: NetworkId,
    /// Network address bytes (length determined by `network_id.addr_len()`).
    pub addr: Vec<u8>,
    /// Listening port.
    pub port: u16,
}

impl AddrV2Entry {
    /// Validate that the address length matches the network type.
    pub fn is_valid(&self) -> bool {
        self.addr.len() == self.network_id.addr_len()
    }

    /// Convert a legacy `AddrEntry` to an `AddrV2Entry`.
    pub fn from_legacy(entry: &AddrEntry) -> Self {
        match entry.addr {
            SocketAddr::V4(v4) => Self {
                timestamp: entry.timestamp,
                services: entry.services,
                network_id: NetworkId::Ipv4,
                addr: v4.ip().octets().to_vec(),
                port: v4.port(),
            },
            SocketAddr::V6(v6) => Self {
                timestamp: entry.timestamp,
                services: entry.services,
                network_id: NetworkId::Ipv6,
                addr: v6.ip().octets().to_vec(),
                port: v6.port(),
            },
        }
    }
}

/// Type of inventory item.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum InvType {
    Block,
    Tx,
}

/// An inventory vector — identifies a block or transaction by hash.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct InvItem {
    pub inv_type: InvType,
    pub hash: [u8; 32],
}

// ── Wire helpers ────────────────────────────────────────────────

/// Compute the 4-byte checksum for a payload: first 4 bytes of
/// SHA256d(payload), matching Bitcoin's wire format.
pub fn payload_checksum(payload: &[u8]) -> [u8; 4] {
    use sha2::{Digest, Sha256};
    let first = Sha256::digest(payload);
    let second = Sha256::digest(first);
    [second[0], second[1], second[2], second[3]]
}

/// Encode a [`Message`] into a length-prefixed frame:
///   `[4-byte magic][4-byte BE length][4-byte checksum][bincode payload]`
///
/// The checksum is the first 4 bytes of SHA256d(payload).
/// Uses the legacy `NETWORK_MAGIC` constant — prefer [`encode_for_network`].
pub fn encode(msg: &Message) -> Result<Vec<u8>, bincode::Error> {
    encode_for_network(msg, NETWORK_MAGIC)
}

/// Encode a [`Message`] using a specific network's magic bytes.
pub fn encode_for_network(msg: &Message, magic: [u8; 4]) -> Result<Vec<u8>, bincode::Error> {
    let payload = bincode::serialize(msg)?;
    let len = payload.len() as u32;
    let checksum = payload_checksum(&payload);
    let mut buf = Vec::with_capacity(12 + payload.len());
    buf.extend_from_slice(&magic);
    buf.extend_from_slice(&len.to_be_bytes());
    buf.extend_from_slice(&checksum);
    buf.extend_from_slice(&payload);
    Ok(buf)
}

/// Decode a bincode payload (after magic + length + checksum have been stripped).
pub fn decode(payload: &[u8]) -> Result<Message, bincode::Error> {
    bincode::deserialize(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_version() {
        let msg = Message::Version(VersionPayload {
            version: PROTOCOL_VERSION,
            services: 0x0d,
            timestamp: 1_700_000_000,
            start_height: 100,
            nonce: 42,
            user_agent: USER_AGENT.to_string(),
        });
        let bytes = encode(&msg).unwrap();
        // Check magic prefix
        assert_eq!(&bytes[..4], &NETWORK_MAGIC);
        // Decode back (skip 4-byte magic + 4-byte length + 4-byte checksum = 12 bytes)
        let decoded = decode(&bytes[12..]).unwrap();
        match decoded {
            Message::Version(v) => {
                assert_eq!(v.version, PROTOCOL_VERSION);
                assert_eq!(v.nonce, 42);
            }
            _ => panic!("expected Version"),
        }
    }

    #[test]
    fn roundtrip_getaddr_verack() {
        for msg in [Message::GetAddr, Message::Verack] {
            let bytes = encode(&msg).unwrap();
            let decoded = decode(&bytes[12..]).unwrap();
            match (&msg, &decoded) {
                (Message::GetAddr, Message::GetAddr) => {}
                (Message::Verack, Message::Verack) => {}
                _ => panic!("mismatch"),
            }
        }
    }

    #[test]
    fn max_message_size_constant() {
        assert_eq!(MAX_MESSAGE_SIZE, 4 * 1024 * 1024);
    }

    #[test]
    fn roundtrip_getheaders_headers() {
        use chain::BlockHeader;
        let msg = Message::GetHeaders {
            locator: vec![[0xabu8; 32]],
            stop_hash: [0u8; 32],
        };
        let bytes = encode(&msg).unwrap();
        let decoded = decode(&bytes[12..]).unwrap();
        match decoded {
            Message::GetHeaders { locator, .. } => assert_eq!(locator.len(), 1),
            _ => panic!("expected GetHeaders"),
        }

        let hdr = BlockHeader::new([0u8; 32], [1u8; 32], 1000, 0x1e0fffff, 0);
        let msg2 = Message::Headers(vec![hdr.clone()]);
        let bytes2 = encode(&msg2).unwrap();
        let decoded2 = decode(&bytes2[12..]).unwrap();
        match decoded2 {
            Message::Headers(hdrs) => {
                assert_eq!(hdrs.len(), 1);
                assert_eq!(hdrs[0].timestamp, 1000);
            }
            _ => panic!("expected Headers"),
        }
    }

    #[test]
    fn network_id_addr_len() {
        assert_eq!(NetworkId::Ipv4.addr_len(), 4);
        assert_eq!(NetworkId::Ipv6.addr_len(), 16);
        assert_eq!(NetworkId::TorV3.addr_len(), 32);
        assert_eq!(NetworkId::I2p.addr_len(), 32);
        assert_eq!(NetworkId::Cjdns.addr_len(), 16);
    }

    #[test]
    fn network_id_from_u8() {
        assert_eq!(NetworkId::from_u8(0x01), Some(NetworkId::Ipv4));
        assert_eq!(NetworkId::from_u8(0x04), Some(NetworkId::TorV3));
        assert_eq!(NetworkId::from_u8(0xFF), None);
    }

    #[test]
    fn addrv2_entry_validation() {
        let valid = AddrV2Entry {
            timestamp: 1_700_000_000,
            services: 1,
            network_id: NetworkId::Ipv4,
            addr: vec![127, 0, 0, 1],
            port: 8333,
        };
        assert!(valid.is_valid());

        let invalid = AddrV2Entry {
            timestamp: 1_700_000_000,
            services: 1,
            network_id: NetworkId::Ipv4,
            addr: vec![127, 0, 0], // too short
            port: 8333,
        };
        assert!(!invalid.is_valid());
    }

    #[test]
    fn addrv2_from_legacy() {
        let legacy = AddrEntry {
            timestamp: 1000,
            services: 0x0d,
            addr: "127.0.0.1:8633".parse().unwrap(),
        };
        let v2 = AddrV2Entry::from_legacy(&legacy);
        assert_eq!(v2.network_id, NetworkId::Ipv4);
        assert_eq!(v2.addr, vec![127, 0, 0, 1]);
        assert_eq!(v2.port, 8633);
        assert!(v2.is_valid());
    }

    #[test]
    fn addrv2_from_legacy_ipv6() {
        let legacy = AddrEntry {
            timestamp: 2000,
            services: 1,
            addr: "[::1]:8633".parse().unwrap(),
        };
        let v2 = AddrV2Entry::from_legacy(&legacy);
        assert_eq!(v2.network_id, NetworkId::Ipv6);
        assert_eq!(v2.addr.len(), 16);
        assert!(v2.is_valid());
    }

    #[test]
    fn roundtrip_addrv2() {
        let entry = AddrV2Entry {
            timestamp: 1_700_000_000,
            services: 1,
            network_id: NetworkId::TorV3,
            addr: vec![0xAA; 32],
            port: 9050,
        };
        let msg = Message::AddrV2(vec![entry.clone()]);
        let bytes = encode(&msg).unwrap();
        let decoded = decode(&bytes[12..]).unwrap();
        match decoded {
            Message::AddrV2(entries) => {
                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0], entry);
            }
            _ => panic!("expected AddrV2"),
        }
    }

    #[test]
    fn roundtrip_send_addrv2() {
        let msg = Message::SendAddrV2;
        let bytes = encode(&msg).unwrap();
        let decoded = decode(&bytes[12..]).unwrap();
        match decoded {
            Message::SendAddrV2 => {}
            _ => panic!("expected SendAddrV2"),
        }
    }
}
