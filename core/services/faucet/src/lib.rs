//! KuberCoin Testnet Faucet
//!
//! Provides free testnet coins to developers for testing purposes.

use anyhow::Result;
use axum::{
    extract::{ConnectInfo, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use governor::{clock::DefaultClock, state::keyed::DashMapStateStore, Quota, RateLimiter};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tx::{Address, AddressType, OutPoint, PrivateKey, Script, Transaction, TxInput, TxOutput};

/// Faucet configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaucetConfig {
    /// Amount to dispense per request (in satoshis)
    #[serde(default = "default_amount")]
    pub drip_amount: u64,
    
    /// Maximum requests per IP per day
    #[serde(default = "default_daily_limit")]
    pub daily_limit: u32,
    
    /// Node RPC URL
    #[serde(default = "default_node_url")]
    pub node_url: String,
    
    /// Listen address
    #[serde(default = "default_listen_addr")]
    pub listen_addr: String,
    
    /// Faucet wallet private key (hex)
    pub private_key: Option<String>,
}

fn default_amount() -> u64 {
    1_000_000 // 0.01 coins
}

fn default_daily_limit() -> u32 {
    5
}

fn default_node_url() -> String {
    "http://127.0.0.1:8080".to_string()
}

fn default_listen_addr() -> String {
    "0.0.0.0:3000".to_string()
}

impl Default for FaucetConfig {
    fn default() -> Self {
        Self {
            drip_amount: default_amount(),
            daily_limit: default_daily_limit(),
            node_url: default_node_url(),
            listen_addr: default_listen_addr(),
            private_key: None,
        }
    }
}

/// Faucet state
pub struct FaucetState {
    config: FaucetConfig,
    /// Recent requests (address -> timestamps)
    recent_requests: RwLock<HashMap<String, Vec<u64>>>,
    /// Rate limiter by address
    rate_limiter: RateLimiter<String, DashMapStateStore<String>, DefaultClock>,
    /// Rate limiter by client IP
    ip_rate_limiter: RateLimiter<String, DashMapStateStore<String>, DefaultClock>,
    /// Total coins dispensed
    total_dispensed: RwLock<u64>,
    /// Request count
    request_count: RwLock<u64>,
    /// HTTP client for talking to the node
    node_client: NodeClient,
    /// Pending PoW challenges (challenge_hex -> expiry timestamp)
    pending_challenges: RwLock<HashMap<String, u64>>,
}

/// Client for the KuberCoin node REST API
pub struct NodeClient {
    http: reqwest::Client,
    base_url: String,
}

/// A spendable UTXO returned by the node
#[derive(Debug, Deserialize)]
struct UtxoEntry {
    txid: String,
    vout: u32,
    value: u64,
}

impl NodeClient {
    fn new(node_url: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: node_url.trim_end_matches('/').to_string(),
        }
    }

    /// Fetch spendable UTXOs for `address` from the node.
    async fn fetch_utxos(&self, address: &str) -> Result<Vec<UtxoEntry>, String> {
        let url = format!("{}/api/utxos/{}", self.base_url, address);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("node unreachable: {}", e))?;

        let entries: Vec<UtxoEntry> = resp
            .json()
            .await
            .map_err(|e| format!("bad utxo response: {}", e))?;

        Ok(entries)
    }

    /// Submit a raw transaction to the node
    async fn submit_tx(&self, tx: &Transaction) -> Result<String, String> {
        let tx_bytes = bincode::serialize(tx).map_err(|e| e.to_string())?;
        let tx_hex = hex::encode(&tx_bytes);

        #[derive(Serialize)]
        struct Req {
            tx_hex: String,
        }
        #[derive(Deserialize)]
        struct Resp {
            accepted: bool,
            txid: Option<String>,
            error: Option<String>,
        }

        let url = format!("{}/api/tx", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&Req { tx_hex })
            .send()
            .await
            .map_err(|e| format!("node unreachable: {}", e))?;

        let body: Resp = resp
            .json()
            .await
            .map_err(|e| format!("bad node response: {}", e))?;

        if body.accepted {
            Ok(body.txid.unwrap_or_default())
        } else {
            Err(body.error.unwrap_or_else(|| "rejected".to_string()))
        }
    }
}

