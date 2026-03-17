//! Node state management
//!
//! Manages blockchain state, UTXO set, and persistent storage.

use anyhow::{bail, Result};
use chain::{Block, UtxoSet};
use tracing::info;
use consensus::validator::{self, ValidationError};
use consensus::CheckpointManager;
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use storage::{SledStorage, Storage, StorageConfig};

use crate::config::Config;

fn current_unix_time_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Maximum number of orphan blocks kept in memory.
const MAX_ORPHAN_BLOCKS: usize = 100;

/// Maximum reorganization depth (safety limit).
const MAX_REORG_DEPTH: usize = 100;

/// Header-only entry in the block index: records that we know about a header
/// but may or may not have the full block data.
#[derive(Clone, Debug)]
pub struct BlockIndex {
    /// Block header hash
    pub hash: [u8; 32],
    /// Previous block hash
    pub prev_hash: [u8; 32],
    /// Block height
    pub height: u64,
    /// Compact difficulty target (`nBits`)
    pub bits: u32,
    /// Cumulative chain work up to and including this block (big-endian 256-bit)
    pub cumulative_work: [u8; 32],
    /// Whether the full block data is available
    pub have_data: bool,
    /// Whether undo data is available (only meaningful when `have_data` is true)
    pub have_undo: bool,
}

/// Thread-safe node state
pub struct NodeState {
    /// Best chain tip hash
    tip: RwLock<[u8; 32]>,
    
    /// Chain height
    height: RwLock<u64>,
    
    /// Block cache (hash -> block)
    blocks: RwLock<HashMap<[u8; 32], Block>>,
    
    /// Insertion-order queue for cache eviction (front = oldest)
    cache_order: RwLock<VecDeque<[u8; 32]>>,
    
    /// Height to hash mapping
    height_map: RwLock<HashMap<u64, [u8; 32]>>,
    
    /// UTXO set (current chain state)
    utxo_set: RwLock<UtxoSet>,
    
    /// Cumulative chainwork for the best chain tip (big-endian 256-bit)
    chainwork: RwLock<[u8; 32]>,
    
    /// Per-block cumulative chainwork (block_hash → cumulative work)
    block_work: RwLock<HashMap<[u8; 32], [u8; 32]>>,
    
    /// Orphan block pool: blocks whose parent we haven't seen yet.
    /// Key = block hash, Value = block data.
    orphan_blocks: RwLock<HashMap<[u8; 32], Block>>,

    /// Reverse index: parent_hash → set of orphan child hashes.
    orphans_by_parent: RwLock<HashMap<[u8; 32], HashSet<[u8; 32]>>>,

    /// Header-only block index: tracks known headers even without full data.
    block_index: RwLock<HashMap<[u8; 32], BlockIndex>>,

    /// Transaction index: txid → confirmed block height (O(1) tx lookup).
    tx_index: RwLock<HashMap<[u8; 32], u64>>,

    /// Script-pubkey index: script_pubkey bytes → txids of all matching outputs.
    script_pubkey_index: RwLock<HashMap<Vec<u8>, Vec<[u8; 32]>>>,

    /// Best-chain index: block hash → confirmed height (O(1) reverse height lookup).
    chain_height_index: RwLock<HashMap<[u8; 32], u64>>,

    /// Storage backend
    storage: SledStorage,
    
    /// Configuration
    config: Config,

    /// Checkpoint manager for chain anchor enforcement
    checkpoints: CheckpointManager,
}

impl NodeState {
    fn network_params(&self) -> testnet::NetworkParams {
        let net = match self.config.network {
            crate::config::Network::Testnet => testnet::Network::Testnet,
            crate::config::Network::Regtest => testnet::Network::Regtest,
            _ => testnet::Network::Mainnet,
        };
        testnet::NetworkParams::for_network(net)
    }

    /// Create a new node state from configuration
    pub fn new(config: Config) -> Result<Arc<Self>> {
        // Setup storage
        let storage_config = StorageConfig {
            path: config.db_path().to_string_lossy().to_string(),
            cache_capacity: 512 * 1024 * 1024, // 512 MB
            compression: true,
            flush_every_ms: Some(500),
        };
        
        let storage = SledStorage::new(storage_config)?;

        // Build checkpoint list anchored to the genesis block for this network.
        let tn = match config.network {
            crate::config::Network::Testnet => testnet::Network::Testnet,
            crate::config::Network::Regtest => testnet::Network::Regtest,
            _ => testnet::Network::Mainnet,
        };
        let genesis_hash = testnet::genesis_hash(tn);
        let checkpoints = CheckpointManager::new(vec![
            consensus::Checkpoint { height: 0, hash: genesis_hash },
        ]);
        
        let state = Arc::new(Self {
            tip: RwLock::new([0u8; 32]),
            height: RwLock::new(0),
            blocks: RwLock::new(HashMap::new()),
            cache_order: RwLock::new(VecDeque::new()),
            height_map: RwLock::new(HashMap::new()),
            utxo_set: RwLock::new(UtxoSet::new()),
            chainwork: RwLock::new([0u8; 32]),
            block_work: RwLock::new(HashMap::new()),
            orphan_blocks: RwLock::new(HashMap::new()),
            orphans_by_parent: RwLock::new(HashMap::new()),
            block_index: RwLock::new(HashMap::new()),
            tx_index: RwLock::new(HashMap::new()),
            script_pubkey_index: RwLock::new(HashMap::new()),
            chain_height_index: RwLock::new(HashMap::new()),
            storage,
            config,
            checkpoints,
        });
        
        state.init()?;
        
        Ok(state)
    }
    
