//! TCP-based P2P server: listening, connecting, handshake,
//! peer discovery (GetAddr / Addr), and block / transaction relay.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::config::{Config, Network};
use crate::mempool::Mempool;
use crate::state::NodeState;

use chain::Block;
use consensus;

use super::message::{
    self, AddrEntry, InvItem, InvType, Message, VersionPayload,
    MAX_MESSAGE_SIZE, MIN_PROTOCOL_VERSION, PROTOCOL_VERSION, USER_AGENT,
};
use super::peer::{Direction, HandshakeState, PeerLimits, PeerManager,
    MAX_ADDR_PER_MSG, MAX_INV_SIZE};

/// Interval between outbound connection rounds.
const CONNECT_INTERVAL: Duration = Duration::from_secs(30);
/// Timeout for reading a single message frame.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

// ── SOCKS5 proxy support (RFC 1928) ─────────────────────────────

/// Establish an outbound TCP stream, optionally via a SOCKS5 proxy.
///
/// When `proxy_addr` is `Some(addr)`, all TCP bytes go through the proxy
/// (e.g. Tor's SOCKS port at 127.0.0.1:9050) before the CONNECT command
/// tunnels through to `target`.  This provides full IP-address anonymity
/// for the peer when running in Tor-only mode.
async fn dial(target: SocketAddr, proxy_addr: Option<&str>) -> Result<TcpStream> {
    match proxy_addr {
        None => Ok(TcpStream::connect(target).await?),
        Some(proxy) => {
            let proxy_sa: SocketAddr = proxy
                .parse()
                .map_err(|_| anyhow::anyhow!("invalid proxy_addr: {proxy}"))?;
            let mut stream = tokio::time::timeout(
                Duration::from_secs(10),
                TcpStream::connect(proxy_sa),
            )
            .await??;
            socks5_connect(&mut stream, target).await?;
            Ok(stream)
        }
    }
}

/// Perform the SOCKS5 no-auth greeting and CONNECT handshake (RFC 1928).
///
/// `stream` must already be connected to the SOCKS5 server.
/// On success the stream is ready for transparent TCP use to `target`.
async fn socks5_connect(stream: &mut TcpStream, target: SocketAddr) -> Result<()> {
    // ── Greeting: VER=5, NMETHODS=1, METHOD=0x00 (no auth) ─────
    stream.write_all(&[0x05, 0x01, 0x00]).await?;

    let mut gr = [0u8; 2];
    stream.read_exact(&mut gr).await?;
    if gr[0] != 0x05 || gr[1] != 0x00 {
        bail!("SOCKS5 proxy rejected no-auth method (got {gr:?})");
    }

    // ── CONNECT request ─────────────────────────────────────────
    let mut req: Vec<u8> = Vec::with_capacity(22);
    req.extend_from_slice(&[0x05, 0x01, 0x00]); // VER CONNECT RSV
    match target.ip() {
        std::net::IpAddr::V4(ip4) => {
            req.push(0x01);
            req.extend_from_slice(&ip4.octets());
        }
        std::net::IpAddr::V6(ip6) => {
            req.push(0x04);
            req.extend_from_slice(&ip6.octets());
        }
    }
    let p = target.port();
    req.push((p >> 8) as u8);
    req.push((p & 0xFF) as u8);
    stream.write_all(&req).await?;

    // ── Response ─────────────────────────────────────────────────
    let mut hdr = [0u8; 4];
    stream.read_exact(&mut hdr).await?;
    if hdr[0] != 0x05 {
        bail!("SOCKS5: unexpected version byte {}", hdr[0]);
    }
    if hdr[1] != 0x00 {
        let reason = match hdr[1] {
            0x01 => "general SOCKS server failure",
            0x02 => "connection not allowed by ruleset",
            0x03 => "network unreachable",
            0x04 => "host unreachable",
            0x05 => "connection refused",
            0x06 => "TTL expired",
            0x07 => "command not supported",
            0x08 => "address type not supported",
            other => return Err(anyhow::anyhow!("SOCKS5 error code {other:#04x}")),
        };
        bail!("SOCKS5 CONNECT refused: {reason}");
    }
    // Drain BND.ADDR + BND.PORT (we don't use the bound address)
    let drain_len = match hdr[3] {
        0x01 => 4 + 2,  // IPv4 + port
        0x04 => 16 + 2, // IPv6 + port
        0x03 => {
            let mut lb = [0u8; 1];
            stream.read_exact(&mut lb).await?;
            lb[0] as usize + 2 // domain-length byte + domain + port
        }
        other => bail!("SOCKS5: unknown ATYP {other:#04x}"),
    };
    let mut drain = vec![0u8; drain_len];
    stream.read_exact(&mut drain).await?;

    Ok(())
}
/// How often we send Ping keep-alives.
const PING_INTERVAL: Duration = Duration::from_secs(120);
/// Maximum addresses we relay per Addr message.
const MAX_ADDR_RELAY: usize = 1_000;
/// How often we broadcast our own address to peers.
const ADDR_RELAY_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
/// Mean interval for Poisson-distributed tx inv trickle (5 seconds like Bitcoin Core).
const INV_TRICKLE_MEAN_SECS: f64 = 5.0;
/// Maximum headers per Headers message (Bitcoin uses 2000).
const MAX_HEADERS_PER_MSG: usize = 2_000;

// ── P2PServer ───────────────────────────────────────────────────

/// Sync stage for initial block download (IBD) tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncState {
    /// Downloading headers from peers.
    HeaderSync,
    /// Downloading full blocks for validated headers.
    BlockSync,
    /// Fully synced — normal relay mode.
    Synced,
}

/// Orchestrates the P2P networking layer.
pub struct P2PServer {
    config: Config,
    state: Arc<NodeState>,
    mempool: Arc<Mempool>,
    peers: Arc<PeerManager>,
    /// Nonce we put in our own Version messages so we can detect
    /// self-connections.
    local_nonce: u64,
    /// Current IBD / sync state.
    sync_state: parking_lot::RwLock<SyncState>,
}