impl FaucetState {
    pub fn new(config: FaucetConfig) -> Self {
        // Per-address rate limit (approximately daily_limit / 24 per hour)
        let per_hour = (config.daily_limit.max(1) / 24).max(1);
        let addr_quota = Quota::per_hour(NonZeroU32::new(per_hour).expect("per_hour guaranteed >= 1"));
        let rate_limiter = RateLimiter::keyed(addr_quota);

        // Per-IP rate limit: allow 3× the per-address rate (multiple addresses from one IP)
        let ip_per_hour = (per_hour.saturating_mul(3)).max(1);
        let ip_quota = Quota::per_hour(NonZeroU32::new(ip_per_hour).expect("ip_per_hour guaranteed >= 1"));
        let ip_rate_limiter = RateLimiter::keyed(ip_quota);

        let node_client = NodeClient::new(&config.node_url);
        
        Self {
            config,
            recent_requests: RwLock::new(HashMap::new()),
            rate_limiter,
            ip_rate_limiter,
            total_dispensed: RwLock::new(0),
            request_count: RwLock::new(0),
            node_client,
            pending_challenges: RwLock::new(HashMap::new()),
        }
    }

    /// Persisted state snapshot for saving/loading faucet data across restarts.
    async fn save_state(&self, path: &std::path::Path) -> std::io::Result<()> {
        let snapshot = FaucetSnapshot {
            recent_requests: self.recent_requests.read().await.clone(),
            total_dispensed: *self.total_dispensed.read().await,
            request_count: *self.request_count.read().await,
        };
        let json = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        tokio::fs::write(path, json).await
    }

    /// Load persisted state from disk, restoring counters and recent requests.
    async fn load_state(&self, path: &std::path::Path) -> std::io::Result<()> {
        let data = tokio::fs::read(path).await?;
        let snapshot: FaucetSnapshot = serde_json::from_slice(&data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        *self.recent_requests.write().await = snapshot.recent_requests;
        *self.total_dispensed.write().await = snapshot.total_dispensed;
        *self.request_count.write().await = snapshot.request_count;
        Ok(())
    }
}

/// Serializable snapshot of faucet state for persistence.
#[derive(Debug, Serialize, Deserialize)]
struct FaucetSnapshot {
    recent_requests: HashMap<String, Vec<u64>>,
    total_dispensed: u64,
    request_count: u64,
}

/// Request for coins
#[derive(Debug, Deserialize)]
pub struct DripRequest {
    /// Recipient address
    pub address: String,
    /// PoW challenge (hex, from GET /challenge)
    pub challenge: Option<String>,
    /// PoW nonce (hex, client-computed)
    pub nonce: Option<String>,
}

/// Drip response
#[derive(Debug, Serialize, Deserialize)]
pub struct DripResponse {
    pub success: bool,
    pub txid: Option<String>,
    pub amount: u64,
    pub message: String,
}

/// Faucet status response
#[derive(Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub online: bool,
    pub drip_amount: u64,
    pub daily_limit: u32,
    pub total_dispensed: u64,
    pub request_count: u64,
}

/// PoW challenge issued by the faucet
#[derive(Debug, Serialize, Deserialize)]
pub struct PowChallenge {
    /// Random hex-encoded challenge nonce (32 bytes)
    pub challenge: String,
    /// Number of leading zero bits required in SHA-256(challenge || nonce)
    pub difficulty: u8,
    /// Unix timestamp when this challenge expires
    pub expires_at: u64,
}

/// Default PoW difficulty (leading zero bits)
const POW_DIFFICULTY: u8 = 16;
/// Challenge validity period in seconds
const POW_CHALLENGE_TTL: u64 = 300;

/// Create the faucet router
pub fn create_router(state: Arc<FaucetState>) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/challenge", get(challenge))
        .route("/drip", post(drip))
        .route("/status", get(status))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Index page
