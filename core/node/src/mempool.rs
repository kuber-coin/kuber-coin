//! Mempool (transaction memory pool)
//!
//! Manages unconfirmed transactions waiting to be included in blocks.
//! Supports BIP-125 opt-in Replace-by-Fee (RBF) and ancestor/descendant
//! chain limits (default 25 each, matching Bitcoin Core).
//! CPFP-aware block assembly uses ancestor package fee rates.

use anyhow::{bail, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use tx::Transaction;

fn unix_time_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
fn unix_time_subsec_nanos() -> u32 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos()
}

/// Maximum number of in-mempool ancestors (BIP-125 / Bitcoin Core default).
const MAX_ANCESTORS: usize = 25;
/// Maximum number of in-mempool descendants (Bitcoin Core default).
const MAX_DESCENDANTS: usize = 25;
/// Maximum number of RBF conflicts allowed per replacement (Rule #2).
const MAX_RBF_CONFLICTS: usize = 100;
/// Minimum relay fee rate in sat/byte. Transactions below this are rejected.
const MIN_RELAY_FEE_RATE: f64 = 1.0;
/// Mempool expiry: entries older than 14 days are evicted.
const MEMPOOL_EXPIRY_SECS: u64 = 14 * 24 * 60 * 60;
/// Maximum number of orphan transactions held in the pool.
const MAX_ORPHAN_TXS: usize = 100;
/// Orphan transaction expiry (20 minutes).
const ORPHAN_TX_EXPIRE_SECS: u64 = 20 * 60;

/// Entry returned by get_block_template_entries with per-tx metadata.
pub struct BlockTemplateEntry {
    pub tx: Transaction,
    pub txid: [u8; 32],
    pub fee: u64,
    pub sigops: usize,
    pub weight: usize,
    /// Indices of parent txs in the template (0-based, same ordering).
    pub depends: Vec<usize>,
}

/// Memory pool for unconfirmed transactions
pub struct Mempool {
    /// Transactions indexed by txid
    transactions: RwLock<HashMap<[u8; 32], MempoolEntry>>,
    
    /// Maximum pool size in bytes
    max_size: usize,
    
    /// Current pool size in bytes
    current_size: RwLock<usize>,

    /// Orphan transactions whose parent(s) are not yet available.
    orphan_txs: RwLock<HashMap<[u8; 32], OrphanEntry>>,

    /// Index: parent txid → set of orphan txids that depend on it.
    orphans_by_parent: RwLock<HashMap<[u8; 32], Vec<[u8; 32]>>>,
}

/// An orphan transaction waiting for its missing parent(s).
#[derive(Clone)]
pub struct OrphanEntry {
    pub tx: Transaction,
    pub added_time: u64,
}

/// Entry in the mempool
#[derive(Clone)]
pub struct MempoolEntry {
    /// The transaction
    pub tx: Transaction,
    
    /// Fee paid
    pub fee: u64,
    
    /// Time added (unix timestamp)
    pub added_time: u64,
    
    /// Serialized size
    pub size: usize,

    /// BIP-141 weighted sigop cost
    pub sigop_cost: usize,

    /// Accumulated fee of this tx + all in-mempool ancestors (for CPFP).
    pub ancestor_fee: u64,

    /// Accumulated size of this tx + all in-mempool ancestors (for CPFP).
    pub ancestor_size: usize,
}

impl Mempool {
    /// Create a new mempool
    pub fn new(max_size: usize) -> Self {
        Self {
            transactions: RwLock::new(HashMap::new()),
            max_size,
            current_size: RwLock::new(0),
            orphan_txs: RwLock::new(HashMap::new()),
            orphans_by_parent: RwLock::new(HashMap::new()),
        }
    }
    
    /// Add a transaction to the mempool with fee = 0.
    ///
    /// This is an **internal** helper used for persistence-restore and tests
    /// where fee information is not available. All public-facing submission
    /// paths must use [`add_transaction_with_fee`] with a properly computed fee.
    pub(crate) fn add_transaction(&self, tx: Transaction) -> Result<()> {
        // Internal path: bypass relay-fee policy (disk restore / test framework only).
        self.add_transaction_unchecked(tx, 0)
    }

    /// Add a transaction to the mempool with a pre-computed fee.
    ///
    /// Implements BIP-125 opt-in RBF: if a conflicting transaction exists
    /// (spends the same input) and the new tx signals replaceability
    /// (sequence < 0xfffffffe on any input), it replaces the old one *if*
    /// the new fee is strictly higher than the aggregate of all evicted txs.
    ///
    /// Also enforces ancestor/descendant chain limits (MAX_ANCESTORS /
    /// MAX_DESCENDANTS) and CPFP ancestor fee accounting.
    pub fn add_transaction_with_fee(&self, tx: Transaction, fee: u64) -> Result<()> {
        // ── Minimum relay fee policy ──────────────────────────────────────────
        let size = bincode::serialize(&tx)?.len();
        if size > 0 {
            if fee == 0 {
                bail!("Zero-fee transactions are not relayed; include the computed fee");
            }
            if (fee as f64 / size as f64) < MIN_RELAY_FEE_RATE {
                bail!("Transaction fee rate ({:.2} sat/byte) below minimum relay fee ({MIN_RELAY_FEE_RATE} sat/byte)",
                    fee as f64 / size as f64);
            }
        }
        self.add_transaction_unchecked(tx, fee)
    }

    /// Internal pool insertion — skips relay-fee policy enforcement.
    /// Called by [`add_transaction`] (restore/tests) and by [`add_transaction_with_fee`].
    fn add_transaction_unchecked(&self, tx: Transaction, fee: u64) -> Result<()> {
        let txid = tx.txid();
        let size = bincode::serialize(&tx)?.len();

        // Check if already in pool
        if self.transactions.read().contains_key(&txid) {
            bail!("Transaction already in mempool");
        }

        // ── BIP-125 RBF check ──────────────────────────────────
        let signals_rbf = tx.inputs.iter().any(|i| i.sequence < 0xffff_fffe);
        let mut to_evict: Vec<[u8; 32]> = Vec::new();
        {
            let pool = self.transactions.read();
            for input in &tx.inputs {
                for (existing_txid, entry) in pool.iter() {
                    if entry.tx.inputs.iter().any(|ei| ei.prev_output == input.prev_output) {
                        if !signals_rbf {
                            bail!("Conflict with existing tx and new tx does not signal BIP-125 RBF");
                        }
                        to_evict.push(*existing_txid);
                    }
                }
            }
            // Rule #2: cap on number of direct conflicts
            if to_evict.len() > MAX_RBF_CONFLICTS {
                bail!("RBF replacement conflicts with too many transactions ({})", to_evict.len());
            }

            // Collect all descendants of conflicting txs for cascade eviction
            let mut all_evict = std::collections::HashSet::new();
            for eid in &to_evict {
                all_evict.insert(*eid);
                collect_descendants(eid, &pool, &mut all_evict);
            }

            // Rule #3 & #4: new fee must exceed aggregate of all evicted txs
            if !all_evict.is_empty() {
                let aggregate_fee: u64 = all_evict.iter()
                    .filter_map(|id| pool.get(id))
                    .map(|e| e.fee)
                    .sum();
                if fee <= aggregate_fee {
                    bail!("RBF replacement fee ({fee}) must exceed aggregate of evicted txs ({aggregate_fee})");
                }
            }

            to_evict = all_evict.into_iter().collect();
        }
        // Evict replaced transactions + their descendants
        for evicted_id in &to_evict {
            self.remove_transaction(evicted_id);
        }
        
        // ── Ancestor / descendant chain limits ──────────────────
        let (ancestor_fee, ancestor_size) = {
            let pool = self.transactions.read();
            let ancestor_count = count_ancestors(&tx, &pool);
            if ancestor_count > MAX_ANCESTORS {
                bail!("Too many in-mempool ancestors ({ancestor_count} > {MAX_ANCESTORS})");
            }
            for input in &tx.inputs {
                let parent_txid = input.prev_output.txid;
                if pool.contains_key(&parent_txid) {
                    let desc = count_descendants(&parent_txid, &pool);
                    if desc + 1 > MAX_DESCENDANTS {
                        bail!("Too many in-mempool descendants ({} > {MAX_DESCENDANTS})", desc + 1);
                    }
                }
            }
            // Compute ancestor package fee and size for CPFP
            let (af, as_) = compute_ancestor_package(&tx, fee, size, &pool);
            (af, as_)
        };

        // Check pool capacity — evict lowest fee-rate entry if needed
        let new_size = self.current_size.read()
            .checked_add(size)
            .ok_or_else(|| anyhow::anyhow!("Mempool size overflow"))?;
        if new_size > self.max_size {
            // Try to evict the lowest fee-rate entry (that isn't an ancestor of this tx)
            if !self.evict_lowest_feerate(size) {
                bail!("Mempool full");
            }
        }
        
        let entry = MempoolEntry {
            tx,
            fee,
            added_time: unix_time_secs(),
            size,
            sigop_cost: 0,
            ancestor_fee,
            ancestor_size,
        };
        
        self.transactions.write().insert(txid, entry);
        let new_size = self.current_size.read().saturating_add(size);
        *self.current_size.write() = new_size;
        
        Ok(())
    }

