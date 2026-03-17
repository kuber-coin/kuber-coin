//! Static Channel Backup (SCB) — export/import channel recovery data.
//!
//! Allows users to back up the minimal information needed to trigger
//! force-close and recover funds if the node database is lost.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::channel::Channel;
use crate::{LightningError, Result};

/// Version of the SCB format
const SCB_VERSION: u8 = 1;
/// Magic bytes identifying a KuberCoin SCB file
const SCB_MAGIC: &[u8; 4] = b"KSCB";

/// Minimal channel info for backup/recovery
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelBackupEntry {
    /// Channel ID
    pub channel_id: [u8; 32],
    /// Funding txid
    pub funding_txid: [u8; 32],
    /// Funding output index
    pub funding_vout: u32,
    /// Channel capacity
    pub capacity: u64,
    /// Remote node pubkey (hex)
    pub remote_pubkey: String,
    /// Local node pubkey (hex)
    pub local_pubkey: String,
}

impl ChannelBackupEntry {
    /// Create a backup entry from a live channel.
    pub fn from_channel(channel: &Channel) -> Self {
        Self {
            channel_id: channel.channel_id,
            funding_txid: channel.funding_txid,
            funding_vout: channel.funding_vout,
            capacity: channel.capacity,
            remote_pubkey: channel.remote_pubkey.clone(),
            local_pubkey: channel.local_pubkey.clone(),
        }
    }
}

/// A complete static channel backup containing all channels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticChannelBackup {
    /// SCB format version
    pub version: u8,
    /// Timestamp (unix seconds)
    pub timestamp: u64,
    /// Node identity pubkey (hex)
    pub node_pubkey: String,
    /// Backed-up channel entries
    pub channels: Vec<ChannelBackupEntry>,
}

impl StaticChannelBackup {
    /// Create a new SCB from a list of channels.
    pub fn new(node_pubkey: String, channels: &[Channel]) -> Self {
        let entries: Vec<ChannelBackupEntry> = channels
            .iter()
            .map(ChannelBackupEntry::from_channel)
            .collect();

        Self {
            version: SCB_VERSION,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            node_pubkey,
            channels: entries,
        }
    }

    /// Serialize the SCB to bytes (magic + version + JSON + SHA256 checksum).
    pub fn export(&self) -> Result<Vec<u8>> {
        let json = serde_json::to_vec(self)
            .map_err(|e| LightningError::Serialization(e.to_string()))?;

        let mut out = Vec::with_capacity(4 + 1 + json.len() + 32);
        out.extend_from_slice(SCB_MAGIC);
        out.push(SCB_VERSION);
        out.extend_from_slice(&json);

        // Append SHA-256 checksum
        let checksum: [u8; 32] = Sha256::digest(&out).into();
        out.extend_from_slice(&checksum);

        Ok(out)
    }

    /// Deserialize an SCB from bytes, verifying magic and checksum.
    pub fn import(data: &[u8]) -> Result<Self> {
        // Minimum size: magic(4) + version(1) + at least 2 bytes JSON + checksum(32)
        if data.len() < 39 {
            return Err(LightningError::Serialization("SCB data too short".into()));
        }

        if &data[..4] != SCB_MAGIC {
            return Err(LightningError::Serialization("invalid SCB magic".into()));
        }

        let version = data[4];
        if version != SCB_VERSION {
            return Err(LightningError::Serialization(
                format!("unsupported SCB version: {version}"),
            ));
        }

        // Verify checksum
        let payload_end = data.len() - 32;
        let stored_checksum = &data[payload_end..];
        let computed: [u8; 32] = Sha256::digest(&data[..payload_end]).into();
        if computed.as_slice() != stored_checksum {
            return Err(LightningError::Serialization("SCB checksum mismatch".into()));
        }

        // Parse JSON body (after magic + version)
        let json_data = &data[5..payload_end];
        let scb: Self = serde_json::from_slice(json_data)
            .map_err(|e| LightningError::Serialization(e.to_string()))?;

        Ok(scb)
    }

    /// Number of channels in the backup.
    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel::Channel;

    fn make_channel(id: u8) -> Channel {
        Channel::new(
            [id; 32],
            [0xAA; 32],
            0,
            1_000_000,
            600_000,
            "local_pub".into(),
            "remote_pub".into(),
        )
    }

    #[test]
    fn test_export_import_roundtrip() {
        let channels = vec![make_channel(1), make_channel(2)];
        let scb = StaticChannelBackup::new("node_pubkey".into(), &channels);

        let exported = scb.export().unwrap();
        let imported = StaticChannelBackup::import(&exported).unwrap();

        assert_eq!(imported.version, SCB_VERSION);
        assert_eq!(imported.node_pubkey, "node_pubkey");
        assert_eq!(imported.channels.len(), 2);
        assert_eq!(imported.channels[0].channel_id, [1u8; 32]);
        assert_eq!(imported.channels[1].channel_id, [2u8; 32]);
        assert_eq!(imported.channels[0].capacity, 1_000_000);
    }

    #[test]
    fn test_empty_backup() {
        let scb = StaticChannelBackup::new("node".into(), &[]);
        let exported = scb.export().unwrap();
        let imported = StaticChannelBackup::import(&exported).unwrap();
        assert_eq!(imported.channel_count(), 0);
    }

    #[test]
    fn test_bad_magic_rejected() {
        let mut data = vec![0u8; 50];
        data[..4].copy_from_slice(b"XXXX");
        let result = StaticChannelBackup::import(&data);
        assert!(result.is_err());
    }

    #[test]
    fn test_bad_checksum_rejected() {
        let channels = vec![make_channel(1)];
        let scb = StaticChannelBackup::new("node".into(), &channels);
        let mut exported = scb.export().unwrap();
        // Corrupt the checksum
        let len = exported.len();
        exported[len - 1] ^= 0xFF;
        let result = StaticChannelBackup::import(&exported);
        assert!(result.is_err());
    }

    #[test]
    fn test_data_too_short_rejected() {
        let result = StaticChannelBackup::import(&[0u8; 10]);
        assert!(result.is_err());
    }

    #[test]
    fn test_backup_entry_from_channel() {
        let ch = make_channel(5);
        let entry = ChannelBackupEntry::from_channel(&ch);
        assert_eq!(entry.channel_id, ch.channel_id);
        assert_eq!(entry.funding_txid, ch.funding_txid);
        assert_eq!(entry.capacity, ch.capacity);
        assert_eq!(entry.remote_pubkey, "remote_pub");
    }
}
