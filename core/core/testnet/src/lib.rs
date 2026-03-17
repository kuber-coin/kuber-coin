//! KuberCoin Testnet Configuration
//!
//! Defines network parameters, genesis blocks, and consensus rules
//! for mainnet, testnet, and regtest networks.

use chain::{Block, BlockHeader};
use consensus::params;
use sha2::{Digest, Sha256};
use tx::{OutPoint, Transaction, TxInput, TxOutput, Witness};

/// Network type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Network {
    /// Main production network
    Mainnet,
    /// Public testing network
    Testnet,
    /// Local regression testing network
    Regtest,
}

impl Network {
    /// Default P2P port for this network
    pub fn default_port(&self) -> u16 {
        match self {
            Network::Mainnet => 8633,
            Network::Testnet => 18633,
            Network::Regtest => 28633,
        }
    }

    /// Default RPC port for this network
    pub fn default_rpc_port(&self) -> u16 {
        match self {
            Network::Mainnet => 8634,
            Network::Testnet => 18634,
            Network::Regtest => 28634,
        }
    }

    /// Network magic bytes for P2P message framing.
    /// Each network uses unique magic to prevent cross-network contamination.
    pub fn magic(&self) -> [u8; 4] {
        match self {
            Network::Mainnet => [0x4b, 0x43, 0x4e, 0x01], // KCN\x01
            Network::Testnet => [0x4b, 0x43, 0x54, 0x01], // KCT\x01
            Network::Regtest => [0x4b, 0x43, 0x52, 0x01], // KCR\x01
        }
    }

    /// Address prefix for this network
    pub fn address_prefix(&self) -> &'static str {
        match self {
            Network::Mainnet => "K",
            Network::Testnet => "t",
            Network::Regtest => "r",
        }
    }

    /// Human-readable network name
    pub fn name(&self) -> &'static str {
        match self {
            Network::Mainnet => "mainnet",
            Network::Testnet => "testnet", 
            Network::Regtest => "regtest",
        }
    }

    /// Parse network from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "mainnet" | "main" => Some(Network::Mainnet),
            "testnet" | "test" => Some(Network::Testnet),
            "regtest" | "local" => Some(Network::Regtest),
            _ => None,
        }
    }
}

impl Default for Network {
    fn default() -> Self {
        Network::Mainnet
    }
}

impl std::fmt::Display for Network {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.name())
    }
}

/// Convert compact `nBits` representation to a 256-bit target (big-endian).
fn compact_to_target(bits: u32) -> [u8; 32] {
    let mut target = [0u8; 32];
    let exponent = ((bits >> 24) & 0xff) as usize;
    let mantissa = bits & 0x007f_ffff;
    if exponent == 0 {
        return target;
    }
    // mantissa bytes placed at (32 - exponent) offset (big-endian)
    let start = 32usize.saturating_sub(exponent);
    if start < 32 {
        target[start] = ((mantissa >> 16) & 0xff) as u8;
    }
    if start + 1 < 32 {
        target[start + 1] = ((mantissa >> 8) & 0xff) as u8;
    }
    if start + 2 < 32 {
        target[start + 2] = (mantissa & 0xff) as u8;
    }
    target
}

/// Network-specific consensus parameters
#[derive(Debug, Clone)]
pub struct NetworkParams {
    /// Network identifier
    pub network: Network,
    /// Total supply cap (in satoshis)
    pub max_supply: u64,
    /// Initial block reward (in satoshis)
    pub initial_block_reward: u64,
    /// Blocks between halvings
    pub halving_interval: u64,
    /// Target block time in seconds
    pub target_block_time: u64,
    /// Difficulty adjustment interval (in blocks)
    pub difficulty_adjustment_interval: u64,
    /// Maximum allowed difficulty adjustment factor
    pub max_difficulty_adjustment_factor: u32,
    /// Genesis block bits (initial difficulty)
    pub genesis_bits: u32,
    /// Maximum block size in bytes
    pub max_block_size: usize,
    /// Maximum block weight (for SegWit)
    pub max_block_weight: usize,
    /// Coinbase maturity (blocks before coinbase can be spent)
    pub coinbase_maturity: u64,
    /// Minimum transaction fee per byte (in satoshis)
    pub min_relay_fee: u64,
    /// BIP-16 (P2SH) activation height
    pub bip16_height: u64,
    /// BIP34 activation height (height in coinbase)
    pub bip34_height: u64,
    /// BIP65 activation height (CHECKLOCKTIMEVERIFY)
    pub bip65_height: u64,
    /// BIP66 activation height (strict DER signatures)
    pub bip66_height: u64,
    /// SegWit activation height
    pub segwit_height: u64,
    /// Taproot activation height
    pub taproot_height: u64,
    /// Proof-of-work limit (maximum allowed target, big-endian 32 bytes).
    /// Derived from `genesis_bits` — blocks may never have a target above this.
    pub pow_limit: [u8; 32],
    /// Allow minimum-difficulty blocks on testnet after a 20-minute gap.
    pub allow_min_difficulty_blocks: bool,
    /// Minimum cumulative chain work required during IBD (big-endian 256-bit).
    /// Nodes will not fully validate a chain with less work than this.
    pub minimum_chain_work: [u8; 32],
    /// If set, skip script validation for all blocks up to and including this hash.
    pub assume_valid_block: Option<[u8; 32]>,
}

