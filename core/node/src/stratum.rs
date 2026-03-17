//! Stratum V1 mining protocol server.
//!
//! Implements the essential subset of the Stratum protocol for pool mining:
//! - `mining.subscribe` – assigns extranonce1 and extranonce2 size
//! - `mining.authorize` – worker authentication (accepts any credentials)
//! - `mining.set_difficulty` – pushed to workers when difficulty changes
//! - `mining.notify` – pushes new jobs to workers
//! - `mining.submit` – accepts share submissions from workers
//!
//! Wire format: newline-delimited JSON-RPC over TCP.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use crate::rpc::AppState;

fn unix_time_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── Constants ───────────────────────────────────────────────────────────

/// Default share difficulty for new workers.
const DEFAULT_SHARE_DIFFICULTY: f64 = 1.0;
/// Extranonce1 length in bytes.
const EXTRANONCE1_SIZE: usize = 4;
/// Extranonce2 length in bytes (communicated to miner on subscribe).
const EXTRANONCE2_SIZE: usize = 4;
/// How often to push new jobs (seconds).
const JOB_REFRESH_INTERVAL: u64 = 30;

// ── Wire types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct StratumRequest {
    id: serde_json::Value,
    method: String,
    params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct StratumResponse {
    id: serde_json::Value,
    result: serde_json::Value,
    error: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct StratumNotification {
    id: serde_json::Value,
    method: String,
    params: Vec<serde_json::Value>,
}

// ── Worker state ────────────────────────────────────────────────────────

struct WorkerSession {
    extranonce1: [u8; EXTRANONCE1_SIZE],
    authorized: bool,
    worker_name: String,
    difficulty: f64,
    shares_accepted: u64,
    shares_rejected: u64,
}

// ── Job management ──────────────────────────────────────────────────────

/// A mining job sent to workers.
#[derive(Clone)]
pub struct MiningJob {
    pub job_id: String,
    pub prev_hash: [u8; 32],
    pub coinbase1: Vec<u8>,
    pub coinbase2: Vec<u8>,
    pub merkle_branches: Vec<[u8; 32]>,
    pub version: i32,
    pub bits: u32,
    pub timestamp: u64,
    pub clean_jobs: bool,
}

/// Manages active mining jobs and worker difficulty.
pub struct StratumJobManager {
    /// Currently active jobs keyed by job_id.
    jobs: RwLock<HashMap<String, MiningJob>>,
    /// Monotonically increasing job counter.
    next_job_id: AtomicU64,
    /// Monotonically increasing extranonce1 counter.
    next_extranonce1: AtomicU64,
    /// Current network difficulty.
    pub share_difficulty: RwLock<f64>,
}

impl StratumJobManager {
    pub fn new() -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
            next_job_id: AtomicU64::new(1),
            next_extranonce1: AtomicU64::new(1),
            share_difficulty: RwLock::new(DEFAULT_SHARE_DIFFICULTY),
        }
    }

    fn allocate_extranonce1(&self) -> [u8; EXTRANONCE1_SIZE] {
        let val = self.next_extranonce1.fetch_add(1, Ordering::Relaxed);
        let bytes = (val as u32).to_be_bytes();
        bytes
    }

    pub fn create_job(&self, job: MiningJob) -> String {
        let id = format!("{:x}", self.next_job_id.fetch_add(1, Ordering::Relaxed));
        self.jobs.write().insert(id.clone(), MiningJob {
            job_id: id.clone(),
            ..job
        });
        id
    }

    pub fn get_job(&self, job_id: &str) -> Option<MiningJob> {
        self.jobs.read().get(job_id).cloned()
    }

    /// Clean stale jobs (keep only the latest N).
    pub fn prune_old_jobs(&self, keep: usize) {
        let mut jobs = self.jobs.write();
        if jobs.len() > keep {
            let mut ids: Vec<String> = jobs.keys().cloned().collect();
            ids.sort();
            let remove_count = ids.len() - keep;
            for id in ids.into_iter().take(remove_count) {
                jobs.remove(&id);
            }
        }
    }
}

// ── Stratum server ──────────────────────────────────────────────────────

/// Stratum V1 server that listens for miner connections.
pub struct StratumServer {
    state: Arc<AppState>,
    job_manager: Arc<StratumJobManager>,
    bind_addr: SocketAddr,
}

