//! REST/RPC API server
//!
//! Provides HTTP endpoints for querying blockchain state and submitting
//! transactions, plus a JSON-RPC endpoint for miners (getblocktemplate,
//! submitblock, getblockcount).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    middleware,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::mempool::Mempool;
use crate::network::peer::{Direction, PeerManager};
use crate::state::NodeState;

/// A loaded wallet with its in-memory state and optional passphrase unlock.
pub struct LoadedWallet {
    pub name: String,
    pub wallet: tx::wallet::WalletFile,
    /// If the wallet was encrypted on disk the user must call `walletpassphrase`
    /// to set this. While `None`, signing operations are refused.
    pub passphrase_until: Option<std::time::Instant>,
    /// Whether this wallet was encrypted on disk (requires unlock for signing).
    pub encrypted: bool,
    /// The password used to decrypt this wallet (needed for re-saving).
    pub password: Option<String>,
}

impl LoadedWallet {
    fn prune_private_descriptors(&mut self) {
        self.wallet.descriptors.retain(|desc| {
            let lower = desc.to_ascii_lowercase();
            !lower.contains("xprv") && !lower.contains("tprv")
        });
    }

    pub fn lock_sensitive_state(&mut self) {
        self.passphrase_until = None;
        self.password = None;
        if self.encrypted {
            self.wallet.private_keys.clear();
            self.wallet.mnemonic = None;
            self.prune_private_descriptors();
        }
    }

    pub fn refresh_lock_state(&mut self) {
        if self.encrypted
            && self.passphrase_until
                .map(|t| t <= std::time::Instant::now())
                .unwrap_or(true)
        {
            self.lock_sensitive_state();
        }
    }

    /// Returns true if the wallet is unlocked for signing operations.
    /// Unencrypted wallets are always considered unlocked.
    pub fn is_unlocked(&self) -> bool {
        if !self.encrypted {
            return true;
        }
        self.passphrase_until
            .map(|t| t > std::time::Instant::now())
            .unwrap_or(false)
    }
}

/// Shared application state for axum handlers
pub struct AppState {
    pub node: Arc<NodeState>,
    pub mempool: Arc<Mempool>,
    /// Optional — set when the P2P server is running.
    pub peers: Option<Arc<PeerManager>>,
    /// Instant when the node was started (for `uptime` RPC).
    pub start_time: std::time::Instant,
    /// Notifier for longpoll — fires when a new block arrives or the
    /// mempool changes significantly.
    pub template_notify: Arc<tokio::sync::Notify>,
    /// Wallet manager (backed by data_dir/wallets/).
    pub wallet_mgr: Option<tx::wallet::WalletManager>,
    /// Currently loaded wallet (at most one at a time).
    pub loaded_wallet: parking_lot::Mutex<Option<LoadedWallet>>,
    /// API keys authorized to call protected endpoints.
    /// Empty means authentication is disabled (open access).
    pub api_keys: Vec<String>,
}

// ── Response types ──────────────────────────────────────────────

/// Node information
#[derive(Serialize, Deserialize)]
pub struct InfoResponse {
    pub version: String,
    pub height: u64,
    pub tip: String,
    pub mempool_size: usize,
    pub network: String,
}

/// Block response
#[derive(Serialize, Deserialize)]
pub struct BlockResponse {
    pub hash: String,
    pub height: u64,
    pub prev_hash: String,
    pub timestamp: u64,
    pub bits: u32,
    pub nonce: u64,
    pub tx_count: usize,
}

/// Balance response
#[derive(Serialize)]
pub struct BalanceResponse {
    pub address: String,
    pub balance: u64,
}

/// Transaction submission request
#[derive(Deserialize)]
pub struct SubmitTxRequest {
    /// Hex-encoded serialized transaction
    pub tx_hex: String,
}

/// Transaction submission response
#[derive(Serialize)]
pub struct SubmitTxResponse {
    pub accepted: bool,
    pub txid: Option<String>,
    pub error: Option<String>,
}

/// Mempool overview
#[derive(Serialize, Deserialize)]
pub struct MempoolResponse {
    pub count: usize,
    pub txids: Vec<String>,
}