impl NetworkParams {
    /// Get parameters for mainnet
    pub fn mainnet() -> Self {
        let genesis_bits = 0x1d00ffff;
        Self {
            network: Network::Mainnet,
            max_supply: 21_000_000_00_000_000, // 21M coins * 10^8 satoshis
            initial_block_reward: 50_00_000_000, // 50 KUBER
            halving_interval: 210_000,
            target_block_time: 600, // 10 minutes
            difficulty_adjustment_interval: 2016,
            max_difficulty_adjustment_factor: 4,
            genesis_bits,
            max_block_size: chain::MAX_BLOCK_SIZE,
            max_block_weight: chain::MAX_BLOCK_WEIGHT,
            coinbase_maturity: 100,
            min_relay_fee: 1000, // 1000 satoshis/KB
            bip16_height: 0,
            bip34_height: 0,
            bip65_height: 0,
            bip66_height: 0,
            segwit_height: 0,
            taproot_height: 0,
            pow_limit: compact_to_target(genesis_bits),
            allow_min_difficulty_blocks: false,
            minimum_chain_work: [0u8; 32],
            assume_valid_block: None,
        }
    }

    /// Get parameters for testnet
    pub fn testnet() -> Self {
        let genesis_bits = 0x1e0fffff;
        Self {
            network: Network::Testnet,
            max_supply: 21_000_000_00_000_000,
            initial_block_reward: 50_00_000_000,
            halving_interval: 210_000,
            target_block_time: 600, // 10 minutes (same as mainnet)
            difficulty_adjustment_interval: 2016,
            max_difficulty_adjustment_factor: 4,
            genesis_bits,
            max_block_size: chain::MAX_BLOCK_SIZE,
            max_block_weight: chain::MAX_BLOCK_WEIGHT,
            coinbase_maturity: 100,
            min_relay_fee: 1000,
            bip16_height: 0,
            bip34_height: 0,
            bip65_height: 0,
            bip66_height: 0,
            segwit_height: 0,
            taproot_height: 0,
            pow_limit: compact_to_target(genesis_bits),
            allow_min_difficulty_blocks: true,
            minimum_chain_work: [0u8; 32],
            assume_valid_block: None,
        }
    }

    /// Get parameters for regtest
    pub fn regtest() -> Self {
        let genesis_bits = 0x207fffff;
        Self {
            network: Network::Regtest,
            max_supply: 21_000_000_00_000_000,
            initial_block_reward: 50_00_000_000,
            // Regtest relaxes time and difficulty only; subsidy schedule stays canonical.
            halving_interval: params::HALVING_INTERVAL,
            target_block_time: 1, // 1 second for fast testing
            difficulty_adjustment_interval: 1, // Adjust every block
            max_difficulty_adjustment_factor: 4,
            genesis_bits,
            max_block_size: chain::MAX_BLOCK_SIZE,
            max_block_weight: chain::MAX_BLOCK_WEIGHT,
            coinbase_maturity: 100,
            min_relay_fee: 1000,
            bip16_height: 0,
            bip34_height: 0,
            bip65_height: 0,
            bip66_height: 0,
            segwit_height: 0,
            taproot_height: 0,
            pow_limit: compact_to_target(genesis_bits),
            allow_min_difficulty_blocks: true,
            minimum_chain_work: [0u8; 32],
            assume_valid_block: None,
        }
    }

