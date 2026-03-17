//! Standalone KuberCoin mining tool.
//!
//! Connects to a running node via JSON-RPC, requests a block template,
//! searches for a valid nonce locally, and submits solved blocks.
//! Supports configurable target address, block count, and RPC endpoint.

use anyhow::{Context, Result};
use chain::Block;
use clap::Parser;
use consensus::verify_pow;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Parser, Debug)]
#[command(name = "kubercoin-miner")]
#[command(about = "KuberCoin mining tool", long_about = None)]
struct Args {
    /// Address to mine to
    #[arg(short, long)]
    address: String,

    /// Number of blocks to mine (0 for continuous)
    #[arg(short, long, default_value = "50")]
    blocks: u32,

    /// RPC endpoint URL
    #[arg(short, long, default_value = "http://127.0.0.1:8634")]
    rpc_url: String,

    /// API key for authentication
    #[arg(short = 'k', long, env = "KUBERCOIN_API_KEY")]
    api_key: Option<String>,

    /// Delay between blocks in milliseconds
    #[arg(short, long, default_value = "100")]
    delay: u64,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,

    /// Number of mining threads (0 = auto-detect CPU count)
    #[arg(short = 't', long, default_value = "0")]
    threads: usize,
}

#[derive(Serialize)]
struct RpcRequest {
    jsonrpc: String,
    method: String,
    params: Vec<serde_json::Value>,
    id: u32,
}

#[derive(Deserialize, Debug)]
struct RpcResponse {
    result: Option<serde_json::Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Debug)]
struct RpcError {
    code: i32,
    message: String,
}

#[derive(Deserialize, Debug)]
struct BlockTemplateResponse {
    block: String,
    height: u64,
    bits: String,
    #[serde(default)]
    previousblockhash: String,
}

fn rpc_call(
    client: &Client,
    rpc_url: &str,
    api_key: Option<&str>,
    method: &str,
    params: Vec<serde_json::Value>,
    id: u32,
) -> Result<serde_json::Value> {
    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
        id,
    };

    let mut req = client.post(rpc_url).json(&request);
    if let Some(api_key) = api_key {
        req = req.header("Authorization", format!("Bearer {api_key}"));
        req = req.header("X-API-Key", api_key);
    }

    let response = req.send().context("RPC request failed")?;
    let status = response.status();
    let rpc_response: RpcResponse = response
        .json()
        .with_context(|| format!("Failed to parse RPC response (HTTP {})", status))?;

    if let Some(error) = rpc_response.error {
        return Err(anyhow::anyhow!("RPC error {}: {}", error.code, error.message));
    }

    rpc_response
        .result
        .ok_or_else(|| anyhow::anyhow!("RPC response missing result"))
}

fn fetch_block_template(
    client: &Client,
    rpc_url: &str,
    api_key: Option<&str>,
    address: &str,
    id: u32,
) -> Result<BlockTemplateResponse> {
    let value = rpc_call(
        client,
        rpc_url,
        api_key,
        "getblocktemplate",
        vec![serde_json::json!(address)],
        id,
    )?;

    serde_json::from_value(value).context("Failed to decode block template")
}

fn solve_block(mut block: Block, verbose: bool) -> Result<(Block, u64, Duration)> {
    let start = Instant::now();
    let mut last_report = Instant::now();
    let mut last_report_nonce: u64 = 0;

    for nonce in 0..=u64::MAX {
        block.header.nonce = nonce;
        if verify_pow(&block.header) {
            return Ok((block, nonce, start.elapsed()));
        }

        if nonce > 0 && nonce % 100_000 == 0 {
            let now = Instant::now();
            let elapsed_since_report = now.duration_since(last_report);
            let hashes_since_report = nonce - last_report_nonce;
            let hashrate = hashes_since_report as f64 / elapsed_since_report.as_secs_f64();

            if verbose {
                println!(
                    "  Height {}: {} nonces, {:.2} H/s ({:.2?} elapsed)",
                    block.header.height, nonce, hashrate, start.elapsed()
                );
            }

            last_report = now;
            last_report_nonce = nonce;
        }
    }

    Err(anyhow::anyhow!(
        "exhausted nonce space without finding a valid solution"
    ))
}

