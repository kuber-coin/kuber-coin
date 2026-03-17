// KuberCoin Transaction Explorer CLI Tool
// Command-line interface for exploring transactions, blocks, and addresses

use std::process;
use std::env;

mod client;
mod formatter;
mod commands;

use client::KuberCoinClient;
use commands::Command;

const VERSION: &str = "1.0.0";
const BANNER: &str = r#"
╔════════════════════════════════════════╗
║   KuberCoin Transaction Explorer      ║
║   Command-Line Block Explorer         ║
╚════════════════════════════════════════╝
"#;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        print_usage();
        process::exit(1);
    }

    let command = &args[1];
    
    // Parse command
    let cmd = match Command::parse(command, &args[2..]) {
        Ok(cmd) => cmd,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    };

    // Initialize RPC client
    let rpc_url = env::var("KUBERCOIN_RPC_URL")
        .unwrap_or_else(|_| "http://localhost:8332".to_string());
    
    let rpc_user = env::var("KUBERCOIN_RPC_USER")
        .unwrap_or_else(|_| "user".to_string());
    
    let rpc_pass = env::var("KUBERCOIN_RPC_PASS")
        .unwrap_or_else(|_| "pass".to_string());

    let client = KuberCoinClient::new(&rpc_url, &rpc_user, &rpc_pass);

    // Execute command
    match execute_command(&client, cmd) {
        Ok(_) => {},
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    }
}

fn execute_command(client: &KuberCoinClient, cmd: Command) -> Result<(), String> {
    match cmd {
        Command::GetBlock { hash, verbose } => {
            commands::get_block(client, &hash, verbose)?;
        }
        Command::GetTransaction { txid, verbose } => {
            commands::get_transaction(client, &txid, verbose)?;
        }
        Command::GetAddress { address } => {
            commands::get_address(client, &address)?;
        }
        Command::GetHeight => {
            commands::get_height(client)?;
        }
        Command::Search { query } => {
            commands::search(client, &query)?;
        }
        Command::Watch { address, interval } => {
            commands::watch(client, &address, interval)?;
        }
        Command::Stats => {
            commands::stats(client)?;
        }
        Command::Mempool => {
            commands::mempool(client)?;
        }
        Command::Version => {
            println!("{}", BANNER);
            println!("Version: {}", VERSION);
        }
        Command::Help => {
            print_usage();
        }
    }
    
    Ok(())
}

fn print_usage() {
    println!("{}", BANNER);
    println!("Usage: kube-explorer <command> [args]");
    println!();
    println!("Commands:");
    println!("  block <hash>              Show block details");
    println!("  block <hash> -v           Show block with full transactions");
    println!("  tx <txid>                 Show transaction details");
    println!("  tx <txid> -v              Show transaction with inputs/outputs");
    println!("  address <addr>            Show address balance and transactions");
    println!("  height                    Show current blockchain height");
    println!("  search <query>            Search for block, tx, or address");
    println!("  watch <addr> [interval]   Watch address for new transactions");
    println!("  stats                     Show network statistics");
    println!("  mempool                   Show mempool statistics");
    println!("  version                   Show version");
    println!("  help                      Show this help");
    println!();
    println!("Environment Variables:");
    println!("  KUBERCOIN_RPC_URL         RPC endpoint (default: http://localhost:8332)");
    println!("  KUBERCOIN_RPC_USER        RPC username (default: user)");
    println!("  KUBERCOIN_RPC_PASS        RPC password (default: pass)");
    println!();
    println!("Examples:");
    println!("  kube-explorer block 0000000000000abc123...");
    println!("  kube-explorer tx abc123def456...");
    println!("  kube-explorer address kube1q...");
    println!("  kube-explorer watch kube1q... 5");
    println!("  kube-explorer stats");
}

// Module: client.rs (RPC client implementation)
mod client {
    use serde::{Deserialize, Serialize};
    use serde_json::{json, Value};

    pub struct KuberCoinClient {
        url: String,
        user: String,
        pass: String,
    }

    impl KuberCoinClient {
        pub fn new(url: &str, user: &str, pass: &str) -> Self {
            Self {
                url: url.to_string(),
                user: user.to_string(),
                pass: pass.to_string(),
            }
        }

        pub fn call(&self, method: &str, params: Vec<Value>) -> Result<Value, String> {
            // Stub: Would make actual RPC call
            // For now, return mock data
            
            match method {
                "getblockcount" => Ok(json!(123456)),
                "getblock" => Ok(json!({
                    "hash": params[0],
                    "height": 123456,
                    "confirmations": 1,
                    "time": 1706659200,
                    "tx": ["abc123", "def456"],
                    "size": 1234,
                })),
                "getrawtransaction" => Ok(json!({
                    "txid": params[0],
                    "size": 250,
                    "vsize": 250,
                    "version": 2,
                    "locktime": 0,
                    "vin": [{"txid": "prev123", "vout": 0}],
                    "vout": [{"value": 10.5, "n": 0}],
                })),
                "getaddressbalance" => Ok(json!({
                    "balance": 100.5,
                    "received": 150.0,
                    "sent": 49.5,
                })),
                "getmempoolinfo" => Ok(json!({
                    "size": 1234,
                    "bytes": 567890,
                })),
                _ => Err(format!("Unknown method: {}", method)),
            }
        }
    }
}