    /// Get parameters for a given network
    pub fn for_network(network: Network) -> Self {
        match network {
            Network::Mainnet => Self::mainnet(),
            Network::Testnet => Self::testnet(),
            Network::Regtest => Self::regtest(),
        }
    }

    /// Calculate block reward at a given height
    pub fn block_reward(&self, height: u64) -> u64 {
        let halvings = height / self.halving_interval;
        if halvings >= 64 {
            0
        } else {
            self.initial_block_reward >> halvings
        }
    }

    /// Check if a height is at a halving boundary
    pub fn is_halving_block(&self, height: u64) -> bool {
        height > 0 && height % self.halving_interval == 0
    }

    /// Get the next halving height after a given height
    pub fn next_halving_height(&self, height: u64) -> u64 {
        (height / self.halving_interval).saturating_add(1).saturating_mul(self.halving_interval)
    }

    /// Calculate total mined supply at a given height
    pub fn supply_at_height(&self, height: u64) -> u64 {
        if self.halving_interval == 0 {
            return 0;
        }
        let mut supply = 0u64;
        let mut current_height = 0u64;
        let mut current_reward = self.initial_block_reward;

        while current_height <= height && current_reward > 0 {
            let next_halving = (current_height / self.halving_interval)
                .saturating_add(1)
                .saturating_mul(self.halving_interval);
            let end = next_halving.min(height.saturating_add(1));
            let blocks_at_this_reward = end.saturating_sub(current_height);
            // Use checked_mul to detect overflow; saturate into max supply on overflow
            let era_supply = blocks_at_this_reward
                .checked_mul(current_reward)
                .unwrap_or(self.max_supply);
            supply = supply.saturating_add(era_supply);
            
            current_height = next_halving;
            current_reward >>= 1;
        }

        supply.min(self.max_supply)
    }
}

/// Create the genesis block for a network
pub fn genesis_block(network: Network) -> Block {
    let params = NetworkParams::for_network(network);
    
    // Genesis coinbase transaction
    let coinbase_tx = create_genesis_coinbase(network, params.initial_block_reward);
    
    // Calculate merkle root (single tx = tx hash)
    let merkle_root = double_sha256(&coinbase_tx.txid());
    
    let header = BlockHeader::with_height(
        [0u8; 32], // No previous block
        merkle_root,
        genesis_timestamp(network),
        params.genesis_bits,
        genesis_nonce(network),
        0, // height
    );

    Block {
        header,
        transactions: vec![coinbase_tx],
    }
}

/// Get genesis timestamp for a network
fn genesis_timestamp(network: Network) -> u64 {
    match network {
        Network::Mainnet => 1706832000, // Feb 1, 2024 00:00:00 UTC
        Network::Testnet => 1706832000,
        Network::Regtest => 1706832000,
    }
}

/// Get genesis nonce for a network
fn genesis_nonce(network: Network) -> u64 {
    match network {
        Network::Mainnet => 2083236893,
        Network::Testnet => 414098458,
        Network::Regtest => 0,
    }
}

/// Create the coinbase transaction for the genesis block
fn create_genesis_coinbase(network: Network, reward: u64) -> Transaction {
    let genesis_message = match network {
        Network::Mainnet => "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks - KuberCoin Genesis",
        Network::Testnet => "KuberCoin Testnet Genesis Block",
        Network::Regtest => "KuberCoin Regtest Genesis Block",
    };

    // Genesis coinbase input (no previous output)
    let coinbase_input = TxInput {
        prev_output: OutPoint::null(), // Null outpoint for coinbase
        script_sig: genesis_message.as_bytes().to_vec(),
        sequence: 0xffffffff,
        witness: Witness::new(),
    };

    // Genesis coinbase output (unspendable - pay to empty script)
    let coinbase_output = TxOutput {
        value: reward,
        script_pubkey: vec![0x51], // OP_TRUE for genesis (or specific address)
    };

    Transaction {
        version: 1,
        inputs: vec![coinbase_input],
        outputs: vec![coinbase_output],
        lock_time: 0,
    }
}