/// Peer information
#[derive(Serialize, Deserialize)]
pub struct PeerResponse {
    pub addr: String,
    pub direction: String,
    pub handshake: String,
    pub user_agent: Option<String>,
    pub start_height: Option<u64>,
    pub connected_secs: u64,
}

/// Peer list overview
#[derive(Serialize, Deserialize)]
pub struct PeersResponse {
    pub total: usize,
    pub inbound: usize,
    pub outbound: usize,
    pub peers: Vec<PeerResponse>,
}

/// Transaction detail response
#[derive(Serialize, Deserialize)]
pub struct TxResponse {
    pub txid: String,
    pub inputs: usize,
    pub outputs: usize,
    pub version: u32,
    pub lock_time: u32,
    pub in_mempool: bool,
    pub block_height: Option<u64>,
}

/// Health check response
#[derive(Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub height: u64,
    pub peers: usize,
}

/// Generic error body
#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

/// Single transaction entry in address history
#[derive(Serialize, Deserialize)]
pub struct AddressTxEntry {
    pub txid: String,
    pub block_height: u64,
    pub block_hash: String,
    pub inputs: usize,
    pub outputs: usize,
    /// Total value sent to this address in this transaction (satoshis)
    pub value_received: u64,
}

/// Merkle inclusion proof for a transaction
#[derive(Serialize, Deserialize)]
pub struct TxProofResponse {
    pub txid: String,
    pub block_hash: String,
    pub block_height: u64,
    /// Sibling hashes along the merkle path from leaf to root (hex-encoded, left-to-right per level)
    pub merkle_path: Vec<String>,
    /// 0-based index of this transaction in the block
    pub position: u32,
}

/// Pagination query parameters for collection endpoints
#[derive(Deserialize)]
pub struct PaginationParams {
    #[serde(default = "default_page_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_page_limit() -> usize {
    50
}

// ── Router ──────────────────────────────────────────────────────

/// API-key authentication middleware.
///
/// Passes through unconditionally when `AppState::api_keys` is empty.
/// Otherwise, requires `Authorization: Bearer <key>` with a known key.
async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    if state.api_keys.is_empty() {
        return next.run(req).await;
    }
    let key = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if state.api_keys.iter().any(|k| constant_time_eq::constant_time_eq(k.as_bytes(), key.as_bytes())) {
        next.run(req).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorBody {
                error: "unauthorized: Authorization: Bearer <api-key> header required".into(),
            }),
        )
            .into_response()
    }
}

/// Create the API router
pub fn create_router(state: Arc<AppState>) -> Router {
    // Public routes — no authentication required
    let public = Router::new()
        .route("/api/health", get(get_health))
        .route("/metrics", get(get_metrics));

    // Protected routes — require a valid API key when api_keys is non-empty
    let protected = Router::new()
        .route("/api/info", get(get_info))
        .route("/api/block/{hash}", get(get_block))
        .route("/api/block-by-height/{height}", get(get_block_by_height))
        .route("/api/balance/{address}", get(get_balance))
        .route("/api/tx", post(submit_tx))
        .route("/api/tx/{txid}", get(get_tx))
        .route("/api/tx/{txid}/proof", get(get_tx_proof))
        .route("/api/address/{address}/txs", get(get_address_txs))
        .route("/api/mempool", get(get_mempool))
        .route("/api/peers", get(get_peers))
        // JSON-RPC endpoint (for miners) — supports single & batch
        .route("/", post(jsonrpc_batch_or_single))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    Router::new()
        .merge(public)
        .merge(protected)
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Start the RPC server
pub async fn serve(addr: SocketAddr, state: Arc<AppState>) -> anyhow::Result<()> {
    let app = create_router(state);
    tracing::info!("RPC server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ── Handlers ────────────────────────────────────────────────────

async fn get_info(State(state): State<Arc<AppState>>) -> Json<InfoResponse> {
    Json(InfoResponse {
        version: env!("CARGO_PKG_VERSION").to_string(),
        height: state.node.get_height(),
        tip: hex::encode(state.node.get_tip()),
        mempool_size: state.mempool.count(),
        network: format!("{:?}", state.node.network()),
    })
}

async fn get_block(
    State(state): State<Arc<AppState>>,
    Path(hash_hex): Path<String>,
) -> Result<Json<BlockResponse>, (StatusCode, Json<ErrorBody>)> {
    let hash_bytes = hex::decode(&hash_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "invalid hex hash".into() }),
        )
    })?;
    if hash_bytes.len() != 32 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "hash must be 32 bytes".into() }),
        ));
    }
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&hash_bytes);

    let block = state.node.get_block(&hash).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorBody { error: "block not found".into() }),
        )
    })?;

    Ok(Json(BlockResponse {
        hash: hex::encode(block.hash()),
        height: block.header.height,
        prev_hash: hex::encode(block.header.prev_hash),
        timestamp: block.header.timestamp,
        bits: block.header.bits,
        nonce: block.header.nonce,
        tx_count: block.transactions.len(),
    }))
}