    /// Initialize state from storage or genesis
    fn init(&self) -> Result<()> {
        let network = match self.config.network {
            crate::config::Network::Testnet => testnet::Network::Testnet,
            crate::config::Network::Regtest => testnet::Network::Regtest,
            _ => testnet::Network::Mainnet,
        };
        let genesis = testnet::genesis_block(network);
        let genesis_hash = genesis.hash();
        let genesis_work = consensus::work_from_compact(genesis.header.bits);

        // Try to load tip from storage
        if let Ok(Some(tip_bytes)) = self.storage.get(b"tip") {
            if tip_bytes.len() == 32 {
                let mut tip = [0u8; 32];
                tip.copy_from_slice(&tip_bytes);
                *self.tip.write() = tip;
                
                // Load height
                if let Ok(Some(height_bytes)) = self.storage.get(b"height") {
                    if height_bytes.len() >= 8 {
                        let h = u64::from_le_bytes(height_bytes[..8].try_into().unwrap());
                        *self.height.write() = h;
                    }
                }
                
                // Restore UTXO set from storage (try compressed format first, then legacy bincode)
                if let Ok(Some(utxo_bytes)) = self.storage.get(b"utxo_set") {
                    if let Some(utxo) = chain::decompress_utxo_set(&utxo_bytes) {
                        *self.utxo_set.write() = utxo;
                    } else if let Ok(utxo) = bincode::deserialize::<UtxoSet>(&utxo_bytes) {
                        *self.utxo_set.write() = utxo;
                    }
                }
                
                // Restore height_map from storage
                if let Ok(Some(hm_bytes)) = self.storage.get(b"height_map") {
                    if let Ok(hm) = bincode::deserialize::<HashMap<u64, [u8; 32]>>(&hm_bytes) {
                        *self.height_map.write() = hm;
                    }
                }
                
                // Restore chainwork from storage
                if let Ok(Some(cw_bytes)) = self.storage.get(b"chainwork") {
                    if cw_bytes.len() == 32 {
                        let mut cw = [0u8; 32];
                        cw.copy_from_slice(&cw_bytes);
                        *self.chainwork.write() = cw;
                    }
                }
                
                // Restore per-block chainwork from storage
                if let Ok(Some(bw_bytes)) = self.storage.get(b"block_work") {
                    if let Ok(bw) = bincode::deserialize::<HashMap<[u8; 32], [u8; 32]>>(&bw_bytes) {
                        *self.block_work.write() = bw;
                    }
                }
                
                // Verify UTXO commitment hash (if stored)
                if let Ok(Some(hash_bytes)) = self.storage.get(b"utxo_hash") {
                    if hash_bytes.len() == 32 {
                        let mut stored_hash = [0u8; 32];
                        stored_hash.copy_from_slice(&hash_bytes);
                        let computed = self.utxo_set.read().commitment_hash();
                        if stored_hash != computed {
                            bail!("UTXO set integrity check failed: stored hash does not match computed hash");
                        }
                    }
                }
                
                // Restore block index from storage
                if let Ok(Some(bi_bytes)) = self.storage.get(b"block_index") {
                    type BiTuple = ([u8; 32], [u8; 32], u64, u32, [u8; 32], bool, bool);
                    if let Ok(entries) = bincode::deserialize::<Vec<BiTuple>>(&bi_bytes) {
                        let mut idx = self.block_index.write();
                        for (hash, prev_hash, height, bits, cumulative_work, have_data, have_undo) in entries {
                            idx.insert(hash, BlockIndex {
                                hash,
                                prev_hash,
                                height,
                                bits,
                                cumulative_work,
                                have_data,
                                have_undo,
                            });
                        }
                    }
                }

                self.ensure_genesis_block_available(&genesis, genesis_hash, genesis_work)?;
                // Load persisted indexes; rebuild from blocks if they are missing or stale.
                if !self.try_load_indexes() {
                    self.rebuild_indexes();
                }
                return Ok(());
            }
        }
        
        // Apply genesis block to UTXO set
        self.utxo_set.write().apply_block(&genesis)
            .map_err(|e| anyhow::anyhow!("Failed to apply genesis block: {}", e))?;

        self.insert_block_cache(genesis_hash, genesis.clone());
        self.height_map.write().insert(0, genesis_hash);
        self.block_work.write().insert(genesis_hash, genesis_work);
        self.block_index.write().insert(genesis_hash, BlockIndex {
            hash: genesis_hash,
            prev_hash: genesis.header.prev_hash,
            height: genesis.header.height,
            bits: genesis.header.bits,
            cumulative_work: genesis_work,
            have_data: true,
            have_undo: false,
        });
        *self.tip.write() = genesis_hash;
        *self.height.write() = 0;
        *self.chainwork.write() = genesis_work;
        
        // Persist all state atomically
        self.persist_state(&genesis_hash, 0)?;
        let key = format!("block:{}", hex::encode(genesis_hash));
        self.storage.put(key.as_bytes(), &bincode::serialize(&genesis)?)?;
        // Build initial indexes for the genesis block (always fast — 1 block).
        self.rebuild_indexes();
        Ok(())
    }

    fn ensure_genesis_block_available(
        &self,
        genesis: &Block,
        genesis_hash: [u8; 32],
        genesis_work: [u8; 32],
    ) -> Result<()> {
        if self.get_block(&genesis_hash).is_none() {
            self.insert_block_cache(genesis_hash, genesis.clone());
            let key = format!("block:{}", hex::encode(genesis_hash));
            self.storage.put(key.as_bytes(), &bincode::serialize(genesis)?)?;
        }

        self.height_map.write().entry(0).or_insert(genesis_hash);
        self.block_work.write().entry(genesis_hash).or_insert(genesis_work);
        self.block_index.write().entry(genesis_hash).or_insert(BlockIndex {
            hash: genesis_hash,
            prev_hash: genesis.header.prev_hash,
            height: genesis.header.height,
            bits: genesis.header.bits,
            cumulative_work: genesis_work,
            have_data: true,
            have_undo: false,
        });

        Ok(())
    }
    
    /// Get the current blockchain tip hash
    pub fn get_tip(&self) -> [u8; 32] {
        *self.tip.read()
    }
    
    /// Get the current blockchain height
    pub fn get_height(&self) -> u64 {
        *self.height.read()
    }
    
    /// Get the configured network
    pub fn network(&self) -> crate::config::Network {
        self.config.network
    }

    /// Calculate the compact `bits` value for the next block at `height`.
    ///
    /// Uses Bitcoin-style difficulty retarget every `difficulty_adjustment_interval`
    /// blocks, clamped by `max_difficulty_adjustment_factor` (default 4×).
    pub fn calculate_next_bits(&self, height: u64) -> u32 {
        if height == 0 {
            return self.network_params().genesis_bits;
        }

        let parent_hash = match self.get_block_hash(height - 1) {
            Some(hash) => hash,
            None => return self.network_params().genesis_bits,
        };

        self.calculate_next_bits_for_parent(&parent_hash, height)
    }

    pub fn calculate_next_bits_with_timestamp(&self, height: u64, candidate_timestamp: u64) -> u32 {
        if height == 0 {
            return self.network_params().genesis_bits;
        }

        let parent_hash = match self.get_block_hash(height - 1) {
            Some(hash) => hash,
            None => return self.network_params().genesis_bits,
        };

        self.calculate_next_bits_for_parent_and_timestamp(&parent_hash, height, Some(candidate_timestamp))
    }

    fn calculate_next_bits_for_parent(&self, parent_hash: &[u8; 32], height: u64) -> u32 {
        self.calculate_next_bits_for_parent_and_timestamp(parent_hash, height, None)
    }

    fn calculate_next_bits_for_parent_and_timestamp(
        &self,
        parent_hash: &[u8; 32],
        height: u64,
        candidate_timestamp: Option<u64>,
    ) -> u32 {
        let params = self.network_params();
        let interval = params.difficulty_adjustment_interval;
        let clamp = params.max_difficulty_adjustment_factor as u64;

        if height == 0 {
            return params.genesis_bits;
        }

        let Some(parent_block) = self.get_block(parent_hash) else {
            return params.genesis_bits;
        };

        if height <= 1 {
            return parent_block.header.bits;
        }

        if height % interval != 0 {
            if params.allow_min_difficulty_blocks {
                if let Some(candidate_timestamp) = candidate_timestamp {
                    let min_difficulty_gap = params.target_block_time.saturating_mul(2);
                    if candidate_timestamp > parent_block.header.timestamp.saturating_add(min_difficulty_gap) {
                        return params.genesis_bits;
                    }

                    let mut cursor = parent_block.clone();
                    while cursor.header.height > 0
                        && cursor.header.height % interval != 0
                        && cursor.header.bits == params.genesis_bits
                    {
                        let prev_hash = cursor.header.prev_hash;
                        let Some(prev_block) = self.get_block(&prev_hash) else {
                            break;
                        };
                        cursor = prev_block;
                    }
                    return cursor.header.bits;
                }
            }

            // Genesis or non-retarget boundary → inherit the direct parent's bits.
            return parent_block.header.bits;
        }

        // Retarget boundary — compute new difficulty.
        let period_start_height = height - interval;
        let end_ts = parent_block.header.timestamp;
        let mut cursor = parent_block.clone();
        while cursor.header.height > period_start_height {
            let prev_hash = cursor.header.prev_hash;
            let Some(prev_block) = self.get_block(&prev_hash) else {
                return params.genesis_bits;
            };
            cursor = prev_block;
        }

        if cursor.header.height != period_start_height {
            return params.genesis_bits;
        }

        let start_ts = cursor.header.timestamp;

        let actual_timespan = end_ts.saturating_sub(start_ts);
        let target_timespan = interval * params.target_block_time;

        // Clamp actual_timespan to [target/clamp, target*clamp]
        let min_ts = (target_timespan / clamp).max(1);
        let max_ts = target_timespan * clamp;
        let clamped = actual_timespan.max(min_ts).min(max_ts);

        let old_target = consensus::difficulty::bits_to_target(parent_block.header.bits);
        let max_target = consensus::difficulty::bits_to_target(params.genesis_bits);

        let new_target =
            consensus::difficulty::retarget_target(&old_target, clamped, target_timespan, &max_target);
        consensus::difficulty::target_to_bits(&new_target)
    }
    
    /// Get block by hash
    pub fn get_block(&self, hash: &[u8; 32]) -> Option<Block> {
        // Check cache
        if let Some(block) = self.blocks.read().get(hash) {
            return Some(block.clone());
        }
        
        // Try storage
        let key = format!("block:{}", hex::encode(hash));
        if let Ok(Some(data)) = self.storage.get(key.as_bytes()) {
            if let Ok(block) = bincode::deserialize::<Block>(&data) {
                return Some(block);
            }
        }
        
        None
    }
    
