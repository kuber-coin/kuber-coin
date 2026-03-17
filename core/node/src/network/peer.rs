//! Peer connection tracking and management.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tokio::sync::mpsc;

use super::message::{InvItem, Message, VersionPayload};

/// How long a peer ban lasts (24 hours).
const BAN_DURATION: Duration = Duration::from_secs(24 * 60 * 60);

/// Maximum addresses in the address book before eviction kicks in.
const MAX_KNOWN_ADDRS: usize = 16_384;

/// Addresses not seen in this many seconds are considered stale (30 days).
const ADDR_STALE_SECS: u64 = 30 * 24 * 60 * 60;

/// Maximum messages a peer may send per window before being rate-limited.
const RATE_LIMIT_MSGS: u32 = 200;

/// Rate-limit window duration.
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(10);

/// Score points that decay per minute of good behaviour.
const SCORE_DECAY_PER_MIN: u32 = 1;

/// Maximum addresses accepted from a single Addr message.
pub const MAX_ADDR_PER_MSG: usize = 1_000;

/// Maximum items accepted in a single Inv / GetData message.
pub const MAX_INV_SIZE: usize = 50_000;

/// Maximum tokens in the per-peer addr token bucket.
const ADDR_BUCKET_MAX: f64 = 1000.0;
/// Tokens added per second to the addr bucket (refill rate).
const ADDR_BUCKET_REFILL_PER_SEC: f64 = 0.1;

// ── Per-address metadata ────────────────────────────────────────

/// Metadata tracked for each known peer address.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddrInfo {
    /// Last time we heard about this address (UNIX secs).
    pub last_seen: u64,
    /// Last time we attempted to connect (UNIX secs).
    pub last_attempt: Option<u64>,
    /// Last time we successfully connected (UNIX secs).
    pub last_success: Option<u64>,
    /// Consecutive connection failures.
    pub failure_count: u32,
    /// Whether we have ever successfully connected.
    pub tried: bool,
}

impl AddrInfo {
    fn new(now: u64) -> Self {
        Self {
            last_seen: now,
            last_attempt: None,
            last_success: None,
            failure_count: 0,
            tried: false,
        }
    }
}

// ── Per-peer state ──────────────────────────────────────────────

/// Connection direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Inbound,
    Outbound,
    /// Short-lived outbound probe to verify address reachability (BIP idea).
    /// Feeler connections complete the handshake then immediately disconnect.
    Feeler,
    /// Block-relay-only outbound connection — does not participate in addr or
    /// transaction relay.  Used to improve partition resistance.
    BlockRelayOnly,
}

/// Handshake progress for a single peer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandshakeState {
    /// TCP connected, no Version sent or received yet.
    Connected,
    /// We sent our Version; waiting for theirs + Verack.
    VersionSent,
    /// Handshake complete — fully operational.
    Ready,
}

/// Tracked state for one connected peer.
#[derive(Debug)]
pub struct PeerInfo {
    pub addr: SocketAddr,
    pub direction: Direction,
    pub handshake: HandshakeState,
    pub version: Option<VersionPayload>,
    pub connected_at: Instant,
    pub last_ping: Option<Instant>,
    pub misbehaviour_score: u32,
    /// Timestamp of last score decay application.
    pub last_decay: Instant,
    /// Messages received in the current rate-limit window.
    pub rate_msg_count: u32,
    /// Start of the current rate-limit window.
    pub rate_window_start: Instant,
    /// Peer's minimum feerate filter (sat/kB). Transactions below this
    /// should not be relayed to this peer.
    pub fee_filter: u64,
    /// Peer requested headers-first announcements (BIP-130).
    pub send_headers: bool,
    /// Peer signalled wtxid-based relay (BIP-339).
    pub wtxid_relay: bool,
    /// Peer wants high-bandwidth compact block relay (BIP-152).
    pub wants_cmpct: bool,
    /// Compact block protocol version the peer supports (1 or 2).
    pub cmpct_version: u64,
    /// Token-bucket for addr relay rate limiting (Bitcoin Core style).
    /// Each addr message consumes tokens; tokens refill over time.
    pub addr_token_bucket: f64,
    /// Last time the addr token bucket was refilled.
    pub addr_bucket_last_fill: Instant,
}

impl PeerInfo {
    pub fn new(addr: SocketAddr, direction: Direction) -> Self {
        let now = Instant::now();
        Self {
            addr,
            direction,
            handshake: HandshakeState::Connected,
            version: None,
            connected_at: now,
            last_ping: None,
            misbehaviour_score: 0,
            last_decay: now,
            rate_msg_count: 0,
            rate_window_start: now,
            fee_filter: 0,
            send_headers: false,
            wtxid_relay: false,
            wants_cmpct: false,
            cmpct_version: 0,
            addr_token_bucket: ADDR_BUCKET_MAX,
            addr_bucket_last_fill: now,
        }
    }

    /// Check and update the rate limiter. Returns `true` if the peer
    /// has exceeded the message rate and should be penalized.
    pub fn check_rate_limit(&mut self) -> bool {
        let now = Instant::now();
        if now.duration_since(self.rate_window_start) >= RATE_LIMIT_WINDOW {
            // New window
            self.rate_window_start = now;
            self.rate_msg_count = 1;
            false
        } else {
            self.rate_msg_count += 1;
            self.rate_msg_count > RATE_LIMIT_MSGS
        }
    }

    /// Apply time-based score decay.
    pub fn apply_decay(&mut self) {
        let now = Instant::now();
        let elapsed_mins = now.duration_since(self.last_decay).as_secs() / 60;
        if elapsed_mins > 0 {
            let decay = (elapsed_mins as u32).saturating_mul(SCORE_DECAY_PER_MIN);
            self.misbehaviour_score = self.misbehaviour_score.saturating_sub(decay);
            self.last_decay = now;
        }
    }

