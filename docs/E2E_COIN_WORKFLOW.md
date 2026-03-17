# Kubercoin Coin Workflow (Real-World Flow)

Date: 2026-03-16

## Purpose
Document how the current local stack is exercised end-to-end using the same
paths a user or integration would use in production: RPC, REST-backed web UIs,
and Prometheus metrics.

## Prerequisites
- Windows host with Docker running.
- Build tools installed for Rust.
- API key available for RPC auth through `KUBERCOIN_API_KEYS`.

## Run Command
- PowerShell:
  - scripts\e2e_extended.ps1

## Current Validated Commands
- Live stack smoke:
  - `powershell -ExecutionPolicy Bypass -File tools\scripts\e2e_live.ps1`
- Wallet live Playwright suite:
  - `npm --prefix apps/web/wallet run test:e2e:live`
- VS Code wallet live task:
  - `wallet-web-e2e-live`

## What The Workflow Does
1. Uses the running local Docker stack with the node on `8634`, wallet web on
  `3250`, explorer on `3200`, ops on `3300`, and Prometheus on `9092`.
2. Performs RPC baseline calls with API key authentication:
   - getblockcount
   - getblockchaininfo
   - getblock (best)
3. Confirms the wallet API proxy is reachable through `/api/wallets` and
  `/api/wallet/balance`.
4. Confirms the primary web UIs are reachable.
5. Confirms Prometheus can scrape the node and exposes the current block-height
  metric.
6. Runs the wallet live Playwright suite against the real stack when deeper
  coverage is required.

## Expected Output
- A successful run message.
- RPC baseline returns a valid chain height and best hash.
- Wallet live suite can create/select wallets, send transactions, and inspect
  history against the real stack.

## Ports Used (Current Local Run)
- Node RPC / REST / metrics: `8634`
- Wallet web: `3250`
- Explorer web: `3200`
- Operations web: `3300`
- Prometheus: `9092`

## Common Issues And Fixes
- RPC Unauthorized: verify API key is provided in the Authorization header.
- Wallet API 404s in live smoke: ensure wallet checks target the wallet web port
  (`3250`) instead of the node port.
- Monitoring mismatches: ensure the metrics endpoint reflects the same chain
  state used by RPC and that Prometheus queries `kubercoin_block_height`.
- WebSocket expectations: the current node runtime does not expose `/ws`; live
  smoke treats that as an unsupported capability and skips it.

## Run Result (Log)
- Date: 2026-03-16
- Status: PASS
- Notes:
  - `tools\scripts\e2e_live.ps1` passed against the current Docker stack
  - wallet live Playwright suite passed `88/88`
  - wallet live critical subset passed `12/12`

## Next Steps
- Optional: run `wallet-web-e2e-live` from the VS Code Tasks UI.
- Optional: run `npm --prefix apps/web/wallet run test:e2e:live:critical` for a
  quicker wallet-only gate.
- Optional: run `test-complete.ps1` for the broader legacy/full-suite path.
