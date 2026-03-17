# KuberCoin Miner

Standalone mining executable for KuberCoin.

## Building

```bash
cargo build --release --package kubercoin-miner
```

The executable will be at: `target/release/kubercoin-miner` (or `kubercoin-miner.exe` on Windows)

## Usage

### Basic mining

```bash
# Mine 50 blocks to an address
kubercoin-miner --address mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY

# Mine 100 blocks
kubercoin-miner -a mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY -b 100

# Continuous mining (until stopped)
kubercoin-miner -a mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY -b 0
```

### With authentication

```bash
# Using command-line API key
kubercoin-miner -a ADDRESS -k your-api-key

# Using environment variable
export KUBERCOIN_API_KEY=your-api-key
kubercoin-miner -a ADDRESS
```

### Custom RPC endpoint

```bash
kubercoin-miner -a ADDRESS -r http://localhost:8332
```

### Verbose output

```bash
kubercoin-miner -a ADDRESS -v
```

### All options

```bash
kubercoin-miner --help
```

## Options

- `-a, --address <ADDRESS>` - Address to mine to (required)
- `-b, --blocks <BLOCKS>` - Number of blocks to mine (default: 50, use 0 for continuous)
- `-r, --rpc-url <URL>` - RPC endpoint URL (default: http://127.0.0.1:8332)
- `-k, --api-key <KEY>` - API key for authentication (can use env: KUBERCOIN_API_KEY)
- `-d, --delay <MS>` - Delay between blocks in milliseconds (default: 100)
- `-v, --verbose` - Verbose output showing each block hash
- `-h, --help` - Show help information

## Examples

### Mine with default settings

```bash
# Windows
kubercoin-miner.exe -a mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY

# Linux/macOS
./kubercoin-miner -a mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY
```

### Mine continuously

```bash
kubercoin-miner -a mxhxGux5fNZkKGxgvkH8SyQr5ZHLbHoDgY -b 0
```

Press Ctrl+C to stop.

### Fast mining (no delay)

```bash
kubercoin-miner -a ADDRESS -d 0
```

### Mine to remote node

```bash
kubercoin-miner -a ADDRESS -r http://192.168.1.100:8332 -k remote-api-key
```

## Distribution

After building, you can distribute just the single executable file:
- Windows: `kubercoin-miner.exe`
- Linux: `kubercoin-miner`
- macOS: `kubercoin-miner`

No other dependencies needed at runtime.