// Module: formatter.rs (Output formatting)
mod formatter {
    use chrono::{DateTime, Utc, TimeZone};
    
    pub fn format_hash(hash: &str) -> String {
        if hash.len() > 16 {
            format!("{}...{}", &hash[0..8], &hash[hash.len()-8..])
        } else {
            hash.to_string()
        }
    }

    pub fn format_amount(amount: f64) -> String {
        format!("{:.8} KUBE", amount)
    }

    pub fn format_time(timestamp: i64) -> String {
        let dt: DateTime<Utc> = Utc.timestamp_opt(timestamp, 0).unwrap();
        dt.format("%Y-%m-%d %H:%M:%S UTC").to_string()
    }

    pub fn format_size(bytes: u64) -> String {
        if bytes < 1024 {
            format!("{} B", bytes)
        } else if bytes < 1024 * 1024 {
            format!("{:.2} KB", bytes as f64 / 1024.0)
        } else {
            format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
        }
    }
}

// Module: commands.rs (Command implementations)
mod commands {
    use super::client::KuberCoinClient;
    use super::formatter;
    use serde_json::json;
    use std::{thread, time};

    pub enum Command {
        GetBlock { hash: String, verbose: bool },
        GetTransaction { txid: String, verbose: bool },
        GetAddress { address: String },
        GetHeight,
        Search { query: String },
        Watch { address: String, interval: u64 },
        Stats,
        Mempool,
        Version,
        Help,
    }

    impl Command {
        pub fn parse(cmd: &str, args: &[String]) -> Result<Self, String> {
            match cmd {
                "block" | "b" => {
                    if args.is_empty() {
                        return Err("Missing block hash".to_string());
                    }
                    let verbose = args.len() > 1 && args[1] == "-v";
                    Ok(Command::GetBlock {
                        hash: args[0].clone(),
                        verbose,
                    })
                }
                "tx" | "transaction" => {
                    if args.is_empty() {
                        return Err("Missing transaction ID".to_string());
                    }
                    let verbose = args.len() > 1 && args[1] == "-v";
                    Ok(Command::GetTransaction {
                        txid: args[0].clone(),
                        verbose,
                    })
                }
                "address" | "addr" | "a" => {
                    if args.is_empty() {
                        return Err("Missing address".to_string());
                    }
                    Ok(Command::GetAddress {
                        address: args[0].clone(),
                    })
                }
                "height" | "h" => Ok(Command::GetHeight),
                "search" | "s" => {
                    if args.is_empty() {
                        return Err("Missing search query".to_string());
                    }
                    Ok(Command::Search {
                        query: args[0].clone(),
                    })
                }
                "watch" | "w" => {
                    if args.is_empty() {
                        return Err("Missing address".to_string());
                    }
                    let interval = if args.len() > 1 {
                        args[1].parse().unwrap_or(10)
                    } else {
                        10
                    };
                    Ok(Command::Watch {
                        address: args[0].clone(),
                        interval,
                    })
                }
                "stats" => Ok(Command::Stats),
                "mempool" | "mp" => Ok(Command::Mempool),
                "version" | "v" => Ok(Command::Version),
                "help" | "-h" | "--help" => Ok(Command::Help),
                _ => Err(format!("Unknown command: {}", cmd)),
            }
        }
    }

    pub fn get_block(client: &KuberCoinClient, hash: &str, verbose: bool) -> Result<(), String> {
        let result = client.call("getblock", vec![json!(hash), json!(verbose)])?;
        
        println!("╔════════════════════════════════════════╗");
        println!("║              BLOCK DETAILS             ║");
        println!("╚════════════════════════════════════════╝");
        println!();
        println!("Hash:          {}", result["hash"]);
        println!("Height:        {}", result["height"]);
        println!("Confirmations: {}", result["confirmations"]);
        println!("Time:          {}", formatter::format_time(result["time"].as_i64().unwrap()));
        println!("Size:          {}", formatter::format_size(result["size"].as_u64().unwrap()));
        println!("Transactions:  {}", result["tx"].as_array().unwrap().len());
        
        if verbose {
            println!();
            println!("Transactions:");
            for (i, tx) in result["tx"].as_array().unwrap().iter().enumerate() {
                println!("  {}. {}", i + 1, formatter::format_hash(tx.as_str().unwrap()));
            }
        }
        
        Ok(())
    }