/// Multi-threaded PoW search. Each thread scans a disjoint nonce sub-range.
/// The first thread to find a valid nonce signals the others to stop.
fn solve_block_parallel(
    block: Block,
    num_threads: usize,
    verbose: bool,
) -> Result<(Block, u64, Duration)> {
    let start = Instant::now();
    let found = Arc::new(AtomicBool::new(false));
    let chunk = u64::MAX / num_threads as u64;

    // Each thread gets its own copy of the block and a nonce range.
    let handles: Vec<_> = (0..num_threads)
        .map(|i| {
            let mut thread_block = block.clone();
            let found = Arc::clone(&found);
            let range_start = chunk * i as u64;
            let range_end = if i == num_threads - 1 {
                u64::MAX
            } else {
                range_start + chunk - 1
            };

            std::thread::spawn(move || -> Option<(Block, u64)> {
                for nonce in range_start..=range_end {
                    if found.load(Ordering::Relaxed) {
                        return None;
                    }
                    thread_block.header.nonce = nonce;
                    if verify_pow(&thread_block.header) {
                        found.store(true, Ordering::Relaxed);
                        return Some((thread_block, nonce));
                    }
                    // Periodic check to bail out early (every 64K hashes)
                    if nonce & 0xFFFF == 0 && found.load(Ordering::Relaxed) {
                        return None;
                    }
                }
                None
            })
        })
        .collect();

    for handle in handles {
        if let Some((solved, nonce)) = handle.join().map_err(|_| anyhow::anyhow!("thread panicked"))? {
            if verbose {
                println!(
                    "  Solved at nonce {} in {:.2?} ({} threads)",
                    nonce,
                    start.elapsed(),
                    num_threads
                );
            }
            return Ok((solved, nonce, start.elapsed()));
        }
    }

    Err(anyhow::anyhow!(
        "no thread found a valid nonce"
    ))
}

fn submit_block(
    client: &Client,
    rpc_url: &str,
    api_key: Option<&str>,
    block: &Block,
    id: u32,
) -> Result<serde_json::Value> {
    let block_bytes = bincode::serialize(block).context("Failed to serialize solved block")?;
    rpc_call(
        client,
        rpc_url,
        api_key,
        "submitblock",
        vec![serde_json::json!(hex::encode(block_bytes))],
        id,
    )
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();

    let num_threads = if args.threads == 0 {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1)
    } else {
        args.threads
    };

    println!("KuberCoin Miner v0.1.0");
    println!("Mining to address: {}", args.address);
    println!("RPC endpoint: {}", args.rpc_url);
    println!("Mining threads: {}", num_threads);

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .context("Failed to create HTTP client")?;

    let total_blocks = if args.blocks == 0 {
        println!("Mode: Continuous mining (Ctrl+C to stop)");
        u32::MAX
    } else {
        println!("Mode: Mining {} blocks", args.blocks);
        args.blocks
    };

    let mut mined_count = 0;
    let mut stale_count = 0;
    let mut total_hashes: u64 = 0;
    let mut request_id = 1;
    let session_start = Instant::now();

    loop {
        if mined_count >= total_blocks {
            break;
        }

        let template = fetch_block_template(
            &client,
            &args.rpc_url,
            args.api_key.as_deref(),
            &args.address,
            request_id,
        )?;
        let template_height = template.height;
        let template_bytes = hex::decode(&template.block)
            .context("Template block hex was not valid hex")?;
        let template_block: Block = bincode::deserialize(&template_bytes)
            .context("Template block payload was not a valid block")?;

        if args.verbose {
            println!(
                "Template height {} prev {} bits {}",
                template.height,
                template.previousblockhash,
                template.bits
            );
        }

        let (solved_block, nonce, elapsed) = if num_threads > 1 {
            solve_block_parallel(template_block, num_threads, args.verbose)?
        } else {
            solve_block(template_block, args.verbose)?
        };
        total_hashes += nonce;

        let submit_result = submit_block(
            &client,
            &args.rpc_url,
            args.api_key.as_deref(),
            &solved_block,
            request_id + 1,
        );

        match submit_result {
            Ok(result) => {
                let result_str = result.to_string();
                // Detect stale/duplicate submissions
                if result_str.contains("stale") || result_str.contains("duplicate") || result_str.contains("inconclusive") {
                    stale_count += 1;
                    if args.verbose {
                        println!(
                            "STALE block at height {} (nonce {} in {:.2?}): {}",
                            template_height, nonce, elapsed, result_str
                        );
                    } else {
                        print!("x");
                    }
                } else {
                    mined_count += 1;
                    if args.verbose {
                        println!(
                            "Block {} accepted at height {} nonce {} in {:.2?}: {}",
                            mined_count,
                            solved_block.header.height,
                            nonce,
                            elapsed,
                            hex::encode(solved_block.hash())
                        );
                    } else {
                        print!(".");
                        if mined_count % 50 == 0 {
                            println!(" {}", mined_count);
                        }
                    }
                }
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("stale") || err_str.contains("duplicate") {
                    stale_count += 1;
                    if args.verbose {
                        println!("STALE at height {}: {}", template_height, err_str);
                    } else {
                        print!("x");
                    }
                } else {
                    return Err(e.context("submitblock failed"));
                }
            }
        }

        request_id += 2;

        if args.delay > 0 && mined_count < total_blocks {
            std::thread::sleep(Duration::from_millis(args.delay));
        }
    }

    let session_elapsed = session_start.elapsed();
    let avg_hashrate = if session_elapsed.as_secs_f64() > 0.0 {
        total_hashes as f64 / session_elapsed.as_secs_f64()
    } else {
        0.0
    };
    println!("\n--- Mining Summary ---");
    println!("Blocks mined:   {}", mined_count);
    println!("Stale blocks:   {}", stale_count);
    println!("Total hashes:   {}", total_hashes);
    println!("Session time:   {:.2?}", session_elapsed);
    println!("Avg hashrate:   {:.2} H/s", avg_hashrate);
    Ok(())
}