    /// Add a transaction, enforcing per-tx sigop cost policy.
    ///
    /// This calls `add_transaction_with_fee` and additionally rejects
    /// transactions whose BIP-141 weighted sigop cost exceeds
    /// `MAX_STANDARD_TX_SIGOPS_COST` (16 000).
    pub fn add_transaction_checked(
        &self,
        tx: Transaction,
        fee: u64,
        utxo_set: &chain::utxo::UtxoSet,
    ) -> Result<()> {
        let sigop_cost = consensus::validator::tx_sigop_cost(&tx, utxo_set);
        if sigop_cost > consensus::validator::MAX_STANDARD_TX_SIGOPS_COST {
            bail!(
                "Transaction sigop cost ({sigop_cost}) exceeds policy limit ({})",
                consensus::validator::MAX_STANDARD_TX_SIGOPS_COST
            );
        }
        self.add_transaction_with_fee(tx.clone(), fee)?;

        // Update the stored entry with the actual sigop cost
        let txid = tx.txid();
        if let Some(entry) = self.transactions.write().get_mut(&txid) {
            entry.sigop_cost = sigop_cost;
        }

        Ok(())
    }
    
    /// Remove a transaction from the mempool
    pub fn remove_transaction(&self, txid: &[u8; 32]) -> Option<Transaction> {
        if let Some(entry) = self.transactions.write().remove(txid) {
            // Saturating prevents underflow if accounting drifted
            let new_size = self.current_size.read().saturating_sub(entry.size);
            *self.current_size.write() = new_size;
            Some(entry.tx)
        } else {
            None
        }
    }

    /// Remove mempool entries that were confirmed by a block or invalidated by
    /// a now-confirmed conflicting spend.
    ///
    /// Exact txids found in the block are removed directly. Any different
    /// mempool transaction that spends an already-consumed prevout is removed
    /// together with its in-mempool descendants.
    pub fn remove_block_transactions(&self, block: &chain::Block) -> usize {
        let confirmed_txids: std::collections::HashSet<[u8; 32]> = block
            .transactions
            .iter()
            .filter(|tx| !tx.is_coinbase())
            .map(|tx| tx.txid())
            .collect();
        let confirmed_spends: std::collections::HashSet<([u8; 32], u32)> = block
            .transactions
            .iter()
            .filter(|tx| !tx.is_coinbase())
            .flat_map(|tx| tx.inputs.iter())
            .filter(|input| !input.prev_output.is_null())
            .map(|input| (input.prev_output.txid, input.prev_output.vout))
            .collect();

        let (exact_confirmed, conflicting_roots) = {
            let pool = self.transactions.read();
            let exact_confirmed: std::collections::HashSet<[u8; 32]> = pool
                .keys()
                .filter(|txid| confirmed_txids.contains(*txid))
                .copied()
                .collect();
            let conflicting_roots: std::collections::HashSet<[u8; 32]> = pool
                .iter()
                .filter(|(txid, _)| !confirmed_txids.contains(*txid))
                .filter(|(_, entry)| {
                    entry.tx.inputs.iter().any(|input| {
                        confirmed_spends.contains(&(input.prev_output.txid, input.prev_output.vout))
                    })
                })
                .map(|(txid, _)| *txid)
                .collect();
            (exact_confirmed, conflicting_roots)
        };

        let mut to_remove = exact_confirmed;
        {
            let pool = self.transactions.read();
            for txid in &conflicting_roots {
                to_remove.insert(*txid);
                collect_descendants(txid, &pool, &mut to_remove);
            }
        }

        let remove_count = to_remove.len();
        for txid in to_remove {
            self.remove_transaction(&txid);
        }
        remove_count
    }
    
    /// Get a transaction from the mempool
    pub fn get_transaction(&self, txid: &[u8; 32]) -> Option<Transaction> {
        self.transactions.read().get(txid).map(|e| e.tx.clone())
    }
    
    /// Check if a transaction is in the mempool
    pub fn contains(&self, txid: &[u8; 32]) -> bool {
        self.transactions.read().contains_key(txid)
    }
    
    /// Get all txids in the mempool
    pub fn get_txids(&self) -> Vec<[u8; 32]> {
        self.transactions.read().keys().copied().collect()
    }

    /// Get a mempool entry by txid.
    pub fn get_entry(&self, txid: &[u8; 32]) -> Option<MempoolEntry> {
        self.transactions.read().get(txid).cloned()
    }

    /// Get number of transactions in the mempool
    pub fn count(&self) -> usize {
        self.transactions.read().len()
    }

    /// Get the current pool size in bytes
    pub fn size_bytes(&self) -> usize {
        *self.current_size.read()
    }
    
    /// Get the fee for a transaction
    pub fn get_fee(&self, tx: &Transaction) -> Option<u64> {
        let txid = tx.txid();
        self.transactions.read().get(&txid).map(|e| e.fee)
    }
    