    /// Get block hash by height
    pub fn get_block_hash(&self, height: u64) -> Option<[u8; 32]> {
        self.height_map.read().get(&height).copied()
    }

    /// Compute the BIP-113 Median-Time-Past for a given block height.
    ///
    /// Returns the median Unix timestamp of the 11 blocks immediately preceding
    /// `height`.  If fewer than 11 ancestors exist (e.g. near genesis), all
    /// available ancestors are used.  Returns 0 when there are no ancestors
    /// (i.e. `height == 0`).
    ///
    /// This is used to enforce BIP-113 lock_time and BIP-68 CSV semantics:
    /// timestamp-based constraints are compared against MTP, not wall clock.
    pub fn get_mtp(&self, height: u64) -> u64 {
        let start = height.saturating_sub(11);
        let mut timestamps: Vec<u64> = Vec::with_capacity(11);
        for h in start..height {
            if let Some(hash) = self.get_block_hash(h) {
                if let Some(blk) = self.get_block(&hash) {
                    timestamps.push(blk.header.timestamp);
                }
            }
        }
        if timestamps.is_empty() {
            return 0;
        }
        timestamps.sort_unstable();
        timestamps[timestamps.len() / 2]
    }

    /// Get the cumulative chainwork for the best chain tip.
    pub fn get_chainwork(&self) -> [u8; 32] {
        *self.chainwork.read()
    }
    
    /// Add a new block to the chain.
    ///
    /// Validates and connects the block.  If it extends the current
    /// best chain it is applied directly.  If it extends a side-chain
    /// and creates more cumulative work than the current tip a reorg
    /// is performed: the current chain is rolled back to the fork
    /// point and the new chain is applied, all under full consensus
    /// validation.
    pub fn add_block(&self, block: &Block) -> Result<()> {
        let hash = block.hash();
        let height = block.header.height;
        let prev = block.header.prev_hash;
        let params = self.network_params();

        // ── Checkpoint enforcement ──────────────────────────────
        if !self.checkpoints.verify(height, &hash) {
            bail!("Block at height {} fails checkpoint verification", height);
        }

        let max_future_timestamp = current_unix_time_secs()
            .saturating_add(consensus::params::MAX_FUTURE_BLOCK_TIME_SECS);
        if block.header.timestamp > max_future_timestamp {
            bail!(
                "Block timestamp {} exceeds future-time limit {}",
                block.header.timestamp,
                max_future_timestamp
            );
        }

        // Check the parent is known (either in memory cache or storage)
        let parent_known = prev == [0u8; 32]
            || self.blocks.read().contains_key(&prev)
            || self.storage.get(format!("block:{}", hex::encode(prev)).as_bytes())
                .ok().flatten().is_some();
        if !parent_known {
            // Parent not known — add to orphan pool instead of failing
            self.add_orphan(hash, block.clone());
            return Ok(());
        }

        if prev == [0u8; 32] {
            if height != 0 {
                bail!("Genesis-parent block must have height 0, got {height}");
            }
            if block.header.bits != params.genesis_bits {
                bail!(
                    "Genesis-parent block uses unexpected bits {:#010x}, expected {:#010x}",
                    block.header.bits,
                    params.genesis_bits
                );
            }
        } else {
            let parent_block = self
                .get_block(&prev)
                .ok_or_else(|| anyhow::anyhow!("Missing parent block {} after parent-known check", hex::encode(prev)))?;
            let expected_height = parent_block.header.height.saturating_add(1);
            if height != expected_height {
                bail!(
                    "Block height {} does not extend parent height {}",
                    height,
                    parent_block.header.height
                );
            }

            let expected_bits = self.calculate_next_bits_for_parent_and_timestamp(&prev, height, Some(block.header.timestamp));
            if block.header.bits != expected_bits {
                bail!(
                    "Block bits {:#010x} do not match expected {:#010x} at height {}",
                    block.header.bits,
                    expected_bits,
                    height
                );
            }
        }
        
        // ── Compute cumulative chainwork for this block ─────────
        let block_work = consensus::work_from_compact(block.header.bits);
        let parent_work = self.block_work.read().get(&prev).copied()
            .unwrap_or([0u8; 32]);
        let cumulative_work = consensus::add_work(&parent_work, &block_work);
        
        // ── Determine whether this extends the tip or forks ─────
        let current_tip = *self.tip.read();
        let extends_tip = prev == current_tip;
        
        if extends_tip {
            // ── Fast path: extends best chain directly ───────────
            // assume-valid: skip script checks for blocks at or below the
            // assume_valid_block hash (IBD speedup, like Bitcoin Core 0.14+).
            let assume_valid = {
                let net = match self.config.network {
                    crate::config::Network::Testnet => testnet::Network::Testnet,
                    crate::config::Network::Regtest => testnet::Network::Regtest,
                    _ => testnet::Network::Mainnet,
                };
                testnet::NetworkParams::for_network(net).assume_valid_block
            };
            let skip_scripts = assume_valid.map_or(false, |av| hash == av || height < self.assume_valid_height(&av));
            // Build the MTP closure for BIP-113 timestamp/locktime validation.
            // All fields accessed inside the closure (blocks, height_map, storage)
            // are separate RwLock fields from utxo_set, so there is no deadlock risk.
            let mtp_fn = |h: u64| self.get_mtp(h);
            if skip_scripts {
                let utxo_guard = self.utxo_set.read();
                validator::validate_block_no_scripts_with_mtp(block, &utxo_guard, Some(&mtp_fn))
                    .map_err(|e| anyhow::anyhow!("Block validation failed: {}", e))?;
                // utxo_guard dropped here — write lock can proceed
            } else {
                let utxo_guard = self.utxo_set.read();
                validator::validate_block_cached(block, &utxo_guard, None, Some(&mtp_fn))
                    .map_err(|e| anyhow::anyhow!("Block validation failed: {}", e))?;
                // utxo_guard dropped here
            }
            
            let undo = self.utxo_set.write().apply_block_with_undo(block)
                .map_err(|e| anyhow::anyhow!("UTXO application failed: {}", e))?;
            
            // Store undo data
            let undo_key = format!("undo:{}", hex::encode(hash));
            let undo_bytes = bincode::serialize(&undo)?;
            self.storage.put(undo_key.as_bytes(), &undo_bytes)?;
            
            // Cache the block
            self.insert_block_cache(hash, block.clone());
            self.height_map.write().insert(height, hash);
            
            // Update tip state
            *self.tip.write() = hash;
            *self.height.write() = height;
            *self.chainwork.write() = cumulative_work;
            self.block_work.write().insert(hash, cumulative_work);
            
            // Persist + store block
            self.persist_state(&hash, height)?;
            let key = format!("block:{}", hex::encode(hash));
            self.storage.put(key.as_bytes(), &bincode::serialize(block)?)?;
            
            // Update tx and script-pubkey indexes for the new block
            self.index_block(block, height);
            // Try to connect any orphans that were waiting on this block
            self.process_orphans(hash);

            // ── Pruning ─────────────────────────────────────────
            self.maybe_prune(height);
            
            return Ok(());
        }
        
        // ── Side-chain / potential reorg ────────────────────────
        // Store the block even if not on the best chain yet.
        let block_key = format!("block:{}", hex::encode(hash));
        self.storage.put(block_key.as_bytes(), &bincode::serialize(block)?)?;
        self.insert_block_cache(hash, block.clone());
        self.block_work.write().insert(hash, cumulative_work);
        
        let tip_work = *self.chainwork.read();
        if consensus::compare_work(&cumulative_work, &tip_work) != std::cmp::Ordering::Greater {
            // Side chain doesn't beat the current best — store but don't switch.
            return Ok(());
        }
        
        // ── Reorg: new chain has more work ──────────────────────
        // Walk back from both tips to the common ancestor.
        let (disconnect, connect) = self.find_fork_blocks(&current_tip, &hash)?;
        
        // Safety: reject deep reorgs
        if disconnect.len() > MAX_REORG_DEPTH {
            bail!("Reorg depth {} exceeds safety limit {}", disconnect.len(), MAX_REORG_DEPTH);
        }

        // Safety: forbid reorgs that would roll back past a checkpoint
        let fork_height = *self.height.read() - disconnect.len() as u64;
        if !self.checkpoints.reorg_allowed(fork_height) {
            bail!("Reorg to height {} denied: below last checkpoint", fork_height);
        }
        
        // Disconnect old chain (tip → fork point)
        for old_hash in &disconnect {
            let undo_key = format!("undo:{}", hex::encode(old_hash));
            let undo_bytes = self.storage.get(undo_key.as_bytes())?
                .ok_or_else(|| anyhow::anyhow!("Missing undo data for block {}", hex::encode(old_hash)))?;
            let undo: chain::BlockUndoData = bincode::deserialize(&undo_bytes)?;
            self.utxo_set.write().disconnect_block(&undo)
                .map_err(|e| anyhow::anyhow!("Disconnect failed: {}", e))?;
        }
        
        // Connect new chain (fork point → new tip)
        for new_hash in &connect {
            let blk = self.get_block(new_hash)
                .ok_or_else(|| anyhow::anyhow!("Missing block {} during reorg", hex::encode(new_hash)))?;
            let mtp_fn = |h: u64| self.get_mtp(h);
            {
                let utxo_guard = self.utxo_set.read();
                validator::validate_block_cached(&blk, &utxo_guard, None, Some(&mtp_fn))
                    .map_err(|e| anyhow::anyhow!("Reorg validation failed at {}: {}", hex::encode(new_hash), e))?;
                // utxo_guard dropped at end of block
            }
            
            let undo = self.utxo_set.write().apply_block_with_undo(&blk)
                .map_err(|e| anyhow::anyhow!("Reorg apply failed at {}: {}", hex::encode(new_hash), e))?;
            
            let undo_key = format!("undo:{}", hex::encode(new_hash));
            self.storage.put(undo_key.as_bytes(), &bincode::serialize(&undo)?)?;
            
            self.height_map.write().insert(blk.header.height, *new_hash);
        }
        
        // Remove old height entries for heights above the fork point
        // (the fork height itself is the common ancestor which stays)
        let new_height = height;
        let old_height = *self.height.read();
        if old_height > new_height {
            let mut hm = self.height_map.write();
            for h in (new_height + 1)..=old_height {
                hm.remove(&h);
            }
        }
        // Also update height_map for new chain blocks already done above via connect loop
        
        *self.tip.write() = hash;
        *self.height.write() = new_height;
        *self.chainwork.write() = cumulative_work;
        
        self.persist_state(&hash, new_height)?;
        // Rebuild indexes after reorg to reflect the new best chain
        self.rebuild_indexes();
        // Try to connect any orphans that were waiting on the new tip
        self.process_orphans(hash);

        // ── Pruning after reorg ─────────────────────────────────
        self.maybe_prune(new_height);
        
        Ok(())
    }
    