async fn get_block_by_height(
    State(state): State<Arc<AppState>>,
    Path(height): Path<u64>,
) -> Result<Json<BlockResponse>, (StatusCode, Json<ErrorBody>)> {
    let hash = state.node.get_block_hash(height).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorBody { error: "height not found".into() }),
        )
    })?;
    let block = state.node.get_block(&hash).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorBody { error: "block not found".into() }),
        )
    })?;

    Ok(Json(BlockResponse {
        hash: hex::encode(block.hash()),
        height: block.header.height,
        prev_hash: hex::encode(block.header.prev_hash),
        timestamp: block.header.timestamp,
        bits: block.header.bits,
        nonce: block.header.nonce,
        tx_count: block.transactions.len(),
    }))
}

async fn get_balance(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Result<Json<BalanceResponse>, (StatusCode, Json<ErrorBody>)> {
    let balance = state.node.get_balance(&address).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "invalid address".into() }),
        )
    })?;
    Ok(Json(BalanceResponse { address, balance }))
}

async fn submit_tx(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SubmitTxRequest>,
) -> Result<Json<SubmitTxResponse>, (StatusCode, Json<ErrorBody>)> {
    let tx_bytes = hex::decode(&req.tx_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "invalid hex".into() }),
        )
    })?;

    let tx: tx::Transaction = bincode::deserialize(&tx_bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: format!("failed to deserialize tx: {}", e),
            }),
        )
    })?;

    let txid = tx.txid();

    // Validate against consensus rules and current UTXO set
    if let Err(e) = state.node.validate_transaction(&tx) {
        return Ok(Json(SubmitTxResponse {
            accepted: false,
            txid: None,
            error: Some(format!("validation failed: {}", e)),
        }));
    }

    // Compute fee from UTXO values (sum of inputs - sum of outputs)
    let fee = {
        let utxo_set = state.node.utxo_set();
        let input_sum: u64 = tx.inputs.iter().filter_map(|inp| {
            utxo_set.get_utxo(&inp.prev_output).map(|u| u.output.value)
        }).sum();
        let output_sum: u64 = tx.outputs.iter().map(|o| o.value).sum();
        input_sum.saturating_sub(output_sum)
    };

    match state.mempool.add_transaction_with_fee(tx, fee) {
        Ok(()) => Ok(Json(SubmitTxResponse {
            accepted: true,
            txid: Some(hex::encode(txid)),
            error: None,
        })),
        Err(e) => Ok(Json(SubmitTxResponse {
            accepted: false,
            txid: None,
            error: Some(e.to_string()),
        })),
    }
}

async fn get_mempool(
    State(state): State<Arc<AppState>>,
    Query(pagination): Query<PaginationParams>,
) -> Json<MempoolResponse> {
    let all_txids = state.mempool.get_txids();
    let count = all_txids.len();
    let page_txids: Vec<String> = all_txids
        .iter()
        .skip(pagination.offset)
        .take(pagination.limit)
        .map(hex::encode)
        .collect();
    Json(MempoolResponse {
        count,
        txids: page_txids,
    })
}

