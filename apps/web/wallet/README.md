# KuberCoin Wallet Web

Web-based wallet management UI for KuberCoin.

## Features

- **Wallet Selection**: View and manage multiple wallets
- **Balance Tracking**: Real-time balance updates
- **Send Transactions**: Send coins with automatic block confirmation
- **Address Management**: View wallet addresses

## Quick Start

```bash
# Install dependencies
npm install

# Create environment configuration
cat > .env.local <<'EOF'
KUBERCOIN_WALLET_API_URL=http://localhost:8634
# Optional: set only when the wallet API requires bearer auth
# KUBERCOIN_WALLET_API_KEY=replace_me
EOF

# Start development server
npm run dev

# Open http://localhost:3250
```

## Configuration

Edit `.env.local`:

```bash
KUBERCOIN_WALLET_API_URL=http://localhost:8634
# Optional: set only when the wallet API requires bearer auth
# KUBERCOIN_WALLET_API_KEY=replace_me
```

## Creating Wallets

Use the CLI to create wallets:

```bash
# Create new wallet
kubercoin-cli wallet create mywallet.json

# Create HD wallet
kubercoin-cli wallet create myhd.json --hd --words 12
```

Wallets are stored in `/data/kubercoin/` and automatically detected by this UI.

## Production Build

```bash
npm run build
npm start
```

## Live E2E Testing

The wallet app has a dedicated Playwright live suite that runs against the real
Docker-backed node and web stack on localhost.

Prerequisites:

- Docker compose stack running with the wallet web on `http://localhost:3250`
- Node RPC/API available on `http://localhost:8634`
- Test API key provided through `KUBERCOIN_API_KEYS` and
  `KUBERCOIN_TEST_API_KEY`

Commands:

```bash
# Full live wallet suite
npm run test:e2e:live

# Critical live subset
npm run test:e2e:live:critical

# Open the live HTML report
npm run test:e2e:live:report
```

VS Code task:

```text
wallet-web-e2e-live
```

Current validated state as of 2026-03-16:

- `wallet-web-e2e-live` runs the full live suite with the local test key preset
- Full live suite passed `88/88`
- Critical live subset passed `12/12`

Notes:

- Live readiness is based on wallet app endpoints that are actually exposed in
  the current runtime: `/api/stats` and `/api/wallets`
- The wallet live suite no longer depends on the broader `/api/status` route,
  which also includes monitoring checks and can cause unrelated test skips

## API Routes

- `GET /api/wallets` - List available wallets
- `GET /api/wallet/balance?name=<wallet.json>` - Get wallet balance
- `POST /api/wallet/send` - Send transaction

## Navigation

- Explorer: http://localhost:3200
- Monitoring Dashboard: http://localhost:3100
- Operations Dashboard: http://localhost:3300