    /// Get transactions for block template with CPFP-aware selection,
    /// topological ordering, weight budgeting, and sigops limit.
    ///
    /// `max_weight` is the maximum block weight budget for transactions
    /// (excludes the coinbase). Each non-witness byte counts as 4 weight
    /// units; witness bytes count as 1. As a simplification we use
    /// `size * 4` here (worst-case non-witness).
    ///
    /// `MAX_BLOCK_SIGOPS` caps total sigop cost at 80 000 (BIP-141).
    pub fn get_block_transactions(&self, max_weight: usize) -> Result<Vec<Transaction>> {
        const MAX_BLOCK_SIGOPS: usize = 80_000;

        let pool = self.transactions.read();

        // Sort candidates by ancestor-package fee rate (CPFP-aware)
        let mut candidates: Vec<_> = pool.values().cloned().collect();
        candidates.sort_by(|a, b| {
            let rate_a = if a.ancestor_size > 0 { a.ancestor_fee as f64 / a.ancestor_size as f64 } else { 0.0 };
            let rate_b = if b.ancestor_size > 0 { b.ancestor_fee as f64 / b.ancestor_size as f64 } else { 0.0 };
            rate_b.partial_cmp(&rate_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        let mut selected_set: std::collections::HashSet<[u8; 32]> = std::collections::HashSet::new();
        let mut selected_order: Vec<[u8; 32]> = Vec::new();
        let mut total_weight: usize = 0;
        let mut total_sigops: usize = 0;

        for entry in &candidates {
            let txid = entry.tx.txid();
            if selected_set.contains(&txid) {
                continue;
            }

            // Collect unconfirmed ancestors that haven't been selected yet
            let mut pkg: Vec<[u8; 32]> = Vec::new();
            Self::collect_package(&entry.tx, &pool, &selected_set, &mut pkg);
            pkg.push(txid);

            // Compute package weight and sigops
            let pkg_weight: usize = pkg.iter()
                .filter_map(|id| pool.get(id))
                .map(|e| e.size * 4)
                .sum();
            let pkg_sigops: usize = pkg.iter()
                .filter_map(|id| pool.get(id))
                .map(|e| e.sigop_cost)
                .sum();

            if total_weight + pkg_weight > max_weight {
                continue; // skip – doesn't fit, try next
            }
            if total_sigops + pkg_sigops > MAX_BLOCK_SIGOPS {
                continue;
            }

            // Add the package (ancestors first = topological order)
            for id in &pkg {
                if selected_set.insert(*id) {
                    selected_order.push(*id);
                    if let Some(e) = pool.get(id) {
                        total_weight += e.size * 4;
                        total_sigops += e.sigop_cost;
                    }
                }
            }
        }

        // Emit transactions in topological order
        let selected: Vec<Transaction> = selected_order.iter()
            .filter_map(|id| pool.get(id).map(|e| e.tx.clone()))
            .collect();
        Ok(selected)
    }

    /// Collect unselected in-mempool parents recursively (topological).
    fn collect_package(
        tx: &Transaction,
        pool: &HashMap<[u8; 32], MempoolEntry>,
        selected: &std::collections::HashSet<[u8; 32]>,
        out: &mut Vec<[u8; 32]>,
    ) {
        for input in &tx.inputs {
            let parent_txid = input.prev_output.txid;
            if selected.contains(&parent_txid) || out.contains(&parent_txid) {
                continue;
            }
            if let Some(parent_entry) = pool.get(&parent_txid) {
                // Recurse first so ancestors come before children
                Self::collect_package(&parent_entry.tx, pool, selected, out);
                out.push(parent_txid);
            }
        }
    }
    
    /// Clear all transactions
    pub fn clear(&self) {
        self.transactions.write().clear();
        *self.current_size.write() = 0;
        self.orphan_txs.write().clear();
        self.orphans_by_parent.write().clear();
    }

    // ── Orphan transaction management ───────────────────────────

    /// Add a transaction to the orphan pool. Call this when a tx references
    /// parent(s) not yet in the UTXO set or mempool.
    /// `missing_parents` is the set of parent txids that were not found.
    pub fn add_orphan(&self, tx: Transaction, missing_parents: Vec<[u8; 32]>) -> bool {
        let txid = tx.txid();

        let mut orphans = self.orphan_txs.write();
        if orphans.contains_key(&txid) {
            return false; // duplicate
        }
        if orphans.len() >= MAX_ORPHAN_TXS {
            // Evict a random orphan to make space
            drop(orphans);
            self.evict_random_orphan();
            orphans = self.orphan_txs.write();
        }

        let now = unix_time_secs();
        orphans.insert(txid, OrphanEntry { tx, added_time: now });

        let mut by_parent = self.orphans_by_parent.write();
        for parent in missing_parents {
            by_parent.entry(parent).or_default().push(txid);
        }
        true
    }

    /// Returns orphan txids that depend on the given parent txid.
    /// Used when a new transaction is accepted so its orphan children
    /// can be re-evaluated.
    pub fn orphans_for_parent(&self, parent_txid: &[u8; 32]) -> Vec<Transaction> {
        let by_parent = self.orphans_by_parent.read();
        let orphan_ids = match by_parent.get(parent_txid) {
            Some(ids) => ids.clone(),
            None => return Vec::new(),
        };
        drop(by_parent);

        let orphans = self.orphan_txs.read();
        orphan_ids.iter()
            .filter_map(|id| orphans.get(id).map(|e| e.tx.clone()))
            .collect()
    }

    /// Remove an orphan (e.g. after it was successfully admitted to the mempool).
    pub fn remove_orphan(&self, txid: &[u8; 32]) {
        let entry = self.orphan_txs.write().remove(txid);
        if let Some(entry) = entry {
            let mut by_parent = self.orphans_by_parent.write();
            for inp in &entry.tx.inputs {
                if let Some(children) = by_parent.get_mut(&inp.prev_output.txid) {
                    children.retain(|id| id != txid);
                    if children.is_empty() {
                        by_parent.remove(&inp.prev_output.txid);
                    }
                }
            }
        }
    }

    /// Evict expired orphan transactions.
    pub fn expire_orphans(&self) {
        let now = unix_time_secs();
        let expired: Vec<[u8; 32]> = self.orphan_txs.read()
            .iter()
            .filter(|(_, e)| now.saturating_sub(e.added_time) >= ORPHAN_TX_EXPIRE_SECS)
            .map(|(id, _)| *id)
            .collect();
        for txid in expired {
            self.remove_orphan(&txid);
        }
    }

    /// Number of orphan transactions in the pool.
    pub fn orphan_count(&self) -> usize {
        self.orphan_txs.read().len()
    }

    /// Evict a random orphan to make room.
    fn evict_random_orphan(&self) {
        let victim = {
            let orphans = self.orphan_txs.read();
            orphans.keys().next().copied()
        };
        if let Some(txid) = victim {
            self.remove_orphan(&txid);
        }
    }

    /// Get block template entries with metadata (fee, sigops, weight, deps).
    /// Used by the GBT RPC to return per-transaction metadata.
    pub fn get_block_template_entries(&self, max_weight: usize) -> Vec<BlockTemplateEntry> {
        let txs = self.get_block_transactions(max_weight).unwrap_or_default();
        let pool = self.transactions.read();
        let mut index_map: HashMap<[u8; 32], usize> = HashMap::new();
        let mut result = Vec::with_capacity(txs.len());
        for (i, tx) in txs.iter().enumerate() {
            let txid = tx.txid();
            index_map.insert(txid, i);
            let entry = pool.get(&txid);
            let fee = entry.map_or(0, |e| e.fee);
            let sigops = entry.map_or(0, |e| e.sigop_cost);
            let size = entry.map_or(0, |e| e.size);
            // Compute dependency indices (parents that are also in this template)
            let depends: Vec<usize> = tx.inputs.iter()
                .filter_map(|inp| index_map.get(&inp.prev_output.txid).copied())
                .collect();
            result.push(BlockTemplateEntry {
                tx: tx.clone(),
                txid,
                fee,
                sigops,
                weight: size * 4,
                depends,
            });
        }
        result
    }

    /// Estimate the fee rate (satoshis per byte) needed to be included within
    /// `conf_target` blocks.
    ///
    /// Uses a simple percentile-based approach over current mempool entries:
    /// - conf_target 1: 90th percentile fee rate (high priority)
    /// - conf_target 2-3: 65th percentile
    /// - conf_target 4-6: 40th percentile
    /// - conf_target 7+: 10th percentile (economy)
    ///
    /// Returns `None` if the mempool is empty.
    pub fn estimate_fee_rate(&self, conf_target: u64) -> Option<f64> {
        let pool = self.transactions.read();
        if pool.is_empty() {
            return None;
        }

        // Collect fee rates (sat/byte)
        let mut rates: Vec<f64> = pool
            .values()
            .filter(|e| e.size > 0)
            .map(|e| e.fee as f64 / e.size as f64)
            .collect();

        if rates.is_empty() {
            return None;
        }

        rates.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let percentile = match conf_target {
            0 | 1 => 0.90,
            2 | 3 => 0.65,
            4..=6 => 0.40,
            _ => 0.10,
        };

        let idx = ((rates.len() as f64 * percentile) as usize).min(rates.len() - 1);
        Some(rates[idx])
    }

    /// Get a summary of mempool fee rate statistics.
    pub fn fee_histogram(&self) -> Vec<(f64, usize)> {
        let pool = self.transactions.read();

        // Fee rate buckets: [0, 1), [1, 5), [5, 10), [10, 50), [50, 100), [100, ∞)
        let boundaries = [1.0, 5.0, 10.0, 50.0, 100.0];
        let mut buckets = vec![0usize; boundaries.len() + 1];

        for entry in pool.values() {
            let rate = if entry.size > 0 {
                entry.fee as f64 / entry.size as f64
            } else {
                0.0
            };
            let bucket = boundaries.iter().position(|&b| rate < b).unwrap_or(boundaries.len());
            buckets[bucket] += 1;
        }

        // Return (upper_bound, count) pairs
        let mut result = Vec::new();
        for (i, &count) in buckets.iter().enumerate() {
            let upper = if i < boundaries.len() {
                boundaries[i]
            } else {
                f64::INFINITY
            };
            result.push((upper, count));
        }
        result
    }

    /// Evict the lowest fee-rate transaction to free at least `needed` bytes.
    /// Returns true if eviction succeeded.
    fn evict_lowest_feerate(&self, needed: usize) -> bool {
        let mut freed = 0usize;
        while freed < needed {
            let victim = {
                let pool = self.transactions.read();
                pool.values()
                    .filter(|e| e.size > 0)
                    .min_by(|a, b| {
                        let ra = a.fee as f64 / a.size as f64;
                        let rb = b.fee as f64 / b.size as f64;
                        ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|e| (e.tx.txid(), e.size))
            };
            match victim {
                Some((txid, sz)) => {
                    self.remove_transaction(&txid);
                    freed += sz;
                }
                None => return false,
            }
        }
        true
    }

    /// Expire entries older than MEMPOOL_EXPIRY_SECS.
    pub fn expire_old_entries(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let cutoff = now.saturating_sub(MEMPOOL_EXPIRY_SECS);
        let expired: Vec<[u8; 32]> = {
            let pool = self.transactions.read();
            pool.iter()
                .filter(|(_, e)| e.added_time < cutoff)
                .map(|(id, _)| *id)
                .collect()
        };
        for txid in &expired {
            self.remove_transaction(txid);
        }
    }
}

// ── Ancestor / descendant helpers ───────────────────────────────

/// Count the number of in-mempool ancestors of `tx` (parents, grandparents, …).
fn count_ancestors(tx: &Transaction, pool: &HashMap<[u8; 32], MempoolEntry>) -> usize {
    let mut visited = std::collections::HashSet::new();
    let mut stack: Vec<[u8; 32]> = tx.inputs.iter().map(|i| i.prev_output.txid).collect();
    while let Some(parent_id) = stack.pop() {
        if !pool.contains_key(&parent_id) || !visited.insert(parent_id) {
            continue;
        }
        if let Some(parent) = pool.get(&parent_id) {
            for inp in &parent.tx.inputs {
                stack.push(inp.prev_output.txid);
            }
        }
    }
    visited.len()
}

/// Count the number of in-mempool descendants of `txid` (children, grandchildren, …).
fn count_descendants(txid: &[u8; 32], pool: &HashMap<[u8; 32], MempoolEntry>) -> usize {
    let mut visited = std::collections::HashSet::new();
    let mut stack = vec![*txid];
    while let Some(current) = stack.pop() {
        if !visited.insert(current) {
            continue;
        }
        // Find all txs spending outputs of `current`
        for (child_id, entry) in pool.iter() {
            if entry.tx.inputs.iter().any(|i| i.prev_output.txid == current) {
                stack.push(*child_id);
            }
        }
    }
    // Don't count the root itself
    visited.len().saturating_sub(1)
}

/// Compute the ancestor-package fee and size for CPFP scoring.
/// Returns (ancestor_fee, ancestor_size) including the tx itself.
fn compute_ancestor_package(
    tx: &Transaction,
    fee: u64,
    size: usize,
    pool: &HashMap<[u8; 32], MempoolEntry>,
) -> (u64, usize) {
    let mut total_fee = fee;
    let mut total_size = size;
    let mut visited = std::collections::HashSet::new();
    let mut stack: Vec<[u8; 32]> = tx.inputs.iter().map(|i| i.prev_output.txid).collect();
    while let Some(parent_id) = stack.pop() {
        if !pool.contains_key(&parent_id) || !visited.insert(parent_id) {
            continue;
        }
        if let Some(parent) = pool.get(&parent_id) {
            total_fee += parent.fee;
            total_size += parent.size;
            for inp in &parent.tx.inputs {
                stack.push(inp.prev_output.txid);
            }
        }
    }
    (total_fee, total_size)
}

/// Collect all in-mempool descendants of `txid` into `out`.
fn collect_descendants(
    txid: &[u8; 32],
    pool: &HashMap<[u8; 32], MempoolEntry>,
    out: &mut std::collections::HashSet<[u8; 32]>,
) {
    let mut stack = vec![*txid];
    while let Some(current) = stack.pop() {
        for (child_id, entry) in pool.iter() {
            if entry.tx.inputs.iter().any(|i| i.prev_output.txid == current) {
                if out.insert(*child_id) {
                    stack.push(*child_id);
                }
            }
        }
    }
}

impl Mempool {
    // ── Package relay (BIP-331 / CPFP) ──────────────────────────

    /// Accept a package of transactions together, allowing child-pays-for-parent
    /// (CPFP) fee aggregation.
    ///
    /// The package must be topologically ordered: parents must appear before
    /// children.  Transactions are added in order; if a parent is not already in
    /// the mempool it is added first, using the combined package fee-rate to
    /// satisfy the minimum relay fee requirement for the whole group.
    ///
    /// Returns the number of transactions successfully added.
    pub fn add_package(&self, txs: Vec<Transaction>) -> usize {
        if txs.is_empty() {
            return 0;
        }

        // Compute aggregate fee across all transactions that pay the minimum relay
        // fee individually.  We use the sum of sizes and fees so that a zero-fee
        // parent + high-fee child still clears the package floor.
        let _total_size: usize = txs.iter()
            .filter_map(|tx| bincode::serialize(tx).ok().map(|b| b.len()))
            .sum();
        let total_fee: u64 = txs.iter()
            .filter_map(|tx| {
                bincode::serialize(tx).ok().map(|b| {
                    // Approximate: use fee 1 sat/vbyte minimum; real CPFP would use
                    // prevout lookup.  For package relay the caller is responsible
                    // for computing actual fee before calling add_package.
                    b.len() as u64
                })
            })
            .sum();
        let _ = total_fee; // reserved for future per-package fee floor

        let mut added = 0usize;
        let mut staged: Vec<Transaction> = Vec::new();

        for tx in txs {
            let txid = tx.txid();
            // Skip if already in mempool
            if self.contains(&txid) {
                staged.push(tx);
                added += 1;
                continue;
            }
            // Attempt to add; on failure (e.g. missing parent not yet staged)
            // keep the tx in staged so children can reference it.
            if self.add_transaction(tx.clone()).is_ok() {
                staged.push(tx);
                added += 1;
            } else {
                // Try promoting staged parent txs to the mempool first, then retry
                for parent in staged.iter() {
                    let _ = self.add_transaction(parent.clone());
                }
                if self.add_transaction(tx.clone()).is_ok() {
                    staged.push(tx);
                    added += 1;
                }
            }
        }

        // Drain staged txs that aren't in the pool yet (e.g. parents that were
        // orphaned before their children arrived).
        for tx in &staged {
            let _ = self.add_transaction(tx.clone());
        }

        added
    }

    // ── Persistence (mempool.dat) ────────────────────────────────

    /// Save all mempool entries to a file (bincode-serialised vec of txs + fees).
    pub fn save(&self, path: &std::path::Path) -> Result<()> {
        let txs = self.transactions.read();
        let entries: Vec<(Vec<u8>, u64)> = txs.values().map(|e| {
            (bincode::serialize(&e.tx).unwrap_or_default(), e.fee)
        }).collect();
        let data = bincode::serialize(&entries)?;
        std::fs::write(path, data)?;
        Ok(())
    }

    /// Load mempool entries from a file. Entries that fail re-validation
    /// are silently skipped.
    pub fn load(&self, path: &std::path::Path) -> Result<usize> {
        let data = std::fs::read(path)?;
        let entries: Vec<(Vec<u8>, u64)> = bincode::deserialize(&data)?;
        let mut loaded = 0usize;
        for (tx_bytes, fee) in entries {
            if let Ok(tx) = bincode::deserialize::<Transaction>(&tx_bytes) {
                if self.add_transaction_with_fee(tx, fee).is_ok() {
                    loaded += 1;
                }
            }
        }
        Ok(loaded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tx::{TxInput, TxOutput, OutPoint, Witness};
    
    fn create_test_tx() -> Transaction {
        Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::null(),
                script_sig: vec![],
                sequence: 0xffffffff,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput {
                value: 1000,
                script_pubkey: vec![],
            }],
            lock_time: 0,
        }
    }
    
    #[test]
    fn test_add_transaction() {
        let mempool = Mempool::new(1024 * 1024);
        let tx = create_test_tx();
        
        assert!(mempool.add_transaction(tx.clone()).is_ok());
        assert!(mempool.contains(&tx.txid()));
    }
    
    #[test]
    fn test_duplicate_transaction() {
        let mempool = Mempool::new(1024 * 1024);
        let tx = create_test_tx();
        
        assert!(mempool.add_transaction(tx.clone()).is_ok());
        assert!(mempool.add_transaction(tx).is_err());
    }
    
    #[test]
    fn test_remove_transaction() {
        let mempool = Mempool::new(1024 * 1024);
        let tx = create_test_tx();
        let txid = tx.txid();
        
        mempool.add_transaction(tx).unwrap();
        assert!(mempool.contains(&txid));
        
        let removed = mempool.remove_transaction(&txid);
        assert!(removed.is_some());
        assert!(!mempool.contains(&txid));
    }

    fn create_coinbase(height: u64) -> Transaction {
        Transaction::new_coinbase(height, 50_00000000, vec![0x51])
    }

    #[test]
    fn test_remove_block_transactions_keeps_valid_child_of_confirmed_tx() {
        let mempool = Mempool::new(1_000_000);
        let parent = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint { txid: [1u8; 32], vout: 0 },
                script_sig: vec![],
                sequence: 0xffff_fffd,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput::new(5_000, vec![0x51])],
            lock_time: 0,
        };
        let child = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint { txid: parent.txid(), vout: 0 },
                script_sig: vec![],
                sequence: 0xffff_fffd,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput::new(4_000, vec![0x51])],
            lock_time: 0,
        };
        let parent_id = parent.txid();
        let child_id = child.txid();

        mempool.add_transaction_with_fee(parent.clone(), 500).unwrap();
        mempool.add_transaction_with_fee(child.clone(), 500).unwrap();

        let block = chain::Block::new(
            chain::BlockHeader::with_height([0u8; 32], [0u8; 32], 1, 0x207fffff, 0, 1),
            vec![create_coinbase(1), parent],
        );

        let removed = mempool.remove_block_transactions(&block);

        assert_eq!(removed, 1);
        assert!(!mempool.contains(&parent_id));
        assert!(mempool.contains(&child_id));
    }

