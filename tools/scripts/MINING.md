# Mining Tools

Quick-start mining scripts for KuberCoin across all platforms.

## Quick Start

### Windows (PowerShell)

```powershell
# Mine 50 blocks (default)
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1

# Mine custom number of blocks
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1 -Blocks 100

# Mine to specific wallet
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1 -Wallet my_wallet.json -Blocks 200
```

### Linux / macOS (Bash)

```bash
# Mine 50 blocks (default)
bash scripts/mine_now.sh

# Mine custom number of blocks
bash scripts/mine_now.sh wallet_mine.json 100

# Mine to specific wallet
bash scripts/mine_now.sh my_wallet.json 200
```

## Environment Variables

Both scripts respect these environment variables:

- `KUBERCOIN_TEST_MODE` - Set to `1` to disable rate limiting (default: 1)
- `KUBERCOIN_API_KEYS` - API key for node authentication (default: local-dev-key)

### Example with custom environment

**Windows:**
```powershell
$env:KUBERCOIN_TEST_MODE=1
$env:KUBERCOIN_API_KEYS="my-api-key"
powershell -ExecutionPolicy Bypass -File scripts\mine_now.ps1
```

**Linux/macOS:**
```bash
export KUBERCOIN_TEST_MODE=1
export KUBERCOIN_API_KEYS="my-api-key"
bash scripts/mine_now.sh
```

## What It Does

1. **Ensures binary exists** - Builds `kubercoin` in release mode if needed
2. **Creates/reuses wallet** - Uses existing wallet or creates a new one
3. **Mines blocks** - Generates the specified number of blocks to your wallet address
4. **Shows balance** - Displays wallet balance after mining (note: blocks need maturity time before becoming spendable)

## Block Maturity

Newly mined blocks are "immature" and cannot be spent immediately. They require 100 additional blocks to be mined on top before becoming spendable. Mine more blocks or wait for network activity to mature your rewards.

## VS Code Task

You can also run mining from VS Code:
- Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
- Type "Run Task"
- Select `mine-now` (if configured in `.vscode/tasks.json`)

## Tips

- **Test mode**: Always run with `KUBERCOIN_TEST_MODE=1` for local development to avoid rate limits
- **Parallel mining**: Don't run multiple mining scripts simultaneously—they'll conflict
- **Check balance**: Use `kubercoin get-balance <wallet.json>` anytime to check your balance
- **Multiple addresses**: Create different wallets for different mining addresses

## Troubleshooting

**"Binary not found"**
- Run `cargo build --release` manually first
- Check that you're in the project root directory

**"Port already in use"**
- Another node instance is running
- Kill existing processes or use different ports

**"Permission denied" (Linux/macOS)**
- Make the script executable: `chmod +x scripts/mine_now.sh`

**Balance shows "immature"**
- This is normal—mine 100+ more blocks to mature your rewards
- Or wait for network activity if connected to other nodes