/// Double SHA256 hash
fn double_sha256(data: &[u8]) -> [u8; 32] {
    let first = Sha256::digest(data);
    let second = Sha256::digest(&first);
    let mut result = [0u8; 32];
    result.copy_from_slice(&second);
    result
}

/// Get genesis block hash for a network
pub fn genesis_hash(network: Network) -> [u8; 32] {
    let block = genesis_block(network);
    block.header.hash()
}

/// Check if a block hash matches the genesis hash
pub fn is_genesis_block(hash: &[u8; 32], network: Network) -> bool {
    *hash == genesis_hash(network)
}

/// DNS seeds for peer discovery
pub fn dns_seeds(network: Network) -> Vec<&'static str> {
    match network {
        Network::Mainnet => vec![
            "seed.kuber-coin.com",
            "dnsseed.kuber-coin.com",
            "seed2.kuber-coin.com",
        ],
        Network::Testnet => vec![
            "testnet-seed.kuber-coin.com",
            "testnet2.kuber-coin.com",
        ],
        Network::Regtest => vec![], // No DNS seeds for regtest
    }
}

/// Hard-coded seed nodes for peer discovery
pub fn seed_nodes(network: Network) -> Vec<&'static str> {
    match network {
        Network::Mainnet => vec![
            "node1.kuber-coin.com:8633",
            "node2.kuber-coin.com:8633",
            "node3.kuber-coin.com:8633",
        ],
        Network::Testnet => vec![
            "192.0.2.10:18633",     // example seed1 placeholder
            "198.51.100.20:18633",  // example seed2 placeholder
        ],
        Network::Regtest => vec![], // No seed nodes for regtest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_defaults() {
        assert_eq!(Network::Mainnet.default_port(), 8633);
        assert_eq!(Network::Testnet.default_port(), 18633);
        assert_eq!(Network::Regtest.default_port(), 28633);
    }

    #[test]
    fn test_network_from_str() {
        assert_eq!(Network::from_str("mainnet"), Some(Network::Mainnet));
        assert_eq!(Network::from_str("testnet"), Some(Network::Testnet));
        assert_eq!(Network::from_str("regtest"), Some(Network::Regtest));
        assert_eq!(Network::from_str("invalid"), None);
    }

    #[test]
    fn test_block_reward_halving() {
        let params = NetworkParams::mainnet();
        
        // First halving period
        assert_eq!(params.block_reward(0), 50_00_000_000);
        assert_eq!(params.block_reward(209_999), 50_00_000_000);
        
        // Second halving period  
        assert_eq!(params.block_reward(210_000), 25_00_000_000);
        assert_eq!(params.block_reward(419_999), 25_00_000_000);
        
        // Third halving period
        assert_eq!(params.block_reward(420_000), 12_50_000_000);
    }

    #[test]
    fn test_genesis_block() {
        let genesis = genesis_block(Network::Mainnet);
        assert_eq!(genesis.header.height, 0);
        assert_eq!(genesis.header.prev_hash, [0u8; 32]);
        assert_eq!(genesis.transactions.len(), 1);
    }

    #[test]
    fn test_supply_calculation() {
        let params = NetworkParams::mainnet();
        
        // After first block
        assert_eq!(params.supply_at_height(0), 50_00_000_000);
        
        // After 100 blocks
        assert_eq!(params.supply_at_height(99), 100 * 50_00_000_000);
    }

    #[test]
    fn test_max_supply_cap() {
        let params = NetworkParams::mainnet();
        
        // Supply should never exceed max
        let supply = params.supply_at_height(100_000_000);
        assert!(supply <= params.max_supply);
    }
    
    #[test]
    fn test_supply_at_height_zero_halving_interval() {
        // Edge case: halving_interval == 0 should not panic (division by zero)
        let mut params = NetworkParams::mainnet();
        params.halving_interval = 0;
        assert_eq!(params.supply_at_height(100), 0);
    }
    
    #[test]
    fn test_next_halving_no_overflow() {
        let params = NetworkParams::mainnet();
        // Very large height should not panic
        let nh = params.next_halving_height(u64::MAX - 1);
        assert!(nh > 0);
    }
    
    #[test]
    fn test_supply_large_reward_no_panic() {
        // Large reward * blocks could overflow u64 — should saturate to max_supply
        let mut params = NetworkParams::mainnet();
        params.initial_block_reward = u64::MAX / 2;
        params.halving_interval = 1_000_000;
        let supply = params.supply_at_height(2_000_000);
        assert!(supply <= params.max_supply);
    }

    // ── Cross-crate consistency tests ────────────────────────────

    #[test]
    fn test_block_size_matches_chain_constants() {
        for net in [Network::Mainnet, Network::Testnet, Network::Regtest] {
            let params = NetworkParams::for_network(net);
            assert_eq!(
                params.max_block_size,
                chain::MAX_BLOCK_SIZE,
                "{net:?} max_block_size diverges from chain::MAX_BLOCK_SIZE"
            );
            assert_eq!(
                params.max_block_weight,
                chain::MAX_BLOCK_WEIGHT,
                "{net:?} max_block_weight diverges from chain::MAX_BLOCK_WEIGHT"
            );
        }
    }

    #[test]
    fn test_params_match_consensus_constants() {
        use consensus::params;

        let p = NetworkParams::mainnet();
        assert_eq!(p.max_supply, params::MAX_SUPPLY);
        assert_eq!(p.initial_block_reward, params::INITIAL_BLOCK_REWARD);
        assert_eq!(p.halving_interval, params::HALVING_INTERVAL);
        assert_eq!(p.coinbase_maturity, params::COINBASE_MATURITY);
        assert_eq!(p.target_block_time, params::TARGET_BLOCK_TIME_SECS);
        assert_eq!(p.difficulty_adjustment_interval, params::DIFFICULTY_ADJUSTMENT_INTERVAL);
        assert_eq!(
            p.max_difficulty_adjustment_factor as u64,
            params::MAX_DIFFICULTY_ADJUSTMENT_FACTOR
        );
        assert_eq!(p.max_block_size, params::MAX_BLOCK_SIZE);
        assert_eq!(p.max_block_weight, params::MAX_BLOCK_WEIGHT);
    }

    #[test]
    fn test_regtest_uses_canonical_halving_interval() {
        use consensus::params;

        let p = NetworkParams::regtest();
        assert_eq!(p.halving_interval, params::HALVING_INTERVAL);
        assert_eq!(p.block_reward(params::HALVING_INTERVAL - 1), params::INITIAL_BLOCK_REWARD);
        assert_eq!(p.block_reward(params::HALVING_INTERVAL), params::INITIAL_BLOCK_REWARD / 2);
    }

    #[test]
    fn test_genesis_block_deterministic() {
        // Genesis block must be identical across calls
        for net in [Network::Mainnet, Network::Testnet, Network::Regtest] {
            let g1 = genesis_block(net);
            let g2 = genesis_block(net);
            assert_eq!(g1.hash(), g2.hash(), "{net:?} genesis is non-deterministic");
        }
    }

    #[test]
    fn test_compact_to_target_mainnet() {
        // 0x1d00ffff → target should have leading zeros and 00ffff at offset
        let target = compact_to_target(0x1d00ffff);
        // Exponent 0x1d = 29, mantissa = 0x00ffff
        // Bytes at indices 32-29=3,4,5 → target[3]=0x00, target[4]=0xff, target[5]=0xff
        assert_eq!(target[3], 0x00);
        assert_eq!(target[4], 0xff);
        assert_eq!(target[5], 0xff);
        // First 3 bytes must be zero (leading zeros)
        assert_eq!(&target[..3], &[0, 0, 0]);
    }

    #[test]
    fn test_pow_limit_per_network() {
        let mn = NetworkParams::mainnet();
        let tn = NetworkParams::testnet();
        let rt = NetworkParams::regtest();
        // Regtest pow_limit is largest (easiest), mainnet is smallest (hardest)
        assert!(rt.pow_limit > tn.pow_limit);
        assert!(tn.pow_limit > mn.pow_limit);
    }

    #[test]
    fn test_min_difficulty_flags() {
        assert!(!NetworkParams::mainnet().allow_min_difficulty_blocks);
        assert!(NetworkParams::testnet().allow_min_difficulty_blocks);
        assert!(NetworkParams::regtest().allow_min_difficulty_blocks);
    }

    #[test]
    fn test_bip16_height_present() {
        for net in [Network::Mainnet, Network::Testnet, Network::Regtest] {
            let params = NetworkParams::for_network(net);
            // All active from genesis in KuberCoin
            assert_eq!(params.bip16_height, 0);
        }
    }
}