async fn index() -> &'static str {
    r#"
    KuberCoin Testnet Faucet
    
    GET  /challenge - Get a PoW challenge
    POST /drip      - Request testnet coins (requires PoW solution)
        Body: {"address": "your_address", "challenge": "...", "nonce": "..."}
    
    GET  /status    - Faucet status
    "#
}

/// Issue a PoW challenge
async fn challenge(
    State(state): State<Arc<FaucetState>>,
) -> Json<PowChallenge> {
    let challenge_hex = {
        let mut rng = rand::thread_rng();
        let mut nonce_bytes = [0u8; 32];
        rng.fill(&mut nonce_bytes);
        hex::encode(nonce_bytes)
    };
    let expires_at = current_timestamp() + POW_CHALLENGE_TTL;

    // Store the challenge
    {
        let mut pending = state.pending_challenges.write().await;
        // Prune expired challenges
        let now = current_timestamp();
        pending.retain(|_, exp| *exp > now);
        pending.insert(challenge_hex.clone(), expires_at);
    }

    Json(PowChallenge {
        challenge: challenge_hex,
        difficulty: POW_DIFFICULTY,
        expires_at,
    })
}

/// Verify a PoW solution: SHA-256(challenge_bytes || nonce_bytes) must have
/// at least `difficulty` leading zero bits.
fn verify_pow(challenge_hex: &str, nonce_hex: &str, difficulty: u8) -> bool {
    let challenge_bytes = match hex::decode(challenge_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let nonce_bytes = match hex::decode(nonce_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let mut hasher = Sha256::new();
    hasher.update(&challenge_bytes);
    hasher.update(&nonce_bytes);
    let hash = hasher.finalize();

    leading_zero_bits(&hash) >= difficulty as u32
}

/// Count leading zero bits in a byte slice.
fn leading_zero_bits(data: &[u8]) -> u32 {
    let mut count = 0u32;
    for &byte in data {
        if byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros();
            break;
        }
    }
    count
}

/// Request coins from faucet
async fn drip(
    State(state): State<Arc<FaucetState>>,
    req_parts: axum::http::Request<axum::body::Body>,
) -> Result<Json<DripResponse>, (StatusCode, String)> {
    // Extract optional client IP from ConnectInfo extension
    let client_ip = req_parts
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip().to_string());

    let req: DripRequest = {
        let body_bytes = axum::body::to_bytes(req_parts.into_body(), 1 << 16)
            .await
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        serde_json::from_slice(&body_bytes)
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    };

    // Validate address format
    if !is_valid_address(&req.address) {
        return Ok(Json(DripResponse {
            success: false,
            txid: None,
            amount: 0,
            message: "Invalid address format".to_string(),
        }));
    }

    // Verify PoW challenge
    match (&req.challenge, &req.nonce) {
        (Some(challenge), Some(nonce)) => {
            // Validate and consume the challenge
            let valid_challenge = {
                let mut pending = state.pending_challenges.write().await;
                let now = current_timestamp();
                if let Some(&expiry) = pending.get(challenge.as_str()) {
                    if expiry > now {
                        pending.remove(challenge.as_str());
                        true
                    } else {
                        pending.remove(challenge.as_str());
                        false
                    }
                } else {
                    false
                }
            };

            if !valid_challenge {
                return Ok(Json(DripResponse {
                    success: false,
                    txid: None,
                    amount: 0,
                    message: "Invalid or expired PoW challenge".to_string(),
                }));
            }

            if !verify_pow(challenge, nonce, POW_DIFFICULTY) {
                return Ok(Json(DripResponse {
                    success: false,
                    txid: None,
                    amount: 0,
                    message: "PoW solution does not meet difficulty requirement".to_string(),
                }));
            }
        }
        _ => {
            return Ok(Json(DripResponse {
                success: false,
                txid: None,
                amount: 0,
                message: "PoW challenge and nonce are required. GET /challenge first.".to_string(),
            }));
        }
    }

    // IP-based rate limit (prevents different-address-same-IP circumvention)
    if let Some(ref ip_key) = client_ip {
        if state.ip_rate_limiter.check_key(ip_key).is_err() {
            return Ok(Json(DripResponse {
                success: false,
                txid: None,
                amount: 0,
                message: "IP rate limit exceeded. Try again later.".to_string(),
            }));
        }
    }
    
    // Check per-address rate limit
    if state.rate_limiter.check_key(&req.address).is_err() {
        return Ok(Json(DripResponse {
            success: false,
            txid: None,
            amount: 0,
            message: format!("Address rate limit exceeded. Maximum {} requests per day.", state.config.daily_limit),
        }));
    }
    
    // Check recent requests for this address
    let now = current_timestamp();
    let day_ago = now - 86400;
    
    {
        let mut recent = state.recent_requests.write().await;
        let requests = recent.entry(req.address.clone()).or_default();
        
        // Remove old entries
        requests.retain(|&t| t > day_ago);
        
        if requests.len() >= state.config.daily_limit as usize {
            return Ok(Json(DripResponse {
                success: false,
                txid: None,
                amount: 0,
                message: format!("Daily limit reached for this address"),
            }));
        }
        
        requests.push(now);
    }
    
    // Build and send a real transaction if the faucet has a private key configured
    let txid = if let Some(ref key_hex) = state.config.private_key {
        match build_and_send_drip(&state, key_hex, &req.address).await {
            Ok(id) => id,
            Err(e) => {
                return Ok(Json(DripResponse {
                    success: false,
                    txid: None,
                    amount: 0,
                    message: format!("Failed to send transaction: {}", e),
                }));
            }
        }
    } else {
        // Faucet not configured: no private key set — refuse the drip rather than
        // returning a fake txid that would mislead the caller.
        return Ok(Json(DripResponse {
            success: false,
            txid: None,
            amount: 0,
            message: "faucet not configured: no private key set".to_string(),
        }));
    };
    
    // Update stats
    {
        let mut dispensed = state.total_dispensed.write().await;
        *dispensed = dispensed.saturating_add(state.config.drip_amount);
    }
    {
        let mut count = state.request_count.write().await;
        *count = count.saturating_add(1);
    }
    
    Ok(Json(DripResponse {
        success: true,
        txid: Some(txid),
        amount: state.config.drip_amount,
        message: format!("Sent {} satoshis to {}", state.config.drip_amount, req.address),
    }))
}