    pub fn get_transaction(client: &KuberCoinClient, txid: &str, verbose: bool) -> Result<(), String> {
        let result = client.call("getrawtransaction", vec![json!(txid), json!(true)])?;
        
        println!("╔════════════════════════════════════════╗");
        println!("║          TRANSACTION DETAILS           ║");
        println!("╚════════════════════════════════════════╝");
        println!();
        println!("TxID:     {}", result["txid"]);
        println!("Size:     {} bytes", result["size"]);
        println!("Version:  {}", result["version"]);
        println!("Locktime: {}", result["locktime"]);
        
        if verbose {
            println!();
            println!("Inputs:");
            for (i, input) in result["vin"].as_array().unwrap().iter().enumerate() {
                println!("  {}. {} : {}", i, 
                    formatter::format_hash(input["txid"].as_str().unwrap()), 
                    input["vout"]);
            }
            
            println!();
            println!("Outputs:");
            for (i, output) in result["vout"].as_array().unwrap().iter().enumerate() {
                println!("  {}. {} → {}", i, 
                    formatter::format_amount(output["value"].as_f64().unwrap()),
                    output["n"]);
            }
        }
        
        Ok(())
    }

    pub fn get_address(client: &KuberCoinClient, address: &str) -> Result<(), String> {
        let result = client.call("getaddressbalance", vec![json!(address)])?;
        
        println!("╔════════════════════════════════════════╗");
        println!("║           ADDRESS DETAILS              ║");
        println!("╚════════════════════════════════════════╝");
        println!();
        println!("Address:  {}", address);
        println!("Balance:  {}", formatter::format_amount(result["balance"].as_f64().unwrap()));
        println!("Received: {}", formatter::format_amount(result["received"].as_f64().unwrap()));
        println!("Sent:     {}", formatter::format_amount(result["sent"].as_f64().unwrap()));
        
        Ok(())
    }

    pub fn get_height(client: &KuberCoinClient) -> Result<(), String> {
        let result = client.call("getblockcount", vec![])?;
        println!("Current block height: {}", result.as_u64().unwrap());
        Ok(())
    }

    pub fn search(client: &KuberCoinClient, query: &str) -> Result<(), String> {
        println!("Searching for: {}", query);
        println!();
        
        // Try as block hash
        if query.len() == 64 {
            println!("Attempting as block hash...");
            if let Ok(_) = client.call("getblock", vec![json!(query)]) {
                return get_block(client, query, false);
            }
        }
        
        // Try as transaction
        if query.len() == 64 {
            println!("Attempting as transaction...");
            if let Ok(_) = client.call("getrawtransaction", vec![json!(query)]) {
                return get_transaction(client, query, false);
            }
        }
        
        // Try as address
        if query.starts_with("kube1") {
            println!("Attempting as address...");
            return get_address(client, query);
        }
        
        // Try as block height
        if let Ok(height) = query.parse::<u64>() {
            println!("Attempting as block height...");
            // Would call getblockhash then getblock
            println!("Block height: {}", height);
            return Ok(());
        }
        
        Err("Could not find matching block, transaction, or address".to_string())
    }

    pub fn watch(client: &KuberCoinClient, address: &str, interval: u64) -> Result<(), String> {
        println!("Watching address: {}", address);
        println!("Checking every {} seconds. Press Ctrl+C to stop.", interval);
        println!();
        
        let mut last_balance: Option<f64> = None;
        
        loop {
            let result = client.call("getaddressbalance", vec![json!(address)])?;
            let balance = result["balance"].as_f64().unwrap();
            
            if let Some(last) = last_balance {
                if balance != last {
                    let change = balance - last;
                    let change_str = if change > 0.0 {
                        format!("+{}", formatter::format_amount(change))
                    } else {
                        formatter::format_amount(change)
                    };
                    
                    println!("[{}] Balance changed: {} ({})",
                        chrono::Utc::now().format("%H:%M:%S"),
                        formatter::format_amount(balance),
                        change_str);
                }
            } else {
                println!("[{}] Initial balance: {}",
                    chrono::Utc::now().format("%H:%M:%S"),
                    formatter::format_amount(balance));
            }
            
            last_balance = Some(balance);
            thread::sleep(time::Duration::from_secs(interval));
        }
    }

    pub fn stats(client: &KuberCoinClient) -> Result<(), String> {
        let height = client.call("getblockcount", vec![])?;
        let mempool = client.call("getmempoolinfo", vec![])?;
        
        println!("╔════════════════════════════════════════╗");
        println!("║         NETWORK STATISTICS             ║");
        println!("╚════════════════════════════════════════╝");
        println!();
        println!("Block Height:        {}", height.as_u64().unwrap());
        println!("Mempool Size:        {} transactions", mempool["size"]);
        println!("Mempool Bytes:       {}", formatter::format_size(mempool["bytes"].as_u64().unwrap()));
        
        Ok(())
    }

    pub fn mempool(client: &KuberCoinClient) -> Result<(), String> {
        let result = client.call("getmempoolinfo", vec![])?;
        
        println!("╔════════════════════════════════════════╗");
        println!("║          MEMPOOL STATISTICS            ║");
        println!("╚════════════════════════════════════════╝");
        println!();
        println!("Size:       {} transactions", result["size"]);
        println!("Bytes:      {}", formatter::format_size(result["bytes"].as_u64().unwrap()));
        
        Ok(())
    }
}