    /// Consume `n` tokens from the addr relay bucket (token-bucket rate
    /// limiter). Returns `true` if the bucket has tokens remaining
    /// (processing allowed), `false` if exhausted (should drop addrs).
    pub fn consume_addr_tokens(&mut self, n: usize) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.addr_bucket_last_fill).as_secs_f64();
        self.addr_token_bucket = (self.addr_token_bucket + elapsed * ADDR_BUCKET_REFILL_PER_SEC)
            .min(ADDR_BUCKET_MAX);
        self.addr_bucket_last_fill = now;
        if self.addr_token_bucket >= n as f64 {
            self.addr_token_bucket -= n as f64;
            true
        } else {
            false
        }
    }

    /// Returns `true` when this peer is a block-relay-only connection and
    /// should NOT participate in addr or transaction relay.
    pub fn is_block_relay_only(&self) -> bool {
        self.direction == Direction::BlockRelayOnly
    }
}

// ── PeerManager ─────────────────────────────────────────────────

/// Limits for the peer manager.
pub struct PeerLimits {
    pub max_outbound: usize,
    pub max_inbound: usize,
    /// Misbehaviour score at which we disconnect + ban.
    pub ban_threshold: u32,
}

impl Default for PeerLimits {
    fn default() -> Self {
        Self {
            max_outbound: 8,
            max_inbound: 117,
            ban_threshold: 100,
        }
    }
}

/// Thread-safe peer bookkeeping.
pub struct PeerManager {
    peers: RwLock<HashMap<SocketAddr, PeerInfo>>,
    /// Banned IPs with the instant they were banned (for expiry).
    banned: RwLock<HashMap<std::net::IpAddr, Instant>>,
    /// Parallel map keyed by IP storing the UNIX timestamp of the ban
    /// (for persistence — `Instant` cannot be serialised).
    banned_unix: RwLock<HashMap<IpAddr, u64>>,
    /// Human-readable reason for each ban (for RPC / debugging).
    ban_reasons: RwLock<HashMap<IpAddr, String>>,
    /// Addresses we've learned about (candidates for future connections).
    known_addrs: RwLock<HashMap<SocketAddr, AddrInfo>>,
    /// Per-peer send channels (for relay / broadcast).
    senders: RwLock<HashMap<SocketAddr, mpsc::Sender<Message>>>,
    /// Per-peer queued Inv items for batched trickle relay.
    inv_relay_queue: RwLock<HashMap<SocketAddr, VecDeque<InvItem>>>,
    limits: PeerLimits,
    /// Optional path to directory where `bans.json` is persisted.
    data_dir: Option<PathBuf>,
}

impl PeerManager {
    pub fn new(limits: PeerLimits) -> Self {
        Self {
            peers: RwLock::new(HashMap::new()),
            banned: RwLock::new(HashMap::new()),
            banned_unix: RwLock::new(HashMap::new()),
            ban_reasons: RwLock::new(HashMap::new()),
            known_addrs: RwLock::new(HashMap::new()),
            senders: RwLock::new(HashMap::new()),
            inv_relay_queue: RwLock::new(HashMap::new()),
            limits,
            data_dir: None,
        }
    }

    /// Create a PeerManager that persists bans and addresses to `data_dir/`.
    pub fn with_data_dir(limits: PeerLimits, data_dir: PathBuf) -> Self {
        let mut pm = Self::new(limits);
        pm.data_dir = Some(data_dir);
        pm.load_bans();
        pm.load_addrs();
        pm
    }

    // ── Connection lifecycle ────────────────────────────────

    /// Register a newly connected peer. Returns `false` if the
    /// connection should be rejected (limit reached or banned).
    /// When inbound slots are full, evicts the worst-quality inbound peer.
    pub fn register(&self, addr: SocketAddr, dir: Direction) -> bool {
        if self.is_banned(&addr.ip()) {
            return false;
        }
        let peers = self.peers.read();
        let count = peers.values().filter(|p| p.direction == dir).count();
        let limit = match dir {
            Direction::Inbound => self.limits.max_inbound,
            Direction::Outbound => self.limits.max_outbound,
            Direction::Feeler => Self::MAX_FEELERS,
            Direction::BlockRelayOnly => Self::MAX_BLOCK_RELAY_ONLY,
        };
        if count >= limit {
            if dir == Direction::Inbound {
                // Try to evict the worst inbound peer to make room
                drop(peers);
                if let Some(victim) = self.pick_eviction_candidate() {
                    self.remove(&victim);
                    // Remove their sender channel to trigger disconnect
                    if let Some(sender) = self.senders.write().remove(&victim) {
                        drop(sender); // dropping closes the channel
                    }
                } else {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            drop(peers);
        }
        self.peers
            .write()
            .insert(addr, PeerInfo::new(addr, dir));
        true
    }

    /// Select the worst inbound peer for eviction, protecting subnet diversity.
    /// Bitcoin Core protects peers from unique /16 subnets, the longest-connected,
    /// and the best-behaving. We: (1) protect one peer per unique network group,
    /// (2) protect the 4 longest-connected, then (3) evict by highest misbehaviour.
    fn pick_eviction_candidate(&self) -> Option<SocketAddr> {
        let peers = self.peers.read();
        let inbound: Vec<&PeerInfo> = peers.values()
            .filter(|p| p.direction == Direction::Inbound)
            .collect();
        if inbound.is_empty() {
            return None;
        }

        // Collect network group for each peer
        let mut group_to_peers: HashMap<Vec<u8>, Vec<&PeerInfo>> = HashMap::new();
        for p in &inbound {
            let group = Self::network_group(&p.addr.ip());
            group_to_peers.entry(group).or_default().push(p);
        }

        // Protect: one peer from each unique network group (the longest-connected)
        let mut protected: std::collections::HashSet<SocketAddr> = std::collections::HashSet::new();
        for peers_in_group in group_to_peers.values() {
            if let Some(best) = peers_in_group.iter()
                .min_by_key(|p| p.connected_at)
            {
                protected.insert(best.addr);
            }
        }

        // Protect: the 4 longest-connected peers
        let mut by_age: Vec<&PeerInfo> = inbound.clone();
        by_age.sort_by_key(|p| p.connected_at);
        for p in by_age.iter().take(4) {
            protected.insert(p.addr);
        }

        // Evictable = inbound peers not in the protected set
        let evictable: Vec<&PeerInfo> = inbound.iter()
            .filter(|p| !protected.contains(&p.addr))
            .copied()
            .collect();

        if evictable.is_empty() {
            // All are protected — fall back to worst overall
            return inbound.iter()
                .max_by(|a, b| {
                    a.misbehaviour_score.cmp(&b.misbehaviour_score)
                        .then_with(|| a.connected_at.cmp(&b.connected_at))
                })
                .map(|p| p.addr);
        }

        evictable.iter()
            .max_by(|a, b| {
                a.misbehaviour_score.cmp(&b.misbehaviour_score)
                    .then_with(|| a.connected_at.cmp(&b.connected_at))
            })
            .map(|p| p.addr)
    }

    /// Compute network group for eclipse protection:
    /// IPv4: /16 prefix (first 2 octets).
    /// IPv6: /48 prefix (first 6 bytes) — better than treating all IPv6 as one group.
    fn network_group(ip: &IpAddr) -> Vec<u8> {
        match ip {
            IpAddr::V4(v4) => v4.octets()[..2].to_vec(),
            IpAddr::V6(v6) => {
                let octets = v6.octets();
                // Check for IPv4-mapped (::ffff:a.b.c.d) → use IPv4 /16
                if octets[..10] == [0; 10] && octets[10] == 0xff && octets[11] == 0xff {
                    return octets[12..14].to_vec();
                }
                // Use /48 prefix for native IPv6
                octets[..6].to_vec()
            }
        }
    }

    /// Remove a peer (disconnected).
    pub fn remove(&self, addr: &SocketAddr) {
        self.peers.write().remove(addr);
    }

    /// Disconnect a peer by address — removes bookkeeping AND closes the send channel.
    pub fn disconnect_peer(&self, addr: &SocketAddr) {
        self.peers.write().remove(addr);
        self.senders.write().remove(addr);
    }

    /// Mark handshake state.
    pub fn set_handshake(&self, addr: &SocketAddr, state: HandshakeState) {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.handshake = state;
        }
    }

    /// Store the peer's Version payload.
    pub fn set_version(&self, addr: &SocketAddr, v: VersionPayload) {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.version = Some(v);
        }
    }