/// Build a transaction sending `drip_amount` to `address` and submit to the node.
async fn build_and_send_drip(
    state: &FaucetState,
    key_hex: &str,
    address: &str,
) -> std::result::Result<String, String> {
    let key_bytes: [u8; 32] = hex::decode(key_hex)
        .map_err(|e| format!("bad private_key hex: {}", e))?
        .try_into()
        .map_err(|_| "private_key must be 32 bytes".to_string())?;
    let key = PrivateKey::from_bytes(&key_bytes).map_err(|e| format!("invalid key: {}", e))?;

    // Decode the recipient address using the tx crate's proper decoder
    let recipient_addr = Address::decode(address)
        .map_err(|e| format!("invalid address: {}", e))?;
    let recipient_script = match recipient_addr.address_type {
        AddressType::P2WPKH => Script::new_p2wpkh(&recipient_addr.pubkey_hash),
        AddressType::P2TR => {
            let output_key = recipient_addr.taproot_output_key
                .ok_or("P2TR address missing output key")?;
            Script::new_p2tr(&output_key)
        }
        _ => Script::new_p2pkh(&recipient_addr.pubkey_hash),
    };

    // Derive the faucet's own address to fetch UTXOs
    let faucet_pubkey = key.public_key();
    let faucet_addr = Address::from_pubkey(&faucet_pubkey);
    let faucet_addr_str = faucet_addr.encode();

    // Fetch real UTXOs from the node
    let utxos = state.node_client.fetch_utxos(&faucet_addr_str).await?;
    if utxos.is_empty() {
        return Err("faucet has no spendable UTXOs".to_string());
    }

    // Coin selection: gather enough inputs to cover drip_amount
    let drip_amount = state.config.drip_amount;
    let mut selected = Vec::new();
    let mut input_total: u64 = 0;
    for utxo in &utxos {
        let txid_bytes: [u8; 32] = hex::decode(&utxo.txid)
            .map_err(|e| format!("bad utxo txid: {}", e))?
            .try_into()
            .map_err(|_| "utxo txid must be 32 bytes".to_string())?;
        selected.push(TxInput::new(
            OutPoint::new(txid_bytes, utxo.vout),
            Vec::new(),
        ));
        input_total = input_total.saturating_add(utxo.value);
        if input_total >= drip_amount {
            break;
        }
    }

    if input_total < drip_amount {
        return Err(format!(
            "insufficient faucet balance: have {}, need {}",
            input_total, drip_amount
        ));
    }

    // Build outputs: recipient + change back to faucet
    let mut outputs = vec![TxOutput::new(drip_amount, recipient_script.bytes)];
    let change = input_total.saturating_sub(drip_amount);
    if change > 0 {
        let change_script = Script::new_p2pkh(&faucet_addr.pubkey_hash);
        outputs.push(TxOutput::new(change, change_script.bytes));
    }

    let mut drip_tx = Transaction::new(selected, outputs, 0);

    // Sign all inputs
    for i in 0..drip_tx.inputs.len() {
        let _ = drip_tx.sign_input(i, &key);
    }

    // Submit to node
    state.node_client.submit_tx(&drip_tx).await
}