    // ── Pruning ──────────────────────────────────────────────────

    /// Look up the height of the assume-valid block (returns 0 if unknown).
    fn assume_valid_height(&self, av_hash: &[u8; 32]) -> u64 {
        // Check height_map reverse lookup
        let hm = self.height_map.read();
        for (&h, hash) in hm.iter() {
            if hash == av_hash {
                return h;
            }
        }
        // If we haven't seen the assume-valid block yet, skip scripts for
        // all blocks (we're still syncing up to it).
        u64::MAX
    }

    /// If `prune_depth` is configured, remove block data (but not undo data
    /// or height_map entries) for blocks older than `tip - prune_depth`.
    fn maybe_prune(&self, tip_height: u64) {
        let depth = match self.config.prune_depth {
            Some(d) if d > 0 => d,
            _ => return,
        };
        if tip_height <= depth {
            return;
        }
        let cutoff = tip_height - depth;
        let hm = self.height_map.read();
        for h in 0..cutoff {
            if let Some(bhash) = hm.get(&h) {
                let key = format!("block:{}", hex::encode(bhash));
                let _ = self.storage.delete(key.as_bytes());
                // Remove from in-memory cache too
                self.blocks.write().remove(bhash);
            }
        }
    }

    // ── Orphan block management ──────────────────────────────────

    /// Add a block to the orphan pool (parent not yet known).
    fn add_orphan(&self, hash: [u8; 32], block: Block) {
        let prev = block.header.prev_hash;
        let mut orphans = self.orphan_blocks.write();
        let mut by_parent = self.orphans_by_parent.write();

        // Evict oldest if at capacity (FIFO approximation via arbitrary removal)
        while orphans.len() >= MAX_ORPHAN_BLOCKS {
            let victim = *orphans.keys().next().unwrap();
            if let Some(blk) = orphans.remove(&victim) {
                if let Some(set) = by_parent.get_mut(&blk.header.prev_hash) {
                    set.remove(&victim);
                    if set.is_empty() {
                        by_parent.remove(&blk.header.prev_hash);
                    }
                }
            }
        }

        orphans.insert(hash, block);
        by_parent.entry(prev).or_default().insert(hash);
    }

    /// Try to reconnect orphan blocks whose parent is now `parent_hash`.
    fn process_orphans(&self, parent_hash: [u8; 32]) {
        let mut queue = vec![parent_hash];
        while let Some(ph) = queue.pop() {
            let children: Vec<[u8; 32]> = {
                let by_parent = self.orphans_by_parent.read();
                by_parent.get(&ph).cloned().unwrap_or_default().into_iter().collect()
            };
            for child_hash in children {
                let child_block = {
                    let mut orphans = self.orphan_blocks.write();
                    orphans.remove(&child_hash)
                };
                if let Some(blk) = child_block {
                    {
                        let mut by_parent = self.orphans_by_parent.write();
                        if let Some(set) = by_parent.get_mut(&ph) {
                            set.remove(&child_hash);
                            if set.is_empty() {
                                by_parent.remove(&ph);
                            }
                        }
                    }
                    // Try to add the orphan — if it fails, discard it
                    if self.add_block(&blk).is_ok() {
                        queue.push(child_hash);
                    }
                }
            }
        }
    }

    /// Number of orphan blocks currently held.
    pub fn orphan_count(&self) -> usize {
        self.orphan_blocks.read().len()
    }

    // ── Header chain index ────────────────────────────────────────

    /// Record a header in the block index (header-first sync).
    /// Does NOT require full block data — just the header fields.
    pub fn add_header_index(
        &self,
        hash: [u8; 32],
        prev_hash: [u8; 32],
        height: u64,
        bits: u32,
    ) {
        let block_work = consensus::work_from_compact(bits);
        let parent_work = self.block_index.read()
            .get(&prev_hash)
            .map(|idx| idx.cumulative_work)
            .unwrap_or([0u8; 32]);
        let cumulative_work = consensus::add_work(&parent_work, &block_work);

        self.block_index.write().insert(hash, BlockIndex {
            hash,
            prev_hash,
            height,
            bits,
            cumulative_work,
            have_data: false,
            have_undo: false,
        });
    }

    /// Mark a block in the header index as having full data (and optionally undo data).
    pub fn mark_block_data(&self, hash: &[u8; 32], have_undo: bool) {
        if let Some(idx) = self.block_index.write().get_mut(hash) {
            idx.have_data = true;
            idx.have_undo = have_undo;
        }
    }

    /// Get a header index entry.
    pub fn get_block_index(&self, hash: &[u8; 32]) -> Option<BlockIndex> {
        self.block_index.read().get(hash).cloned()
    }

    /// Return all chain tips: blocks whose hash is not the prev_hash of any other
    /// known block in the index.  Each tip is returned as a `BlockIndex`.
    pub fn get_chain_tips(&self) -> Vec<BlockIndex> {
        let idx = self.block_index.read();
        let children: std::collections::HashSet<[u8; 32]> =
            idx.values().map(|bi| bi.prev_hash).collect();
        idx.values()
            .filter(|bi| !children.contains(&bi.hash))
            .cloned()
            .collect()
    }