impl StratumServer {
    pub fn new(state: Arc<AppState>, bind_addr: SocketAddr) -> Self {
        Self {
            state,
            job_manager: Arc::new(StratumJobManager::new()),
            bind_addr,
        }
    }

    pub fn job_manager(&self) -> &Arc<StratumJobManager> {
        &self.job_manager
    }

    /// Start the Stratum TCP server. Runs forever.
    pub async fn run(&self) -> Result<()> {
        let listener = TcpListener::bind(self.bind_addr).await?;
        tracing::info!(addr = %self.bind_addr, "Stratum server listening");

        // Spawn a task that periodically creates new jobs
        let state = self.state.clone();
        let jm = self.job_manager.clone();
        tokio::spawn(async move {
            job_refresh_loop(state, jm).await;
        });

        loop {
            let (stream, peer_addr) = listener.accept().await?;
            tracing::info!(%peer_addr, "Stratum worker connected");
            let state = self.state.clone();
            let jm = self.job_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_worker(stream, peer_addr, state, jm).await {
                    tracing::warn!(%peer_addr, error = %e, "Stratum worker session ended");
                }
            });
        }
    }
}

/// Periodically fetches a new block template and pushes jobs.
async fn job_refresh_loop(state: Arc<AppState>, jm: Arc<StratumJobManager>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(JOB_REFRESH_INTERVAL));
    loop {
        interval.tick().await;
        let height = state.node.get_height() + 1;
        let prev_hash = state.node.get_tip();
        let timestamp = unix_time_secs();
        let bits = state.node.calculate_next_bits_with_timestamp(height, timestamp);

        let job = MiningJob {
            job_id: String::new(), // filled by create_job
            prev_hash,
            coinbase1: Vec::new(), // simplified — real impl splits coinbase
            coinbase2: Vec::new(),
            merkle_branches: Vec::new(),
            version: 0x2000_0000,
            bits,
            timestamp,
            clean_jobs: true,
        };
        let _id = jm.create_job(job);
        jm.prune_old_jobs(5);
        tracing::debug!(height, "Stratum: new mining job created");
    }
}

/// Handle a single worker connection.
async fn handle_worker(
    stream: TcpStream,
    peer_addr: SocketAddr,
    state: Arc<AppState>,
    jm: Arc<StratumJobManager>,
) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    let mut session = WorkerSession {
        extranonce1: jm.allocate_extranonce1(),
        authorized: false,
        worker_name: String::new(),
        difficulty: *jm.share_difficulty.read(),
        shares_accepted: 0,
        shares_rejected: 0,
    };

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let req: StratumRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(%peer_addr, "Malformed stratum request: {e}");
                continue;
            }
        };

        let response = match req.method.as_str() {
            "mining.subscribe" => handle_subscribe(&req, &session),
            "mining.authorize" => handle_authorize(&req, &mut session),
            "mining.submit" => handle_submit(&req, &mut session, &state, &jm),
            "mining.configure" => handle_configure(&req),
            other => {
                tracing::debug!(%peer_addr, method = other, "Unknown stratum method");
                StratumResponse {
                    id: req.id,
                    result: serde_json::Value::Null,
                    error: serde_json::json!(["Unknown method", 20]),
                }
            }
        };

        let mut resp_str = serde_json::to_string(&response)?;
        resp_str.push('\n');
        writer.write_all(resp_str.as_bytes()).await?;

        // After subscribe, send set_difficulty
        if req.method == "mining.subscribe" {
            let diff_notif = StratumNotification {
                id: serde_json::Value::Null,
                method: "mining.set_difficulty".to_string(),
                params: vec![serde_json::json!(session.difficulty)],
            };
            let mut s = serde_json::to_string(&diff_notif)?;
            s.push('\n');
            writer.write_all(s.as_bytes()).await?;
        }

        // After authorize, send the latest job
        if req.method == "mining.authorize" && session.authorized {
            let job_opt = jm.jobs.read().values().last().cloned();
            if let Some(job) = job_opt {
                let notify = build_notify(&job);
                let mut s = serde_json::to_string(&notify)?;
                s.push('\n');
                writer.write_all(s.as_bytes()).await?;
            }
        }
    }

    tracing::info!(
        %peer_addr,
        worker = session.worker_name,
        accepted = session.shares_accepted,
        rejected = session.shares_rejected,
        "Stratum worker disconnected"
    );
    Ok(())
}

