//! KuberCoin Rust SDK Example
//!
//! Demonstrates interacting with the KuberCoin REST + RPC APIs from Rust.
//!
//! Copy this file into your project, add `reqwest` and `serde_json` to your
//! `Cargo.toml`, then compile and run with `cargo run`.

use serde::{Deserialize, Serialize};
use std::error::Error;

const API_BASE: &str = "http://localhost:8634";
const RPC_URL: &str = "http://localhost:8634/";

// ─── REST API types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct NodeInfo {
    version: String,
    height: u64,
    tip: String,
    mempool_size: usize,
    network: String,
}

// ─── RPC types ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct RpcRequest {
    jsonrpc: &'static str,
    method: String,
    params: Vec<serde_json::Value>,
    id: u64,
}

#[derive(Debug, Deserialize)]
struct RpcResponse<T> {
    result: Option<T>,
    error: Option<serde_json::Value>,
}

// ─── Client ──────────────────────────────────────────────────────────────────

struct KuberCoinClient {
    http: reqwest::Client,
    api_base: String,
    rpc_url: String,
    rpc_id: u64,
}

impl KuberCoinClient {
    fn new(api_base: &str, rpc_url: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_base: api_base.to_string(),
            rpc_url: rpc_url.to_string(),
            rpc_id: 0,
        }
    }

    /// REST: GET /api/info
    async fn get_info(&self) -> Result<NodeInfo, Box<dyn Error>> {
        let resp = self
            .http
            .get(format!("{}/api/info", self.api_base))
            .send()
            .await?
            .json::<NodeInfo>()
            .await?;
        Ok(resp)
    }

    /// REST: GET /api/balance/:address
    async fn get_balance(&self, address: &str) -> Result<f64, Box<dyn Error>> {
        let resp = self
            .http
            .get(format!("{}/api/balance/{}", self.api_base, address))
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;
        Ok(resp["balance"].as_f64().unwrap_or(0.0))
    }

    /// RPC: generic call
    async fn rpc_call<T: for<'de> Deserialize<'de>>(
        &mut self,
        method: &str,
        params: Vec<serde_json::Value>,
    ) -> Result<T, Box<dyn Error>> {
        self.rpc_id += 1;
        let req = RpcRequest {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
            id: self.rpc_id,
        };
        let resp: RpcResponse<T> = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;
        resp.result
            .ok_or_else(|| format!("RPC error: {:?}", resp.error).into())
    }

    /// RPC: getblockcount
    async fn get_block_count(&mut self) -> Result<u64, Box<dyn Error>> {
        self.rpc_call("getblockcount", vec![]).await
    }

    /// RPC: getblockchaininfo
    async fn get_blockchain_info(
        &mut self,
    ) -> Result<serde_json::Value, Box<dyn Error>> {
        self.rpc_call("getblockchaininfo", vec![]).await
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut client = KuberCoinClient::new(API_BASE, RPC_URL);

    // Node info
    println!("=== Node Info ===");
    let info = client.get_info().await?;
    println!("  Version:  {}", info.version);
    println!("  Network:  {}", info.network);
    println!("  Height:   {}", info.height);
    println!("  Tip:      {}", info.tip);
    println!("  Mempool:  {} txs", info.mempool_size);

    // Block count via RPC
    println!("\n=== RPC ===");
    let height = client.get_block_count().await?;
    println!("  Block count: {}", height);

    let chain = client.get_blockchain_info().await?;
    println!("  Chain: {}", chain["chain"]);
    println!("  Best block: {}", chain["bestblockhash"]);

    Ok(())
}