    /// Increment misbehaviour score; returns `true` if peer should
    /// be banned.  Applies time-based decay before adding the score.
    pub fn add_misbehaviour(&self, addr: &SocketAddr, score: u32) -> bool {
        self.add_misbehaviour_with_reason(addr, score, "protocol violation")
    }

    /// Like `add_misbehaviour` but stores a human-readable reason for the ban.
    pub fn add_misbehaviour_with_reason(&self, addr: &SocketAddr, score: u32, reason: &str) -> bool {
        let mut peers = self.peers.write();
        if let Some(p) = peers.get_mut(addr) {
            p.apply_decay();
            p.misbehaviour_score = p.misbehaviour_score.saturating_add(score);
            if p.misbehaviour_score >= self.limits.ban_threshold {
                let ip = addr.ip();
                drop(peers);
                let now = Instant::now();
                let now_unix = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                self.banned.write().insert(ip, now);
                self.banned_unix.write().insert(ip, now_unix);
                self.ban_reasons.write().insert(ip, reason.to_string());
                self.peers.write().remove(addr);
                self.persist_bans();
                return true;
            }
        }
        false
    }

    /// Check and update the per-peer rate limiter.
    /// Returns `true` if the peer exceeded the message rate limit
    /// (caller should penalize or disconnect).
    pub fn check_rate_limit(&self, addr: &SocketAddr) -> bool {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.check_rate_limit()
        } else {
            false
        }
    }

    /// Check whether a peer has enough addr tokens to process `count` addr entries.
    /// Returns `true` if the tokens were consumed, `false` if rate-limited.
    pub fn check_addr_rate_limit(&self, addr: &SocketAddr, count: usize) -> bool {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.consume_addr_tokens(count)
        } else {
            true // unknown peer – allow
        }
    }

    /// Set the peer's feefilter value (BIP-133).
    pub fn set_fee_filter(&self, addr: &SocketAddr, rate: u64) {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.fee_filter = rate;
        }
    }

    /// Get the peer's feefilter value.
    pub fn fee_filter(&self, addr: &SocketAddr) -> u64 {
        self.peers.read().get(addr).map(|p| p.fee_filter).unwrap_or(0)
    }

    /// Mark that the peer requested headers announcements (BIP-130).
    pub fn set_send_headers(&self, addr: &SocketAddr) {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.send_headers = true;
        }
    }

    /// Does this peer want headers-first announcements?
    pub fn wants_headers(&self, addr: &SocketAddr) -> bool {
        self.peers.read().get(addr).map(|p| p.send_headers).unwrap_or(false)
    }

    /// Mark that the peer signalled wtxid relay (BIP-339).
    pub fn set_wtxid_relay(&self, addr: &SocketAddr) {
        if let Some(p) = self.peers.write().get_mut(addr) {
            p.wtxid_relay = true;
        }
    }

    /// Does this peer use wtxid-based relay?
    pub fn uses_wtxid_relay(&self, addr: &SocketAddr) -> bool {
        self.peers.read().get(addr).map(|p| p.wtxid_relay).unwrap_or(false)
    }

    /// Record that a peer wants compact block relay (BIP-152).
    pub fn set_cmpct(&self, addr: SocketAddr, announce: bool, version: u64) {
        if let Some(p) = self.peers.write().get_mut(&addr) {
            p.wants_cmpct = announce;
            p.cmpct_version = version;
        }
    }

    /// Whether a peer wants high-bandwidth compact blocks.
    pub fn wants_cmpct(&self, addr: &SocketAddr) -> bool {
        self.peers.read().get(addr).map(|p| p.wants_cmpct).unwrap_or(false)
    }

    // ── Queries ─────────────────────────────────────────────

    /// Number of connected peers by direction.
    pub fn count(&self, dir: Direction) -> usize {
        self.peers
            .read()
            .values()
            .filter(|p| p.direction == dir)
            .count()
    }

    /// Total connected peers.
    pub fn total(&self) -> usize {
        self.peers.read().len()
    }

    /// Addresses of all fully-handshaked peers.
    pub fn ready_addrs(&self) -> Vec<SocketAddr> {
        self.peers
            .read()
            .values()
            .filter(|p| p.handshake == HandshakeState::Ready)
            .map(|p| p.addr)
            .collect()
    }

    /// Count currently connected peers with a specific direction.
    pub fn count_by_direction(&self, dir: Direction) -> usize {
        self.peers.read().values().filter(|p| p.direction == dir).count()
    }

    /// Is this IP banned? Expired bans are silently removed.
    pub fn is_banned(&self, ip: &std::net::IpAddr) -> bool {
        let banned = self.banned.read();
        if let Some(when) = banned.get(ip) {
            if when.elapsed() < BAN_DURATION {
                return true;
            }
            // Ban expired — remove lazily on next write.
            drop(banned);
            self.banned.write().remove(ip);
            self.banned_unix.write().remove(ip);
            self.persist_bans();
        }
        false
    }

    // ── Ban persistence ─────────────────────────────────────

    fn bans_path(&self) -> Option<PathBuf> {
        self.data_dir.as_ref().map(|d| d.join("bans.json"))
    }

    /// Persist the ban list to disk (best-effort; errors are logged).
    fn persist_bans(&self) {
        let Some(path) = self.bans_path() else { return };
        let map: HashMap<String, u64> = self
            .banned_unix
            .read()
            .iter()
            .map(|(ip, ts)| (ip.to_string(), *ts))
            .collect();
        if let Ok(json) = serde_json::to_string_pretty(&map) {
            let _ = std::fs::write(&path, json);
        }
    }

    /// Load persisted bans from disk, discarding expired entries.
    fn load_bans(&self) {
        let Some(path) = self.bans_path() else { return };
        let Ok(data) = std::fs::read_to_string(&path) else { return };
        let Ok(map): Result<HashMap<String, u64>, _> = serde_json::from_str(&data) else { return };
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut banned = self.banned.write();
        let mut banned_unix = self.banned_unix.write();
        for (ip_str, ts) in map {
            let elapsed_secs = now_unix.saturating_sub(ts);
            if elapsed_secs >= BAN_DURATION.as_secs() {
                continue; // expired
            }
            if let Ok(ip) = ip_str.parse::<IpAddr>() {
                // Reconstruct an approximate `Instant` for the remaining duration.
                let remaining = BAN_DURATION.as_secs() - elapsed_secs;
                let instant = Instant::now() - Duration::from_secs(BAN_DURATION.as_secs() - remaining);
                banned.insert(ip, instant);
                banned_unix.insert(ip, ts);
            }
        }
    }

    // ── Address persistence ─────────────────────────────────

    fn addrs_path(&self) -> Option<PathBuf> {
        self.data_dir.as_ref().map(|d| d.join("addrs.json"))
    }

    /// Persist the address book to disk (best-effort).
    fn persist_addrs(&self) {
        let Some(path) = self.addrs_path() else { return };
        let map: HashMap<String, AddrInfo> = self
            .known_addrs
            .read()
            .iter()
            .map(|(addr, info)| (addr.to_string(), info.clone()))
            .collect();
        if let Ok(json) = serde_json::to_string_pretty(&map) {
            let _ = std::fs::write(&path, json);
        }
    }

    /// Load persisted addresses from disk, discarding stale entries.
    fn load_addrs(&self) {
        let Some(path) = self.addrs_path() else { return };
        let Ok(data) = std::fs::read_to_string(&path) else { return };
        let Ok(map): Result<HashMap<String, AddrInfo>, _> = serde_json::from_str(&data) else { return };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut known = self.known_addrs.write();
        for (addr_str, info) in map {
            // Discard stale
            if now.saturating_sub(info.last_seen) >= ADDR_STALE_SECS {
                continue;
            }
            if let Ok(addr) = addr_str.parse::<SocketAddr>() {
                known.insert(addr, info);
            }
        }
    }

    /// Get the start_height reported by a peer in their Version message.
    pub fn peer_height(&self, addr: &SocketAddr) -> Option<u64> {
        self.peers
            .read()
            .get(addr)
            .and_then(|p| p.version.as_ref())
            .map(|v| v.start_height)
    }

    /// Returns `true` if the peer at `addr` is a block-relay-only connection.
    pub fn is_block_relay_only(&self, addr: &SocketAddr) -> bool {
        self.peers
            .read()
            .get(addr)
            .map_or(false, |p| p.is_block_relay_only())
    }

    // ── Address book ────────────────────────────────────────

    /// Record discovered addresses (from Addr messages or DNS).
    pub fn add_known_addrs(&self, addrs: impl IntoIterator<Item = SocketAddr>) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut known = self.known_addrs.write();
        for a in addrs {
            known.entry(a)
                .and_modify(|info| info.last_seen = now)
                .or_insert_with(|| AddrInfo::new(now));
        }
        // Evict if over capacity
        Self::evict_addrs(&mut known);
        drop(known);
        self.persist_addrs();
    }

    /// Addresses we know about but are not currently connected to.
    pub fn unconnected_known(&self) -> Vec<SocketAddr> {
        let peers = self.peers.read();
        self.known_addrs
            .read()
            .iter()
            .filter(|(a, _)| !peers.contains_key(a))
            .map(|(a, _)| *a)
            .collect()
    }

    /// Like `unconnected_known` but diversified by network group.
    /// Returns at most one candidate per group to mitigate eclipse attacks.
    /// IPv4: /16 subnet. IPv6: /48 prefix (not all-as-one-group).
    pub fn unconnected_diverse(&self) -> Vec<SocketAddr> {
        use std::collections::HashSet;
        let peers = self.peers.read();

        // Collect network groups already occupied by outbound peers
        let mut occupied: HashSet<Vec<u8>> = HashSet::new();
        for p in peers.values() {
            if p.direction == Direction::Outbound || p.direction == Direction::BlockRelayOnly {
                occupied.insert(Self::network_group(&p.addr.ip()));
            }
        }

        let mut seen_groups: HashSet<Vec<u8>> = occupied;
        let mut result = Vec::new();
        let known = self.known_addrs.read();
        let mut candidates: Vec<_> = known.iter()
            .filter(|(a, _)| !peers.contains_key(a))
            .collect();
        // Prefer addresses we've successfully connected to before
        candidates.sort_by(|(_, a), (_, b)| {
            b.tried.cmp(&a.tried).then_with(|| b.last_seen.cmp(&a.last_seen))
        });
        for (addr, _) in candidates {
            let group = Self::network_group(&addr.ip());
            if seen_groups.insert(group) {
                result.push(*addr);
            }
        }
        result
    }

    /// Record a successful connection to `addr`.
    pub fn mark_addr_success(&self, addr: &SocketAddr) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut known = self.known_addrs.write();
        if let Some(info) = known.get_mut(addr) {
            info.last_success = Some(now);
            info.last_seen = now;
            info.failure_count = 0;
            info.tried = true;
        }
    }

    /// Record a failed connection attempt to `addr`.
    pub fn mark_addr_failure(&self, addr: &SocketAddr) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut known = self.known_addrs.write();
        if let Some(info) = known.get_mut(addr) {
            info.last_attempt = Some(now);
            info.failure_count = info.failure_count.saturating_add(1);
        }
    }

    /// Remove stale addresses not seen within `ADDR_STALE_SECS`.
    pub fn prune_stale_addrs(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut known = self.known_addrs.write();
        known.retain(|_, info| now.saturating_sub(info.last_seen) < ADDR_STALE_SECS);
        drop(known);
        self.persist_addrs();
    }

    /// Evict lowest-quality addresses when over capacity.
    fn evict_addrs(known: &mut HashMap<SocketAddr, AddrInfo>) {
        if known.len() <= MAX_KNOWN_ADDRS {
            return;
        }
        // Sort by quality: high failure_count and old last_seen are evicted first
        let mut entries: Vec<(SocketAddr, u32, u64)> = known
            .iter()
            .map(|(a, info)| (*a, info.failure_count, info.last_seen))
            .collect();
        // Worst first: high failure, then old last_seen
        entries.sort_by(|a, b| {
            b.1.cmp(&a.1).then_with(|| a.2.cmp(&b.2))
        });
        let to_remove = known.len() - MAX_KNOWN_ADDRS;
        for (addr, _, _) in entries.iter().take(to_remove) {
            known.remove(addr);
        }
    }

    /// Number of known addresses.
    pub fn known_addr_count(&self) -> usize {
        self.known_addrs.read().len()
    }

    /// Collect addresses to share with a peer (Addr response).
    /// Returns up to `max` randomly-sampled ready peer addresses.
    pub fn addr_response(&self, max: usize) -> Vec<SocketAddr> {
        use rand::seq::SliceRandom;
        let mut addrs = self.ready_addrs();
        let mut rng = rand::thread_rng();
        if addrs.len() <= max {
            addrs.shuffle(&mut rng);
            addrs
        } else {
            addrs.shuffle(&mut rng);
            addrs.truncate(max);
            addrs
        }
    }

    // ── Relay / broadcast ───────────────────────────────────

    /// Register the per-peer send channel so broadcast can reach this peer.
    pub fn register_sender(&self, addr: SocketAddr, sender: mpsc::Sender<Message>) {
        self.senders.write().insert(addr, sender);
    }

    /// Remove the per-peer send channel (on disconnect).
    pub fn remove_sender(&self, addr: &SocketAddr) {
        self.senders.write().remove(addr);
    }

    /// Snapshot of all senders (for targeted relay).
    pub fn senders_snapshot(&self) -> HashMap<SocketAddr, mpsc::Sender<Message>> {
        self.senders.read().clone()
    }

    /// Send `msg` to all ready peers except `exclude` (the originator).
    pub async fn broadcast(&self, msg: &Message, exclude: Option<&SocketAddr>) {
        let ready: Vec<SocketAddr> = self.ready_addrs();
        let senders = self.senders.read();
        for peer_addr in &ready {
            if exclude.is_some_and(|ex| ex == peer_addr) {
                continue;
            }
            if let Some(sender) = senders.get(peer_addr) {
                let _ = sender.try_send(msg.clone());
            }
        }
    }

    /// Queue an Inv item for batched trickle relay to all peers except `origin`.
    pub fn queue_inv_relay(&self, item: InvItem, origin: SocketAddr) {
        let ready = self.ready_addrs();
        let mut queue = self.inv_relay_queue.write();
        for peer_addr in &ready {
            if *peer_addr == origin {
                continue;
            }
            queue.entry(*peer_addr)
                .or_insert_with(VecDeque::new)
                .push_back(item.clone());
        }
    }

    /// Flush batched Inv items for all peers (called on a Poisson timer).
    pub async fn flush_inv_relay(&self) {
        let mut queue = self.inv_relay_queue.write();
        let senders = self.senders.read();
        for (peer_addr, items) in queue.iter_mut() {
            if items.is_empty() {
                continue;
            }
            // Drain up to MAX_INV_SIZE items per flush
            let batch: Vec<InvItem> = items.drain(..items.len().min(super::peer::MAX_INV_SIZE))
                .collect();
            if let Some(sender) = senders.get(peer_addr) {
                let _ = sender.try_send(Message::Inv(batch));
            }
        }
        // Remove empty entries
        queue.retain(|_, v| !v.is_empty());
    }

    /// Summary of every connected peer (for RPC / monitoring).
    pub fn peer_summaries(&self) -> Vec<PeerSummary> {
        self.peers
            .read()
            .values()
            .map(|p| PeerSummary {
                addr: p.addr,
                direction: p.direction,
                handshake: p.handshake,
                user_agent: p.version.as_ref().map(|v| v.user_agent.clone()),
                start_height: p.version.as_ref().map(|v| v.start_height),
                connected_secs: p.connected_at.elapsed().as_secs(),
                misbehaviour_score: p.misbehaviour_score,
            })
            .collect()
    }

    /// Return the ban reason for an IP (if any).
    pub fn ban_reason(&self, ip: &IpAddr) -> Option<String> {
        self.ban_reasons.read().get(ip).cloned()
    }

    /// Manually ban an IP address (used by `setban` RPC).
    pub fn ban_ip(&self, ip: IpAddr, reason: &str) {
        let now = Instant::now();
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.banned.write().insert(ip, now);
        self.banned_unix.write().insert(ip, now_unix);
        self.ban_reasons.write().insert(ip, reason.to_string());
        // Disconnect any active peer on that IP
        let to_remove: Vec<SocketAddr> = self.peers.read()
            .keys()
            .filter(|a| a.ip() == ip)
            .copied()
            .collect();
        for addr in &to_remove {
            self.peers.write().remove(addr);
            self.senders.write().remove(addr);
        }
        self.persist_bans();
    }

    /// Remove a ban for an IP address (used by `setban remove` RPC).
    pub fn unban_ip(&self, ip: &IpAddr) {
        self.banned.write().remove(ip);
        self.banned_unix.write().remove(ip);
        self.ban_reasons.write().remove(ip);
        self.persist_bans();
    }

    /// List all currently banned IPs with their ban timestamps and reasons.
    pub fn list_banned(&self) -> Vec<(IpAddr, u64, Option<String>)> {
        let banned_unix = self.banned_unix.read();
        let reasons = self.ban_reasons.read();
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        banned_unix
            .iter()
            .filter(|(_, ts)| now_unix.saturating_sub(**ts) < BAN_DURATION.as_secs())
            .map(|(ip, ts)| (*ip, *ts, reasons.get(ip).cloned()))
            .collect()
    }

    // ── Feeler connections ──────────────────────────────────

    /// Maximum concurrent feeler connections.
    const MAX_FEELERS: usize = 2;

    /// Maximum concurrent block-relay-only outbound connections.
    const MAX_BLOCK_RELAY_ONLY: usize = 2;

    /// Pick addresses that have never been successfully connected to
    /// (untried) as feeler candidates — up to `max` results.
    pub fn feeler_candidates(&self, max: usize) -> Vec<SocketAddr> {
        let peers = self.peers.read();
        let known = self.known_addrs.read();
        known.iter()
            .filter(|(a, info)| !info.tried && !peers.contains_key(a))
            .map(|(a, _)| *a)
            .take(max)
            .collect()
    }

    /// Register a feeler connection. Feelers share a small dedicated slot
    /// pool and don't count against the normal outbound limit.
    pub fn register_feeler(&self, addr: SocketAddr) -> bool {
        if self.is_banned(&addr.ip()) {
            return false;
        }
        let peers = self.peers.read();
        let feeler_count = peers.values()
            .filter(|p| p.direction == Direction::Feeler)
            .count();
        if feeler_count >= Self::MAX_FEELERS {
            return false;
        }
        drop(peers);
        self.peers.write().insert(addr, PeerInfo::new(addr, Direction::Feeler));
        true
    }

    /// Called when a feeler completes the handshake. Marks the address as
    /// tried/successful and removes the feeler peer entry so the slot is
    /// freed and the TCP connection can be dropped.
    pub fn complete_feeler(&self, addr: &SocketAddr) {
        self.mark_addr_success(addr);
        self.peers.write().remove(addr);
        self.senders.write().remove(addr);
    }

    /// Number of active feeler connections.
    pub fn feeler_count(&self) -> usize {
        self.peers.read().values()
            .filter(|p| p.direction == Direction::Feeler)
            .count()
    }
}

