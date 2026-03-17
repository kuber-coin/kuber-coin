//! KuberCoin Testnet Faucet CLI

use anyhow::Result;
use clap::{Parser, Subcommand};
use kubercoin_faucet::{FaucetConfig, run_server};
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "kubercoin-faucet")]
#[command(about = "KuberCoin Testnet Faucet Server")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the faucet server
    Run {
        /// Config file path
        #[arg(short, long, default_value = "faucet.toml")]
        config: PathBuf,
        
        /// Listen address (overrides config)
        #[arg(short, long)]
        listen: Option<String>,
        
        /// Node RPC URL (overrides config)
        #[arg(short, long)]
        node: Option<String>,
    },
    
    /// Generate default config file
    Init {
        /// Output file path
        #[arg(short, long, default_value = "faucet.toml")]
        output: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();
    
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Run { config, listen, node } => {
            let mut faucet_config = if config.exists() {
                let content = fs::read_to_string(&config)?;
                toml::from_str(&content)?
            } else {
                tracing::warn!("Config file not found, using defaults");
                FaucetConfig::default()
            };
            
            // Apply overrides
            if let Some(addr) = listen {
                faucet_config.listen_addr = addr;
            }
            if let Some(url) = node {
                faucet_config.node_url = url;
            }
            
            run_server(faucet_config).await?;
        }
        
        Commands::Init { output } => {
            let config = FaucetConfig::default();
            let content = toml::to_string_pretty(&config)?;
            fs::write(&output, content)?;
            println!("Created config file: {}", output.display());
        }
    }
    
    Ok(())
}
