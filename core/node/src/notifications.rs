//! ZMQ-style pub/sub notification system.
//!
//! Provides Bitcoin Core–compatible notification topics using in-process
//! `tokio::sync::broadcast` channels.  Subscribers receive real-time events
//! for new blocks and transactions without polling.
//!
//! ## Topics
//! | Topic          | Payload          |
//! |----------------|------------------|
//! | `hashblock`    | 32-byte block hash (hex) |
//! | `hashtx`       | 32-byte txid (hex)       |
//! | `rawblock`     | Full serialised block    |
//! | `rawtx`        | Full serialised tx       |
//! | `sequence`     | Block-connected / tx-added sequence events |

use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};

// ── Topic types ──────────────────────────────────────────────────

/// Notification topic identifiers (Bitcoin Core ZMQ–compatible names).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Topic {
    HashBlock,
    HashTx,
    RawBlock,
    RawTx,
    Sequence,
}

impl Topic {
    pub fn as_str(&self) -> &'static str {
        match self {
            Topic::HashBlock => "hashblock",
            Topic::HashTx => "hashtx",
            Topic::RawBlock => "rawblock",
            Topic::RawTx => "rawtx",
            Topic::Sequence => "sequence",
        }
    }
}

// ── Notification payload ─────────────────────────────────────────

/// A single pub/sub notification.
#[derive(Debug, Clone)]
pub struct Notification {
    pub topic: Topic,
    pub payload: Vec<u8>,
    /// Monotonically-increasing sequence number per topic.
    pub sequence: u64,
}

// ── NotificationPublisher ────────────────────────────────────────

/// Capacity of each broadcast channel.
const CHANNEL_CAPACITY: usize = 256;
/// Maximum number of connected TCP notification clients.
const MAX_TCP_CLIENTS: usize = 1_024;

/// The publisher side — call `notify_*` methods when new blocks/txs arrive.
pub struct NotificationPublisher {
    hashblock_tx: broadcast::Sender<Notification>,
    hashtx_tx: broadcast::Sender<Notification>,
    rawblock_tx: broadcast::Sender<Notification>,
    rawtx_tx: broadcast::Sender<Notification>,
    sequence_tx: broadcast::Sender<Notification>,
    /// Per-topic sequence counters.
    seq_block: std::sync::atomic::AtomicU64,
    seq_tx: std::sync::atomic::AtomicU64,
    seq_rawblock: std::sync::atomic::AtomicU64,
    seq_rawtx: std::sync::atomic::AtomicU64,
    seq_sequence: std::sync::atomic::AtomicU64,
}