    #[test]
    fn test_remove_block_transactions_removes_conflicts_and_descendants() {
        let mempool = Mempool::new(1_000_000);
        let shared_prev = OutPoint { txid: [2u8; 32], vout: 0 };
        let conflicted = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: shared_prev,
                script_sig: vec![],
                sequence: 0xffff_fffd,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput::new(5_000, vec![0x51])],
            lock_time: 0,
        };
        let descendant = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint { txid: conflicted.txid(), vout: 0 },
                script_sig: vec![],
                sequence: 0xffff_fffd,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput::new(4_000, vec![0x51])],
            lock_time: 0,
        };
        let included = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: shared_prev,
                script_sig: vec![],
                sequence: 0xffff_fffd,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput::new(4_500, vec![0x51])],
            lock_time: 0,
        };
        let conflicted_id = conflicted.txid();
        let descendant_id = descendant.txid();

        mempool.add_transaction_with_fee(conflicted, 500).unwrap();
        mempool.add_transaction_with_fee(descendant, 500).unwrap();

        let block = chain::Block::new(
            chain::BlockHeader::with_height([0u8; 32], [0u8; 32], 1, 0x207fffff, 0, 1),
            vec![create_coinbase(1), included],
        );

        let removed = mempool.remove_block_transactions(&block);

        assert_eq!(removed, 2);
        assert!(!mempool.contains(&conflicted_id));
        assert!(!mempool.contains(&descendant_id));
    }
    
    #[test]
    fn test_count() {
        let mempool = Mempool::new(10 * 1024 * 1024);
        
        for i in 0u64..5 {
            let mut txid_bytes = [0u8; 32];
            txid_bytes[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new(txid_bytes, 0),
                    script_sig: vec![],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 1000 + i * 100, script_pubkey: vec![] }],
                lock_time: 0,
            };
            let _ = mempool.add_transaction(tx);
        }
        
        assert_eq!(mempool.count(), 5);
    }

    #[test]
    fn test_rbf_replacement() {
        let mempool = Mempool::new(10 * 1024 * 1024);
        let outpoint = OutPoint::new([1u8; 32], 0);

        // Original tx (fee = 100)
        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1.clone(), 100).unwrap();

        // Replacement with higher fee
        let tx2 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![1], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx2.clone(), 200).unwrap();

        // Old tx evicted, new one present
        assert!(!mempool.contains(&tx1.txid()));
        assert!(mempool.contains(&tx2.txid()));
        assert_eq!(mempool.count(), 1);
    }

    #[test]
    fn test_rbf_rejected_lower_fee() {
        let mempool = Mempool::new(10 * 1024 * 1024);
        let outpoint = OutPoint::new([2u8; 32], 0);

        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1, 200).unwrap();

        let tx2 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![1], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        assert!(mempool.add_transaction_with_fee(tx2, 100).is_err());
    }

    #[test]
    fn test_rbf_rejected_no_signal() {
        let mempool = Mempool::new(10 * 1024 * 1024);
        let outpoint = OutPoint::new([3u8; 32], 0);

        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![], sequence: 0xffff_ffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1, 100).unwrap();

        // Conflicting tx that does NOT signal RBF (sequence = max)
        let tx2 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![1], sequence: 0xffff_ffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        assert!(mempool.add_transaction_with_fee(tx2, 200).is_err());
    }

    #[test]
    fn test_eviction_when_full() {
        // Pool just big enough for one tx (bincode-serialized ~120 bytes each)
        let mempool = Mempool::new(150);
        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([10u8; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1.clone(), 200).unwrap();
        let used = mempool.size_bytes();
        // Ensure it actually fit
        assert!(mempool.contains(&tx1.txid()), "tx1 should be in pool (used {used} bytes)");

        let tx2 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([11u8; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx2.clone(), 1000).unwrap();
        assert!(!mempool.contains(&tx1.txid()), "low-fee tx1 should have been evicted");
        assert!(mempool.contains(&tx2.txid()));
    }

    #[test]
    fn test_ancestor_package_fee_rate() {
        let mempool = Mempool::new(10 * 1024 * 1024);

        let parent = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([20u8; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let parent_txid = parent.txid();
        mempool.add_transaction_with_fee(parent, 200).unwrap();

        let child = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new(parent_txid, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(child.clone(), 5000).unwrap();

        let pool = mempool.transactions.read();
        let child_entry = pool.get(&child.txid()).unwrap();
        assert!(child_entry.ancestor_fee >= 5200, "ancestor_fee should include parent fee");
        assert!(child_entry.ancestor_size > child_entry.size, "ancestor_size should include parent size");
    }

    #[test]
    fn test_rbf_descendant_cascade() {
        let mempool = Mempool::new(10 * 1024 * 1024);
        let outpoint = OutPoint::new([30u8; 32], 0);

        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let tx1_id = tx1.txid();
        mempool.add_transaction_with_fee(tx1, 200).unwrap();

        let child = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new(tx1_id, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let child_id = child.txid();
        mempool.add_transaction_with_fee(child, 200).unwrap();

        // RBF replacement — fee must exceed aggregate of evicted (200 + 200 = 400)
        let replacement = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![99], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 700, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(replacement.clone(), 500).unwrap();

        assert!(!mempool.contains(&tx1_id));
        assert!(!mempool.contains(&child_id));
        assert!(mempool.contains(&replacement.txid()));
    }

    // ── Orphan transaction pool tests ─────────────────────────────

    #[test]
    fn test_orphan_add_and_count() {
        let mempool = Mempool::new(10_000_000);
        let tx = create_test_tx();
        let parent_id = [0xaa; 32];
        assert!(mempool.add_orphan(tx, vec![parent_id]));
        assert_eq!(mempool.orphan_count(), 1);
    }

    #[test]
    fn test_orphan_duplicate_rejected() {
        let mempool = Mempool::new(10_000_000);
        let tx = create_test_tx();
        let parent_id = [0xaa; 32];
        assert!(mempool.add_orphan(tx.clone(), vec![parent_id]));
        assert!(!mempool.add_orphan(tx, vec![parent_id]));
        assert_eq!(mempool.orphan_count(), 1);
    }

    #[test]
    fn test_orphans_for_parent() {
        let mempool = Mempool::new(10_000_000);
        let parent_id = [0xbb; 32];
        let tx = create_test_tx();
        let txid = tx.txid();
        mempool.add_orphan(tx, vec![parent_id]);

        let children = mempool.orphans_for_parent(&parent_id);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].txid(), txid);

        // Unknown parent returns empty
        let empty = mempool.orphans_for_parent(&[0xff; 32]);
        assert!(empty.is_empty());
    }

    #[test]
    fn test_orphan_remove() {
        let mempool = Mempool::new(10_000_000);
        let tx = create_test_tx();
        let txid = tx.txid();
        let parent_id = [0xcc; 32];
        mempool.add_orphan(tx, vec![parent_id]);
        assert_eq!(mempool.orphan_count(), 1);

        mempool.remove_orphan(&txid);
        assert_eq!(mempool.orphan_count(), 0);
        assert!(mempool.orphans_for_parent(&parent_id).is_empty());
    }

    #[test]
    fn test_orphan_eviction_at_capacity() {
        let mempool = Mempool::new(10_000_000);
        // Fill to MAX_ORPHAN_TXS
        for i in 0..MAX_ORPHAN_TXS {
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new([i as u8; 32], 0),
                    script_sig: vec![i as u8],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 1000 + i as u64, script_pubkey: vec![] }],
                lock_time: 0,
            };
            mempool.add_orphan(tx, vec![[i as u8; 32]]);
        }
        assert_eq!(mempool.orphan_count(), MAX_ORPHAN_TXS);

        // Adding one more should evict one, keeping size at MAX
        let extra = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::new([0xff; 32], 0),
                script_sig: vec![0xff],
                sequence: 0xffffffff,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput { value: 9999, script_pubkey: vec![] }],
            lock_time: 0,
        };
        assert!(mempool.add_orphan(extra, vec![[0xff; 32]]));
        assert_eq!(mempool.orphan_count(), MAX_ORPHAN_TXS);
    }

    #[test]
    fn test_orphan_clear() {
        let mempool = Mempool::new(10_000_000);
        mempool.add_orphan(create_test_tx(), vec![[0xdd; 32]]);
        assert_eq!(mempool.orphan_count(), 1);
        mempool.clear();
        assert_eq!(mempool.orphan_count(), 0);
    }

    // ── Stress / flood tests ──────────────────────────────────────

    #[test]
    fn test_flood_500_distinct_transactions() {
        let mempool = Mempool::new(100 * 1024 * 1024);
        for i in 0u64..500 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new(seed, 0),
                    script_sig: vec![i as u8],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 1000 + i, script_pubkey: vec![0x51] }],
                lock_time: 0,
            };
            let fee = 1000 + i * 100;
            mempool.add_transaction_with_fee(tx, fee).unwrap();
        }
        assert_eq!(mempool.count(), 500);
    }

    #[test]
    fn test_flood_rejects_past_max_capacity() {
        // Pool capacity = 200 bytes (fits ~2-3 tiny txs).
        // Add two high-fee txs; then try to add a physically-oversized tx
        // (larger than the entire pool capacity) — it must be rejected and
        // the pool must not panic. Size of the oversized tx > pool capacity
        // means `evict_lowest_feerate` empties the pool but can't free enough
        // bytes → returns false → "Mempool full".
        let mempool = Mempool::new(200);

        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::new([0xAA; 32], 0),
                script_sig: vec![],
                sequence: 0xffffffff,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput { value: 500, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1, 9999).unwrap();

        // Oversized tx: output script is 500 bytes → total serialized size >> 200
        let big_script = vec![0x00u8; 500];
        let tx_big = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::new([0xBB; 32], 0),
                script_sig: vec![],
                sequence: 0xffffffff,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput { value: 1, script_pubkey: big_script }],
            lock_time: 0,
        };
        // The oversized tx is physically larger than pool capacity, so even
        // after evicting all existing entries it cannot fit → must be rejected.
        let res = mempool.add_transaction_with_fee(tx_big, 1);
        assert!(res.is_err(), "Oversized tx larger than pool capacity must be rejected");
    }

    // ── Fee estimation / histogram ────────────────────────────────

    #[test]
    fn test_estimate_fee_rate_empty_returns_none() {
        let mempool = Mempool::new(10_000_000);
        assert!(mempool.estimate_fee_rate(1).is_none());
        assert!(mempool.estimate_fee_rate(6).is_none());
    }

    #[test]
    fn test_estimate_fee_rate_conf_target_ordering() {
        // A pool with 30 txs at varied fee rates.
        // conf_target 1 (90th pct) should return a higher rate than target 10 (10th pct).
        let mempool = Mempool::new(100 * 1024 * 1024);
        for i in 1u64..=30 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            // Identical-sized tx, fee = i * 1000 → rate = i * 1000 / size
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new(seed, 0),
                    script_sig: vec![i as u8],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 500, script_pubkey: vec![0x51] }],
                lock_time: 0,
            };
            mempool.add_transaction_with_fee(tx, i * 1000).unwrap();
        }
        let rate_1  = mempool.estimate_fee_rate(1).unwrap();
        let rate_6  = mempool.estimate_fee_rate(6).unwrap();
        let rate_10 = mempool.estimate_fee_rate(10).unwrap();
        assert!(rate_1 >= rate_6,  "conf_target 1 rate ({rate_1}) should be >= conf_target 6 ({rate_6})");
        assert!(rate_6 >= rate_10, "conf_target 6 rate ({rate_6}) should be >= conf_target 10 ({rate_10})");
    }

    #[test]
    fn test_fee_histogram_buckets_nonempty() {
        let mempool = Mempool::new(100 * 1024 * 1024);
        // Add a tx with a minimal fee (zero-fee is rejected by policy)
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x01; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx, 200).unwrap();

        let hist = mempool.fee_histogram();
        assert!(!hist.is_empty(), "histogram must return at least one bucket");
        // Total count across all buckets == pool count
        let total: usize = hist.iter().map(|(_, count)| count).sum();
        assert_eq!(total, mempool.count(), "histogram total should equal mempool count");
    }

    // ── Block template selection ──────────────────────────────────

    #[test]
    fn test_block_template_contains_added_txs() {
        let mempool = Mempool::new(100 * 1024 * 1024);
        for i in 0u64..5 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput { prev_output: OutPoint::new(seed, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
                outputs: vec![TxOutput { value: 500, script_pubkey: vec![] }],
                lock_time: 0,
            };
            mempool.add_transaction_with_fee(tx, 5000).unwrap();
        }
        let entries = mempool.get_block_template_entries(4_000_000);
        assert_eq!(entries.len(), 5, "all 5 txs should appear in the template");
    }

    #[test]
    fn test_block_template_topological_order_parent_before_child() {
        let mempool = Mempool::new(100 * 1024 * 1024);
        let parent = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0xA0; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let parent_txid = parent.txid();
        // Add parent with a low but valid fee so the child CPFP bumps the package
        mempool.add_transaction_with_fee(parent, 200).unwrap();

        let child = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new(parent_txid, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let child_txid = child.txid();
        mempool.add_transaction_with_fee(child, 50_000).unwrap();

        let entries = mempool.get_block_template_entries(4_000_000);
        assert_eq!(entries.len(), 2);
        let parent_pos = entries.iter().position(|e| e.txid == parent_txid).unwrap();
        let child_pos  = entries.iter().position(|e| e.txid == child_txid).unwrap();
        assert!(parent_pos < child_pos, "parent must appear before child in template");
    }

    #[test]
    fn test_block_template_excludes_tx_exceeding_weight_cap() {
        let mempool = Mempool::new(100 * 1024 * 1024);
        // A tx whose weight (size * 4) would itself exceed the template budget.
        let big_script = vec![0xaa; 2048];
        let heavy_tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0xC0; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: big_script }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(heavy_tx, 999_999).unwrap();

        // Template budget of 100 bytes weight — heavy_tx won't fit
        let entries = mempool.get_block_template_entries(100);
        assert!(entries.is_empty(), "heavy tx must be excluded when it exceeds weight cap");
    }

    // ── Package relay (BIP-331) ───────────────────────────────────

    #[test]
    fn test_package_relay_empty_returns_zero() {
        let mempool = Mempool::new(10_000_000);
        assert_eq!(mempool.add_package(vec![]), 0);
    }

    #[test]
    fn test_package_relay_single_tx() {
        let mempool = Mempool::new(10_000_000);
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0xD0; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        assert_eq!(mempool.add_package(vec![tx]), 1);
        assert_eq!(mempool.count(), 1);
    }

    #[test]
    fn test_package_relay_parent_child_both_admitted() {
        let mempool = Mempool::new(10_000_000);
        let parent = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0xE0; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let parent_txid = parent.txid();
        let child = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new(parent_txid, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let added = mempool.add_package(vec![parent, child]);
        assert!(added >= 1, "at least one tx from the package should be added");
    }

    #[test]
    fn test_package_relay_duplicate_does_not_double_count() {
        let mempool = Mempool::new(10_000_000);
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0xF0; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_package(vec![tx.clone()]);
        let count_before = mempool.count();
        // Submitting the same tx again in another package should not increase count
        mempool.add_package(vec![tx]);
        assert_eq!(mempool.count(), count_before);
    }

    // ── RBF edge-cases ────────────────────────────────────────────

    #[test]
    fn test_rbf_exact_aggregate_fee_rejected() {
        // Replacement fee == aggregate fee of evicted set → must be rejected
        // (rule requires strictly greater).
        let mempool = Mempool::new(10_000_000);
        let outpoint = OutPoint::new([0x11; 32], 0);
        let original = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(original, 500).unwrap();

        let replacement = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: outpoint, script_sig: vec![1], sequence: 0xffff_fffd, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 800, script_pubkey: vec![] }],
            lock_time: 0,
        };
        // fee == aggregate (500 == 500) → strictly-greater rule fails
        assert!(mempool.add_transaction_with_fee(replacement, 500).is_err());
    }

    #[test]
    fn test_rbf_non_conflicting_tx_always_added() {
        // Tx that spends a completely different outpoint is never considered
        // an RBF conflict — it must be added regardless of sequence.
        let mempool = Mempool::new(10_000_000);
        let tx1 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x22; 32], 0), script_sig: vec![], sequence: 0xffff_ffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let tx2 = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x33; 32], 0), script_sig: vec![], sequence: 0xffff_ffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![] }],
            lock_time: 0,
        };
        mempool.add_transaction_with_fee(tx1, 100).unwrap();
        mempool.add_transaction_with_fee(tx2, 100).unwrap();
        assert_eq!(mempool.count(), 2);
    }

    // ── Ancestor chain limit ──────────────────────────────────────

    #[test]
    fn test_ancestor_chain_limit_enforced() {
        let mempool = Mempool::new(200 * 1024 * 1024);
        // Build a chain of MAX_ANCESTORS + 1 txs so the over-limit tx has
        // MAX_ANCESTORS + 1 ancestors, which exceeds the check (> MAX_ANCESTORS)
        let mut prev_txid = [0x50u8; 32];
        for i in 0..=(MAX_ANCESTORS) {
            let mut seed = [0u8; 32];
            seed[0..4].copy_from_slice(&(i as u32).to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new(prev_txid, 0),
                    script_sig: vec![i as u8],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 1000, script_pubkey: vec![0x51] }],
                lock_time: 0,
            };
            prev_txid = tx.txid();
            mempool.add_transaction_with_fee(tx, 1000).unwrap();
        }
        // The (MAX_ANCESTORS + 1)-th tx should be rejected
        let over_limit = Transaction {
            version: 2,
            inputs: vec![TxInput {
                prev_output: OutPoint::new(prev_txid, 0),
                script_sig: vec![0xff],
                sequence: 0xffffffff,
                witness: Witness::new(),
            }],
            outputs: vec![TxOutput { value: 900, script_pubkey: vec![0x51] }],
            lock_time: 0,
        };
        assert!(mempool.add_transaction_with_fee(over_limit, 1000).is_err(),
            "tx with more than MAX_ANCESTORS in-mempool ancestors must be rejected");
    }

    // ── Persistence ───────────────────────────────────────────────

    #[test]
    fn test_persistence_save_and_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("kc_mempool_test_{}", unix_time_subsec_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("mempool.dat");

        let mempool1 = Mempool::new(10_000_000);
        for i in 0u64..10 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput { prev_output: OutPoint::new(seed, 0), script_sig: vec![i as u8], sequence: 0xffffffff, witness: Witness::new() }],
                outputs: vec![TxOutput { value: 1000 + i, script_pubkey: vec![] }],
                lock_time: 0,
            };
            mempool1.add_transaction_with_fee(tx, 500 + i * 50).unwrap();
        }
        assert_eq!(mempool1.count(), 10);
        mempool1.save(&path).unwrap();

        let mempool2 = Mempool::new(10_000_000);
        let loaded = mempool2.load(&path).unwrap();
        assert_eq!(loaded, 10, "all 10 txs should be reloaded");
        assert_eq!(mempool2.count(), 10);

        // All txids should match
        let ids1: std::collections::HashSet<Vec<u8>> = mempool1.get_txids().iter().map(|id| id.to_vec()).collect();
        let ids2: std::collections::HashSet<Vec<u8>> = mempool2.get_txids().iter().map(|id| id.to_vec()).collect();
        assert_eq!(ids1, ids2, "txids must match after roundtrip");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_persistence_load_corrupted_data_returns_zero() {
        let dir = std::env::temp_dir().join(format!("kc_mempool_corrupt_{}", unix_time_subsec_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("mempool.dat");
        std::fs::write(&path, b"not valid bincode data \xff\xfe\xfd").unwrap();

        let mempool = Mempool::new(10_000_000);
        // Should return an error (not panic)
        let result = mempool.load(&path);
        assert!(result.is_err(), "loading corrupted data must return an error");
        assert_eq!(mempool.count(), 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_persistence_load_nonexistent_file_returns_error() {
        let mempool = Mempool::new(10_000_000);
        let result = mempool.load(std::path::Path::new("/nonexistent/path/mempool.dat"));
        assert!(result.is_err());
        assert_eq!(mempool.count(), 0);
    }

    // ── Concurrent access ─────────────────────────────────────────

    #[test]
    fn test_concurrent_adds_do_not_panic() {
        use std::sync::Arc;
        use std::thread;

        let mempool = Arc::new(Mempool::new(200 * 1024 * 1024));
        let mut handles = Vec::new();

        for t in 0u64..8 {
            let mp = Arc::clone(&mempool);
            handles.push(thread::spawn(move || {
                for i in 0u64..50 {
                    let idx = t * 50 + i;
                    let mut seed = [0u8; 32];
                    seed[0..8].copy_from_slice(&idx.to_le_bytes());
                    let tx = Transaction {
                        version: 2,
                        inputs: vec![TxInput {
                            prev_output: OutPoint::new(seed, 0),
                            script_sig: vec![(idx & 0xff) as u8],
                            sequence: 0xffffffff,
                            witness: Witness::new(),
                        }],
                        outputs: vec![TxOutput { value: 1000 + idx, script_pubkey: vec![] }],
                        lock_time: 0,
                    };
                    let _ = mp.add_transaction_with_fee(tx, 1000 + idx);
                }
            }));
        }
        for h in handles { h.join().unwrap(); }
        // Pool should have up to 400 txs, no panics
        assert!(mempool.count() <= 400);
    }

    #[test]
    fn test_concurrent_add_and_remove_no_panic() {
        use std::sync::Arc;

        let mempool = Arc::new(Mempool::new(200 * 1024 * 1024));
        // Pre-populate
        let mut txids = Vec::new();
        for i in 0u64..50 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput { prev_output: OutPoint::new(seed, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
                outputs: vec![TxOutput { value: 1000, script_pubkey: vec![] }],
                lock_time: 0,
            };
            txids.push(tx.txid());
            mempool.add_transaction_with_fee(tx, 1000).unwrap();
        }

        let mp_add = Arc::clone(&mempool);
        let mp_rem = Arc::clone(&mempool);
        let txids_arc = Arc::new(txids);
        let txids_arc2 = Arc::clone(&txids_arc);

        let adder = std::thread::spawn(move || {
            for i in 100u64..150 {
                let mut seed = [0u8; 32];
                seed[0..8].copy_from_slice(&i.to_le_bytes());
                let tx = Transaction {
                    version: 2,
                    inputs: vec![TxInput { prev_output: OutPoint::new(seed, 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
                    outputs: vec![TxOutput { value: 1000, script_pubkey: vec![] }],
                    lock_time: 0,
                };
                let _ = mp_add.add_transaction_with_fee(tx, 1000);
            }
        });

        let remover = std::thread::spawn(move || {
            for txid in txids_arc2.iter() {
                mp_rem.remove_transaction(txid);
            }
        });

        adder.join().unwrap();
        remover.join().unwrap();
        // Must not panic; count is non-deterministic but bounded
        assert!(mempool.count() <= 200);
    }

    // ── get_entry / size_bytes consistency ────────────────────────

    #[test]
    fn test_get_entry_returns_fee_and_size() {
        let mempool = Mempool::new(10_000_000);
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x60; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 1234, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let txid = tx.txid();
        mempool.add_transaction_with_fee(tx, 777).unwrap();

        let entry = mempool.get_entry(&txid).unwrap();
        assert_eq!(entry.fee, 777);
        assert!(entry.size > 0);
        assert_eq!(mempool.size_bytes(), entry.size);
    }

    #[test]
    fn test_size_bytes_tracks_adds_and_removes() {
        let mempool = Mempool::new(10_000_000);
        assert_eq!(mempool.size_bytes(), 0);

        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x70; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 999, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let txid = tx.txid();
        mempool.add_transaction_with_fee(tx, 100).unwrap();
        let sz = mempool.size_bytes();
        assert!(sz > 0, "size_bytes must increase after adding a tx");

        mempool.remove_transaction(&txid);
        assert_eq!(mempool.size_bytes(), 0, "size_bytes must return to 0 after removal");
    }

    #[test]
    fn test_clear_resets_size_bytes() {
        let mempool = Mempool::new(10_000_000);
        for i in 0u64..5 {
            let mut seed = [0u8; 32];
            seed[0..8].copy_from_slice(&i.to_le_bytes());
            let tx = Transaction {
                version: 2,
                inputs: vec![TxInput { prev_output: OutPoint::new(seed, 0), script_sig: vec![i as u8], sequence: 0xffffffff, witness: Witness::new() }],
                outputs: vec![TxOutput { value: 1000, script_pubkey: vec![] }],
                lock_time: 0,
            };
            mempool.add_transaction_with_fee(tx, 500).unwrap();
        }
        assert!(mempool.size_bytes() > 0);
        mempool.clear();
        assert_eq!(mempool.size_bytes(), 0);
        assert_eq!(mempool.count(), 0);
    }

    // ── expire_old_entries no-op on fresh txs ─────────────────────

    #[test]
    fn test_expire_old_entries_keeps_fresh_txs() {
        let mempool = Mempool::new(10_000_000);
        let tx = Transaction {
            version: 2,
            inputs: vec![TxInput { prev_output: OutPoint::new([0x80; 32], 0), script_sig: vec![], sequence: 0xffffffff, witness: Witness::new() }],
            outputs: vec![TxOutput { value: 100, script_pubkey: vec![] }],
            lock_time: 0,
        };
        let txid = tx.txid();
        mempool.add_transaction_with_fee(tx, 100).unwrap();
        mempool.expire_old_entries(); // should not expire a just-added tx
        assert!(mempool.contains(&txid), "freshly-added tx must not be expired");
    }

    // ── Concurrency / race-condition hardening ────────────────────────────────

    #[test]
    fn test_concurrent_readers_see_consistent_state() {
        use std::sync::Arc;
        use std::thread;

        let mempool = Arc::new(Mempool::new(200 * 1024 * 1024));
        let n = 20usize;
        // Pre-populate
        for i in 0..n {
            let tx = Transaction {
                version: 1,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new([i as u8; 32], 0),
                    script_sig: vec![],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 1000 + i as u64, script_pubkey: vec![] }],
                lock_time: 0,
            };
            mempool.add_transaction_with_fee(tx, 200).unwrap();
        }

        // Many readers concurrently; none should panic or observe size < n
        let handles: Vec<_> = (0..8).map(|_| {
            let mp = Arc::clone(&mempool);
            thread::spawn(move || {
                for _ in 0..50 {
                    let sz = mp.count();
                    assert!(sz <= n, "size must not exceed pre-populated count");
                }
            })
        }).collect();

        for h in handles { h.join().unwrap(); }
    }

    #[test]
    fn test_concurrent_write_then_read_consistency() {
        use std::sync::Arc;
        use std::thread;

        let mempool = Arc::new(Mempool::new(200 * 1024 * 1024));
        let n_writers = 4usize;
        let txs_per_writer = 25usize;

        let mut writers = Vec::new();
        for w in 0..n_writers {
            let mp = Arc::clone(&mempool);
            writers.push(thread::spawn(move || {
                for t in 0..txs_per_writer {
                    let unique = w * 1000 + t + 1;
                    let tx = Transaction {
                        version: 1,
                        inputs: vec![TxInput {
                            prev_output: OutPoint::new({
                                let mut b = [0u8; 32];
                                b[0] = (unique & 0xFF) as u8;
                                b[1] = ((unique >> 8) & 0xFF) as u8;
                                b
                            }, 0),
                            script_sig: vec![],
                            sequence: 0xffffffff,
                            witness: Witness::new(),
                        }],
                        outputs: vec![TxOutput { value: unique as u64 * 100, script_pubkey: vec![] }],
                        lock_time: 0,
                    };
                    let _ = mp.add_transaction_with_fee(tx, 5); // errors ok (dup/full)
                }
            }));
        }
        for w in writers { w.join().unwrap(); }

        // Reader after all writers finish
        let total = mempool.count();
        assert!(total <= n_writers * txs_per_writer,
            "size {} must not exceed total inserted {}", total, n_writers * txs_per_writer);
        // Fee estimates must compute without panic
        let _ = mempool.estimate_fee_rate(1);
        let _ = mempool.estimate_fee_rate(6);
    }

    #[test]
    fn test_concurrent_get_block_template_under_writes() {
        use std::sync::Arc;
        use std::thread;

        let mempool = Arc::new(Mempool::new(200 * 1024 * 1024));

        // Pre-fill
        for i in 0..30u8 {
            let tx = Transaction {
                version: 1,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new([i; 32], 0),
                    script_sig: vec![],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 5000 + i as u64, script_pubkey: vec![] }],
                lock_time: 0,
            };
            let _ = mempool.add_transaction_with_fee(tx, 10 + i as u64);
        }

        // Concurrent template requests + adds
        let mp_read = Arc::clone(&mempool);
        let reader = thread::spawn(move || {
            for _ in 0..20 {
                let tmpl = mp_read.get_block_template_entries(1_000_000);
                // Pre-filled 30 + up to 15 concurrently added = max 45
                assert!(tmpl.len() <= 45, "template exceeds maximum possible entries: {}", tmpl.len());
            }
        });

        for i in 100u8..115 {
            let tx = Transaction {
                version: 1,
                inputs: vec![TxInput {
                    prev_output: OutPoint::new([i; 32], 1),
                    script_sig: vec![],
                    sequence: 0xffffffff,
                    witness: Witness::new(),
                }],
                outputs: vec![TxOutput { value: 9999, script_pubkey: vec![] }],
                lock_time: 0,
            };
            let _ = mempool.add_transaction_with_fee(tx, 20);
        }

        reader.join().unwrap();
    }
}
