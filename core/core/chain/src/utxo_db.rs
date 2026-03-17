use crate::error::ChainError;
use crate::{UtxoSet, UTXO};
use sled::Db;
use std::path::Path;
use std::sync::Arc;
use tx::OutPoint;

/// Sled-backed UTXO set for persistent storage and scalability
pub struct UtxoDatabase {
    db: Arc<Db>,
}

impl UtxoDatabase {
    /// Open or create a UTXO database at the given path
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, ChainError> {
        let db = sled::open(path)?;
        Ok(Self { db: Arc::new(db) })
    }

    /// Add a UTXO to the database
    pub fn add_utxo(&self, outpoint: OutPoint, utxo: UTXO) -> Result<(), ChainError> {
        let key = Self::serialize_outpoint(&outpoint);
        let value = Self::serialize_utxo(&utxo)?;
        self.db.insert(&key, value)?;
        Ok(())
    }

    /// Remove a UTXO from the database
    pub fn remove_utxo(&self, outpoint: &OutPoint) -> Result<(), ChainError> {
        let key = Self::serialize_outpoint(outpoint);
        self.db.remove(&key)?;
        Ok(())
    }

    /// Get a UTXO from the database
    pub fn get_utxo(&self, outpoint: &OutPoint) -> Result<Option<UTXO>, ChainError> {
        let key = Self::serialize_outpoint(outpoint);
        match self.db.get(&key)? {
            Some(value) => {
                let utxo = Self::deserialize_utxo(&value)?;
                Ok(Some(utxo))
            }
            None => Ok(None),
        }
    }

    /// Check if a UTXO exists
    pub fn contains(&self, outpoint: &OutPoint) -> bool {
        let key = Self::serialize_outpoint(outpoint);
        self.db.get(&key).ok().flatten().is_some()
    }

    /// Get the total number of UTXOs
    pub fn len(&self) -> usize {
        self.db.len()
    }

    /// Check if the database is empty
    pub fn is_empty(&self) -> bool {
        self.db.is_empty()
    }

    /// Get total value locked in all UTXOs
    pub fn total_value(&self) -> Result<u64, ChainError> {
        let mut total = 0u64;
        for item in self.db.iter() {
            let (_, value) = item?;
            let utxo = Self::deserialize_utxo(&value)?;
            total = total.checked_add(utxo.output.value)
                .ok_or_else(|| ChainError::Validation("UTXO total value overflowed u64".to_string()))?;
        }
        Ok(total)
    }

    /// Batch write operations for better performance
    pub fn batch_write<F>(&self, f: F) -> Result<(), ChainError>
    where
        F: FnOnce(&mut Vec<(Vec<u8>, Vec<u8>)>) -> Result<(), ChainError>,
    {
        let mut batch = Vec::new();
        f(&mut batch)?;

        let mut batch_op = sled::Batch::default();
        for (key, value) in batch {
            batch_op.insert(key, value);
        }

        self.db.apply_batch(batch_op)?;
        self.db.flush()?;
        Ok(())
    }

    /// Load in-memory UTXO set from database (for compatibility)
    pub fn load_memory_set(&self) -> Result<UtxoSet, ChainError> {
        let mut utxo_set = UtxoSet::new();
        for item in self.db.iter() {
            let (key, value) = item?;
            let outpoint = Self::deserialize_outpoint(&key)?;
            let utxo = Self::deserialize_utxo(&value)?;
            utxo_set.add_utxo(outpoint, utxo);
        }
        Ok(utxo_set)
    }

    /// Save in-memory UTXO set to database
    pub fn save_memory_set(&self, utxo_set: &UtxoSet) -> Result<(), ChainError> {
        for (outpoint, utxo) in utxo_set.iter() {
            let key = Self::serialize_outpoint(outpoint);
            let value = Self::serialize_utxo(utxo)?;
            self.db.insert(key, value)?;
        }
        self.db.flush()?;
        Ok(())
    }

    /// Compact the database to reclaim space
    pub fn compact(&self) {
        // Sled doesn't have explicit compaction API
        // It handles compaction automatically
    }