impl NotificationPublisher {
    /// Create a new publisher and return it wrapped in `Arc`.
    pub fn new() -> Arc<Self> {
        let (hashblock_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (hashtx_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (rawblock_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (rawtx_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (sequence_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        Arc::new(Self {
            hashblock_tx,
            hashtx_tx,
            rawblock_tx,
            rawtx_tx,
            sequence_tx,
            seq_block: 0.into(),
            seq_tx: 0.into(),
            seq_rawblock: 0.into(),
            seq_rawtx: 0.into(),
            seq_sequence: 0.into(),
        })
    }

    // ── Subscribe ────────────────────────────────────────────

    /// Subscribe to a topic.  Returns a `broadcast::Receiver`.
    pub fn subscribe(&self, topic: Topic) -> broadcast::Receiver<Notification> {
        match topic {
            Topic::HashBlock => self.hashblock_tx.subscribe(),
            Topic::HashTx => self.hashtx_tx.subscribe(),
            Topic::RawBlock => self.rawblock_tx.subscribe(),
            Topic::RawTx => self.rawtx_tx.subscribe(),
            Topic::Sequence => self.sequence_tx.subscribe(),
        }
    }

    // ── Publish helpers ──────────────────────────────────────

    /// Notify subscribers of a new block hash (hex-encoded 32-byte hash).
    pub fn notify_block(&self, block_hash: &[u8; 32]) {
        let seq = self.seq_block.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let note = Notification {
            topic: Topic::HashBlock,
            payload: hex::encode(block_hash).into_bytes(),
            sequence: seq,
        };
        if self.hashblock_tx.send(note).is_err() {
            debug!("zmq: no hashblock subscribers");
        }
    }

    /// Notify subscribers of a new transaction id (hex-encoded 32-byte txid).
    pub fn notify_tx(&self, txid: &[u8; 32]) {
        let seq = self.seq_tx.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let note = Notification {
            topic: Topic::HashTx,
            payload: hex::encode(txid).into_bytes(),
            sequence: seq,
        };
        if self.hashtx_tx.send(note).is_err() {
            debug!("zmq: no hashtx subscribers");
        }
    }

    /// Notify subscribers of a raw serialised block.
    pub fn notify_raw_block(&self, raw: Vec<u8>) {
        let seq = self.seq_rawblock.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let note = Notification {
            topic: Topic::RawBlock,
            payload: raw,
            sequence: seq,
        };
        if self.rawblock_tx.send(note).is_err() {
            debug!("zmq: no rawblock subscribers");
        }
    }

    /// Notify subscribers of a raw serialised transaction.
    pub fn notify_raw_tx(&self, raw: Vec<u8>) {
        let seq = self.seq_rawtx.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let note = Notification {
            topic: Topic::RawTx,
            payload: raw,
            sequence: seq,
        };
        if self.rawtx_tx.send(note).is_err() {
            debug!("zmq: no rawtx subscribers");
        }
    }

    /// Notify subscribers of a sequence event (block connected / tx added).
    pub fn notify_sequence(&self, label: &str, hash: &[u8; 32]) {
        let seq = self.seq_sequence.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let mut payload = label.as_bytes().to_vec();
        payload.push(b':');
        payload.extend_from_slice(&hex::encode(hash).into_bytes());
        let note = Notification {
            topic: Topic::Sequence,
            payload,
            sequence: seq,
        };
        if self.sequence_tx.send(note).is_err() {
            debug!("zmq: no sequence subscribers");
        }
    }

    /// Return the number of active subscribers for a given topic.
    pub fn subscriber_count(&self, topic: Topic) -> usize {
        match topic {
            Topic::HashBlock => self.hashblock_tx.receiver_count(),
            Topic::HashTx => self.hashtx_tx.receiver_count(),
            Topic::RawBlock => self.rawblock_tx.receiver_count(),
            Topic::RawTx => self.rawtx_tx.receiver_count(),
            Topic::Sequence => self.sequence_tx.receiver_count(),
        }
    }
}

// ── ZMQ TCP publisher ────────────────────────────────────────────

use std::net::SocketAddr;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

/// A lightweight TCP-based ZMQ-compatible publisher.
///
/// Listens on a TCP port and streams notifications to all connected
/// clients.  Each message is sent as:
///   `<topic> <hex_payload> <sequence>\n`
///
/// This mirrors the Bitcoin Core `-zmqpub*` interface closely enough
/// for tooling that parses ZMQ output (e.g. block explorers).
pub struct ZmqPublisher;

impl ZmqPublisher {
    /// Start a ZMQ-like TCP publisher that bridges from `NotificationPublisher`
    /// broadcast channels to connected TCP clients.
    ///
    /// Spawns a tokio task that runs until the process exits.
    pub async fn start(
        addr: SocketAddr,
        publisher: Arc<NotificationPublisher>,
    ) -> std::io::Result<()> {
        let listener = TcpListener::bind(addr).await?;
        tracing::info!("ZMQ TCP publisher listening on {}", addr);

        // Shared list of connected client senders
        let clients: Arc<tokio::sync::RwLock<Vec<tokio::sync::mpsc::Sender<Vec<u8>>>>> =
            Arc::new(tokio::sync::RwLock::new(Vec::new()));

        // Accept loop
        let clients_accept = clients.clone();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((mut stream, peer)) => {
                        debug!("zmq: client connected from {}", peer);
                        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);
                        let mut writers = clients_accept.write().await;
                        writers.retain(|sender| !sender.is_closed());
                        if writers.len() >= MAX_TCP_CLIENTS {
                            warn!("zmq: rejecting client {} because the client limit ({MAX_TCP_CLIENTS}) was reached", peer);
                            continue;
                        }
                        writers.push(tx);
                        // Per-client write loop
                        tokio::spawn(async move {
                            while let Some(msg) = rx.recv().await {
                                if stream.write_all(&msg).await.is_err() {
                                    break;
                                }
                            }
                            debug!("zmq: client {} disconnected", peer);
                        });
                    }
                    Err(e) => {
                        warn!("zmq: accept error: {}", e);
                    }
                }
            }
        });

        // Subscribe to all topics and broadcast to clients
        let topics = [
            Topic::HashBlock,
            Topic::HashTx,
            Topic::RawBlock,
            Topic::RawTx,
            Topic::Sequence,
        ];
        for topic in topics {
            let mut rx = publisher.subscribe(topic);
            let clients = clients.clone();
            tokio::spawn(async move {
                loop {
                    match rx.recv().await {
                        Ok(note) => {
                            let line = format!(
                                "{} {} {}\n",
                                note.topic.as_str(),
                                String::from_utf8_lossy(&note.payload),
                                note.sequence,
                            );
                            let bytes = line.into_bytes();
                            let mut writers = clients.write().await;
                            writers.retain(|sender| !sender.is_closed());
                            for sender in writers.iter() {
                                let _ = sender.try_send(bytes.clone());
                            }
                            writers.retain(|sender| !sender.is_closed());
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            warn!("zmq: {} subscriber lagged by {} messages", topic.as_str(), n);
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn basic_pub_sub() {
        let pub_sub = NotificationPublisher::new();
        let mut rx = pub_sub.subscribe(Topic::HashBlock);

        let hash = [0xABu8; 32];
        pub_sub.notify_block(&hash);

        let note = rx.recv().await.unwrap();
        assert_eq!(note.topic, Topic::HashBlock);
        assert_eq!(note.sequence, 0);
        assert_eq!(note.payload, hex::encode(hash).into_bytes());
    }

    #[tokio::test]
    async fn sequence_counter_increments() {
        let pub_sub = NotificationPublisher::new();
        let mut rx = pub_sub.subscribe(Topic::HashTx);

        pub_sub.notify_tx(&[1u8; 32]);
        pub_sub.notify_tx(&[2u8; 32]);

        let n0 = rx.recv().await.unwrap();
        let n1 = rx.recv().await.unwrap();
        assert_eq!(n0.sequence, 0);
        assert_eq!(n1.sequence, 1);
    }

    #[test]
    fn no_subscribers_is_ok() {
        let pub_sub = NotificationPublisher::new();
        // Should not panic even with no subscribers
        pub_sub.notify_block(&[0u8; 32]);
        pub_sub.notify_tx(&[0u8; 32]);
        pub_sub.notify_raw_block(vec![0u8; 80]);
        pub_sub.notify_raw_tx(vec![0u8; 20]);
        pub_sub.notify_sequence("C", &[0u8; 32]);
    }
}
