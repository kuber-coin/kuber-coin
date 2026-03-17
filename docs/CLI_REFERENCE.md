# KuberCoin CLI Tools - Complete Reference

## 🚀 Quick Start

```bash
# Node status
kubercoin-cli node status

# Explore blockchain
kubercoin-cli explorer recent --count 10

# Interactive dashboards
kubercoin-tui status      # Real-time node monitoring
kubercoin-tui explorer    # Browse blocks interactively
kubercoin-tui console     # RPC command REPL

# Governance
kubercoin-gov list
kubercoin-gov deployments
```

## 📦 Available Binaries

| Binary | Purpose | Status |
|--------|---------|--------|
| `kubercoin-cli` | Command-line interface | ✅ Complete |
| `kubercoin-tui` | Interactive terminal UI | ✅ Complete |
| `kubercoin-gov` | Governance management | ✅ Complete |
| `kubercoin` | Full node daemon | ✅ Running |

---

## ⛓️ kubercoin (node binary)

This repo also ships a lightweight CLI on the `kubercoin` node binary itself. It’s used by the local demo scripts in `scripts/` and is handy for deterministic local testing.

### Commands

```bash
kubercoin mine [count] [--json]                 # Mine blocks (default: 10)
kubercoin mine-to <address> [count] [--json]    # Mine blocks paying to an address

kubercoin new-wallet [path] [--json]            # Create new wallet (default: wallet.json)
kubercoin get-address [path] [--json]           # Show default wallet address
kubercoin get-balance [path] [--json]           # Show wallet balance
kubercoin generate [path] [count] [--json]      # Generate new addresses (default: 1)

kubercoin send <wallet> <to_address> <amount>   # Single-recipient send (mines 1 confirming block)
kubercoin send <wallet> <to_address> <amount> --fee 1000
kubercoin send <wallet> <to_address> <amount> --dry-run              # Preview without broadcast/mining
kubercoin send <wallet> <to_address> <amount> --dry-run --json        # Machine-readable preview
kubercoin send <wallet> <to_address> <amount> --json                  # Machine-readable receipt

# Multi-recipient send (single transaction, multiple outputs; mines 1 confirming block)
kubercoin send-many <wallet> <json_or_file> [fee]

# Richer UX forms (no JSON needed)
kubercoin send-many <wallet> <to:amount> <to:amount> ... [--fee <fee>]
kubercoin send-many <wallet> <to> <amount> <to> <amount> ... [--fee <fee>]
```

Notes:

- `--json` is designed for scripting and prints a single JSON object to stdout.
- `--format json` and `--format=json` are accepted as equivalents to `--json`.
- In JSON mode, errors also print a single JSON object to stdout and exit with code `1`.
- If you need *pure JSON output*, run the compiled binary (for example `target\release\kubercoin.exe`) rather than `cargo run`, because Cargo warnings can appear in the terminal output.

Quick examples:

```bash
# JSON help (useful for scripting / introspection)
target\release\kubercoin.exe --json

# Mine with JSON output
target\release\kubercoin.exe mine 1 --json

# `--format json` is equivalent to `--json`
target\release\kubercoin.exe mine 1 --format json

# Create a wallet with JSON output
target\release\kubercoin.exe new-wallet wallet_demo.json --json

# Generate addresses with JSON output
target\release\kubercoin.exe generate wallet_demo.json 3 --json
```

JSON contract smoke test:

```powershell
# Validates that JSON-mode commands print a single JSON object to stdout
# (and that stderr stays empty) for both success and failure cases.
powershell -ExecutionPolicy Bypass -File scripts\cli_json_smoke.ps1
```

### `send-many` JSON format

Pass either an inline JSON array or a path to a JSON file:

```json
[
  {"to": "ADDR1", "amount": 2000000},
  {"to": "ADDR2", "amount": 1500000},
  {"to": "ADDR3", "amount": 1000000}
]
```

Tip (Windows PowerShell): write JSON as UTF-8 without BOM to avoid parsing issues when passing a JSON file to `send-many`.

### `send-many` token formats

Colon tokens:

```bash
kubercoin send-many wallet_a.json mtGc...:2000000 n2Jq...:1500000 n47Y...:1000000 --fee 1000
```

PowerShell tip: if you build the token from a variable, use braces to avoid scope parsing:

```powershell
$to = kubercoin get-address wallet_b.json
kubercoin send-many wallet_a.json ("${to}:2000000") --fee 1000
```

Pair tokens:

```bash
kubercoin send-many wallet_a.json mtGc... 2000000 n2Jq... 1500000 n47Y... 1000000 --fee 1000
```

### `send-many --dry-run`

Preview a multi-recipient transaction (coin selection, fee, change, inputs/outputs) without broadcasting or mining:

```bash
kubercoin send-many wallet_a.json mtGc...:2000000 n2Jq...:1500000 n47Y...:1000000 --fee 1000 --dry-run
```

Add `--json` to print the preview as JSON (useful for scripting).

You can also pass `--json` without `--dry-run` to print the successful send result (txid + mined block) as JSON.

## 🖥️ kubercoin-cli

Comprehensive command-line tool for all node operations.

### Global Flags

```bash
-r, --rpc-url <URL>     RPC server URL [default: http://localhost:8634]
-r, --rpc-user <USER>   RPC username [env: KUBERCOIN_RPC_USER]
-p, --rpc-pass <PASS>   RPC password [env: KUBERCOIN_RPC_PASS]
    --format <FORMAT>    Output format: text, json, table [default: text]
```

### Node Commands

```bash
kubercoin-cli node status           # Get current node status
kubercoin-cli node info             # Detailed node information
kubercoin-cli node validate         # Validate blockchain integrity
kubercoin-cli node validate --from 0 --to 100  # Validate range
```

### Wallet Commands

```bash
kubercoin-cli wallet list                    # List all wallets
kubercoin-cli wallet create alice            # Create simple wallet
kubercoin-cli wallet create --hd --words 24 bob  # Create HD wallet
kubercoin-cli wallet balance alice           # Check balance
kubercoin-cli wallet backup alice --output backup.json
kubercoin-cli wallet restore alice --input backup.json
```

### Mining Commands

```bash
kubercoin-cli miner status                   # Mining status
kubercoin-cli miner stats                    # Statistics
kubercoin-cli miner benchmark --rounds 100000  # Benchmark hashrate
```

**Example Output:**
```text
Benchmark Results
  Rounds:     100000
  Duration:   2.34s
  Hashrate:   42735.04 H/s
```

### Explorer Commands

```bash
kubercoin-cli explorer block 100              # Get block by height
kubercoin-cli explorer block <hash>           # Get block by hash
kubercoin-cli explorer block 100 --verbose    # Include transactions
kubercoin-cli explorer tx <txid>              # Get transaction
kubercoin-cli explorer search <query>         # Universal search
kubercoin-cli explorer mempool               # Mempool info
kubercoin-cli explorer recent --count 20     # Recent blocks
```

**Example Output:**
```text
Recent 5 Blocks

  112 000009fa3b48afe9 (0 txs)
  111 0000096781f79a14 (0 txs)
  110 00000bb6f6f3da97 (0 txs)
```

### Network Commands

```bash
kubercoin-cli network peers          # List connected peers
kubercoin-cli network info           # Network information
kubercoin-cli network bandwidth      # Bandwidth statistics
```

### Configuration Commands

```bash
kubercoin-cli config show            # Show current config
kubercoin-cli config set rpc_url http://localhost:8634
kubercoin-cli config get rpc_url
kubercoin-cli config reset           # Reset to defaults
```

**Config File:** `~/.kubercoin/config.json`

---

## 🎨 kubercoin-tui

Interactive terminal dashboards using `ratatui`.

### Status Dashboard

Real-time node monitoring with auto-refresh.

```bash
kubercoin-tui status
```

**Features:**
- Block height & best block hash
- Connected peers count
- Mempool size
- Sync progress gauge
- Auto-refresh every 5 seconds

**Keybindings:**
- `q` or `Esc` - Quit
- `r` - Force refresh

### Block Explorer

Interactive blockchain browser with vim-style navigation.

```bash
kubercoin-tui explorer
```

**Features:**
- Browse recent 20 blocks
- Vim-style navigation (j/k or arrow keys)
- Block details (height, hash, transaction count)
- Visual selection highlighting

**Keybindings:**
- `↑`/`↓` or `j`/`k` - Navigate
- `r` - Refresh
- `q` - Quit

### RPC Console

Interactive REPL for JSON-RPC commands.

```bash
kubercoin-tui console
```

**Features:**
- Full RPC command support
- Command history (last 50)
- Pretty-printed JSON responses
- Error handling with feedback

**Keybindings:**
- `Enter` - Execute command
- `Ctrl+C` - Clear input
- `Ctrl+Q` or `Esc` - Quit

**Example Commands:**
```text
> getblockcount
112

> getblock 100
{
  "hash": "...",
  "height": 100,
  ...
}
```

---

## 🏛️ kubercoin-gov

Governance and protocol upgrade management.

### List Proposals

```bash
kubercoin-gov list                   # All proposals
kubercoin-gov list --status active   # Filter by status
```

### Proposal Details

```bash
kubercoin-gov get 1                  # Get proposal #1
```

### Create Proposal

```bash
kubercoin-gov create \
  --type softfork \
  --title "Enable Taproot" \
  --description "Activate Schnorr signatures"
```

### Vote on Proposal

```bash
kubercoin-gov vote 1 yes --wallet alice
```