    /// Get database statistics
    pub fn stats(&self) -> String {
        format!(
            "UTXO count: {}, Database size: {} bytes",
            self.len(),
            self.db.size_on_disk().unwrap_or(0)
        )
    }

    // Serialization helpers

    fn serialize_outpoint(outpoint: &OutPoint) -> Vec<u8> {
        let mut key = Vec::with_capacity(36); // 32 bytes txid + 4 bytes vout
        key.extend_from_slice(&outpoint.txid);
        key.extend_from_slice(&outpoint.vout.to_le_bytes());
        key
    }

    fn deserialize_outpoint(bytes: &[u8]) -> Result<OutPoint, ChainError> {
        if bytes.len() != 36 {
            return Err(ChainError::InvalidFormat(format!(
                "invalid outpoint length: {} (expected 36)",
                bytes.len()
            )));
        }

        let mut txid = [0u8; 32];
        txid.copy_from_slice(&bytes[0..32]);

        let mut vout_bytes = [0u8; 4];
        vout_bytes.copy_from_slice(&bytes[32..36]);
        let vout = u32::from_le_bytes(vout_bytes);

        Ok(OutPoint::new(txid, vout))
    }

    fn serialize_utxo(utxo: &UTXO) -> Result<Vec<u8>, ChainError> {
        Ok(serde_json::to_vec(utxo)?)
    }

    fn deserialize_utxo(bytes: &[u8]) -> Result<UTXO, ChainError> {
        Ok(serde_json::from_slice(bytes)?)
    }
}

impl Clone for UtxoDatabase {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tx::{PrivateKey, TxOutput};

    #[test]
    fn test_utxo_database_operations() {
        let temp_dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(temp_dir.path()).unwrap();

        // Create test UTXO
        let privkey = PrivateKey::new();
        let pubkey = privkey.public_key();
        let pubkey_hash = pubkey.hash();

        let output = TxOutput::new_p2pkh(1000, pubkey_hash);
        let txid = [0x42u8; 32];
        let outpoint = OutPoint::new(txid, 0);
        let utxo = UTXO::new(output, 0, false);

        // Test add
        db.add_utxo(outpoint, utxo.clone()).unwrap();
        assert!(db.contains(&outpoint));

        // Test get
        let retrieved = db.get_utxo(&outpoint).unwrap().unwrap();
        assert_eq!(retrieved.output.value, 1000);

        // Test remove
        db.remove_utxo(&outpoint).unwrap();
        assert!(!db.contains(&outpoint));
    }

    #[test]
    fn test_batch_operations() {
        let temp_dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(temp_dir.path()).unwrap();

        // Add multiple UTXOs in batch
        db.batch_write(|batch| {
            for i in 0..10 {
                let mut txid = [0u8; 32];
                txid[0] = i;
                let outpoint = OutPoint::new(txid, 0);
                let output = TxOutput::new(1000 * (i as u64 + 1), vec![]);
                let utxo = UTXO::new(output, i as u64, false);

                let key = UtxoDatabase::serialize_outpoint(&outpoint);
                let value = UtxoDatabase::serialize_utxo(&utxo)?;
                batch.push((key, value));
            }
            Ok(())
        })
        .unwrap();

        assert_eq!(db.len(), 10);

        // Verify total value
        let total = db.total_value().unwrap();
        assert_eq!(total, 55000); // 1000+2000+...+10000
    }

    #[test]
    fn test_memory_set_conversion() {
        let temp_dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(temp_dir.path()).unwrap();

        // Create in-memory set
        let mut mem_set = UtxoSet::new();
        for i in 0..5 {
            let mut txid = [0u8; 32];
            txid[0] = i;
            let outpoint = OutPoint::new(txid, 0);
            let output = TxOutput::new(1000, vec![]);
            let utxo = UTXO::new(output, i as u64, false);
            mem_set.add_utxo(outpoint, utxo);
        }

        // Save to database
        db.save_memory_set(&mem_set).unwrap();
        assert_eq!(db.len(), 5);

        // Load back
        let loaded_set = db.load_memory_set().unwrap();
        assert_eq!(loaded_set.len(), 5);
    }

    // ── Hardening tests ────────────────────────────────────────────────────