impl P2PServer {
    pub fn new(
        config: Config,
        state: Arc<NodeState>,
        mempool: Arc<Mempool>,
    ) -> Self {
        let peers = Arc::new(
            PeerManager::with_data_dir(PeerLimits::default(), config.data_dir.clone()),
        );
        let local_nonce: u64 = rand::random();
        Self {
            config, state, mempool, peers, local_nonce,
            sync_state: parking_lot::RwLock::new(SyncState::HeaderSync),
        }
    }

    /// Reference to the peer manager (for metrics / RPC queries).
    pub fn peers(&self) -> &Arc<PeerManager> {
        &self.peers
    }

    // ── Entry point ─────────────────────────────────────────

    /// Start all P2P tasks: listener, bootstrap connector, keep-alive.
    /// Returns immediately — work runs on the tokio runtime.
    pub async fn start(self: Arc<Self>) -> Result<()> {
        let listen_addr: SocketAddr = self.config.p2p_addr.parse()?;
        let listener = TcpListener::bind(listen_addr).await?;
        info!(%listen_addr, "P2P listener started");

        // Optional UPnP port mapping
        if self.config.upnp {
            let addr = listen_addr;
            tokio::spawn(async move {
                super::upnp::try_map_port(addr).await;
            });
        }

        // Task: accept inbound connections
        let srv = Arc::clone(&self);
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let s = Arc::clone(&srv);
                        tokio::spawn(async move {
                            if let Err(e) = s.handle_inbound(stream, addr).await {
                                debug!(%addr, err = %e, "inbound peer error");
                            }
                        });
                    }
                    Err(e) => {
                        error!(err = %e, "P2P accept error");
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });

        // Task: bootstrap & periodic outbound connection
        let srv = Arc::clone(&self);
        tokio::spawn(async move { srv.bootstrap_loop().await });

        // Task: batched Inv trickle relay (Poisson mean = INV_TRICKLE_MEAN_SECS)
        let peers_for_trickle = Arc::clone(&self.peers);
        tokio::spawn(async move {
            loop {
                let delay_secs = {
                    let u: f64 = rand::random::<f64>().max(1e-9);
                    -INV_TRICKLE_MEAN_SECS * u.ln()
                };
                tokio::time::sleep(Duration::from_secs_f64(delay_secs)).await;
                peers_for_trickle.flush_inv_relay().await;
            }
        });

        Ok(())
    }

    // ── Inbound ─────────────────────────────────────────────

    async fn handle_inbound(self: &Arc<Self>, stream: TcpStream, addr: SocketAddr) -> Result<()> {
        if !self.peers.register(addr, Direction::Inbound) {
            debug!(%addr, "inbound rejected (limit or banned)");
            return Ok(());
        }
        info!(%addr, "inbound peer connected");

        if let Err(e) = self.run_peer(stream, addr, Direction::Inbound).await {
            debug!(%addr, err = %e, "inbound session ended");
        }
        self.peers.remove(&addr);
        Ok(())
    }

    // ── Outbound ────────────────────────────────────────────

    async fn connect_outbound(self: &Arc<Self>, addr: SocketAddr) -> Result<()> {
        self.connect_outbound_dir(addr, Direction::Outbound).await
    }

    async fn connect_outbound_dir(self: &Arc<Self>, addr: SocketAddr, dir: Direction) -> Result<()> {
        if !self.peers.register(addr, dir) {
            return Ok(());
        }
        let proxy = self.config.proxy_addr.as_deref();
        let stream = tokio::time::timeout(
            Duration::from_secs(10),
            dial(addr, proxy),
        )
        .await??;

        info!(%addr, ?dir, "outbound peer connected");

        if let Err(e) = self.run_peer(stream, addr, dir).await {
            debug!(%addr, err = %e, "outbound session ended");
        }
        self.peers.remove(&addr);
        Ok(())
    }

    // ── Bootstrap ───────────────────────────────────────────

    async fn bootstrap_loop(self: &Arc<Self>) {
        // Seed the known-address book from hardcoded seeds
        let tn = to_testnet_network(self.config.network);
        let seed_addrs = resolve_seeds(tn).await;
        self.peers.add_known_addrs(seed_addrs);

        if self.config.tor_only && self.config.proxy_addr.is_none() {
            warn!("tor_only=true but proxy_addr is not set — no outbound connections will be made");
        }

        let mut last_addr_relay = std::time::Instant::now();

        loop {
            // Fill outbound slots from the address book (subnet-diverse)
            let candidates = self.peers.unconnected_diverse();
            for addr in candidates.into_iter().take(4) {
                let srv = Arc::clone(self);
                tokio::spawn(async move {
                    if let Err(e) = srv.connect_outbound(addr).await {
                        debug!(%addr, err = %e, "outbound connect failed");
                    }
                });
            }

            // Fill block-relay-only outbound slots (2 dedicated)
            let bro_candidates = self.peers.unconnected_diverse();
            let bro_current = self.peers.count_by_direction(Direction::BlockRelayOnly);
            let max_bro: usize = 2; // matches PeerManager::MAX_BLOCK_RELAY_ONLY
            for addr in bro_candidates.into_iter()
                .take(max_bro.saturating_sub(bro_current))
            {
                let srv = Arc::clone(self);
                tokio::spawn(async move {
                    if let Err(e) = srv.connect_outbound_dir(addr, Direction::BlockRelayOnly).await {
                        debug!(%addr, err = %e, "block-relay-only connect failed");
                    }
                });
            }

            // Periodic self-addr relay (once per ADDR_RELAY_INTERVAL)
            if last_addr_relay.elapsed() >= ADDR_RELAY_INTERVAL {
                last_addr_relay = std::time::Instant::now();
                if let Ok(self_addr) = self.config.p2p_addr.parse::<SocketAddr>() {
                    let entry = AddrEntry {
                        timestamp: now_unix(),
                        services: 0x01,
                        addr: self_addr,
                    };
                    let senders = self.peers.senders_snapshot();
                    for sender in senders.values() {
                        let _ = sender.try_send(Message::Addr(vec![entry.clone()]));
                    }
                }
            }

            tokio::time::sleep(CONNECT_INTERVAL).await;
        }
    }

    // ── Per-peer session ────────────────────────────────────

    /// Main loop for a single peer (inbound or outbound).
    async fn run_peer(
        self: &Arc<Self>,
        stream: TcpStream,
        addr: SocketAddr,
        dir: Direction,
    ) -> Result<()> {
        let (mut reader, mut writer) = stream.into_split();
        let magic = message::network_magic(to_testnet_network(self.config.network));

        // ── Handshake ───────────────────────────────────────
        // Outbound: we send Version first; inbound: we wait.
        if dir == Direction::Outbound {
            let version_msg = self.build_version();
            write_message(&mut writer, &version_msg, magic).await?;
            self.peers.set_handshake(&addr, HandshakeState::VersionSent);
        }

        // Channel for messages to send back to this peer.
        let (tx, mut rx) = mpsc::channel::<Message>(64);
        self.peers.register_sender(addr, tx.clone());

        // Writer task: drains rx and sends to TCP
        let write_handle = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if write_message(&mut writer, &msg, magic).await.is_err() {
                    break;
                }
            }
        });

        // Ping keep-alive timer
        let tx_ping = tx.clone();
        let ping_handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(PING_INTERVAL);
            loop {
                interval.tick().await;
                let nonce = rand::random::<u64>();
                if tx_ping.send(Message::Ping(nonce)).await.is_err() {
                    break;
                }
            }
        });

        // ── Read loop ───────────────────────────────────────
        let result = self.read_loop(&mut reader, &addr, dir, &tx).await;

        // Clean up
        ping_handle.abort();
        self.peers.remove_sender(&addr);
        drop(tx);
        let _ = write_handle.await;

        result
    }

    async fn read_loop(
        self: &Arc<Self>,
        reader: &mut tokio::net::tcp::OwnedReadHalf,
        addr: &SocketAddr,
        dir: Direction,
        tx: &mpsc::Sender<Message>,
    ) -> Result<()> {
        let magic = message::network_magic(to_testnet_network(self.config.network));
        loop {
            let msg = match tokio::time::timeout(READ_TIMEOUT, read_message(reader, magic)).await {
                Ok(Ok(msg)) => msg,
                Ok(Err(e)) => bail!("read error: {e}"),
                Err(_) => bail!("read timeout"),
            };

            // Per-peer rate limiting
            if self.peers.check_rate_limit(addr) {
                warn!(%addr, "peer exceeded message rate limit");
                if self.peers.add_misbehaviour_with_reason(addr, 20, "message rate limit exceeded") {
                    bail!("peer banned (rate limit)");
                }
                continue; // drop excess messages
            }

            self.handle_message(addr, dir, msg, tx).await?;
        }
    }

    // ── Message dispatch ────────────────────────────────────

    async fn handle_message(
        self: &Arc<Self>,
        addr: &SocketAddr,
        dir: Direction,
        msg: Message,
        tx: &mpsc::Sender<Message>,
    ) -> Result<()> {
        match msg {
            // ── Handshake ───────────────────────────────────
            Message::Version(v) => {
                debug!(%addr, version = v.version, agent = %v.user_agent, "recv Version");

                // Self-connection detection: if the peer's nonce matches our
                // own, we are talking to ourselves.
                if v.nonce == self.local_nonce {
                    warn!(%addr, "detected self-connection — disconnecting");
                    bail!("self-connection detected");
                }

                // Reject peers running a protocol version below our minimum.
                if v.version < MIN_PROTOCOL_VERSION {
                    warn!(%addr, version = v.version, min = MIN_PROTOCOL_VERSION,
                          "peer protocol version too old — disconnecting");
                    bail!("protocol version too old");
                }

                // Service-bit gating: require at least NODE_NETWORK.
                if v.services & message::NODE_NETWORK == 0 {
                    warn!(%addr, services = v.services,
                          "peer does not advertise NODE_NETWORK — disconnecting");
                    bail!("peer missing NODE_NETWORK service bit");
                }

                self.peers.set_version(addr, v);

                // Reply with our Version (if inbound) then Verack
                if dir == Direction::Inbound {
                    tx.send(self.build_version()).await?;
                    self.peers.set_handshake(addr, HandshakeState::VersionSent);
                }
                tx.send(Message::Verack).await?;
            }
            Message::Verack => {
                debug!(%addr, "recv Verack — handshake complete");
                self.peers.set_handshake(addr, HandshakeState::Ready);

                // Signal feature support to peer
                tx.send(Message::SendHeaders).await?;
                tx.send(Message::WtxidRelay).await?;
                // Signal BIP-155 addrv2 support
                tx.send(Message::SendAddrV2).await?;

                // Announce our minimum relay fee (1 sat/kB default)
                tx.send(Message::FeeFilter(1000)).await?;

                // ── Key step: request peer addresses after handshake ──
                tx.send(Message::GetAddr).await?;

                // ── Headers-first sync: if peer is ahead, request headers ──
                let peer_height = self.peers.peer_height(addr).unwrap_or(0);
                let our_height = self.state.get_height();
                if peer_height > our_height {
                    let locator = self.build_locator();
                    tx.send(Message::GetHeaders {
                        locator,
                        stop_hash: [0u8; 32],
                    })
                    .await?;
                    debug!(%addr, our_height, peer_height, "starting headers-first sync");
                } else if self.sync_state() == SyncState::HeaderSync {
                    // Already at tip — skip IBD
                    self.set_sync_state(SyncState::Synced);
                }
            }

            // ── Peer discovery ──────────────────────────────
            Message::GetAddr => {
                let addrs = self.peers.addr_response(MAX_ADDR_RELAY);
                let entries: Vec<AddrEntry> = addrs
                    .into_iter()
                    .map(|a| AddrEntry {
                        timestamp: now_unix(),
                        services: 0x01,
                        addr: a,
                    })
                    .collect();
                tx.send(Message::Addr(entries)).await?;
            }
            Message::Addr(entries) => {
                // Block-relay-only peers do not participate in addr relay.
                if self.peers.is_block_relay_only(addr) {
                    return Ok(());
                }
                if entries.len() > MAX_ADDR_PER_MSG {
                    warn!(%addr, count = entries.len(), "oversized Addr message");
                    if self.peers.add_misbehaviour_with_reason(addr, 10, "oversized Addr") {
                        bail!("peer banned (oversized Addr)");
                    }
                    return Ok(());
                }
                if !self.peers.check_addr_rate_limit(&addr, entries.len()) {
                    warn!(%addr, count = entries.len(), "addr rate limit exceeded, dropping");
                    return Ok(());
                }
                let new_addrs: Vec<SocketAddr> =
                    entries.iter().map(|e| e.addr).collect();
                info!(%addr, count = new_addrs.len(), "recv Addr");
                self.peers.add_known_addrs(new_addrs);
            }

            // ── Keep-alive ──────────────────────────────────
            Message::Ping(nonce) => {
                tx.send(Message::Pong(nonce)).await?;
            }
            Message::Pong(_nonce) => { /* update latency tracking if needed */ }

            // ── Inventory ───────────────────────────────────
            Message::Inv(items) => {
                if items.len() > MAX_INV_SIZE {
                    warn!(%addr, count = items.len(), "oversized Inv message");
                    if self.peers.add_misbehaviour_with_reason(addr, 20, "oversized Inv") {
                        bail!("peer banned (oversized Inv)");
                    }
                    return Ok(());
                }
                // Request any items we don't already have
                let needed: Vec<InvItem> = items
                    .into_iter()
                    .filter(|i| match i.inv_type {
                        InvType::Block => self.state.get_block(&i.hash).is_none(),
                        InvType::Tx => !self.mempool.contains(&i.hash),
                    })
                    .collect();
                if !needed.is_empty() {
                    tx.send(Message::GetData(needed)).await?;
                }
            }
            Message::GetData(items) => {
                if items.len() > MAX_INV_SIZE {
                    warn!(%addr, count = items.len(), "oversized GetData message");
                    if self.peers.add_misbehaviour_with_reason(addr, 20, "oversized GetData") {
                        bail!("peer banned (oversized GetData)");
                    }
                    return Ok(());
                }
                for item in items {
                    match item.inv_type {
                        InvType::Block => {
                            if let Some(block) = self.state.get_block(&item.hash) {
                                tx.send(Message::BlockMsg(block)).await?;
                            } else {
                                tx.send(Message::NotFound(vec![item])).await?;
                            }
                        }
                        InvType::Tx => {
                            if let Some(txn) = self.mempool.get_transaction(&item.hash) {
                                tx.send(Message::TxMsg(txn)).await?;
                            } else {
                                tx.send(Message::NotFound(vec![item])).await?;
                            }
                        }
                    }
                }
            }
            Message::NotFound(_items) => {
                debug!(%addr, "peer reports NotFound");
            }

            // ── Block relay ─────────────────────────────────
            Message::GetHeaders { locator, stop_hash } => {
                // Find the starting point from the locator
                let start_height = locator
                    .iter()
                    .find_map(|h| self.state.get_block(h).map(|b| b.header.height))
                    .unwrap_or(0);
                let tip_height = self.state.get_height();
                let mut headers = Vec::new();
                for h in (start_height + 1)..=tip_height {
                    if let Some(hash) = self.state.get_block_hash(h) {
                        if let Some(block) = self.state.get_block(&hash) {
                            headers.push(block.header.clone());
                            if hash == stop_hash || headers.len() >= MAX_HEADERS_PER_MSG {
                                break;
                            }
                        }
                    }
                }
                tx.send(Message::Headers(headers)).await?;
            }
            Message::Headers(headers) => {
                if headers.is_empty() {
                    debug!(%addr, "recv empty Headers — sync complete");
                    if self.sync_state() == SyncState::HeaderSync {
                        self.set_sync_state(SyncState::Synced);
                        info!("IBD complete — entering normal relay mode");
                    }
                    return Ok(());
                }
                info!(%addr, count = headers.len(), "recv Headers");

                // Validate header chain connectivity
                let mut prev = self.state.get_tip();
                let mut request_hashes = Vec::new();
                for hdr in &headers {
                    if hdr.prev_hash != prev && self.state.get_block(&hdr.prev_hash).is_none() {
                        warn!(%addr, "header chain disconnect — ignoring batch");
                        if self.peers.add_misbehaviour(addr, 10) {
                            bail!("peer banned");
                        }
                        return Ok(());
                    }
                    let hash = hdr.hash();
                    if self.state.get_block(&hash).is_none() {
                        request_hashes.push(hash);
                    }
                    prev = hash;
                }

                // Request full blocks for headers we don't have
                if !request_hashes.is_empty() {
                    if self.sync_state() == SyncState::HeaderSync {
                        self.set_sync_state(SyncState::BlockSync);
                    }
                    let items: Vec<InvItem> = request_hashes
                        .iter()
                        .map(|h| InvItem { inv_type: InvType::Block, hash: *h })
                        .collect();
                    tx.send(Message::GetData(items)).await?;
                }

                // If we got a full batch, request more headers
                if headers.len() >= MAX_HEADERS_PER_MSG {
                    let last_hash = headers.last().unwrap().hash();
                    tx.send(Message::GetHeaders {
                        locator: vec![last_hash],
                        stop_hash: [0u8; 32],
                    })
                    .await?;
                }
            }
            Message::GetBlocks { locator, stop_hash } => {
                // Find the first locator hash we have, then send Inv
                let start_height = locator
                    .iter()
                    .find_map(|h| self.state.get_block(h).map(|b| b.header.height))
                    .unwrap_or(0);
                let tip_height = self.state.get_height();
                let mut inv = Vec::new();
                for h in (start_height + 1)..=tip_height {
                    if let Some(hash) = self.state.get_block_hash(h) {
                        inv.push(InvItem { inv_type: InvType::Block, hash });
                        if hash == stop_hash || inv.len() >= 500 {
                            break;
                        }
                    }
                }
                if !inv.is_empty() {
                    tx.send(Message::Inv(inv)).await?;
                }
            }
            Message::BlockMsg(block) => {
                let hash = block.hash();
                if self.state.get_block(&hash).is_some() {
                    return Ok(()); // duplicate
                }

                // PoW check: reject blocks that don't satisfy their own target.
                if !consensus::pow::verify_pow(&block.header) {
                    warn!(%addr, "rejected block with invalid PoW");
                    if self.peers.add_misbehaviour(addr, 100) {
                        bail!("peer banned (bad PoW)");
                    }
                    return Ok(());
                }

                match self.state.add_block(&block) {
                    Ok(()) => {
                        self.mempool.remove_block_transactions(&block);
                        info!(height = block.header.height, "accepted block from peer");
                        // Announce to peers: Headers if they requested it, Inv otherwise
                        self.announce_block(&block, addr).await;
                    }
                    Err(e) => {
                        warn!(%addr, err = %e, "rejected block from peer");
                        if self.peers.add_misbehaviour(addr, 20) {
                            bail!("peer banned");
                        }
                    }
                }
            }

            // ── Transaction relay ───────────────────────────
            Message::TxMsg(txn) => {
                // Block-relay-only peers do not participate in tx relay.
                if self.peers.is_block_relay_only(addr) {
                    return Ok(());
                }
                // During IBD, skip tx relay
                if self.is_ibd() {
                    return Ok(());
                }
                let txid = txn.txid();
                if self.mempool.contains(&txid) {
                    return Ok(());
                }
                // Validate before admitting
                match self.state.validate_transaction(&txn) {
                    Ok(()) => {}
                    Err(e) => {
                        // Check if the failure is due to missing inputs (orphan)
                        let err_msg = format!("{e}");
                        if err_msg.contains("input not found") || err_msg.contains("missing input") {
                            // Queue as orphan
                            let missing: Vec<[u8; 32]> = txn.inputs.iter()
                                .map(|i| i.prev_output.txid)
                                .collect();
                            self.mempool.add_orphan(txn, missing);
                            debug!(%addr, "queued orphan tx {}", hex::encode(txid));
                            return Ok(());
                        }
                        debug!(%addr, err = ?e, "rejected tx from peer");
                        if self.peers.add_misbehaviour(addr, 5) {
                            bail!("peer banned");
                        }
                        return Ok(());
                    }
                }
                // Compute real fee from UTXO set (consistent with RPC path).
                let fee = self.state.compute_tx_fee(&txn).unwrap_or(0);
                if let Err(e) = self.mempool.add_transaction_with_fee(txn, fee) {
                    debug!(%addr, err = %e, "mempool rejected tx");
                } else {
                    // Queue Inv for batched per-peer relay with Poisson-distributed trickle.
                    self.peers.queue_inv_relay(InvItem { inv_type: InvType::Tx, hash: txid }, *addr);

                    // Try to resolve orphan transactions that depend on this tx
                    self.process_orphans_for_tx(&txid).await;
                }
            }

            // ── Reject ──────────────────────────────────────
            Message::Reject { message, reason } => {
                warn!(%addr, %message, %reason, "peer sent Reject");
            }

            // ── BIP-152 Compact Block Relay ─────────────────
            Message::SendCmpct { announce, version } => {
                debug!(%addr, announce, version, "peer requests compact block relay");
                if version >= 1 && version <= 2 {
                    self.peers.set_cmpct(*addr, announce, version);
                    debug!(%addr, "compact block relay enabled for peer");
                }
            }
            Message::CmpctBlock(compact) => {
                let hash = compact.header.hash();
                if self.state.get_block(&hash).is_some() {
                    return Ok(()); // already have this block
                }

                // Build short-ID mempool index for reconstruction
                let key = chain::compact_blocks::CompactBlock::calculate_key(
                    &compact.header,
                    compact.nonce,
                );
                let mut short_id_map = std::collections::HashMap::new();
                for txid in self.mempool.get_txids() {
                    if let Some(txn) = self.mempool.get_transaction(&txid) {
                        let tx_bytes = bincode::serialize(&txn).unwrap_or_default();
                        let sid = chain::compact_blocks::CompactBlock::calculate_short_txid(
                            &tx_bytes, &key,
                        );
                        short_id_map.insert(sid, tx_bytes);
                    }
                }

                match compact.reconstruct(&short_id_map) {
                    Ok(_reconstructed) => {
                        info!(%addr, "compact block reconstructed successfully");
                        // Full block available — request via normal GetData
                        let items = vec![InvItem {
                            inv_type: InvType::Block,
                            hash,
                        }];
                        tx.send(Message::GetData(items)).await?;
                    }
                    Err(_) => {
                        // Request missing transactions
                        let missing = compact.get_missing_indices(&short_id_map);
                        if !missing.is_empty() {
                            tx.send(Message::GetBlockTxn(
                                chain::compact_blocks::GetBlockTransactions {
                                    blockhash: hash,
                                    indices: missing,
                                },
                            ))
                            .await?;
                        }
                    }
                }
            }
            Message::GetBlockTxn(req) => {
                if let Some(block) = self.state.get_block(&req.blockhash) {
                    let txs: Vec<Vec<u8>> = req
                        .indices
                        .iter()
                        .filter_map(|&idx| {
                            block
                                .transactions
                                .get(idx as usize)
                                .and_then(|t| bincode::serialize(t).ok())
                        })
                        .collect();
                    tx.send(Message::BlockTxn(chain::compact_blocks::BlockTransactions {
                        blockhash: req.blockhash,
                        transactions: txs,
                    }))
                    .await?;
                }
            }
            Message::BlockTxn(resp) => {
                debug!(%addr, blockhash = ?resp.blockhash, count = resp.transactions.len(),
                       "received blocktxn response");
                // After receiving missing transactions, request the full block
                // via normal GetData to keep the pipeline simple.
                if self.state.get_block(&resp.blockhash).is_none() {
                    let items = vec![InvItem {
                        inv_type: InvType::Block,
                        hash: resp.blockhash,
                    }];
                    tx.send(Message::GetData(items)).await?;
                }
            }

            // ── BIP-133 FeeFilter ───────────────────────────
            Message::FeeFilter(rate) => {
                debug!(%addr, rate, "peer set feefilter");
                self.peers.set_fee_filter(addr, rate);
            }

            // ── BIP-130 SendHeaders ─────────────────────────
            Message::SendHeaders => {
                debug!(%addr, "peer requests headers announcements");
                self.peers.set_send_headers(addr);
            }

            // ── BIP-339 WtxidRelay ──────────────────────────
            Message::WtxidRelay => {
                debug!(%addr, "peer signalled wtxid relay");
                self.peers.set_wtxid_relay(addr);
            }

            // ── BIP-155 AddrV2 ──────────────────────────────
            Message::SendAddrV2 => {
                debug!(%addr, "peer signalled addrv2 support");
            }
            Message::AddrV2(entries) => {
                // Block-relay-only peers do not participate in addr relay.
                if self.peers.is_block_relay_only(addr) {
                    return Ok(());
                }
                if !self.peers.check_addr_rate_limit(&addr, entries.len()) {
                    warn!(%addr, count = entries.len(), "addrv2 rate limit exceeded, dropping");
                    return Ok(());
                }
                debug!(%addr, count = entries.len(), "received addrv2");
                // Convert valid entries to SocketAddr and add to peer table
                let mut discovered = Vec::new();
                for entry in &entries {
                    if !entry.is_valid() {
                        continue;
                    }
                    let socket_addr = match entry.network_id {
                        message::NetworkId::Ipv4 if entry.addr.len() == 4 => {
                            let ip = std::net::Ipv4Addr::new(
                                entry.addr[0], entry.addr[1],
                                entry.addr[2], entry.addr[3],
                            );
                            std::net::SocketAddr::V4(
                                std::net::SocketAddrV4::new(ip, entry.port),
                            )
                        }
                        message::NetworkId::Ipv6 if entry.addr.len() == 16 => {
                            let mut octets = [0u8; 16];
                            octets.copy_from_slice(&entry.addr);
                            let ip = std::net::Ipv6Addr::from(octets);
                            std::net::SocketAddr::V6(
                                std::net::SocketAddrV6::new(ip, entry.port, 0, 0),
                            )
                        }
                        _ => continue, // skip Tor/I2P/CJDNS for now
                    };
                    debug!(%addr, peer = %socket_addr, "addrv2 discovered peer");
                    discovered.push(socket_addr);
                }
                if !discovered.is_empty() {
                    self.peers.add_known_addrs(discovered);
                }
            }
        }
        Ok(())
    }

    // ── Helpers ─────────────────────────────────────────────

    /// Announce a new block to all peers (except originator).
    /// Peers that signalled `SendHeaders` get a Headers message;
    /// others get an Inv message.
    async fn announce_block(&self, block: &Block, exclude: &SocketAddr) {
        let hash = block.hash();
        let ready = self.peers.ready_addrs();
        let senders = self.peers.senders_snapshot();
        for peer_addr in &ready {
            if peer_addr == exclude { continue; }
            let msg = if self.peers.wants_cmpct(peer_addr) {
                // BIP-152 high-bandwidth: send compact block directly
                let tx_bytes: Vec<Vec<u8>> = block.transactions.iter()
                    .filter_map(|t| bincode::serialize(t).ok())
                    .collect();
                match chain::compact_blocks::CompactBlock::new(
                    block.header.clone(), rand::random(), &tx_bytes, &[0],
                ) {
                    Ok(cmpct) => Message::CmpctBlock(cmpct),
                    Err(_) => Message::Inv(vec![InvItem { inv_type: InvType::Block, hash }]),
                }
            } else if self.peers.wants_headers(peer_addr) {
                Message::Headers(vec![block.header.clone()])
            } else {
                Message::Inv(vec![InvItem { inv_type: InvType::Block, hash }])
            };
            if let Some(sender) = senders.get(peer_addr) {
                let _ = sender.try_send(msg);
            }
        }
    }

    fn build_version(&self) -> Message {
        Message::Version(VersionPayload {
            version: PROTOCOL_VERSION,
            services: 0x01, // NODE_NETWORK
            timestamp: now_unix() as i64,
            start_height: self.state.get_height(),
            nonce: self.local_nonce,
            user_agent: USER_AGENT.to_string(),
        })
    }

    /// Current sync state.
    pub fn sync_state(&self) -> SyncState {
        *self.sync_state.read()
    }

    /// Whether we are in initial block download.
    pub fn is_ibd(&self) -> bool {
        self.sync_state() != SyncState::Synced
    }

    /// Try to resolve orphan transactions that depend on `parent_txid`.
    async fn process_orphans_for_tx(&self, parent_txid: &[u8; 32]) {
        let orphans = self.mempool.orphans_for_parent(parent_txid);
        for orphan_tx in orphans {
            let orphan_txid = orphan_tx.txid();
            if self.mempool.contains(&orphan_txid) {
                self.mempool.remove_orphan(&orphan_txid);
                continue;
            }
            if self.state.validate_transaction(&orphan_tx).is_ok() {
                let fee = self.state.compute_tx_fee(&orphan_tx).unwrap_or(0);
                self.mempool.remove_orphan(&orphan_txid);
                if self.mempool.add_transaction_with_fee(orphan_tx, fee).is_ok() {
                    info!("resolved orphan tx {}", hex::encode(orphan_txid));
                    // Relay the newly-admitted orphan
                    let inv = vec![InvItem { inv_type: InvType::Tx, hash: orphan_txid }];
                    let msg = Message::Inv(inv);
                    self.peers.broadcast(&msg, None).await;
                    // Recursively process orphans that depend on this one
                    Box::pin(self.process_orphans_for_tx(&orphan_txid)).await;
                }
            }
        }
    }

    /// Transition to the next sync state.
    fn set_sync_state(&self, s: SyncState) {
        *self.sync_state.write() = s;
    }

    /// Build a block locator (exponentially spaced hashes from tip
    /// back to genesis) used in GetHeaders / GetBlocks.
    fn build_locator(&self) -> Vec<[u8; 32]> {
        let mut locator = Vec::new();
        let height = self.state.get_height();
        let mut step = 1u64;
        let mut h = height;
        loop {
            if let Some(hash) = self.state.get_block_hash(h) {
                locator.push(hash);
            }
            if h == 0 {
                break;
            }
            h = h.saturating_sub(step);
            // Exponential back-off after the first 10 entries
            if locator.len() >= 10 {
                step *= 2;
            }
        }
        locator
    }
}

