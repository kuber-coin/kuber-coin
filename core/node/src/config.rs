//! Configuration module for KuberCoin node

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use testnet;

/// Network type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Network {
    #[default]
    Mainnet,
    Testnet,
    Regtest,
}

/// Node configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Data directory
    pub data_dir: PathBuf,
    
    /// Network type
    #[serde(default)]
    pub network: Network,
    
    /// RPC listen address
    #[serde(default = "default_rpc_addr")]
    pub rpc_addr: String,
    
    /// REST API listen address
    #[serde(default = "default_rest_addr")]
    pub rest_addr: String,
    
    /// P2P listen address
    #[serde(default = "default_p2p_addr")]
    pub p2p_addr: String,
    
    /// Maximum mempool size in bytes
    #[serde(default = "default_max_mempool")]
    pub max_mempool_size: usize,
    
    /// Maximum number of blocks kept in the in-memory cache.
    /// Evicted blocks are still available from persistent storage.
    #[serde(default = "default_max_block_cache")]
    pub max_block_cache: usize,

    /// If set, prune block bodies older than this many blocks from the tip.
    /// Headers and UTXO data are always kept. Set to 0 or omit to disable.
    #[serde(default)]
    pub prune_depth: Option<u64>,

    /// Stratum mining pool listen address. If set, starts the Stratum V1 server.
    /// Example: "0.0.0.0:3333"
    #[serde(default)]
    pub stratum_addr: Option<String>,

    /// Enable UPnP port mapping for the P2P listen port.
    #[serde(default)]
    pub upnp: bool,

    /// ZMQ TCP publisher address. If set, starts the ZMQ-compatible notification
    /// publisher on this address (e.g. "tcp://127.0.0.1:28332").
    #[serde(default)]
    pub zmq_pub_addr: Option<String>,

    /// List of valid API keys for HTTP bearer-token authentication.
    /// Read from KUBERCOIN_API_KEYS (comma-separated). Empty = auth disabled.
    #[serde(default)]
    pub api_keys: Vec<String>,

    /// SOCKS5 proxy address for all outbound P2P connections.
    /// Set to your Tor SOCKS port (e.g. "127.0.0.1:9050") to route the
    /// entire P2P layer through Tor.  See docs/TOR_CONFIGURATION.md.
    #[serde(default)]
    pub proxy_addr: Option<String>,

    /// If true, refuse direct outbound connections and only connect via
    /// `proxy_addr`.  Prevents IP-address leakage when running as a Tor-only
    /// node.  Requires `proxy_addr` to be set.
    #[serde(default)]
    pub tor_only: bool,

    /// Accept .onion (Tor v3) addresses received via BIP-155 AddrV2 messages.
    /// Requires `proxy_addr` to be configured.
    #[serde(default)]
    pub allow_onion: bool,
}

fn default_rpc_addr() -> String {
    "127.0.0.1:8634".to_string()
}

fn default_rest_addr() -> String {
    "127.0.0.1:8080".to_string()
}

fn default_p2p_addr() -> String {
    "0.0.0.0:8633".to_string()
}

impl Config {
    /// Return the P2P address adjusted for the configured network.
    pub fn effective_p2p_addr(&self) -> String {
        let tn = match self.network {
            Network::Testnet => testnet::Network::Testnet,
            Network::Regtest => testnet::Network::Regtest,
            _ => testnet::Network::Mainnet,
        };
        let port = tn.default_port();
        format!("0.0.0.0:{port}")
    }

    /// Return the RPC address adjusted for the configured network.
    pub fn effective_rpc_addr(&self) -> String {
        let tn = match self.network {
            Network::Testnet => testnet::Network::Testnet,
            Network::Regtest => testnet::Network::Regtest,
            _ => testnet::Network::Mainnet,
        };
        let port = tn.default_rpc_port();
        format!("127.0.0.1:{port}")
    }
}

fn default_max_mempool() -> usize {
    300 * 1024 * 1024 // 300 MB
}

fn default_max_block_cache() -> usize {
    512
}

impl Default for Config {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("./data"),
            network: Network::default(),
            rpc_addr: default_rpc_addr(),
            rest_addr: default_rest_addr(),
            p2p_addr: default_p2p_addr(),
            max_mempool_size: default_max_mempool(),
            max_block_cache: default_max_block_cache(),
            prune_depth: None,
            stratum_addr: None,
            upnp: false,
            zmq_pub_addr: None,
            api_keys: Vec::new(),
            proxy_addr: None,
            tor_only: false,
            allow_onion: false,
        }
    }
}

impl Config {
    /// Get the database path
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("chaindata")
    }
    
    /// Load configuration from file
    pub fn load(path: &PathBuf) -> anyhow::Result<Self> {
        let contents = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&contents)?;
        Ok(config)
    }
    
    /// Save configuration to file
    pub fn save(&self, path: &PathBuf) -> anyhow::Result<()> {
        let contents = toml::to_string_pretty(self)?;
        std::fs::write(path, contents)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.network, Network::Mainnet);
        assert_eq!(config.rpc_addr, "127.0.0.1:8634");
    }
    
    #[test]
    fn test_db_path() {
        let config = Config {
            data_dir: PathBuf::from("/tmp/kubercoin"),
            ..Default::default()
        };
        assert_eq!(config.db_path(), PathBuf::from("/tmp/kubercoin/chaindata"));
    }
}