async fn get_peers(State(state): State<Arc<AppState>>) -> Json<PeersResponse> {
    let Some(pm) = state.peers.as_ref() else {
        return Json(PeersResponse {
            total: 0,
            inbound: 0,
            outbound: 0,
            peers: vec![],
        });
    };

    let summaries = pm.peer_summaries();
    let inbound = summaries
        .iter()
        .filter(|s| s.direction == Direction::Inbound)
        .count();
    let total = summaries.len();
    let peers = summaries
        .into_iter()
        .map(|s| PeerResponse {
            addr: s.addr.to_string(),
            direction: format!("{:?}", s.direction),
            handshake: format!("{:?}", s.handshake),
            user_agent: s.user_agent,
            start_height: s.start_height,
            connected_secs: s.connected_secs,
        })
        .collect();

    Json(PeersResponse {
        total,
        inbound,
        outbound: total - inbound,
        peers,
    })
}

// ── Prometheus metrics ──────────────────────────────────────────

/// Expose Prometheus-compatible metrics in text exposition format
async fn get_metrics(State(state): State<Arc<AppState>>) -> (StatusCode, [(axum::http::header::HeaderName, &'static str); 1], String) {
    let height = state.node.get_height();
    let mempool_size = state.mempool.count();
    let mempool_bytes = state.mempool.size_bytes();
    let utxo_count = state.node.utxo_set().len();

    // Peer counts
    let (total_peers, inbound_peers, outbound_peers) = if let Some(pm) = state.peers.as_ref() {
        let summaries = pm.peer_summaries();
        let ib = summaries.iter().filter(|s| s.direction == Direction::Inbound).count();
        let tot = summaries.len();
        (tot, ib, tot - ib)
    } else {
        (0, 0, 0)
    };

    // Difficulty from current tip
    let difficulty_bits = state.node.calculate_next_bits(height + 1);

    // Block reward at current height
    let net = match state.node.network() {
        crate::config::Network::Testnet => testnet::Network::Testnet,
        crate::config::Network::Regtest => testnet::Network::Regtest,
        _ => testnet::Network::Mainnet,
    };
    let params = testnet::NetworkParams::for_network(net);
    let block_reward = params.block_reward(height + 1);

    let body = format!(
        "# HELP kubercoin_block_height Current blockchain tip height\n\
         # TYPE kubercoin_block_height gauge\n\
         kubercoin_block_height {height}\n\
         # HELP kubercoin_peers Total connected peers\n\
         # TYPE kubercoin_peers gauge\n\
         kubercoin_peers {total_peers}\n\
         # HELP kubercoin_peers_inbound Inbound peer connections\n\
         # TYPE kubercoin_peers_inbound gauge\n\
         kubercoin_peers_inbound {inbound_peers}\n\
         # HELP kubercoin_peers_outbound Outbound peer connections\n\
         # TYPE kubercoin_peers_outbound gauge\n\
         kubercoin_peers_outbound {outbound_peers}\n\
         # HELP kubercoin_mempool_size Number of transactions in mempool\n\
         # TYPE kubercoin_mempool_size gauge\n\
         kubercoin_mempool_size {mempool_size}\n\
         # HELP kubercoin_mempool_bytes Total bytes of transactions in mempool\n\
         # TYPE kubercoin_mempool_bytes gauge\n\
         kubercoin_mempool_bytes {mempool_bytes}\n\
         # HELP kubercoin_utxo_count Total number of unspent transaction outputs\n\
         # TYPE kubercoin_utxo_count gauge\n\
         kubercoin_utxo_count {utxo_count}\n\
         # HELP kubercoin_difficulty Current difficulty bits (compact)\n\
         # TYPE kubercoin_difficulty gauge\n\
         kubercoin_difficulty {difficulty_bits}\n\
         # HELP kubercoin_block_reward Current block reward in satoshis\n\
         # TYPE kubercoin_block_reward gauge\n\
         kubercoin_block_reward {block_reward}\n",
    );

    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}

async fn get_tx(
    State(state): State<Arc<AppState>>,
    Path(txid_hex): Path<String>,
) -> Result<Json<TxResponse>, (StatusCode, Json<ErrorBody>)> {
    let txid_bytes = hex::decode(&txid_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "invalid hex txid".into() }),
        )
    })?;
    if txid_bytes.len() != 32 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "txid must be 32 bytes".into() }),
        ));
    }
    let mut txid = [0u8; 32];
    txid.copy_from_slice(&txid_bytes);

    // Check mempool first
    if let Some(tx) = state.mempool.get_transaction(&txid) {
        return Ok(Json(TxResponse {
            txid: txid_hex,
            inputs: tx.inputs.len(),
            outputs: tx.outputs.len(),
            version: tx.version,
            lock_time: tx.lock_time,
            in_mempool: true,
            block_height: None,
        }));
    }

    // Use tx_index for O(1) confirmed-tx lookup; fall back to linear scan on
    // fresh nodes whose index is still empty (e.g. no blocks yet confirmed).
    let found_height = state.node.get_tx_height(&txid).or_else(|| {
        let tip = state.node.get_height();
        for h in (0..=tip).rev() {
            if let Some(bhash) = state.node.get_block_hash(h) {
                if let Some(block) = state.node.get_block(&bhash) {
                    if block.transactions.iter().any(|t| t.txid() == txid) {
                        return Some(h);
                    }
                }
            }
        }
        None
    });
    if let Some(block_height) = found_height {
        if let Some(bhash) = state.node.get_block_hash(block_height) {
            if let Some(block) = state.node.get_block(&bhash) {
                for tx in &block.transactions {
                    if tx.txid() == txid {
                        return Ok(Json(TxResponse {
                            txid: txid_hex,
                            inputs: tx.inputs.len(),
                            outputs: tx.outputs.len(),
                            version: tx.version,
                            lock_time: tx.lock_time,
                            in_mempool: false,
                            block_height: Some(block_height),
                        }));
                    }
                }
            }
        }
    }

    Err((
        StatusCode::NOT_FOUND,
        Json(ErrorBody { error: "transaction not found".into() }),
    ))
}