// ── Wire I/O helpers (outside impl) ─────────────────────────────

/// Write a length-prefixed message to a TCP stream using per-network magic.
async fn write_message(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    msg: &Message,
    magic: [u8; 4],
) -> Result<()> {
    let frame = message::encode_for_network(msg, magic)?;
    writer.write_all(&frame).await?;
    Ok(())
}

/// Read one length-prefixed message from a TCP stream, verifying per-network magic.
async fn read_message(
    reader: &mut tokio::net::tcp::OwnedReadHalf,
    expected_magic: [u8; 4],
) -> Result<Message> {
    // Read magic
    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic).await?;
    if magic != expected_magic {
        bail!("bad magic: {:02x?}", magic);
    }

    // Read length
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf);
    if len > MAX_MESSAGE_SIZE {
        bail!("message too large: {len} bytes");
    }

    // Read checksum
    let mut cksum_buf = [0u8; 4];
    reader.read_exact(&mut cksum_buf).await?;

    // Read payload
    let mut payload = vec![0u8; len as usize];
    reader.read_exact(&mut payload).await?;

    // Verify checksum
    let expected = message::payload_checksum(&payload);
    if cksum_buf != expected {
        bail!("checksum mismatch");
    }

    let msg = message::decode(&payload)?;
    Ok(msg)
}