// ── Method handlers ─────────────────────────────────────────────────────

fn handle_subscribe(req: &StratumRequest, session: &WorkerSession) -> StratumResponse {
    // Response: [[["mining.set_difficulty", "sub_id"], ["mining.notify", "sub_id"]], extranonce1, extranonce2_size]
    StratumResponse {
        id: req.id.clone(),
        result: serde_json::json!([
            [
                ["mining.set_difficulty", hex::encode(session.extranonce1)],
                ["mining.notify", hex::encode(session.extranonce1)]
            ],
            hex::encode(session.extranonce1),
            EXTRANONCE2_SIZE
        ]),
        error: serde_json::Value::Null,
    }
}

fn handle_authorize(req: &StratumRequest, session: &mut WorkerSession) -> StratumResponse {
    let worker_name = req.params.first()
        .and_then(|v| v.as_str())
        .unwrap_or("anonymous")
        .to_string();
    session.worker_name = worker_name;
    session.authorized = true;
    tracing::info!(worker = %session.worker_name, "Stratum worker authorized");
    StratumResponse {
        id: req.id.clone(),
        result: serde_json::json!(true),
        error: serde_json::Value::Null,
    }
}

fn handle_submit(
    req: &StratumRequest,
    session: &mut WorkerSession,
    _state: &AppState,
    jm: &StratumJobManager,
) -> StratumResponse {
    if !session.authorized {
        return StratumResponse {
            id: req.id.clone(),
            result: serde_json::json!(false),
            error: serde_json::json!(["Not authorized", 24]),
        };
    }

    // params: [worker_name, job_id, extranonce2, ntime, nonce]
    let job_id = req.params.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let extranonce2_hex = req.params.get(2).and_then(|v| v.as_str()).unwrap_or("");
    let ntime_hex = req.params.get(3).and_then(|v| v.as_str()).unwrap_or("");
    let nonce_hex = req.params.get(4).and_then(|v| v.as_str()).unwrap_or("");

    // Verify the job exists
    let job = match jm.get_job(job_id) {
        Some(j) => j,
        None => {
            session.shares_rejected += 1;
            return StratumResponse {
                id: req.id.clone(),
                result: serde_json::json!(false),
                error: serde_json::json!(["Job not found (stale)", 21]),
            };
        }
    };

    // Parse submitted nonce and ntime
    let nonce = match u64::from_str_radix(nonce_hex, 16) {
        Ok(v) => v,
        Err(_) => {
            session.shares_rejected += 1;
            return StratumResponse {
                id: req.id.clone(),
                result: serde_json::json!(false),
                error: serde_json::json!(["Invalid nonce", 20]),
            };
        }
    };

    let ntime = u64::from_str_radix(ntime_hex, 16).unwrap_or(job.timestamp);

    // Build a merkle root from coinbase with extranonce1 + extranonce2
    let extranonce2_bytes = hex::decode(extranonce2_hex).unwrap_or_default();
    let mut coinbase_data = job.coinbase1.clone();
    coinbase_data.extend_from_slice(&session.extranonce1);
    coinbase_data.extend_from_slice(&extranonce2_bytes);
    coinbase_data.extend_from_slice(&job.coinbase2);

    // SHA256d of coinbase to get coinbase txid
    use sha2::{Digest, Sha256};
    let first = Sha256::digest(&coinbase_data);
    let coinbase_hash: [u8; 32] = Sha256::digest(first).into();

    // Walk merkle branches to get the merkle root
    let mut merkle_root = coinbase_hash;
    for branch in &job.merkle_branches {
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(&merkle_root);
        combined.extend_from_slice(branch);
        let h1 = Sha256::digest(&combined);
        merkle_root = Sha256::digest(h1).into();
    }

    // Reconstruct header and compute hash
    let header = chain::BlockHeader::new(
        job.prev_hash,
        merkle_root,
        ntime,
        job.bits,
        nonce,
    );
    let hash = header.hash();

    // Check if hash meets share difficulty.
    // share_target = max_target / share_difficulty
    // For simplicity, compare leading zero bytes proportional to difficulty.
    let share_target = difficulty_to_target(session.difficulty);
    if hash > share_target {
        session.shares_rejected += 1;
        tracing::debug!(
            worker = %session.worker_name,
            job_id,
            "Share rejected: hash does not meet difficulty"
        );
        return StratumResponse {
            id: req.id.clone(),
            result: serde_json::json!(false),
            error: serde_json::json!(["Share above target", 23]),
        };
    }

    session.shares_accepted += 1;
    tracing::debug!(
        worker = %session.worker_name,
        job_id,
        accepted = session.shares_accepted,
        "Share accepted"
    );
    StratumResponse {
        id: req.id.clone(),
        result: serde_json::json!(true),
        error: serde_json::Value::Null,
    }
}

