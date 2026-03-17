//! KuberCoin Lightning Network Implementation
//!
//! Provides instant, low-fee payments through payment channels.

pub mod channel;
pub mod channel_manager;
pub mod backup;
pub mod funding;
pub mod gossip;
pub mod htlc;
pub mod invoice;
pub mod liquidity;
pub mod messages;
pub mod onion;
pub mod dual_funding;
pub mod persistence;
pub mod routing;
pub mod watchtower;

pub use channel::{Channel, ChannelConfig, ChannelState};
pub use channel_manager::{ChannelManager, NegotiationPhase};
pub use htlc::{Htlc, HtlcDirection, HtlcState};
pub use invoice::{Invoice, PaymentHash, PaymentPreimage};
pub use messages::LightningMessage;
pub use routing::{Route, RouteHop};

use thiserror::Error;

/// Lightning-specific errors
#[derive(Error, Debug)]
pub enum LightningError {
    #[error("channel not found: {0}")]
    ChannelNotFound(String),
    
    #[error("insufficient channel balance")]
    InsufficientBalance,
    
    #[error("invalid HTLC: {0}")]
    InvalidHtlc(String),
    
    #[error("payment failed: {0}")]
    PaymentFailed(String),
    
    #[error("channel closed")]
    ChannelClosed,
    
    #[error("timeout exceeded")]
    Timeout,
    
    #[error("invalid preimage")]
    InvalidPreimage,
    
    #[error("routing failed: {0}")]
    RoutingFailed(String),
    
    #[error("serialization error: {0}")]
    Serialization(String),
}

pub type Result<T> = std::result::Result<T, LightningError>;