    /// Best known header tip (most cumulative work header in the index).
    pub fn best_header_tip(&self) -> Option<BlockIndex> {
        self.block_index.read().values()
            .max_by(|a, b| consensus::compare_work(&a.cumulative_work, &b.cumulative_work))
            .cloned()
    }
    
    /// Insert a block into the memory cache, evicting the oldest if over capacity.
    fn insert_block_cache(&self, hash: [u8; 32], block: Block) {
        let mut blocks = self.blocks.write();
        let mut order = self.cache_order.write();
        blocks.insert(hash, block);
        order.push_back(hash);
        let cap = self.config.max_block_cache;
        while blocks.len() > cap {
            if let Some(old) = order.pop_front() {
                blocks.remove(&old);
            }
        }
    }
    
    /// Walk back from two chain tips to find their common ancestor.
    ///
    /// Returns `(disconnect, connect)`:
    /// - `disconnect`: block hashes to roll back (tip-first order)
    /// - `connect`:    block hashes to apply (ancestor-first order)
    fn find_fork_blocks(
        &self,
        old_tip: &[u8; 32],
        new_tip: &[u8; 32],
    ) -> Result<(Vec<[u8; 32]>, Vec<[u8; 32]>)> {
        let mut old_chain: Vec<[u8; 32]> = Vec::new();
        let mut new_chain: Vec<[u8; 32]> = Vec::new();
        
        let old_cursor = *old_tip;
        let new_cursor = *new_tip;
        
        // Collect old-chain ancestors
        let mut old_ancestors: HashMap<[u8; 32], ()> = HashMap::new();
        let mut cursor = old_cursor;
        loop {
            old_ancestors.insert(cursor, ());
            if let Some(blk) = self.get_block(&cursor) {
                if blk.header.prev_hash == [0u8; 32] {
                    break; // genesis
                }
                cursor = blk.header.prev_hash;
            } else {
                break;
            }
        }
        
        // Walk new chain back until we hit a block in old_ancestors
        let mut cursor = new_cursor;
        loop {
            if old_ancestors.contains_key(&cursor) {
                // cursor is the fork point
                break;
            }
            new_chain.push(cursor);
            if let Some(blk) = self.get_block(&cursor) {
                cursor = blk.header.prev_hash;
            } else {
                bail!("Cannot find block {} while tracing new chain", hex::encode(cursor));
            }
        }
        let fork_point = cursor;
        new_chain.reverse(); // now ancestor-first order
        
        // Walk old chain back from old_tip to fork_point
        let mut cursor = old_cursor;
        while cursor != fork_point {
            old_chain.push(cursor);
            if let Some(blk) = self.get_block(&cursor) {
                cursor = blk.header.prev_hash;
            } else {
                bail!("Cannot find block {} while tracing old chain", hex::encode(cursor));
            }
        }
        // old_chain is already in tip-first order (what we want for disconnect)
        
        Ok((old_chain, new_chain))
    }
    
    /// Persist tip, height, UTXO set, height_map, chainwork, block_work,
    /// UTXO commitment hash, and block index to storage, then flush to disk.
    fn persist_state(&self, tip: &[u8; 32], height: u64) -> Result<()> {
        use storage::WriteOp;
        
        let utxo_set = self.utxo_set.read();
        let utxo_bytes = chain::compress_utxo_set(&*utxo_set);
        let utxo_hash = utxo_set.commitment_hash();
        drop(utxo_set);
        
        let hm_bytes = bincode::serialize(&*self.height_map.read())?;
        let cw = *self.chainwork.read();
        let bw_bytes = bincode::serialize(&*self.block_work.read())?;
        let bi_bytes = bincode::serialize(&self.block_index_snapshot())?;
        
        let mut ops = vec![
            WriteOp::Put { key: b"tip".to_vec(), value: tip.to_vec() },
            WriteOp::Put { key: b"height".to_vec(), value: height.to_le_bytes().to_vec() },
            WriteOp::Put { key: b"utxo_set".to_vec(), value: utxo_bytes },
            WriteOp::Put { key: b"utxo_hash".to_vec(), value: utxo_hash.to_vec() },
            WriteOp::Put { key: b"height_map".to_vec(), value: hm_bytes },
            WriteOp::Put { key: b"chainwork".to_vec(), value: cw.to_vec() },
            WriteOp::Put { key: b"block_work".to_vec(), value: bw_bytes },
            WriteOp::Put { key: b"block_index".to_vec(), value: bi_bytes },
        ];
        
        // Prune undo data for blocks deeper than MAX_REORG_DEPTH from current tip
        if height > MAX_REORG_DEPTH as u64 {
            let prune_below = height - MAX_REORG_DEPTH as u64;
            let hm = self.height_map.read();
            for h in 0..=prune_below {
                if let Some(hash) = hm.get(&h) {
                    let undo_key = format!("undo:{}", hex::encode(hash));
                    ops.push(WriteOp::Delete { key: undo_key.into_bytes() });
                }
            }
        }
        
        self.storage.write_batch(ops)?;
        
        // Explicit flush to ensure durability (don't rely on 500ms timer)
        let _ = self.storage.flush();

        // Auto-prune if configured
        if let Some(depth) = self.config.prune_depth {
            if depth > 0 {
                let _ = self.prune_blocks(depth);
            }
        }
        
        Ok(())
    }

    /// Delete block bodies older than `keep_depth` blocks from the tip.
    ///
    /// Headers, UTXO set, undo data (already pruned elsewhere), and the
    /// height-map are unaffected.  After pruning, `get_block()` will
    /// return `None` for the deleted heights.
    pub fn prune_blocks(&self, keep_depth: u64) -> Result<usize> {
        use storage::WriteOp;
        let height = *self.height.read();
        if height <= keep_depth {
            return Ok(0);
        }
        let prune_below = height - keep_depth;
        let hm = self.height_map.read();

        let mut ops = Vec::new();
        for h in 0..=prune_below {
            if let Some(hash) = hm.get(&h) {
                let key = format!("block:{}", hex::encode(hash));
                if self.storage.exists(key.as_bytes()).unwrap_or(false) {
                    ops.push(WriteOp::Delete { key: key.into_bytes() });
                }
            }
        }
        let count = ops.len();
        if !ops.is_empty() {
            self.storage.write_batch(ops)?;
        }

        // Update block_index metadata so queries know data is pruned
        let mut idx = self.block_index.write();
        for h in 0..=prune_below {
            if let Some(hash) = hm.get(&h) {
                if let Some(bi) = idx.get_mut(hash) {
                    bi.have_data = false;
                }
            }
        }

        Ok(count)
    }
    
    /// Snapshot the block index for serialization (as a Vec of tuples).
    fn block_index_snapshot(&self) -> Vec<([u8; 32], [u8; 32], u64, u32, [u8; 32], bool, bool)> {
        self.block_index.read().values().map(|bi| {
            (bi.hash, bi.prev_hash, bi.height, bi.bits, bi.cumulative_work, bi.have_data, bi.have_undo)
        }).collect()
    }
    
    /// Validate a transaction against the current UTXO set.
    ///
    /// Call this before admitting a transaction to the mempool.
    /// Uses Median-Time-Past (BIP-113) for timestamp-based lock_time comparison.
    pub fn validate_transaction(&self, tx: &tx::Transaction) -> Result<(), ValidationError> {
        let height = *self.height.read();
        let utxo_guard = self.utxo_set.read();
        // BIP-113: pass an MTP closure so timestamp-based lock_time values are
        // compared against the median of the last 11 block timestamps, not the
        // wall clock.  The closure borrows separate RwLock fields (blocks,
        // height_map, storage) — no deadlock with the utxo read guard above.
        let mtp_fn = |h: u64| self.get_mtp(h);
        validator::validate_transaction_cached(tx, &utxo_guard, height, None, Some(&mtp_fn))
    }