async fn get_address_txs(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<Vec<AddressTxEntry>>, (StatusCode, Json<ErrorBody>)> {
    let script_pubkey = tx::Address::decode(&address)
        .map(|a| a.to_script_pubkey())
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorBody { error: "invalid address".into() }),
            )
        })?;

    let mut entries = Vec::new();
    let indexed_txids = state.node.get_txids_for_script(&script_pubkey);
    if !indexed_txids.is_empty() {
        // Fast path: use script_pubkey_index for O(1) per tx
        for txid in &indexed_txids {
            if let Some(h) = state.node.get_tx_height(txid) {
                if let Some(bhash) = state.node.get_block_hash(h) {
                    if let Some(block) = state.node.get_block(&bhash) {
                        let block_hash_hex = hex::encode(bhash);
                        for tx in &block.transactions {
                            if tx.txid() == *txid {
                                let value_received: u64 = tx
                                    .outputs
                                    .iter()
                                    .filter(|o| o.script_pubkey == script_pubkey)
                                    .map(|o| o.value)
                                    .sum();
                                entries.push(AddressTxEntry {
                                    txid: hex::encode(txid),
                                    block_height: h,
                                    block_hash: block_hash_hex,
                                    inputs: tx.inputs.len(),
                                    outputs: tx.outputs.len(),
                                    value_received,
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }
    } else {
        // Fallback: linear scan for fresh nodes with empty index
        let chain_height = state.node.get_height();
        for h in 0..=chain_height {
            if let Some(bhash) = state.node.get_block_hash(h) {
                if let Some(block) = state.node.get_block(&bhash) {
                    let block_hash_hex = hex::encode(bhash);
                    for tx in &block.transactions {
                        let value_received: u64 = tx
                            .outputs
                            .iter()
                            .filter(|o| o.script_pubkey == script_pubkey)
                            .map(|o| o.value)
                            .sum();
                        if value_received > 0 {
                            entries.push(AddressTxEntry {
                                txid: hex::encode(tx.txid()),
                                block_height: h,
                                block_hash: block_hash_hex.clone(),
                                inputs: tx.inputs.len(),
                                outputs: tx.outputs.len(),
                                value_received,
                            });
                        }
                    }
                }
            }
        }
    }

    let page: Vec<AddressTxEntry> = entries
        .into_iter()
        .skip(pagination.offset)
        .take(pagination.limit)
        .collect();
    Ok(Json(page))
}

/// Build a Bitcoin-style merkle inclusion proof.
///
/// Returns the sibling hashes at each level and the leaf position.
fn build_merkle_proof(txids: &[[u8; 32]], position: usize) -> Vec<[u8; 32]> {
    use sha2::{Digest, Sha256};

    if txids.len() <= 1 {
        return vec![];
    }

    let mut hashes = txids.to_vec();
    let mut proof = Vec::new();
    let mut pos = position;

    while hashes.len() > 1 {
        // Capture sibling before collapsing this level
        let sibling_pos = if pos % 2 == 0 {
            // Even index — sibling is to the right; duplicate if no right sibling
            (pos + 1).min(hashes.len() - 1)
        } else {
            pos - 1
        };
        proof.push(hashes[sibling_pos]);

        // Compute next level using double-SHA256 pairs (same as calculate_merkle_root)
        let mut next_level = Vec::new();
        for chunk in hashes.chunks(2) {
            let combined: [u8; 32] = if chunk.len() == 2 {
                let mut data = Vec::with_capacity(64);
                data.extend_from_slice(&chunk[0]);
                data.extend_from_slice(&chunk[1]);
                Sha256::digest(Sha256::digest(&data)).into()
            } else {
                let mut data = Vec::with_capacity(64);
                data.extend_from_slice(&chunk[0]);
                data.extend_from_slice(&chunk[0]);
                Sha256::digest(Sha256::digest(&data)).into()
            };
            next_level.push(combined);
        }

        pos /= 2;
        hashes = next_level;
    }

    proof
}

async fn get_tx_proof(
    State(state): State<Arc<AppState>>,
    Path(txid_hex): Path<String>,
) -> Result<Json<TxProofResponse>, (StatusCode, Json<ErrorBody>)> {
    let txid_bytes = hex::decode(&txid_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "invalid hex txid".into() }),
        )
    })?;
    if txid_bytes.len() != 32 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: "txid must be 32 bytes".into() }),
        ));
    }
    let mut txid = [0u8; 32];
    txid.copy_from_slice(&txid_bytes);

    let height = state.node.get_height();
    for h in (0..=height).rev() {
        if let Some(bhash) = state.node.get_block_hash(h) {
            if let Some(block) = state.node.get_block(&bhash) {
                let txids: Vec<[u8; 32]> = block.transactions.iter().map(|t| t.txid()).collect();
                if let Some(pos) = txids.iter().position(|id| *id == txid) {
                    let merkle_path = build_merkle_proof(&txids, pos)
                        .into_iter()
                        .map(|h| hex::encode(h))
                        .collect();
                    return Ok(Json(TxProofResponse {
                        txid: txid_hex,
                        block_hash: hex::encode(bhash),
                        block_height: h,
                        merkle_path,
                        position: pos as u32,
                    }));
                }
            }
        }
    }

    Err((
        StatusCode::NOT_FOUND,
        Json(ErrorBody { error: "transaction not found".into() }),
    ))
}

