//! Persistent storage for Lightning channel state.
//!
//! Serialises [`Channel`] objects to a `storage::Storage` backend so channels
//! survive node restarts.

use storage::Storage;

use crate::channel::Channel;
use crate::htlc::Htlc;
use crate::{LightningError, Result};

/// Key prefix for channel records.
const CHANNEL_PREFIX: &[u8] = b"ln_channel:";
/// Key prefix for HTLC records.
const HTLC_PREFIX: &[u8] = b"ln_htlc:";

/// Manages persisting and loading channels.
pub struct ChannelStore<S: Storage> {
    db: S,
}

impl<S: Storage> ChannelStore<S> {
    /// Wrap an existing storage backend.
    pub fn new(db: S) -> Self {
        Self { db }
    }

    /// Persist a channel (insert or update).
    pub fn save(&self, channel: &Channel) -> Result<()> {
        let key = channel_key(&channel.channel_id);
        let value = serde_json::to_vec(channel)
            .map_err(|e| LightningError::Serialization(e.to_string()))?;
        self.db
            .put(&key, &value)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }

    /// Load a channel by its 32-byte ID.
    pub fn load(&self, channel_id: &[u8; 32]) -> Result<Option<Channel>> {
        let key = channel_key(channel_id);
        match self.db.get(&key) {
            Ok(Some(bytes)) => {
                let ch: Channel = serde_json::from_slice(&bytes)
                    .map_err(|e| LightningError::Serialization(e.to_string()))?;
                Ok(Some(ch))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(LightningError::Serialization(e.to_string())),
        }
    }

    /// Delete a channel record.
    pub fn remove(&self, channel_id: &[u8; 32]) -> Result<()> {
        let key = channel_key(channel_id);
        self.db
            .delete(&key)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }

    /// Check whether a channel exists in storage.
    pub fn exists(&self, channel_id: &[u8; 32]) -> Result<bool> {
        let key = channel_key(channel_id);
        self.db
            .exists(&key)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }

    /// Persist an HTLC associated with a channel.
    pub fn save_htlc(&self, channel_id: &[u8; 32], htlc: &Htlc) -> Result<()> {
        let key = htlc_key(channel_id, htlc.id);
        let value = serde_json::to_vec(htlc)
            .map_err(|e| LightningError::Serialization(e.to_string()))?;
        self.db
            .put(&key, &value)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }

    /// Load an HTLC by channel ID and HTLC ID.
    pub fn load_htlc(&self, channel_id: &[u8; 32], htlc_id: u64) -> Result<Option<Htlc>> {
        let key = htlc_key(channel_id, htlc_id);
        match self.db.get(&key) {
            Ok(Some(bytes)) => {
                let htlc: Htlc = serde_json::from_slice(&bytes)
                    .map_err(|e| LightningError::Serialization(e.to_string()))?;
                Ok(Some(htlc))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(LightningError::Serialization(e.to_string())),
        }
    }

    /// Remove an HTLC record.
    pub fn remove_htlc(&self, channel_id: &[u8; 32], htlc_id: u64) -> Result<()> {
        let key = htlc_key(channel_id, htlc_id);
        self.db
            .delete(&key)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }

    /// Save multiple HTLCs for a channel using batch writes.
    pub fn save_htlcs_batch(&self, channel_id: &[u8; 32], htlcs: &[Htlc]) -> Result<()> {
        let ops: std::result::Result<Vec<_>, _> = htlcs
            .iter()
            .map(|htlc| {
                let key = htlc_key(channel_id, htlc.id);
                let value = serde_json::to_vec(htlc)
                    .map_err(|e| LightningError::Serialization(e.to_string()))?;
                Ok(storage::WriteOp::Put { key, value })
            })
            .collect();
        self.db
            .write_batch(ops?)
            .map_err(|e| LightningError::Serialization(e.to_string()))
    }
}

fn channel_key(id: &[u8; 32]) -> Vec<u8> {
    let mut key = Vec::with_capacity(CHANNEL_PREFIX.len() + 32);
    key.extend_from_slice(CHANNEL_PREFIX);
    key.extend_from_slice(id);
    key
}

fn htlc_key(channel_id: &[u8; 32], htlc_id: u64) -> Vec<u8> {
    let mut key = Vec::with_capacity(HTLC_PREFIX.len() + 32 + 8);
    key.extend_from_slice(HTLC_PREFIX);
    key.extend_from_slice(channel_id);
    key.extend_from_slice(&htlc_id.to_be_bytes());
    key
}

#[cfg(test)]
mod tests {
    use super::*;
    use storage::MemoryStorage;

    fn sample_channel(id_byte: u8) -> Channel {
        Channel::new(
            [id_byte; 32],
            [0xAA; 32],
            0,
            500_000,
            300_000,
            "local".into(),
            "remote".into(),
        )
    }

    #[test]
    fn save_and_load_roundtrip() {
        let store = ChannelStore::new(MemoryStorage::new());
        let ch = sample_channel(1);

        store.save(&ch).unwrap();
        let loaded = store.load(&ch.channel_id).unwrap().unwrap();
        assert_eq!(loaded.channel_id, ch.channel_id);
        assert_eq!(loaded.capacity, 500_000);
        assert_eq!(loaded.local_balance, 300_000);
        assert_eq!(loaded.remote_balance, 200_000);
    }

    #[test]
    fn load_nonexistent_returns_none() {
        let store = ChannelStore::new(MemoryStorage::new());
        assert!(store.load(&[0xFF; 32]).unwrap().is_none());
    }

    #[test]
    fn remove_deletes_channel() {
        let store = ChannelStore::new(MemoryStorage::new());
        let ch = sample_channel(2);
        store.save(&ch).unwrap();
        assert!(store.exists(&ch.channel_id).unwrap());
        store.remove(&ch.channel_id).unwrap();
        assert!(!store.exists(&ch.channel_id).unwrap());
    }

    #[test]
    fn overwrite_updates_state() {
        let store = ChannelStore::new(MemoryStorage::new());
        let mut ch = sample_channel(3);
        store.save(&ch).unwrap();

        ch.local_balance = 100_000;
        ch.remote_balance = 400_000;
        store.save(&ch).unwrap();

        let loaded = store.load(&ch.channel_id).unwrap().unwrap();
        assert_eq!(loaded.local_balance, 100_000);
        assert_eq!(loaded.remote_balance, 400_000);
    }

    #[test]
    fn exists_returns_false_for_missing() {
        let store = ChannelStore::new(MemoryStorage::new());
        assert!(!store.exists(&[0xBB; 32]).unwrap());
    }

    #[test]
    fn save_and_load_htlc_roundtrip() {
        use crate::htlc::{Htlc, HtlcDirection, HtlcState};
        let store = ChannelStore::new(MemoryStorage::new());
        let channel_id = [1u8; 32];
        let htlc = Htlc::new_outgoing(42, [0xAB; 32], 50_000, 144);

        store.save_htlc(&channel_id, &htlc).unwrap();
        let loaded = store.load_htlc(&channel_id, 42).unwrap().unwrap();
        assert_eq!(loaded.id, 42);
        assert_eq!(loaded.amount, 50_000);
        assert_eq!(loaded.expiry, 144);
        assert_eq!(loaded.direction, HtlcDirection::Outgoing);
        assert_eq!(loaded.state, HtlcState::Pending);
    }

    #[test]
    fn load_htlc_nonexistent_returns_none() {
        let store = ChannelStore::new(MemoryStorage::new());
        assert!(store.load_htlc(&[1u8; 32], 999).unwrap().is_none());
    }

    #[test]
    fn remove_htlc_deletes_record() {
        let store = ChannelStore::new(MemoryStorage::new());
        let channel_id = [1u8; 32];
        let htlc = Htlc::new_incoming(7, [0xCD; 32], 25_000, 288);
        store.save_htlc(&channel_id, &htlc).unwrap();
        assert!(store.load_htlc(&channel_id, 7).unwrap().is_some());
        store.remove_htlc(&channel_id, 7).unwrap();
        assert!(store.load_htlc(&channel_id, 7).unwrap().is_none());
    }

    #[test]
    fn save_htlcs_batch_writes_all() {
        let store = ChannelStore::new(MemoryStorage::new());
        let channel_id = [2u8; 32];
        let htlcs: Vec<Htlc> = (0..5)
            .map(|i| Htlc::new_outgoing(i, [i as u8; 32], 10_000 * (i + 1), 144))
            .collect();

        store.save_htlcs_batch(&channel_id, &htlcs).unwrap();

        for i in 0..5 {
            let loaded = store.load_htlc(&channel_id, i).unwrap().unwrap();
            assert_eq!(loaded.amount, 10_000 * (i + 1));
        }
    }
}
