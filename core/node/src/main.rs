//! KuberCoin Node — binary entry point
//!
//! Boots the full node: state → mempool → P2P → RPC server.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use tracing::info;

use kubercoin_node::config::{Config, Network};
use kubercoin_node::mempool::Mempool;
use kubercoin_node::network::P2PServer;
use kubercoin_node::rpc::{self, AppState};
use kubercoin_node::state::NodeState;

// ── CLI ─────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "kubercoin-node", version, about = "KuberCoin full node")]
struct Cli {
    /// Path to a TOML config file (overrides defaults)
    #[arg(short, long)]
    config: Option<PathBuf>,

    /// Data directory
    #[arg(long, env = "KUBERCOIN_DATA_DIR")]
    data_dir: Option<PathBuf>,

    /// Network: mainnet, testnet, regtest
    #[arg(long, env = "KUBERCOIN_NETWORK")]
    network: Option<String>,

    /// Combined REST + JSON-RPC listen address (e.g. 127.0.0.1:8634)
    #[arg(long, env = "KUBERCOIN_RPC_ADDR")]
    rpc_addr: Option<String>,

    /// P2P listen address (e.g. 0.0.0.0:8633)
    #[arg(long, env = "KUBERCOIN_P2P_ADDR")]
    p2p_addr: Option<String>,

    /// Stratum mining pool listen address (e.g. 0.0.0.0:3333)
    #[arg(long, env = "KUBERCOIN_STRATUM_ADDR")]
    stratum_addr: Option<String>,
}

// ── Main ────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // Logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,kubercoin_node=debug".parse().unwrap()),
        )
        .init();

    let cli = Cli::parse();

    // Build config: file → CLI overrides → defaults
    let mut config = match &cli.config {
        Some(path) => Config::load(path)?,
        None => Config::default(),
    };

    if let Some(dir) = cli.data_dir {
        config.data_dir = dir;
    }
    if let Some(net) = &cli.network {
        config.network = parse_network(net)?;
    }
    if let Some(addr) = cli.rpc_addr {
        config.rpc_addr = addr;
    }
    if let Some(addr) = cli.p2p_addr {
        config.p2p_addr = addr;
    }
    if let Some(addr) = cli.stratum_addr {
        config.stratum_addr = Some(addr);
    }

    info!(
        network = ?config.network,
        data_dir = %config.data_dir.display(),
        rpc = %config.rpc_addr,
        p2p = %config.p2p_addr,
        "Starting KuberCoin node"
    );

    // Ensure data directory exists
    std::fs::create_dir_all(&config.data_dir)?;

    // Boot subsystems
    let rpc_addr = config.rpc_addr.parse()?;
    let state = NodeState::new(config.clone())?;
    let mempool = Arc::new(Mempool::new(config.max_mempool_size));

    // Load persisted mempool entries from previous session
    let mempool_path = config.data_dir.join("mempool.dat");
    if mempool_path.exists() {
        match mempool.load(&mempool_path) {
            Ok(n) => info!(count = n, "Loaded mempool entries from disk"),
            Err(e) => tracing::warn!(error = %e, "Failed to load mempool.dat"),
        }
    }

    let stratum_opt = config.stratum_addr.clone();
    let data_dir = config.data_dir.clone();
    let zmq_pub_addr_opt = config.zmq_pub_addr.clone();

    let p2p = Arc::new(P2PServer::new(config, Arc::clone(&state), Arc::clone(&mempool)));
    let peers = p2p.peers().clone();
    Arc::clone(&p2p).start().await?;

    // Initialise the wallet manager (data_dir/wallets/)
    let wallet_dir = data_dir.join("wallets");
    let wallet_mgr = tx::wallet::WalletManager::new(&wallet_dir).ok();

    let app_state = Arc::new(AppState {
        node: state,
        mempool,
        peers: Some(peers),
        start_time: std::time::Instant::now(),
        template_notify: Arc::new(tokio::sync::Notify::new()),
        wallet_mgr,
        loaded_wallet: parking_lot::Mutex::new(None),
        api_keys: std::env::var("KUBERCOIN_API_KEYS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
    });

    // Warn if running on mainnet without API authentication
    if app_state.api_keys.is_empty() && matches!(app_state.node.network(), Network::Mainnet) {
        tracing::warn!(
            "API authentication is DISABLED on mainnet — \
             set KUBERCOIN_API_KEYS to secure the RPC endpoint"
        );
    }

    // Optionally start Stratum mining pool server
    if let Some(ref stratum_addr) = stratum_opt {
        let stratum_bind: std::net::SocketAddr = stratum_addr.parse()?;
        let stratum = kubercoin_node::stratum::StratumServer::new(app_state.clone(), stratum_bind);
        // Wire template_notify → stratum job push
        let jm = stratum.job_manager().clone();
        let notify = app_state.template_notify.clone();
        let state_for_jm = app_state.clone();
        tokio::spawn(async move {
            loop {
                notify.notified().await;
                let height = state_for_jm.node.get_height() + 1;
                let prev_hash = state_for_jm.node.get_tip();
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let bits = state_for_jm.node.calculate_next_bits_with_timestamp(height, timestamp);
                let job = kubercoin_node::stratum::MiningJob {
                    job_id: String::new(),
                    prev_hash,
                    coinbase1: Vec::new(),
                    coinbase2: Vec::new(),
                    merkle_branches: Vec::new(),
                    version: 0x2000_0000,
                    bits,
                    timestamp,
                    clean_jobs: true,
                };
                let _id = jm.create_job(job);
                jm.prune_old_jobs(5);
                tracing::debug!(height, "Stratum: pushed new job from template_notify");
            }
        });
        tokio::spawn(async move {
            if let Err(e) = stratum.run().await {
                tracing::error!(error = %e, "Stratum server failed");
            }
        });
        info!(addr = %stratum_addr, "Stratum server started");
    }

    info!("Node initialised — launching RPC server");

    // Optionally start ZMQ TCP publisher
    if let Some(ref zmq_addr_str) = zmq_pub_addr_opt {
        // Strip "tcp://" prefix if present
        let addr_clean = zmq_addr_str.trim_start_matches("tcp://");
        if let Ok(zmq_bind) = addr_clean.parse::<std::net::SocketAddr>() {
            let npub = kubercoin_node::notifications::NotificationPublisher::new();
            if let Err(e) = kubercoin_node::notifications::ZmqPublisher::start(zmq_bind, npub).await {
                tracing::warn!(error = %e, "Failed to start ZMQ publisher");
            } else {
                info!(addr = %zmq_addr_str, "ZMQ publisher started");
            }
        }
    }

    // Save mempool on shutdown
    let mempool_for_shutdown = app_state.mempool.clone();
    let mempool_save_path = data_dir.join("mempool.dat");
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            if let Err(e) = mempool_for_shutdown.save(&mempool_save_path) {
                tracing::warn!(error = %e, "Failed to save mempool.dat");
            } else {
                tracing::info!("Saved mempool to disk");
            }
            std::process::exit(0);
        }
    });

    rpc::serve(rpc_addr, app_state).await?;

    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────

fn parse_network(s: &str) -> Result<Network> {
    match s.to_lowercase().as_str() {
        "mainnet" | "main" => Ok(Network::Mainnet),
        "testnet" | "test" => Ok(Network::Testnet),
        "regtest" | "reg" => Ok(Network::Regtest),
        other => anyhow::bail!("unknown network '{other}' — expected mainnet, testnet, or regtest"),
    }
}