    #[test]
    fn test_utxo_db_get_nonexistent_returns_none() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();
        let outpoint = OutPoint::new([0x42u8; 32], 7);
        let result = db.get_utxo(&outpoint).unwrap();
        assert!(result.is_none(), "get for non-existent UTXO must return None");
    }

    #[test]
    fn test_utxo_db_remove_nonexistent_is_ok() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();
        let outpoint = OutPoint::new([0xffu8; 32], 0);
        // Must not panic or error
        let result = db.remove_utxo(&outpoint);
        assert!(result.is_ok(), "remove of nonexistent UTXO should be Ok");
    }

    #[test]
    fn test_utxo_db_contains_after_add_and_remove() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();
        let outpoint = OutPoint::new([0x01u8; 32], 0);
        let utxo = UTXO::new(TxOutput::new(5000, vec![0xAB]), 10, false);

        assert!(!db.contains(&outpoint));
        db.add_utxo(outpoint.clone(), utxo).unwrap();
        assert!(db.contains(&outpoint));
        db.remove_utxo(&outpoint).unwrap();
        assert!(!db.contains(&outpoint));
    }

    #[test]
    fn test_utxo_db_total_value_multiple_utxos() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();

        let values = [1_000u64, 2_500, 7_500];
        for (i, &v) in values.iter().enumerate() {
            let mut txid = [0u8; 32];
            txid[0] = i as u8;
            let outpoint = OutPoint::new(txid, 0);
            let utxo = UTXO::new(TxOutput::new(v, vec![]), i as u64, false);
            db.add_utxo(outpoint, utxo).unwrap();
        }

        let total = db.total_value().unwrap();
        assert_eq!(total, 11_000, "total_value must equal sum of all UTXO amounts");
    }

    #[test]
    fn test_utxo_db_is_empty_lifecycle() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();
        assert!(db.is_empty(), "freshly opened DB must be empty");

        let outpoint = OutPoint::new([0x02u8; 32], 1);
        let utxo = UTXO::new(TxOutput::new(100, vec![]), 0, true);
        db.add_utxo(outpoint.clone(), utxo).unwrap();
        assert!(!db.is_empty());

        db.remove_utxo(&outpoint).unwrap();
        assert!(db.is_empty(), "DB should be empty after last UTXO removed");
    }

    #[test]
    fn test_utxo_db_overwrite_utxo() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();

        let outpoint = OutPoint::new([0x03u8; 32], 0);
        let utxo_v1 = UTXO::new(TxOutput::new(100, vec![0x01]), 1, false);
        let utxo_v2 = UTXO::new(TxOutput::new(9999, vec![0x02]), 2, false);

        db.add_utxo(outpoint.clone(), utxo_v1).unwrap();
        db.add_utxo(outpoint.clone(), utxo_v2).unwrap();

        let retrieved = db.get_utxo(&outpoint).unwrap().expect("UTXO must exist after overwrite");
        assert_eq!(retrieved.output.value, 9999, "second add must overwrite the first");
    }

    #[test]
    fn test_utxo_db_1000_utxos_load_memory_set() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();

        for i in 0u32..1000 {
            let mut txid = [0u8; 32];
            txid[0] = (i & 0xFF) as u8;
            txid[1] = ((i >> 8) & 0xFF) as u8;
            let outpoint = OutPoint::new(txid, i);
            let utxo = UTXO::new(TxOutput::new(i as u64 + 1, vec![]), 0, false);
            db.add_utxo(outpoint, utxo).unwrap();
        }

        assert_eq!(db.len(), 1000);
        let mem_set = db.load_memory_set().unwrap();
        assert_eq!(mem_set.len(), 1000, "load_memory_set must return all 1000 UTXOs");
    }

    #[test]
    fn test_utxo_db_stats_returns_nonempty_string() {
        let dir = TempDir::new().unwrap();
        let db = UtxoDatabase::open(dir.path()).unwrap();

        let outpoint = OutPoint::new([0x04u8; 32], 0);
        db.add_utxo(outpoint, UTXO::new(TxOutput::new(500, vec![]), 0, false)).unwrap();

        let stats = db.stats();
        assert!(!stats.is_empty(), "stats() must return a non-empty string");
    }
}