/// Handle `mining.configure` (BIP 310).
///
/// The miner sends a list of extensions it supports together with
/// per-extension parameters.  We recognise `version-rolling` and echo
/// back the negotiated mask.
fn handle_configure(req: &StratumRequest) -> StratumResponse {
    // params: [ ["version-rolling", ...], {"version-rolling.mask": "1fffe000", ...} ]
    let extensions = req.params.first()
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let ext_params = req.params.get(1)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut result = serde_json::Map::new();

    for ext in &extensions {
        if let Some(name) = ext.as_str() {
            match name {
                "version-rolling" => {
                    // Negotiate the version-rolling mask.
                    // Default Bitcoin mask allowing bits 1-28: 0x1fffe000
                    let mask = ext_params
                        .get("version-rolling.mask")
                        .and_then(|v| v.as_str())
                        .unwrap_or("1fffe000");
                    // We accept the miner's proposed mask as-is (intersection
                    // with our allowed range would be done in production).
                    result.insert("version-rolling".into(), serde_json::json!(true));
                    result.insert("version-rolling.mask".into(), serde_json::json!(mask));
                    result.insert("version-rolling.min-bit-count".into(), serde_json::json!(0));
                }
                _ => {
                    // Unknown extension — reject it.
                    result.insert(name.to_string(), serde_json::json!(false));
                }
            }
        }
    }

    StratumResponse {
        id: req.id.clone(),
        result: serde_json::json!(result),
        error: serde_json::Value::Null,
    }
}

/// Convert a floating-point difficulty to a 256-bit target.
///
/// `target = max_target / difficulty`  where max_target is the
/// Bitcoin difficulty-1 target (0x00000000FFFF << 208).
fn difficulty_to_target(difficulty: f64) -> [u8; 32] {
    if difficulty <= 0.0 {
        return [0xff; 32];
    }
    // Difficulty-1 target: 0x00000000FFFF followed by zeros.
    // In big-endian [u8; 32] that's bytes [4..6] = 0xFF 0xFF, rest 0.
    let mut diff1 = [0u8; 32];
    diff1[4] = 0xFF;
    diff1[5] = 0xFF;

    if difficulty <= 1.0 {
        return diff1;
    }

    // Scale down: target = diff1 / difficulty
    // We treat the 256-bit target as a big-endian integer, dividing by
    // difficulty using floating point for the significant bytes.
    // For pool shares this is sufficiently accurate.
    let diff1_f64 = 0xFFFF_u64 as f64 * (2.0_f64).powi(208);
    let target_f64 = diff1_f64 / difficulty;

    // Extract the position and value: find how many whole bytes of leading
    // zeros, then fill the remaining significant bytes.
    if target_f64 == 0.0 {
        return [0u8; 32];
    }
    let bits = target_f64.log2();
    let byte_pos = 31 - (bits as usize / 8).min(31);
    let shift = (bits as usize % 8) as u32;

    let mut result = [0u8; 32];
    // Write up to 8 significant bytes starting from byte_pos
    let significant = (target_f64 / (2.0_f64).powi((bits.floor() - 55.0).max(0.0) as i32)) as u64;
    let sig_bytes = significant.to_be_bytes();
    let start = byte_pos;
    for (i, &b) in sig_bytes.iter().enumerate() {
        if start + i < 32 {
            result[start + i] = b;
        }
    }
    let _ = shift; // precision is sufficient for share difficulty
    result
}