    /// Compute the fee for a transaction: sum(input values) - sum(output values).
    /// Returns `None` if any input UTXO is missing.
    pub fn compute_tx_fee(&self, tx: &tx::Transaction) -> Option<u64> {
        let utxos = self.utxo_set.read();
        let input_sum: u64 = tx.inputs.iter().map(|inp| {
            utxos.get_utxo(&inp.prev_output).map(|u| u.output.value)
        }).sum::<Option<u64>>()?;
        let output_sum: u64 = tx.outputs.iter().map(|o| o.value).sum();
        Some(input_sum.saturating_sub(output_sum))
    }
    
    /// Get a read-only snapshot of the current UTXO set.
    pub fn utxo_set(&self) -> parking_lot::RwLockReadGuard<'_, UtxoSet> {
        self.utxo_set.read()
    }

    /// Look up a single UTXO by txid and output index.
    pub fn get_utxo(&self, txid: &[u8; 32], vout: u32) -> Option<chain::utxo::UTXO> {
        let outpoint = tx::OutPoint::new(*txid, vout);
        self.utxo_set.read().get_utxo(&outpoint).cloned()
    }

    /// Return the confirmed block height for a given txid, or None if not indexed.
    pub fn get_tx_height(&self, txid: &[u8; 32]) -> Option<u64> {
        self.tx_index.read().get(txid).copied()
    }

    /// Return the best-chain height at which a block with the given hash was confirmed.
    pub fn get_block_height(&self, hash: &[u8; 32]) -> Option<u64> {
        self.chain_height_index.read().get(hash).copied()
    }

    /// Return all txids whose outputs match the given script_pubkey.
    pub fn get_txids_for_script(&self, script_pubkey: &[u8]) -> Vec<[u8; 32]> {
        self.script_pubkey_index
            .read()
            .get(script_pubkey)
            .cloned()
            .unwrap_or_default()
    }

    /// Persist all three derived indexes to Sled so they survive restarts
    /// without a full O(Nâ¢M) rebuild. Idempotent — updates are atomic via
    /// individual Sled puts (no partial-write risk for in-process crashes).
    fn save_indexes(&self) {
        let tip = *self.tip.read();
        let tx_snap = bincode::serialize(&*self.tx_index.read());
        let spk_snap = bincode::serialize(&*self.script_pubkey_index.read());
        let chi_snap = bincode::serialize(&*self.chain_height_index.read());
        if let (Ok(t), Ok(s), Ok(c)) = (tx_snap, spk_snap, chi_snap) {
            let _ = self.storage.put(b"index_tip", &tip);
            let _ = self.storage.put(b"index_tx", &t);
            let _ = self.storage.put(b"index_spk", &s);
            let _ = self.storage.put(b"index_height", &c);
        }
    }

    /// Try to load persisted indexes from Sled. Returns `true` when the stored
    /// indexes were valid (tip matched) and have been loaded. Returns `false`
    /// when the indexes are missing, corrupt, or stale, in which case the
    /// caller should fall back to `rebuild_indexes()`.
    fn try_load_indexes(&self) -> bool {
        let current_tip = *self.tip.read();

        // Validate the tip stamp first.
        let Ok(Some(stored_tip_bytes)) = self.storage.get(b"index_tip") else {
            return false;
        };
        if stored_tip_bytes.len() != 32 { return false; }
        let mut stored_tip = [0u8; 32];
        stored_tip.copy_from_slice(&stored_tip_bytes);
        if stored_tip != current_tip { return false; }

        // Load all three indexes.
        let Ok(Some(tx_bytes)) = self.storage.get(b"index_tx") else { return false };
        let Ok(Some(spk_bytes)) = self.storage.get(b"index_spk") else { return false };
        let Ok(Some(chi_bytes)) = self.storage.get(b"index_height") else { return false };

        let Ok(tx_map) = bincode::deserialize::<HashMap<[u8; 32], u64>>(&tx_bytes) else { return false };
        let Ok(spk_map) = bincode::deserialize::<HashMap<Vec<u8>, Vec<[u8; 32]>>>(&spk_bytes) else { return false };
        let Ok(chi_map) = bincode::deserialize::<HashMap<[u8; 32], u64>>(&chi_bytes) else { return false };

        *self.tx_index.write() = tx_map;
        *self.script_pubkey_index.write() = spk_map;
        *self.chain_height_index.write() = chi_map;
        true
    }

    /// Rebuild all three derived indexes (tx, script-pubkey, chain-height) by
    /// scanning every confirmed block, then persist the result to Sled.
    /// Called on first startup, after reorgs, and as a corruption-recovery fallback.
    pub fn rebuild_indexes(&self) {
        let height = *self.height.read();
        // Snapshot the height_map before acquiring index write locks.
        let height_map_snap: Vec<(u64, [u8; 32])> = {
            let hm = self.height_map.read();
            (0..=height)
                .filter_map(|h| hm.get(&h).map(|&hash| (h, hash)))
                .collect()
        };
        let mut tx_idx = self.tx_index.write();
        let mut spk_idx = self.script_pubkey_index.write();
        let mut chi_idx = self.chain_height_index.write();
        tx_idx.clear();
        spk_idx.clear();
        chi_idx.clear();
        for (h, hash) in height_map_snap {
            chi_idx.insert(hash, h);
            if let Some(block) = self.get_block(&hash) {
                for tx in &block.transactions {
                    let txid = tx.txid();
                    tx_idx.insert(txid, h);
                    for output in &tx.outputs {
                        spk_idx
                            .entry(output.script_pubkey.clone())
                            .or_default()
                            .push(txid);
                    }
                }
            }
        }
        drop(tx_idx);
        drop(spk_idx);
        drop(chi_idx);
        self.save_indexes();
    }

    /// Incrementally index a single newly-confirmed block and persist.
    fn index_block(&self, block: &Block, height: u64) {
        let hash = block.hash();
        let mut tx_idx = self.tx_index.write();
        let mut spk_idx = self.script_pubkey_index.write();
        let mut chi_idx = self.chain_height_index.write();
        chi_idx.insert(hash, height);
        for tx in &block.transactions {
            let txid = tx.txid();
            tx_idx.insert(txid, height);
            for output in &tx.outputs {
                spk_idx
                    .entry(output.script_pubkey.clone())
                    .or_default()
                    .push(txid);
            }
        }
        drop(tx_idx);
        drop(spk_idx);
        drop(chi_idx);
        self.save_indexes();
    }

    /// Get balance for an address by scanning the UTXO set for matching script_pubkeys.
    pub fn get_balance(&self, address: &str) -> Result<u64> {
        // Decode the address to its proper script_pubkey for comparison
        let script_pubkey = tx::Address::decode(address)
            .map(|a| a.to_script_pubkey())
            .map_err(|e| anyhow::anyhow!("invalid address: {e}"))?;
        let balance = self
            .utxo_set
            .read()
            .iter()
            .filter(|(_, utxo)| utxo.output.script_pubkey == script_pubkey)
            .map(|(_, utxo)| utxo.output.value)
            .sum();
        Ok(balance)
    }

    // ── assumeUTXO snapshot support ──────────────────────────

    /// Export a UTXO snapshot for the current tip.
    ///
    /// The snapshot is a bincode blob prefixed by:
    /// - 32-byte block hash (the snapshot point)
    /// - 8-byte little-endian height
    /// - 32-byte UTXO commitment hash
    ///
    /// A receiving node can load this with [`load_utxo_snapshot`] to skip IBD
    /// up to the snapshot height (assumeUTXO / BIP-???).
    pub fn dump_utxo_snapshot(&self) -> Result<Vec<u8>> {
        let tip = self.get_tip();
        let height = self.get_height();
        let utxo_guard = self.utxo_set.read();
        let commitment = utxo_guard.commitment_hash();

        let utxo_bytes = chain::compress_utxo_set(&utxo_guard);
        drop(utxo_guard);

        let mut snapshot = Vec::with_capacity(32 + 8 + 32 + utxo_bytes.len());
        snapshot.extend_from_slice(&tip);
        snapshot.extend_from_slice(&height.to_le_bytes());
        snapshot.extend_from_slice(&commitment);
        snapshot.extend_from_slice(&utxo_bytes);
        Ok(snapshot)
    }

    /// Load a UTXO snapshot produced by [`dump_utxo_snapshot`].
    ///
    /// Validates the commitment hash, then overwrites the UTXO set, tip,
    /// and height.  Background validation of the full chain from genesis to
    /// the snapshot point is left to the caller (IBD continues in parallel).
    pub fn load_utxo_snapshot(&self, data: &[u8]) -> Result<()> {
        const HEADER_LEN: usize = 32 + 8 + 32; // tip + height + commitment
        if data.len() < HEADER_LEN {
            bail!("snapshot too short");
        }

        let mut tip = [0u8; 32];
        tip.copy_from_slice(&data[..32]);

        let height = u64::from_le_bytes(data[32..40].try_into().unwrap());

        let mut expected_commitment = [0u8; 32];
        expected_commitment.copy_from_slice(&data[40..72]);

        let utxo_bytes = &data[72..];

        // Decompress
        let utxo = chain::decompress_utxo_set(utxo_bytes)
            .ok_or_else(|| anyhow::anyhow!("failed to decompress UTXO snapshot"))?;

        // Verify commitment
        let actual_commitment = utxo.commitment_hash();
        if expected_commitment != actual_commitment {
            bail!(
                "UTXO snapshot commitment mismatch: expected {}, got {}",
                hex::encode(expected_commitment),
                hex::encode(actual_commitment)
            );
        }

        // Install the snapshot
        *self.utxo_set.write() = utxo;
        *self.tip.write() = tip;
        *self.height.write() = height;

        // Persist
        self.storage.put(b"tip", &tip)?;
        self.storage.put(b"height", &height.to_le_bytes())?;
        self.storage.put(b"utxo_hash", &actual_commitment)?;

        info!(height, tip = %hex::encode(tip), "loaded assumeUTXO snapshot");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chain::BlockHeader;
    use tempfile::tempdir;
    use tx::{OutPoint, TxInput, TxOutput, Transaction};
    
    #[test]
    fn test_node_state_creation() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        
        let state = NodeState::new(config).unwrap();
        assert_eq!(state.get_height(), 0);
    }
    
    #[test]
    fn test_genesis_initialization() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        
        let state = NodeState::new(config).unwrap();
        let tip = state.get_tip();
        
        // Tip should be genesis hash
        let genesis = testnet::genesis_block(testnet::Network::Mainnet);
        assert_eq!(tip, genesis.hash());
    }
    
    #[test]
    fn test_genesis_utxo_set_populated() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();
        
        // Genesis coinbase should have created UTXOs
        let utxo_set = state.utxo_set();
        assert!(
            !utxo_set.is_empty(),
            "UTXO set should contain genesis outputs"
        );
    }
    
    #[test]
    fn test_add_block_rejects_invalid_block() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();
        
        let genesis_hash = state.get_tip();
        
        // Create a block with no transactions (invalid: needs coinbase)
        let header = BlockHeader::new(genesis_hash, [0u8; 32], 1000, 0x1e0fffff, 0);
        let mut header_with_height = header;
        header_with_height.height = 1;
        let bad_block = Block::new(header_with_height, vec![]);
        
        let result = state.add_block(&bad_block);
        assert!(result.is_err(), "Block with no transactions should be rejected");
        
        // Tip should not have changed
        assert_eq!(state.get_tip(), genesis_hash);
        assert_eq!(state.get_height(), 0);
    }
    
    #[test]
    fn test_add_block_accepts_valid_coinbase_only() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();
        
        let genesis_hash = state.get_tip();
        
        // Build a valid coinbase-only block
        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(genesis_hash, merkle, 1706832001, state.calculate_next_bits(1), 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);
        
        let result = state.add_block(&block);
        assert!(result.is_ok(), "Valid coinbase-only block should be accepted: {:?}", result);
        
        assert_eq!(state.get_height(), 1);
        assert_eq!(state.get_tip(), block.hash());
    }
    
    #[test]
    fn test_validate_transaction_rejects_missing_utxo() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();
        
        // Create a tx spending a non-existent UTXO
        let fake_outpoint = OutPoint::new([0xffu8; 32], 0);
        let input = TxInput::new(fake_outpoint, vec![]);
        let output = TxOutput::new(100, vec![0xab]);
        let tx = Transaction::new(vec![input], vec![output], 0);
        
        let result = state.validate_transaction(&tx);
        assert!(result.is_err(), "Tx spending non-existent UTXO should be rejected");
    }
    
    #[test]
    fn test_block_cache_eviction() {
        let dir = tempdir().unwrap();
        let cache_limit: usize = 4; // tiny cache for testing
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            max_block_cache: cache_limit,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();
        
        // Genesis is already in the cache (count = 1).
        // Add enough coinbase-only blocks to exceed the limit.
        let blocks_to_add = cache_limit + 3; // will exceed limit by 3
        let mut hashes = Vec::new();
        
        for i in 1..=blocks_to_add {
            let tip = state.get_tip();
            let coinbase = Transaction::new_coinbase(
                i as u64,
                50 * 100_000_000,
                vec![i as u8],
            );
            let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
            // Use timestamps after genesis (1706832000) so BIP-113 MTP check passes.
            let mut header = BlockHeader::new(tip, merkle, 1706832000 + i as u64, state.calculate_next_bits(i as u64), 0);
            header.height = i as u64;
            let block = Block::new(header, vec![coinbase]);
            hashes.push(block.hash());
            state.add_block(&block).unwrap();
        }
        
        // Cache size must not exceed the configured limit
        let cache_size = state.blocks.read().len();
        assert!(
            cache_size <= cache_limit,
            "Cache should be bounded to {cache_limit}, got {cache_size}"
        );
        
        // Oldest blocks were evicted from memory but still available via Sled
        for h in &hashes {
            assert!(
                state.get_block(h).is_some(),
                "Evicted block must still be retrievable from storage"
            );
        }
    }
    
    #[test]
    fn test_state_survives_restart() {
        let dir = tempdir().unwrap();
        let data_path = dir.path().to_path_buf();
        
        // ── First run: create state + add a block
        let genesis_hash;
        let block1_hash;
        let utxo_count_after_block1;
        {
            let config = Config {
                data_dir: data_path.clone(),
                ..Default::default()
            };
            let state = NodeState::new(config).unwrap();
            genesis_hash = state.get_tip();
            
            // Add a valid coinbase-only block
            let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
            let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
            let mut header = BlockHeader::new(genesis_hash, merkle, 1706832001, state.calculate_next_bits(1), 0);
            header.height = 1;
            let block = Block::new(header, vec![coinbase]);
            block1_hash = block.hash();
            
            state.add_block(&block).unwrap();
            assert_eq!(state.get_height(), 1);
            utxo_count_after_block1 = state.utxo_set().len();
        }
        // ← state dropped, SledStorage flushed
        
        // ── Second run: re-open from same data dir
        {
            let config = Config {
                data_dir: data_path,
                ..Default::default()
            };
            let state = NodeState::new(config).unwrap();
            
            // Tip and height must survive
            assert_eq!(
                state.get_tip(), block1_hash,
                "Tip must survive restart"
            );
            assert_eq!(
                state.get_height(), 1,
                "Height must survive restart"
            );
            
            // UTXO set must survive
            assert_eq!(
                state.utxo_set().len(), utxo_count_after_block1,
                "UTXO set must survive restart"
            );
            assert!(
                !state.utxo_set().is_empty(),
                "UTXO set should not be empty after restart"
            );
            
            // Height map must survive
            assert_eq!(
                state.get_block_hash(0), Some(genesis_hash),
                "Genesis hash via height_map must survive restart"
            );
            assert_eq!(
                state.get_block_hash(1), Some(block1_hash),
                "Block 1 hash via height_map must survive restart"
            );
            
            // Block data must survive (stored separately in Sled)
            assert!(
                state.get_block(&block1_hash).is_some(),
                "Block data must survive restart"
            );
        }
    }

    // ── Hardening tests ────────────────────────────────────────────────────

    #[test]
    fn test_get_block_hash_genesis_is_zero() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();

        // Genesis is at height 0
        let hash_at_zero = state.get_block_hash(0);
        assert!(hash_at_zero.is_some(), "genesis hash must be known");
        assert_eq!(hash_at_zero.unwrap(), state.get_tip());
    }

    #[test]
    fn test_get_block_hash_out_of_range_returns_none() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();

        // Height 9999 was never inserted
        assert!(state.get_block_hash(9999).is_none());
    }

    #[test]
    fn test_get_balance_unknown_address_is_zero() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();

        let balance = state.get_balance("1NoCoinsHere").unwrap_or(0);
        assert_eq!(balance, 0, "unknown address must have zero balance");
    }

    #[test]
    fn test_orphan_count_starts_zero() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();
        assert_eq!(state.orphan_count(), 0, "fresh node should have no orphans");
    }

    #[test]
    fn test_get_utxo_nonexistent_returns_none() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();
        assert!(state.get_utxo(&[0xffu8; 32], 0).is_none());
    }

    #[test]
    fn test_height_advances_after_each_block() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();

        for i in 1u64..=5 {
            let tip = state.get_tip();
            let coinbase = Transaction::new_coinbase(i, 50 * 100_000_000, vec![i as u8]);
            let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
            // Use timestamps after genesis (1706832000) so BIP-113 MTP check passes.
            let mut header = BlockHeader::new(tip, merkle, 1706832000 + i, state.calculate_next_bits(i), 0);
            header.height = i;
            let block = Block::new(header, vec![coinbase]);
            state.add_block(&block).unwrap();
            assert_eq!(state.get_height(), i);
        }
    }

    #[test]
    fn test_add_duplicate_block_is_handled() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();

        let tip = state.get_tip();
        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(tip, merkle, 1706832001, state.calculate_next_bits(1), 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);

        state.add_block(&block).unwrap();
        // Adding the same block again should not corrupt state
        let _second = state.add_block(&block);
        // Height must still be 1 (not 2)
        assert_eq!(state.get_height(), 1);
    }

    #[test]
    fn test_chainwork_grows_with_blocks() {
        let dir = tempdir().unwrap();
        let config = Config { data_dir: dir.path().to_path_buf(), ..Default::default() };
        let state = NodeState::new(config).unwrap();
        let cw_before = state.get_chainwork();

        let tip = state.get_tip();
        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(tip, merkle, 1706832001, state.calculate_next_bits(1), 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);
        state.add_block(&block).unwrap();

        let cw_after = state.get_chainwork();
        assert!(cw_after >= cw_before, "chainwork must not decrease after adding a block");
    }

    #[test]
    fn test_add_block_rejects_wrong_height_continuity() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let tip = state.get_tip();
        let coinbase = Transaction::new_coinbase(2, 50 * 100_000_000, vec![0x02]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(tip, merkle, 1706832001, state.calculate_next_bits(1), 0);
        header.height = 2;
        let block = Block::new(header, vec![coinbase]);

        let result = state.add_block(&block);
        assert!(result.is_err(), "block with non-contiguous height must be rejected");
    }

    #[test]
    fn test_add_block_rejects_unexpected_bits() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let tip = state.get_tip();
        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(tip, merkle, 1706832001, 0x1d00ffff, 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);

        let result = state.add_block(&block);
        assert!(result.is_err(), "block with unexpected bits must be rejected");
    }

    #[test]
    fn test_add_block_rejects_far_future_timestamp() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let tip = state.get_tip();
        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let future_ts = current_unix_time_secs()
            .saturating_add(consensus::params::MAX_FUTURE_BLOCK_TIME_SECS)
            .saturating_add(1);
        let mut header = BlockHeader::new(tip, merkle, future_ts, state.calculate_next_bits(1), 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);

        let result = state.add_block(&block);
        assert!(result.is_err(), "block beyond the future-time limit must be rejected");
    }

    #[test]
    fn test_regtest_next_bits_never_zero() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let next_bits = state.calculate_next_bits(1);
        assert_ne!(next_bits, 0, "regtest mining difficulty must never become impossible");
    }

    fn insert_cached_block(
        state: &NodeState,
        prev_hash: [u8; 32],
        height: u64,
        timestamp: u64,
        bits: u32,
    ) -> [u8; 32] {
        let header = BlockHeader::with_height(prev_hash, [height as u8; 32], timestamp, bits, 0, height);
        let block = Block::new(header, vec![]);
        let hash = block.hash();
        state.blocks.write().insert(hash, block);
        state.height_map.write().insert(height, hash);
        *state.tip.write() = hash;
        *state.height.write() = height;
        hash
    }

    #[test]
    fn test_testnet_retarget_changes_bits_after_full_period() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Testnet,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let mut prev_hash = state.get_tip();
        let genesis_timestamp = state.get_block(&prev_hash).unwrap().header.timestamp;
        let genesis_bits = state.network_params().genesis_bits;

        for height in 1..=2015u64 {
            let timestamp = genesis_timestamp + (height * 300);
            prev_hash = insert_cached_block(&state, prev_hash, height, timestamp, genesis_bits);
        }

        let retarget_timestamp = genesis_timestamp + (2016 * 300);
        let retarget_bits = state.calculate_next_bits_with_timestamp(2016, retarget_timestamp);
        assert_ne!(
            retarget_bits, genesis_bits,
            "testnet should retarget after a full 2016-block period when blocks arrive too quickly"
        );
    }

    #[test]
    fn test_testnet_min_difficulty_and_recovery_use_candidate_timestamp() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Testnet,
            ..Default::default()
        };
        let state = NodeState::new(config).unwrap();

        let mut prev_hash = state.get_tip();
        let genesis_block = state.get_block(&prev_hash).unwrap();
        let genesis_timestamp = genesis_block.header.timestamp;
        let genesis_bits = state.network_params().genesis_bits;

        for height in 1..=2015u64 {
            let timestamp = genesis_timestamp + (height * 300);
            prev_hash = insert_cached_block(&state, prev_hash, height, timestamp, genesis_bits);
        }

        let retarget_timestamp = genesis_timestamp + (2016 * 300);
        let retarget_bits = state.calculate_next_bits_with_timestamp(2016, retarget_timestamp);
        assert_ne!(retarget_bits, genesis_bits, "precondition: first retarget should produce non-floor bits");
        prev_hash = insert_cached_block(&state, prev_hash, 2016, retarget_timestamp, retarget_bits);

        let delayed_timestamp = retarget_timestamp + (2 * 600) + 1;
        let delayed_bits = state.calculate_next_bits_with_timestamp(2017, delayed_timestamp);
        assert_eq!(
            delayed_bits, genesis_bits,
            "testnet delayed blocks should drop to minimum difficulty"
        );
        let _delayed_hash = insert_cached_block(&state, prev_hash, 2017, delayed_timestamp, delayed_bits);

        let quick_timestamp = delayed_timestamp + 1;
        let recovered_bits = state.calculate_next_bits_with_timestamp(2018, quick_timestamp);
        assert_eq!(
            recovered_bits, retarget_bits,
            "testnet should recover the last non-floor difficulty after a minimum-difficulty block"
        );
    }

    #[test]
    fn test_reloaded_state_can_extend_genesis_chain() {
        let dir = tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().to_path_buf(),
            network: crate::config::Network::Regtest,
            ..Default::default()
        };

        {
            let state = NodeState::new(config.clone()).unwrap();
            assert_eq!(state.get_height(), 0);
        }

        let state = NodeState::new(config).unwrap();
        let tip = state.get_tip();
        assert!(state.get_block(&tip).is_some(), "reloaded state must retain genesis block data");

        let coinbase = Transaction::new_coinbase(1, 50 * 100_000_000, vec![0x01]);
        let merkle = Block::calculate_merkle_root(std::slice::from_ref(&coinbase));
        let mut header = BlockHeader::new(tip, merkle, 1706832001, state.calculate_next_bits(1), 0);
        header.height = 1;
        let block = Block::new(header, vec![coinbase]);

        state.add_block(&block).unwrap();
        assert_eq!(state.get_height(), 1, "reloaded state should connect the first mined block");
    }
}
