//! P2P networking layer for the KuberCoin node.
//!
//! Provides TCP-based peer-to-peer connectivity with:
//! - Version/Verack handshake
//! - GetAddr / Addr peer discovery
//! - Block and transaction relay
//! - DNS seed and hardcoded seed-node bootstrap

pub mod message;
pub mod peer;
pub mod server;
pub mod upnp;
pub mod v2_transport;

pub use message::{Message, NETWORK_MAGIC, PROTOCOL_VERSION};
pub use peer::{Direction, HandshakeState, PeerManager};
pub use server::P2PServer;