// ── Seed resolution ─────────────────────────────────────────────

/// Resolve DNS seeds and hard-coded seed nodes into socket addresses.
async fn resolve_seeds(network: testnet::Network) -> Vec<SocketAddr> {
    let port = network.default_port();
    let mut addrs = Vec::new();

    // Hard-coded seeds (try to resolve hostname:port)
    for seed in testnet::seed_nodes(network) {
        match tokio::net::lookup_host(seed).await {
            Ok(resolved) => addrs.extend(resolved),
            Err(e) => debug!(seed, err = %e, "seed node lookup failed"),
        }
    }

    // DNS seeds (resolve hostname, append default port)
    for seed in testnet::dns_seeds(network) {
        let host_port = format!("{seed}:{port}");
        match tokio::net::lookup_host(&host_port).await {
            Ok(resolved) => addrs.extend(resolved),
            Err(e) => debug!(seed, err = %e, "DNS seed lookup failed"),
        };
    }

    addrs
}

/// Map config Network to testnet crate Network.
fn to_testnet_network(n: Network) -> testnet::Network {
    match n {
        Network::Testnet => testnet::Network::Testnet,
        Network::Regtest => testnet::Network::Regtest,
        _ => testnet::Network::Mainnet,
    }
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use tempfile::tempdir;
    use tokio::net::TcpListener;

    fn test_config(dir: &std::path::Path, p2p_port: u16) -> Config {
        Config {
            data_dir: dir.to_path_buf(),
            p2p_addr: format!("127.0.0.1:{p2p_port}"),
            network: Network::Regtest,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn version_handshake_between_two_nodes() {
        // Pick two free ports
        let l1 = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let l2 = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port1 = l1.local_addr().unwrap().port();
        let port2 = l2.local_addr().unwrap().port();
        drop(l1);
        drop(l2);

        let dir1 = tempdir().unwrap();
        let dir2 = tempdir().unwrap();

        let cfg1 = test_config(dir1.path(), port1);
        let cfg2 = test_config(dir2.path(), port2);

        let state1 = NodeState::new(cfg1.clone()).unwrap();
        let state2 = NodeState::new(cfg2.clone()).unwrap();

        let mp1 = Arc::new(Mempool::new(1_000_000));
        let mp2 = Arc::new(Mempool::new(1_000_000));

        let srv1 = Arc::new(P2PServer::new(cfg1, state1, mp1));
        let srv2 = Arc::new(P2PServer::new(cfg2, state2, mp2));

        // Start both servers
        Arc::clone(&srv1).start().await.unwrap();
        Arc::clone(&srv2).start().await.unwrap();

        // Seed srv2 with srv1's address so it connects
        let addr1: SocketAddr = format!("127.0.0.1:{port1}").parse().unwrap();
        srv2.peers().add_known_addrs(vec![addr1]);

        // Trigger an outbound connection from srv2
        let srv2c = Arc::clone(&srv2);
        tokio::spawn(async move {
            let _ = srv2c.connect_outbound(addr1).await;
        });

        // Wait a moment for handshake
        tokio::time::sleep(Duration::from_millis(500)).await;

        // srv1 should see an inbound peer
        assert!(
            srv1.peers().total() >= 1,
            "srv1 should have at least 1 peer, got {}",
            srv1.peers().total(),
        );
    }

    #[tokio::test]
    async fn message_roundtrip_on_tcp() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let magic = super::message::NETWORK_MAGIC;

        // Spawn a sender
        let handle = tokio::spawn(async move {
            let stream = TcpStream::connect(addr).await.unwrap();
            let (_, mut writer) = stream.into_split();
            let msg = Message::Ping(12345);
            write_message(&mut writer, &msg, magic).await.unwrap();
        });

        // Accept and read
        let (stream, _) = listener.accept().await.unwrap();
        let (mut reader, _) = stream.into_split();
        let msg = read_message(&mut reader, magic).await.unwrap();

        match msg {
            Message::Ping(n) => assert_eq!(n, 12345),
            other => panic!("expected Ping, got {other:?}"),
        }

        handle.await.unwrap();
    }

    #[test]
    fn to_testnet_network_mapping() {
        assert!(matches!(
            to_testnet_network(Network::Mainnet),
            testnet::Network::Mainnet
        ));
        assert!(matches!(
            to_testnet_network(Network::Testnet),
            testnet::Network::Testnet
        ));
        assert!(matches!(
            to_testnet_network(Network::Regtest),
            testnet::Network::Regtest
        ));
    }

    /// Helper: build a chain of `n` coinbase-only blocks on top of genesis.
    fn build_chain(state: &Arc<NodeState>, n: usize) {
        use chain::{Block as CBlock, BlockHeader as BH};
        use tx::Transaction;
        // Use regtest-level difficulty so mining is near-instant.
        let bits = 0x207fffffu32;
        let target = consensus::difficulty::bits_to_target(bits);
        for i in 1..=n {
            let tip = state.get_tip();
            let coinbase =
                Transaction::new_coinbase(i as u64, 50 * 100_000_000, vec![i as u8]);
            let merkle =
                CBlock::calculate_merkle_root(std::slice::from_ref(&coinbase));
            // Use timestamps after genesis (1706832000) so BIP-113 MTP check passes.
            let mut header = BH::new(tip, merkle, 1706832000 + i as u64, bits, 0);
            header.height = i as u64;
            // Mine: increment nonce until PoW is satisfied
            while header.hash() > target {
                header.nonce += 1;
            }
            let block = CBlock::new(header, vec![coinbase]);
            state.add_block(&block).expect("block should be accepted");
        }
    }

    #[test]
    fn build_locator_genesis_only() {
        let dir = tempdir().unwrap();
        let cfg = test_config(dir.path(), 0);
        let state = NodeState::new(cfg.clone()).unwrap();
        let mp = Arc::new(crate::mempool::Mempool::new(1_000_000));
        let srv = P2PServer::new(cfg, state.clone(), mp);

        let locator = srv.build_locator();
        // At height 0, locator should contain exactly the genesis hash
        assert_eq!(locator.len(), 1);
        assert_eq!(locator[0], state.get_tip());
    }

    #[test]
    fn build_locator_grows_exponentially() {
        let dir = tempdir().unwrap();
        let cfg = test_config(dir.path(), 0);
        let state = NodeState::new(cfg.clone()).unwrap();
        build_chain(&state, 50);
        assert_eq!(state.get_height(), 50);

        let mp = Arc::new(crate::mempool::Mempool::new(1_000_000));
        let srv = P2PServer::new(cfg, state.clone(), mp);

        let locator = srv.build_locator();
        // Should contain tip (height 50) and end with genesis (height 0)
        assert_eq!(locator.first().unwrap(), &state.get_tip());
        let genesis = state.get_block_hash(0).unwrap();
        assert_eq!(locator.last().unwrap(), &genesis);
        // With 50 blocks: first 10 dense + exponential tail ⇒ well under 50
        assert!(
            locator.len() < 25,
            "locator should use exponential steps, got {} entries",
            locator.len(),
        );
    }

    #[tokio::test]
    async fn headers_first_sync_between_nodes() {
        // Node A has 5 blocks; Node B has only genesis.
        // After handshake, B should send GetHeaders and A should reply with headers.
        let l1 = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let l2 = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port_a = l1.local_addr().unwrap().port();
        let port_b = l2.local_addr().unwrap().port();
        drop(l1);
        drop(l2);

        let dir_a = tempdir().unwrap();
        let dir_b = tempdir().unwrap();

        let cfg_a = test_config(dir_a.path(), port_a);
        let cfg_b = test_config(dir_b.path(), port_b);

        let state_a = NodeState::new(cfg_a.clone()).unwrap();
        let state_b = NodeState::new(cfg_b.clone()).unwrap();

        // Build 5 blocks on node A
        build_chain(&state_a, 5);
        assert_eq!(state_a.get_height(), 5);
        assert_eq!(state_b.get_height(), 0);

        let mp_a = Arc::new(crate::mempool::Mempool::new(1_000_000));
        let mp_b = Arc::new(crate::mempool::Mempool::new(1_000_000));

        let srv_a = Arc::new(P2PServer::new(cfg_a, state_a.clone(), mp_a));
        let srv_b = Arc::new(P2PServer::new(cfg_b, state_b.clone(), mp_b));

        // Start both servers
        Arc::clone(&srv_a).start().await.unwrap();
        Arc::clone(&srv_b).start().await.unwrap();

        // Connect B → A
        let addr_a: SocketAddr = format!("127.0.0.1:{port_a}").parse().unwrap();
        let srv_b_c = Arc::clone(&srv_b);
        tokio::spawn(async move {
            let _ = srv_b_c.connect_outbound(addr_a).await;
        });

        // Give time for handshake + headers exchange + block download
        tokio::time::sleep(Duration::from_secs(6)).await;

        // Node B should have synced some blocks from A via headers-first
        // (it requests headers, gets them, then requests blocks via GetData)
        assert!(
            state_b.get_height() >= 1,
            "node B should have synced at least 1 block, got height={}",
            state_b.get_height(),
        );
    }
}
