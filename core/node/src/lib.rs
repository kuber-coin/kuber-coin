//! KuberCoin Node Library
//!
//! Core node functionality including state management, mempool,
//! P2P networking, and REST/RPC API server.

pub mod config;
pub mod mempool;
pub mod network;
pub mod notifications;
pub mod rpc;
mod rpc_chain;
mod rpc_mining;
mod rpc_network;
mod rpc_wallet;
pub mod state;
pub mod stratum;

// Re-export main types
pub use config::Config;
pub use mempool::Mempool;
pub use network::P2PServer;
pub use rpc::AppState;
pub use state::NodeState;