### BIP9 Deployments

```bash
kubercoin-gov deployments            # Show BIP9 status
```

**Example Output:**
```text
BIP9 Deployment Status

Current Height: 112

Active Deployments:
  • SegWit - Active (height 0)
  • Taproot - Defined (not started)
```

### Fork Schedule

```bash
kubercoin-gov forks                  # Activation schedule
```

### Upgrade Readiness

```bash
kubercoin-gov readiness              # Network upgrade status
```

---

## 🔗 Integration Examples

### PowerShell Script

```powershell
# Monitor node and alert on issues
$status = kubercoin-cli node status --format json | ConvertFrom-Json
if ($status.peers -eq 0) {
    Write-Host "WARNING: No peers connected!" -ForegroundColor Red
}
```

### Bash Script

```bash
#!/bin/bash
# Backup all wallets daily
for wallet in $(kubercoin-cli wallet list --format json | jq -r '.wallets[]'); do
    kubercoin-cli wallet backup $wallet --output "/backup/${wallet}_$(date +%Y%m%d).json"
done
```

### Python Integration

```python
import subprocess
import json

def get_block_height():
    result = subprocess.run(
        ['kubercoin-cli', 'node', 'status', '--format', 'json'],
        capture_output=True,
        text=True
    )
    data = json.loads(result.stdout)
    return data['height']

print(f"Current height: {get_block_height()}")
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KUBERCOIN_RPC_URL` | RPC server URL | `http://localhost:8634` |
| `KUBERCOIN_RPC_USER` | RPC username | None |
| `KUBERCOIN_RPC_PASS` | RPC password | None |

**Example:**

```bash
export KUBERCOIN_RPC_URL=http://node.kuber-coin.com:8634
export KUBERCOIN_RPC_USER=admin
export KUBERCOIN_RPC_PASS=secret

kubercoin-cli node status
```

---

## 📊 Output Formats

All commands support multiple output formats:

### Text (Default)

Human-readable colored output.

```bash
kubercoin-cli node status
```

### JSON

Machine-readable JSON for scripting.

```bash
kubercoin-cli node status --format json
```

Output:
```json
{
  "height": 112,
  "best_block": "000009fa...",
  "peers": 0,
  "mempool_size": 0
}
```

### Table

Tabular format (where applicable).

```bash
kubercoin-cli explorer recent --format table
```

---

## 🛠️ Advanced Usage

### Blockchain Validation

Validate entire chain or specific range:

```bash
# Full validation
kubercoin-cli node validate --from 0

# Range validation
kubercoin-cli node validate --from 1000 --to 2000
```

### Mining Benchmark

Measure local hashrate:

```bash
kubercoin-cli miner benchmark --rounds 1000000
```

**Typical Output:**
- Consumer CPU: 30,000 - 50,000 H/s
- High-end CPU: 80,000 - 150,000 H/s

### Universal Search

Search by height, block hash, or transaction ID:

```bash
kubercoin-cli explorer search 100           # By height
kubercoin-cli explorer search 000009fa...   # By block hash
kubercoin-cli explorer search abc123...     # By txid
```

---

## 🐛 Troubleshooting

### Connection Refused

```bash
Error: connection refused
```

**Solution:** Ensure node is running on port 8634.

```bash
docker compose ps node
curl http://localhost:8634
```

### RPC Authentication Failed

```bash
Error: RPC error: unauthorized
```

**Solution:** Set RPC credentials.

```bash
export KUBERCOIN_RPC_USER=user
export KUBERCOIN_RPC_PASS=pass
```

### TUI Not Rendering

Terminal must support:
- ANSI colors
- Unicode characters
- Minimum 80x24 resolution

**Test:**
```bash
echo $TERM
# Should be: xterm-256color, screen-256color, or similar
```

---

## 📚 Additional Resources

- **RPC API Reference:** [TOOLS_README.md](TOOLS_README.md)
- **Web Interfaces:** `http://localhost:8080` (Wallet UI), `apps/web/explorer` (Block Explorer app)
- **Metrics:** `http://localhost:9091/metrics` (Prometheus)
- **Source Code:** `node/src/bin/` and `node/src/cli/`

---

## 🎯 Quick Reference Card

| Task | Command |
|------|---------|
| Node status | `kubercoin-cli node status` |
| List wallets | `kubercoin-cli wallet list` |
| Recent blocks | `kubercoin-cli explorer recent` |
| Benchmark mining | `kubercoin-cli miner benchmark` |
| Interactive status | `kubercoin-tui status` |
| Browse blocks | `kubercoin-tui explorer` |
| RPC console | `kubercoin-tui console` |
| Governance list | `kubercoin-gov list` |

---

**Version:** 0.1.0  
**Last Updated:** March 13, 2026  
**License:** MIT