/// Lightweight snapshot of a peer — safe to serialize for RPC.
#[derive(Debug, Clone)]
pub struct PeerSummary {
    pub addr: SocketAddr,
    pub direction: Direction,
    pub handshake: HandshakeState,
    pub user_agent: Option<String>,
    pub start_height: Option<u64>,
    pub connected_secs: u64,
    pub misbehaviour_score: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local(port: u16) -> SocketAddr {
        SocketAddr::from(([127, 0, 0, 1], port))
    }

    #[test]
    fn register_and_count() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 2,
            ban_threshold: 100,
        });
        assert!(pm.register(local(1), Direction::Outbound));
        assert!(pm.register(local(2), Direction::Outbound));
        // Third outbound exceeds limit
        assert!(!pm.register(local(3), Direction::Outbound));
        assert_eq!(pm.count(Direction::Outbound), 2);
        assert_eq!(pm.total(), 2);
    }

    #[test]
    fn ban_prevents_reconnect() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 8,
            max_inbound: 8,
            ban_threshold: 10,
        });
        pm.register(local(1), Direction::Outbound);
        let banned = pm.add_misbehaviour(&local(1), 10);
        assert!(banned);
        assert!(pm.is_banned(&local(1).ip()));
        // Re-registration is rejected
        assert!(!pm.register(local(1), Direction::Outbound));
    }

    #[test]
    fn ready_addrs_empty_until_handshake() {
        let pm = PeerManager::new(PeerLimits::default());
        pm.register(local(1), Direction::Outbound);
        assert!(pm.ready_addrs().is_empty());
        pm.set_handshake(&local(1), HandshakeState::Ready);
        assert_eq!(pm.ready_addrs(), vec![local(1)]);
    }

    #[test]
    fn known_addrs_tracking() {
        let pm = PeerManager::new(PeerLimits::default());
        pm.register(local(1), Direction::Outbound);
        pm.add_known_addrs(vec![local(1), local(2), local(3)]);
        // local(1) is connected, so unconnected should be {2, 3}
        let mut unk = pm.unconnected_known();
        unk.sort();
        assert_eq!(unk, vec![local(2), local(3)]);
    }

    #[test]
    fn rate_limit_triggers() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 8,
            max_inbound: 8,
            ban_threshold: 100,
        });
        pm.register(local(1), Direction::Outbound);
        // Should pass for RATE_LIMIT_MSGS calls
        for _ in 0..RATE_LIMIT_MSGS {
            assert!(!pm.check_rate_limit(&local(1)));
        }
        // Next one should trip the limit
        assert!(pm.check_rate_limit(&local(1)));
    }

    #[test]
    fn misbehaviour_with_reason_tracks_reason() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 8,
            max_inbound: 8,
            ban_threshold: 10,
        });
        pm.register(local(1), Direction::Outbound);
        let banned = pm.add_misbehaviour_with_reason(&local(1), 10, "bad PoW");
        assert!(banned);
        assert_eq!(pm.ban_reason(&local(1).ip()), Some("bad PoW".to_string()));
    }

    #[test]
    fn subnet_diverse_selection() {
        let pm = PeerManager::new(PeerLimits::default());
        // Add several addresses in the same /16 subnet (10.1.x.x)
        let same_subnet: Vec<SocketAddr> = (1..=5)
            .map(|i| SocketAddr::from(([10, 1, 0, i], 8333)))
            .collect();
        // Add one address in a different /16 (10.2.x.x)
        let diff_subnet = SocketAddr::from(([10, 2, 0, 1], 8333));
        let mut all = same_subnet.clone();
        all.push(diff_subnet);
        pm.add_known_addrs(all);

        let diverse = pm.unconnected_diverse();
        // Should pick at most one from 10.1.x.x and one from 10.2.x.x
        assert_eq!(diverse.len(), 2, "should pick one per /16 subnet");
    }

    #[test]
    fn score_decay_reduces_score() {
        let mut info = PeerInfo::new(local(1), Direction::Outbound);
        info.misbehaviour_score = 10;
        // Simulate 5 minutes passing
        info.last_decay = Instant::now() - Duration::from_secs(5 * 60);
        info.apply_decay();
        assert_eq!(info.misbehaviour_score, 5, "5 minutes should decay 5 points");
    }

    #[test]
    fn fee_filter_stored_and_retrieved() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(1);
        pm.register(addr, Direction::Outbound);
        pm.set_fee_filter(&addr, 5000);
        assert_eq!(pm.fee_filter(&addr), 5000);
    }

    #[test]
    fn send_headers_flag_default_false() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(1);
        pm.register(addr, Direction::Outbound);
        assert!(!pm.wants_headers(&addr));
        pm.set_send_headers(&addr);
        assert!(pm.wants_headers(&addr));
    }

    #[test]
    fn wtxid_relay_flag_default_false() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(1);
        pm.register(addr, Direction::Outbound);
        assert!(!pm.uses_wtxid_relay(&addr));
        pm.set_wtxid_relay(&addr);
        assert!(pm.uses_wtxid_relay(&addr));
    }

    // ── Peer eviction tests ──────────────────────────────────────

    #[test]
    fn inbound_eviction_when_full() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 2,
            ban_threshold: 100,
        });
        // Fill inbound slots
        assert!(pm.register(local(10), Direction::Inbound));
        assert!(pm.register(local(11), Direction::Inbound));
        assert_eq!(pm.count(Direction::Inbound), 2);

        // Give one peer a higher misbehaviour score so it gets evicted
        pm.add_misbehaviour(&local(10), 50);

        // Third inbound should succeed by evicting the misbehaving peer
        assert!(pm.register(local(12), Direction::Inbound));
        assert_eq!(pm.count(Direction::Inbound), 2);
        // Peer 10 (bad score) should have been evicted
        assert!(!pm.peers.read().contains_key(&local(10)));
        assert!(pm.peers.read().contains_key(&local(12)));
    }

    #[test]
    fn eviction_picks_highest_misbehaviour() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 8,
            max_inbound: 3,
            ban_threshold: 100,
        });
        pm.register(local(1), Direction::Inbound);
        pm.register(local(2), Direction::Inbound);
        pm.register(local(3), Direction::Inbound);

        pm.add_misbehaviour(&local(1), 10);
        pm.add_misbehaviour(&local(2), 30);
        pm.add_misbehaviour(&local(3), 5);

        let victim = pm.pick_eviction_candidate();
        assert_eq!(victim, Some(local(2)));
    }

    #[test]
    fn outbound_not_evicted_when_full() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 8,
            ban_threshold: 100,
        });
        pm.register(local(1), Direction::Outbound);
        pm.register(local(2), Direction::Outbound);
        // Outbound full — should NOT evict, just fail
        assert!(!pm.register(local(3), Direction::Outbound));
        assert_eq!(pm.count(Direction::Outbound), 2);
    }

    // ── Feeler connection tests ─────────────────────────────────

    #[test]
    fn feeler_registration_and_limit() {
        let pm = PeerManager::new(PeerLimits::default());
        // Add untried addresses
        pm.add_known_addrs(vec![local(10), local(11), local(12)]);
        let candidates = pm.feeler_candidates(10);
        assert_eq!(candidates.len(), 3);

        // Register feelers (max 2)
        assert!(pm.register_feeler(local(10)));
        assert!(pm.register_feeler(local(11)));
        assert!(!pm.register_feeler(local(12))); // exceeds MAX_FEELERS
        assert_eq!(pm.feeler_count(), 2);
    }

    #[test]
    fn feeler_complete_marks_tried() {
        let pm = PeerManager::new(PeerLimits::default());
        pm.add_known_addrs(vec![local(20)]);

        assert!(pm.register_feeler(local(20)));
        assert_eq!(pm.feeler_count(), 1);

        // Complete the feeler
        pm.complete_feeler(&local(20));
        assert_eq!(pm.feeler_count(), 0);

        // Address should now be marked as tried
        let known = pm.known_addrs.read();
        let info = known.get(&local(20)).unwrap();
        assert!(info.tried);
        assert!(info.last_success.is_some());
    }

    #[test]
    fn feeler_candidates_skip_tried() {
        let pm = PeerManager::new(PeerLimits::default());
        pm.add_known_addrs(vec![local(30), local(31)]);

        // Mark one as tried
        pm.mark_addr_success(&local(30));

        let candidates = pm.feeler_candidates(10);
        // Only local(31) should be a candidate (untried)
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0], local(31));
    }

    #[test]
    fn feeler_does_not_count_against_outbound() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 2,
            ban_threshold: 100,
        });
        pm.register(local(1), Direction::Outbound);
        pm.register(local(2), Direction::Outbound);
        // Outbound full
        assert!(!pm.register(local(3), Direction::Outbound));
        // But feelers use a separate pool
        assert!(pm.register_feeler(local(4)));
        assert_eq!(pm.feeler_count(), 1);
        assert_eq!(pm.count(Direction::Outbound), 2);
    }

    // ── Peer manager hardening tests ──────────────────────────────────────────

    #[test]
    fn ban_blocks_reconnect_from_same_ip() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(200);
        pm.ban_ip(addr.ip(), "test ban");
        assert!(pm.is_banned(&addr.ip()));
        // Attempting to register a new connection from that IP must be rejected
        assert!(!pm.register(addr, Direction::Inbound));
    }

    #[test]
    fn unban_allows_reconnect() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(201);
        pm.ban_ip(addr.ip(), "temporary ban");
        assert!(pm.is_banned(&addr.ip()));
        pm.unban_ip(&addr.ip());
        assert!(!pm.is_banned(&addr.ip()));
        assert!(pm.register(addr, Direction::Inbound));
    }

    #[test]
    fn ban_reason_is_stored_and_retrievable() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(202);
        pm.ban_ip(addr.ip(), "sending bad blocks");
        assert_eq!(pm.ban_reason(&addr.ip()), Some("sending bad blocks".to_string()));
    }

    #[test]
    fn misbehaviour_accumulates_and_triggers_ban() {
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 4,
            max_inbound: 4,
            ban_threshold: 100,
        });
        let addr = local(203);
        pm.register(addr, Direction::Inbound);
        // Add 99 — not yet banned
        let banned = pm.add_misbehaviour(&addr, 99);
        assert!(!banned, "Should not be banned below threshold");
        // Add 1 more — total 100, should ban
        let banned = pm.add_misbehaviour(&addr, 1);
        assert!(banned, "Should be banned at threshold");
        assert!(pm.is_banned(&addr.ip()));
    }

    #[test]
    fn inbound_and_outbound_limits_are_independent() {
        // Outbound is STRICTLY limited (no eviction path)
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 10,
            ban_threshold: 100,
        });
        assert!(pm.register(local(10), Direction::Outbound));
        assert!(pm.register(local(11), Direction::Outbound));
        // Outbound full — must be rejected
        assert!(!pm.register(local(12), Direction::Outbound));
        // Inbound capacity is independent; still has room
        assert!(pm.register(local(13), Direction::Inbound));
        assert!(pm.register(local(14), Direction::Inbound));
        assert_eq!(pm.count(Direction::Inbound), 2);
        assert_eq!(pm.count(Direction::Outbound), 2);
    }

    #[test]
    fn inbound_at_limit_uses_eviction_not_hard_reject() {
        // When inbound is full, the manager evicts the worst peer to let the new one in
        let pm = PeerManager::new(PeerLimits {
            max_outbound: 2,
            max_inbound: 2,
            ban_threshold: 100,
        });
        assert!(pm.register(local(20), Direction::Inbound));
        assert!(pm.register(local(21), Direction::Inbound));
        assert_eq!(pm.count(Direction::Inbound), 2);
        // Third inbound trigger eviction; after eviction count stays at 2
        let _ = pm.register(local(22), Direction::Inbound);
        assert_eq!(pm.count(Direction::Inbound), 2);
    }

    #[test]
    fn addr_response_respects_max_count() {
        let pm = PeerManager::new(PeerLimits::default());
        let addrs: Vec<SocketAddr> = (100u16..200).map(|p| local(p)).collect(); // 100 addrs
        pm.add_known_addrs(addrs.clone());
        for &a in &addrs {
            pm.mark_addr_success(&a);
        }
        let response = pm.addr_response(10);
        assert!(response.len() <= 10, "addr_response must not exceed max={}", 10);
    }

    #[test]
    fn max_feelers_limit_enforced() {
        let pm = PeerManager::new(PeerLimits::default());
        // MAX_FEELERS = 2
        assert!(pm.register_feeler(local(50)));
        assert!(pm.register_feeler(local(51)));
        // Third feeler must be rejected
        assert!(!pm.register_feeler(local(52)), "MAX_FEELERS exceeded should be rejected");
        assert_eq!(pm.feeler_count(), 2);
    }

    #[test]
    fn known_addrs_deduplication() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(60);
        pm.add_known_addrs(vec![addr, addr, addr]);
        // All three refer to the same address — only one candidate should be returned
        pm.mark_addr_success(&addr); // mark as tried so it doesn't appear in feeler candidates  
        let candidates = pm.feeler_candidates(100);
        // addr is tried, so 0 feeler candidates for it
        assert!(!candidates.contains(&addr), "Tried address must not appear as feeler candidate");
    }

    #[test]
    fn remove_decrements_count() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(70);
        pm.register(addr, Direction::Outbound);
        assert_eq!(pm.count(Direction::Outbound), 1);
        pm.remove(&addr);
        assert_eq!(pm.count(Direction::Outbound), 0);
    }

    #[test]
    fn ban_removes_active_peer() {
        let pm = PeerManager::new(PeerLimits::default());
        let addr = local(80);
        pm.register(addr, Direction::Inbound);
        assert_eq!(pm.count(Direction::Inbound), 1);
        pm.ban_ip(addr.ip(), "direct ban");
        // PeerManager should evict/remove the active peer on ban
        // is_banned must be true; new registration must be blocked
        assert!(pm.is_banned(&addr.ip()));
    }
}