/// Get faucet status
async fn status(State(state): State<Arc<FaucetState>>) -> Json<StatusResponse> {
    Json(StatusResponse {
        online: true,
        drip_amount: state.config.drip_amount,
        daily_limit: state.config.daily_limit,
        total_dispensed: *state.total_dispensed.read().await,
        request_count: *state.request_count.read().await,
    })
}

/// Validate address format using the tx crate's Address::decode
fn is_valid_address(address: &str) -> bool {
    Address::decode(address).is_ok()
}

/// Get current timestamp
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Default path for the faucet state persistence file.
const STATE_FILE: &str = "faucet_state.json";

/// Run the faucet server
pub async fn run_server(config: FaucetConfig) -> Result<()> {
    let addr: SocketAddr = config.listen_addr.parse()?;
    let state = Arc::new(FaucetState::new(config));

    // Load persisted state if available
    let state_path = std::path::PathBuf::from(STATE_FILE);
    if state_path.exists() {
        if let Err(e) = state.load_state(&state_path).await {
            tracing::warn!("Failed to load persisted state: {}", e);
        } else {
            tracing::info!("Loaded persisted faucet state from {}", STATE_FILE);
        }
    }

    let app = create_router(state.clone());
    
    tracing::info!("Faucet starting on {}", addr);

    // Spawn periodic state saver (every 60 seconds)
    let save_state = state.clone();
    tokio::spawn(async move {
        let path = std::path::PathBuf::from(STATE_FILE);
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            if let Err(e) = save_state.save_state(&path).await {
                tracing::warn!("Failed to persist faucet state: {}", e);
            }
        }
    });
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = FaucetConfig::default();
        assert_eq!(config.drip_amount, 1_000_000);
        assert_eq!(config.daily_limit, 5);
    }
    
    #[test]
    fn test_valid_address() {
        // Generate a valid KuberCoin address from a known pubkey hash
        let addr = Address::from_pubkey_hash([0xab; 20]);
        let encoded = addr.encode();
        assert!(is_valid_address(&encoded));
        assert!(!is_valid_address(""));
        assert!(!is_valid_address("short"));
        assert!(!is_valid_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")); // Bitcoin, not KuberCoin
    }
    
    #[tokio::test]
    async fn test_faucet_state() {
        let config = FaucetConfig::default();
        let state = FaucetState::new(config);
        
        assert_eq!(*state.total_dispensed.read().await, 0);
        assert_eq!(*state.request_count.read().await, 0);
    }

    #[test]
    fn test_node_client_creation() {
        let client = NodeClient::new("http://127.0.0.1:8080/");
        assert_eq!(client.base_url, "http://127.0.0.1:8080");
    }

    #[test]
    fn test_node_client_strips_trailing_slash() {
        let client = NodeClient::new("http://localhost:3000///");
        assert_eq!(client.base_url, "http://localhost:3000");
    }

    #[test]
    fn test_faucet_state_has_node_client() {
        let config = FaucetConfig {
            node_url: "http://test-node:8080".to_string(),
            ..Default::default()
        };
        let state = FaucetState::new(config);
        assert_eq!(state.node_client.base_url, "http://test-node:8080");
    }

    /// Helper to brute-force a PoW solution in tests (low difficulty so it's fast)
    fn solve_pow_for_test(challenge_hex: &str, difficulty: u8) -> String {
        let challenge_bytes = hex::decode(challenge_hex).unwrap();
        for nonce in 0u64.. {
            let nonce_bytes = nonce.to_le_bytes();
            let mut hasher = Sha256::new();
            hasher.update(&challenge_bytes);
            hasher.update(&nonce_bytes);
            let hash = hasher.finalize();
            if leading_zero_bits(&hash) >= difficulty as u32 {
                return hex::encode(nonce_bytes);
            }
        }
        unreachable!()
    }

    #[tokio::test]
    async fn test_drip_without_key_returns_placeholder() {
        // When private_key is None, drip should return a placeholder txid
        let config = FaucetConfig {
            private_key: None,
            ..Default::default()
        };
        let state = Arc::new(FaucetState::new(config));

        // First, get a challenge
        let challenge_app = create_router(state.clone());
        let challenge_req = axum::http::Request::builder()
            .uri("/challenge")
            .body(axum::body::Body::empty())
            .unwrap();
        let challenge_resp = tower::ServiceExt::oneshot(challenge_app, challenge_req).await.unwrap();
        let challenge_body = axum::body::to_bytes(challenge_resp.into_body(), 1 << 20).await.unwrap();
        let pow: PowChallenge = serde_json::from_slice(&challenge_body).unwrap();

        // Solve the PoW
        let nonce_hex = solve_pow_for_test(&pow.challenge, pow.difficulty);

        // Now submit drip with PoW solution
        let drip_app = create_router(state.clone());
        let valid_addr = Address::from_pubkey_hash([0xab; 20]).encode();
        let body_json = serde_json::json!({
            "address": valid_addr,
            "challenge": pow.challenge,
            "nonce": nonce_hex,
        }).to_string();

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/drip")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body_json))
            .unwrap();

        let resp = tower::ServiceExt::oneshot(drip_app, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let drip: DripResponse = serde_json::from_slice(&body).unwrap();
        // Without a private key the faucet must decline — not silently succeed
        assert!(!drip.success);
        assert!(drip.txid.is_none());
        assert!(drip.message.contains("not configured"));
    }

    #[tokio::test]
    async fn test_status_endpoint() {
        let config = FaucetConfig::default();
        let state = Arc::new(FaucetState::new(config));
        let app = create_router(state);

        let req = axum::http::Request::builder()
            .uri("/status")
            .body(axum::body::Body::empty())
            .unwrap();

        let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let status: StatusResponse = serde_json::from_slice(&body).unwrap();
        assert!(status.online);
        assert_eq!(status.total_dispensed, 0);
    }

    #[test]
    fn test_verify_pow_valid() {
        let challenge = "aa".repeat(32);
        let nonce = solve_pow_for_test(&challenge, POW_DIFFICULTY);
        assert!(verify_pow(&challenge, &nonce, POW_DIFFICULTY));
    }

    #[test]
    fn test_verify_pow_invalid() {
        let challenge = "bb".repeat(32);
        // A nonce of all zeros is very unlikely to meet difficulty 16
        assert!(!verify_pow(&challenge, "0000000000000000", 20));
    }

    #[test]
    fn test_verify_pow_bad_hex() {
        assert!(!verify_pow("not_hex!", "0000", 1));
        assert!(!verify_pow("aabb", "not_hex!", 1));
    }

    #[test]
    fn test_leading_zero_bits() {
        assert_eq!(leading_zero_bits(&[0x00, 0x00, 0xFF]), 16);
        assert_eq!(leading_zero_bits(&[0x00, 0x80, 0xFF]), 8);
        assert_eq!(leading_zero_bits(&[0x0F, 0xFF]), 4);
        assert_eq!(leading_zero_bits(&[0xFF]), 0);
        assert_eq!(leading_zero_bits(&[]), 0);
    }

    #[tokio::test]
    async fn test_challenge_endpoint() {
        let state = Arc::new(FaucetState::new(FaucetConfig::default()));
        let app = create_router(state.clone());

        let req = axum::http::Request::builder()
            .uri("/challenge")
            .body(axum::body::Body::empty())
            .unwrap();

        let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let pow: PowChallenge = serde_json::from_slice(&body).unwrap();
        assert_eq!(pow.challenge.len(), 64); // 32 bytes hex-encoded
        assert_eq!(pow.difficulty, POW_DIFFICULTY);
        assert!(pow.expires_at > current_timestamp());

        // Challenge should be stored in pending
        let pending = state.pending_challenges.read().await;
        assert!(pending.contains_key(&pow.challenge));
    }

    #[tokio::test]
    async fn test_drip_rejects_missing_pow() {
        let state = Arc::new(FaucetState::new(FaucetConfig::default()));
        let app = create_router(state);

        let valid_addr = Address::from_pubkey_hash([0xab; 20]).encode();
        let body_json = serde_json::json!({"address": valid_addr}).to_string();

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/drip")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body_json))
            .unwrap();

        let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let drip: DripResponse = serde_json::from_slice(&body).unwrap();
        assert!(!drip.success);
        assert!(drip.message.contains("PoW challenge and nonce are required"));
    }

    #[tokio::test]
    async fn test_drip_rejects_invalid_challenge() {
        let state = Arc::new(FaucetState::new(FaucetConfig::default()));
        let app = create_router(state);

        let valid_addr = Address::from_pubkey_hash([0xab; 20]).encode();
        let body_json = serde_json::json!({
            "address": valid_addr,
            "challenge": "deadbeef".repeat(8),
            "nonce": "0000000000000000",
        }).to_string();

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/drip")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body_json))
            .unwrap();

        let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
        let body = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let drip: DripResponse = serde_json::from_slice(&body).unwrap();
        assert!(!drip.success);
        assert!(drip.message.contains("Invalid or expired"));
    }

    #[tokio::test]
    async fn test_state_persistence_roundtrip() {
        let state = Arc::new(FaucetState::new(FaucetConfig::default()));

        // Simulate some activity
        {
            let mut recent = state.recent_requests.write().await;
            recent.insert("addr1".to_string(), vec![100, 200]);
        }
        *state.total_dispensed.write().await = 5_000_000;
        *state.request_count.write().await = 5;

        // Save to a temp file
        let temp = std::env::temp_dir().join("kubercoin_faucet_test_state.json");
        state.save_state(&temp).await.unwrap();

        // Load into a fresh state
        let state2 = Arc::new(FaucetState::new(FaucetConfig::default()));
        state2.load_state(&temp).await.unwrap();

        assert_eq!(*state2.total_dispensed.read().await, 5_000_000);
        assert_eq!(*state2.request_count.read().await, 5);
        let recent = state2.recent_requests.read().await;
        assert_eq!(recent.get("addr1").unwrap(), &vec![100u64, 200]);

        // Clean up
        let _ = std::fs::remove_file(&temp);
    }

    #[tokio::test]
    async fn test_load_state_missing_file() {
        let state = Arc::new(FaucetState::new(FaucetConfig::default()));
        let result = state.load_state(std::path::Path::new("/nonexistent/path.json")).await;
        assert!(result.is_err());
    }
}