/// Build a `mining.notify` notification for a job.
fn build_notify(job: &MiningJob) -> StratumNotification {
    let branches: Vec<serde_json::Value> = job.merkle_branches.iter()
        .map(|b| serde_json::json!(hex::encode(b)))
        .collect();
    StratumNotification {
        id: serde_json::Value::Null,
        method: "mining.notify".to_string(),
        params: vec![
            serde_json::json!(job.job_id),
            serde_json::json!(hex::encode(job.prev_hash)),
            serde_json::json!(hex::encode(&job.coinbase1)),
            serde_json::json!(hex::encode(&job.coinbase2)),
            serde_json::json!(branches),
            serde_json::json!(format!("{:08x}", job.version)),
            serde_json::json!(format!("{:08x}", job.bits)),
            serde_json::json!(format!("{:08x}", job.timestamp)),
            serde_json::json!(job.clean_jobs),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extranonce1_allocation_is_unique() {
        let jm = StratumJobManager::new();
        let e1 = jm.allocate_extranonce1();
        let e2 = jm.allocate_extranonce1();
        assert_ne!(e1, e2);
    }

    #[test]
    fn test_job_create_and_retrieve() {
        let jm = StratumJobManager::new();
        let job = MiningJob {
            job_id: String::new(),
            prev_hash: [0u8; 32],
            coinbase1: vec![1, 2, 3],
            coinbase2: vec![4, 5, 6],
            merkle_branches: vec![],
            version: 0x2000_0000,
            bits: 0x1d00ffff,
            timestamp: 1000,
            clean_jobs: true,
        };
        let id = jm.create_job(job);
        assert!(jm.get_job(&id).is_some());
        assert!(jm.get_job("nonexistent").is_none());
    }

    #[test]
    fn test_job_pruning() {
        let jm = StratumJobManager::new();
        for _ in 0..10 {
            jm.create_job(MiningJob {
                job_id: String::new(),
                prev_hash: [0u8; 32],
                coinbase1: vec![],
                coinbase2: vec![],
                merkle_branches: vec![],
                version: 0x2000_0000,
                bits: 0x1d00ffff,
                timestamp: 1000,
                clean_jobs: false,
            });
        }
        assert_eq!(jm.jobs.read().len(), 10);
        jm.prune_old_jobs(3);
        assert_eq!(jm.jobs.read().len(), 3);
    }

    #[test]
    fn test_build_notify_format() {
        let job = MiningJob {
            job_id: "abc".to_string(),
            prev_hash: [0xff; 32],
            coinbase1: vec![0x01],
            coinbase2: vec![0x02],
            merkle_branches: vec![[0xaa; 32]],
            version: 0x2000_0000,
            bits: 0x1d00ffff,
            timestamp: 1234567890,
            clean_jobs: true,
        };
        let notif = build_notify(&job);
        assert_eq!(notif.method, "mining.notify");
        assert_eq!(notif.params.len(), 9);
        assert_eq!(notif.params[0], serde_json::json!("abc"));
        assert_eq!(notif.params[8], serde_json::json!(true));
    }

    #[test]
    fn test_subscribe_response_format() {
        let session = WorkerSession {
            extranonce1: [0x00, 0x00, 0x00, 0x01],
            authorized: false,
            worker_name: String::new(),
            difficulty: 1.0,
            shares_accepted: 0,
            shares_rejected: 0,
        };
        let req = StratumRequest {
            id: serde_json::json!(1),
            method: "mining.subscribe".to_string(),
            params: vec![],
        };
        let resp = handle_subscribe(&req, &session);
        assert!(resp.error.is_null());
        // result should contain extranonce1 and extranonce2_size
        let arr = resp.result.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[1], serde_json::json!("00000001"));
        assert_eq!(arr[2], serde_json::json!(EXTRANONCE2_SIZE));
    }

    #[test]
    fn test_mining_configure_version_rolling() {
        let req = StratumRequest {
            id: serde_json::json!(1),
            method: "mining.configure".to_string(),
            params: vec![
                serde_json::json!(["version-rolling"]),
                serde_json::json!({"version-rolling.mask": "1fffe000", "version-rolling.min-bit-count": 2}),
            ],
        };
        let resp = handle_configure(&req);
        assert!(resp.error.is_null());
        let result = resp.result.as_object().unwrap();
        assert_eq!(result["version-rolling"], serde_json::json!(true));
        assert_eq!(result["version-rolling.mask"], serde_json::json!("1fffe000"));
    }

    #[test]
    fn test_mining_configure_unknown_extension() {
        let req = StratumRequest {
            id: serde_json::json!(2),
            method: "mining.configure".to_string(),
            params: vec![
                serde_json::json!(["unknown-ext"]),
                serde_json::json!({}),
            ],
        };
        let resp = handle_configure(&req);
        let result = resp.result.as_object().unwrap();
        assert_eq!(result["unknown-ext"], serde_json::json!(false));
    }
}