async fn get_health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let peer_count = state
        .peers
        .as_ref()
        .map(|pm| pm.total())
        .unwrap_or(0);
    Json(HealthResponse {
        status: "ok".to_string(),
        height: state.node.get_height(),
        peers: peer_count,
    })
}

// ── JSON-RPC (mining & query) ───────────────────────────────────

#[derive(Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    method: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
    id: serde_json::Value,
}

#[derive(Serialize)]
pub(crate) struct JsonRpcResponse {
    jsonrpc: &'static str,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
    id: serde_json::Value,
}

#[derive(Serialize)]
pub(crate) struct JsonRpcError {
    code: i32,
    message: String,
}

impl JsonRpcResponse {
    pub(crate) fn ok(id: serde_json::Value, result: serde_json::Value) -> Self {
        Self { jsonrpc: "2.0", result: Some(result), error: None, id }
    }
    pub(crate) fn err(id: serde_json::Value, code: i32, msg: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0",
            result: None,
            error: Some(JsonRpcError { code, message: msg.into() }),
            id,
        }
    }
}

/// Entry point: accept a single JSON-RPC object or an array (batch).
async fn jsonrpc_batch_or_single(
    State(state): State<Arc<AppState>>,
    body: axum::body::Bytes,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    // Try parsing as an array first, then as a single object.
    if let Ok(batch) = serde_json::from_slice::<Vec<JsonRpcRequest>>(&body) {
        if batch.is_empty() {
            let err = JsonRpcResponse::err(serde_json::Value::Null, -32600, "empty batch");
            return Json(err).into_response();
        }
        let mut results = Vec::with_capacity(batch.len());
        for req in batch {
            results.push(jsonrpc_dispatch_inner(&state, req).await);
        }
        return Json(results).into_response();
    }

    match serde_json::from_slice::<JsonRpcRequest>(&body) {
        Ok(req) => {
            let resp = jsonrpc_dispatch_inner(&state, req).await;
            Json(resp).into_response()
        }
        Err(_) => {
            let err = JsonRpcResponse::err(serde_json::Value::Null, -32700, "parse error");
            Json(err).into_response()
        }
    }
}

async fn jsonrpc_dispatch_inner(
    state: &Arc<AppState>,
    req: JsonRpcRequest,
) -> JsonRpcResponse {
    let id = req.id.clone();
    let method = req.method.as_str();

    // Delegate to sub-modules in priority order
    if let Some(resp) = crate::rpc_mining::dispatch(state, method, &req.params, id.clone()).await {
        return resp;
    }
    if let Some(resp) = crate::rpc_wallet::dispatch(state, method, &req.params, id.clone()) {
        return resp;
    }
    if let Some(resp) = crate::rpc_network::dispatch(state, method, &req.params, id.clone()) {
        return resp;
    }
    if let Some(resp) = crate::rpc_chain::dispatch(state, method, &req.params, id.clone()) {
        return resp;
    }

    JsonRpcResponse::err(id, -32601, format!("method not found: {method}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::peer::{Direction, PeerManager};
    use axum::body::Body;
    use axum::http::Request;
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn test_app() -> (Router, Arc<AppState>) {
        let dir = tempdir().unwrap();
        let config = crate::Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let node = NodeState::new(config).unwrap();
        let mempool = Arc::new(Mempool::new(10 * 1024 * 1024));
        let state = Arc::new(AppState { node, mempool, peers: None, start_time: std::time::Instant::now(), template_notify: Arc::new(tokio::sync::Notify::new()), wallet_mgr: None, loaded_wallet: parking_lot::Mutex::new(None), api_keys: vec![] });
        (create_router(state.clone()), state)
    }

    #[tokio::test]
    async fn test_get_info() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/info")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let info: InfoResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(info.height, 0);
    }

    #[tokio::test]
    async fn test_get_block_not_found() {
        let (app, _) = test_app();
        let fake_hash = hex::encode([0xffu8; 32]);
        let req = Request::builder()
            .uri(format!("/api/block/{}", fake_hash))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_block_by_height_genesis() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/block-by-height/0")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let block: BlockResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(block.height, 0);
    }

    #[tokio::test]
    async fn test_get_mempool_empty() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/mempool")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let mp: MempoolResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(mp.count, 0);
    }

    #[tokio::test]
    async fn test_submit_tx_invalid_hex() {
        let (app, _) = test_app();
        let req = Request::builder()
            .method("POST")
            .uri("/api/tx")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"tx_hex":"not_valid_hex!!"}"#))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_balance_invalid_address() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/balance/not_a_valid_address")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        // Invalid address must return 400
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_health() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/health")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let health: HealthResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(health.status, "ok");
        assert_eq!(health.peers, 0);
    }

    #[tokio::test]
    async fn test_get_peers_empty() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/peers")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let peers: PeersResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(peers.total, 0);
    }

    #[tokio::test]
    async fn test_get_peers_with_peer_manager() {
        let dir = tempdir().unwrap();
        let config = crate::Config {
            data_dir: dir.path().to_path_buf(),
            ..Default::default()
        };
        let node = NodeState::new(config).unwrap();
        let mempool = Arc::new(Mempool::new(10 * 1024 * 1024));
        let pm = Arc::new(PeerManager::new(Default::default()));

        // Register a fake peer
        let addr: std::net::SocketAddr = "1.2.3.4:8633".parse().unwrap();
        pm.register(addr, Direction::Outbound);

        let state = Arc::new(AppState {
            node,
            mempool,
            peers: Some(pm),
            start_time: std::time::Instant::now(),
            template_notify: Arc::new(tokio::sync::Notify::new()),
            wallet_mgr: None,
            loaded_wallet: parking_lot::Mutex::new(None),
            api_keys: vec![],
        });
        let app = create_router(state);

        let req = Request::builder()
            .uri("/api/peers")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let peers: PeersResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(peers.total, 1);
        assert_eq!(peers.outbound, 1);
        assert_eq!(peers.inbound, 0);
    }

    #[tokio::test]
    async fn test_get_tx_not_found() {
        let (app, _) = test_app();
        let fake_txid = hex::encode([0xabu8; 32]);
        let req = Request::builder()
            .uri(format!("/api/tx/{}", fake_txid))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_tx_genesis_coinbase() {
        let (app, state) = test_app();
        // Genesis block should have a coinbase tx
        let genesis_hash = state.node.get_block_hash(0).unwrap();
        let genesis = state.node.get_block(&genesis_hash).unwrap();
        let coinbase_txid = hex::encode(genesis.transactions[0].txid());

        let req = Request::builder()
            .uri(format!("/api/tx/{}", coinbase_txid))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let tx_resp: TxResponse = serde_json::from_slice(&body).unwrap();
        assert!(!tx_resp.in_mempool);
        assert_eq!(tx_resp.block_height, Some(0));
    }

    // ── Hardening tests ────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_get_block_invalid_hash_format() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/block/not-a-valid-hex-hash")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_block_by_height_zero_is_genesis() {
        let (app, state) = test_app();
        let req = Request::builder()
            .uri("/api/block-by-height/0")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let block_resp: BlockResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(block_resp.height, 0);
        assert_eq!(block_resp.hash, hex::encode(state.node.get_tip()));
    }

    #[tokio::test]
    async fn test_get_block_by_height_out_of_range() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/block-by-height/999999")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_submit_tx_empty_body() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/tx")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"tx_hex":""}"#))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_submit_tx_odd_length_hex() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/tx")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"tx_hex":"abc"}"#))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_balance_known_address() {
        let (app, _) = test_app();
        // Generate a valid Kubercoin P2PKH address (version 0x2D = 'K' prefix)
        let addr = tx::Address::from_pubkey_hash([0u8; 20]).encode();
        let req = Request::builder()
            .uri(format!("/api/balance/{addr}"));
        let resp = app
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_get_info_content_type_json() {
        let (app, _) = test_app();
        let req = Request::builder().uri("/api/info").body(Body::empty()).unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let ct = resp.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(ct.contains("application/json"), "info must return JSON content-type, got: {ct}");
    }

    #[tokio::test]
    async fn test_get_metrics_returns_prometheus_format() {
        let (app, _) = test_app();
        let req = Request::builder().uri("/metrics").body(Body::empty()).unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let text = std::str::from_utf8(&body).expect("metrics must be UTF-8");
        // Prometheus text format starts lines with metric names or comments
        assert!(
            text.contains('#') || text.contains("kubercoin"),
            "metrics endpoint should return Prometheus text format"
        );
    }

    #[tokio::test]
    async fn test_get_tx_invalid_txid_format() {
        let (app, _) = test_app();
        let req = Request::builder()
            .uri("/api/tx/not-hex")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_health_reports_synced_at_genesis() {
        let (app, _) = test_app();
        let req = Request::builder().uri("/api/health").body(Body::empty()).unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let health: HealthResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(health.status, "ok", "freshly initialized node should report status=ok");
    }
}

