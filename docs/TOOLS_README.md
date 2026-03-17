# KuberCoin Developer Tools & UIs

Complete guide to all KuberCoin tools, APIs, and user interfaces.

## 🎯 Quick Access

| Tool | URL | Description |
|------|-----|-------------|
| **Node Operator CLI** | `kubercoin-cli` | Node, wallet, miner, explorer, network, config |
| **Terminal Dashboards (TUI)** | `kubercoin-tui` | Status dashboard, block browser, RPC console |
| **Governance CLI** | `kubercoin-gov` | Deployments, forks, readiness checks |
| **Wallet UI** | http://localhost:8080/ | Manage wallets, send transactions |
| **Blockchain Explorer** | [apps/web/explorer](apps/web/explorer) | Browse blocks and transactions |
| **Mining Pool** | [mining-pool/index.html](mining-pool/index.html) | Pool dashboard and stats |
| **Testnet Faucet** | http://localhost:3001/ | Get testnet coins (rate-limited) |
| **JSON-RPC API** | http://localhost:8332/ | Bitcoin-compatible RPC interface |
| **Prometheus Metrics** | http://localhost:9091/metrics | Node metrics for monitoring |
| **Grafana Dashboard** | http://localhost:3000/ | Visual monitoring (credentials from env/compose) |
| **Monitoring Web** | http://localhost:3100/ | Next.js health + metrics dashboard |

---

## 🔧 1. JSON-RPC Server (Port 8332)

Bitcoin-compatible RPC API for programmatic blockchain access.

### Available Methods

```bash
# Get blockchain height
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","id":1}'

# Get best block hash
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getbestblockhash","id":2}'

# Get block by height or hash
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblock","params":[112],"id":3}'

# Get transaction
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"gettransaction","params":["TXID"],"id":4}'

# Get mempool info
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getmempoolinfo","id":5}'

# Get peer info
curl -X POST http://localhost:8332/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getpeerinfo","id":6}'
```

### PowerShell Examples

```powershell
# Get block count
$body = '{"jsonrpc":"2.0","method":"getblockcount","id":1}'
Invoke-WebRequest -Method POST -Uri http://localhost:8332/ -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content

# Get block details
$body = '{"jsonrpc":"2.0","method":"getblock","params":[1],"id":2}'
(Invoke-WebRequest -Method POST -Uri http://localhost:8332/ -Body $body -ContentType "application/json").Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

---

## 💻 2. Wallet UI (Port 8080)

Web-based wallet interface for managing KuberCoin.

### Features

- ✅ View wallet balances (spendable, total, immature)
- ✅ Multiple wallet support
- ✅ Send transactions
- ✅ Automatic mining confirmation
- ✅ Address display

### HTTP API Endpoints

```bash
# Health check
curl http://localhost:8080/api/health

# List wallets
curl http://localhost:8080/api/wallets

# Get wallet balance
curl "http://localhost:8080/api/wallet/balance?name=alice.json"

# Send transaction (POST JSON)
curl -X POST http://localhost:8080/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{"from":"alice.json","to":"ADDRESS","amount":1000000}'
```

---

## 🔍 3. Blockchain Explorer

Interactive web interface for exploring the blockchain.

### How to Use

1. Run the explorer app from [apps/web/explorer](apps/web/explorer)
2. Browse latest blocks
3. Search by:
   - Block height (e.g., `112`)
   - Block hash (64-character hex)
   - Transaction ID (64-character hex)

### Features

- Real-time blockchain statistics
- Latest 10 blocks display
- Block details viewer
- Transaction lookup
- Auto-refresh every 10 seconds

---

## 📚 4. Developer SDKs

Pre-built client libraries for easy integration.

### Python SDK

```bash
cd sdk-examples/python
pip install -r requirements.txt
python kubercoin_example.py
```

**Example Usage:**

```python
from kubercoin_example import KuberCoinClient

client = KuberCoinClient('http://localhost:8332/')

# Get blockchain info
height = client.get_block_count()
best_hash = client.get_best_block_hash()

# Get block
block = client.get_block(height)
print(f"Block {block['height']}: {block['hash']}")

# Get transaction
tx = client.get_transaction(block['tx'][0])
print(f"Inputs: {len(tx['vin'])}, Outputs: {len(tx['vout'])}")
```

### JavaScript/Node.js SDK

```bash
cd sdk-examples/javascript
node kubercoin_example.js
```

**Example Usage:**

```javascript
const { KuberCoinClient } = require('./kubercoin_example');

const client = new KuberCoinClient('http://localhost:8332/');

// Get blockchain info
const height = await client.getBlockCount();
const bestHash = await client.getBestBlockHash();

// Get block
const block = await client.getBlock(height);
console.log(`Block ${block.height}: ${block.hash}`);

// Get transaction
const tx = await client.getTransaction(block.tx[0]);
console.log(`Inputs: ${tx.vin.length}, Outputs: ${tx.vout.length}`);
```

---

## ⛏️ 5. Mining Pool

Stratum-compatible mining pool with web dashboard.

### Pool Configuration

- **Stratum Port**: 3334
- **Dashboard**: [mining-pool/index.html](mining-pool/index.html)
- **Fee**: 1%
- **Reward Model**: PPLNS (Pay Per Last N Shares)

### Connect a Miner

```bash
# Using cpuminer
minerd -a sha256d -o stratum+tcp://localhost:3334 -u worker1 -p x

# Using cgminer
cgminer -o stratum+tcp://localhost:3334 -u worker1 -p x
```

### Pool Dashboard Features

- Real-time pool hashrate
- Active workers monitoring
- Blocks found history
- Payment tracking
- Network difficulty stats

---

## 📊 6. Monitoring & Metrics

### Prometheus Metrics (Port 9091)

```bash
# View raw metrics
curl http://localhost:9091/metrics
```

**Available Metrics:**
- `kubercoin_node_up` - Node status
- `kubercoin_block_height` - Current height
- `kubercoin_network_peers` - Connected peers
- `kubercoin_mempool_size` - Pending transactions
- `kubercoin_network_bytes_sent` - Network traffic
- `kubercoin_network_bytes_received` - Network traffic
- `kubercoin_node_cpu_usage` - CPU percentage
- `kubercoin_node_memory_usage` - Memory percentage

### Grafana Dashboard (Port 3000)

1. Open http://localhost:3000/
2. Login: `admin` / `admin`
3. View pre-configured dashboards:
   - Node health
   - Network activity
   - Block production
   - Resource usage

---

## 🚀 CLI Tools

KuberCoin node provides comprehensive CLI commands.

### Wallet Commands

```bash
# Create wallet
docker exec kubercoin-node kubercoin create-wallet alice.json

# Get address
docker exec kubercoin-node kubercoin get-address alice.json

# Get balance
docker exec kubercoin-node kubercoin get-balance alice.json

# Send transaction
docker exec kubercoin-node kubercoin send alice.json <ADDRESS> <AMOUNT>
```

### Mining Commands

```bash
# Mine blocks to address
docker exec kubercoin-node kubercoin mine-to <ADDRESS> 10

# Single block mine
docker exec kubercoin-node kubercoin mine
```

### Node Commands

```bash
# Check node status
docker exec kubercoin-node kubercoin status

# View blockchain info
docker exec kubercoin-node kubercoin getblockchaininfo
```

---

## 🔗 Integration Examples

### Webhook Notifications

```python
import requests

def on_new_block(block_height):
    """Called when a new block is mined"""
    client = KuberCoinClient()
    block = client.get_block(block_height)
    
    # Send notification
    requests.post('https://your-app.com/webhook', json={
        'event': 'new_block',
        'height': block['height'],
        'hash': block['hash'],
        'transactions': len(block['tx'])
    })
```

### Payment Processor

```javascript
async function processPayment(recipientAddress, amount) {
    const client = new KuberCoinClient();
    
    // Create transaction via wallet API
    const response = await fetch('http://localhost:8080/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'merchant.json',
            to: recipientAddress,
            amount: amount
        })
    });
    
    const result = await response.json();
    
    return {
        txid: result.txid,
        confirmed_height: result.confirmed_height
    };
}
```

### Real-time Block Monitor

```python
import time

def monitor_blockchain():
    client = KuberCoinClient()
    last_height = 0
    
    while True:
        current_height = client.get_block_count()
        
        if current_height > last_height:
            print(f"New block: {current_height}")
            block = client.get_block(current_height)
            print(f"  Hash: {block['hash']}")
            print(f"  Transactions: {len(block['tx'])}")
            last_height = current_height
        
        time.sleep(5)  # Check every 5 seconds
```

---

## 📖 API Reference

### REST API Endpoints (Port 8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Wallet UI (HTML) |
| GET | `/api/health` | Health check |
| GET | `/api/wallets` | List wallet files |
| GET | `/api/wallet/balance?name=X` | Get wallet balance |
| POST | `/api/wallet/send` | Send transaction |

### JSON-RPC Methods (Port 8332)

| Method | Params | Description |
|--------|--------|-------------|
| `getblockcount` | [] | Current height |
| `getbestblockhash` | [] | Tip hash |
| `getblock` | [hash_or_height] | Block details |
| `gettransaction` | [txid] | Transaction details |
| `getmempoolinfo` | [] | Mempool stats |
| `getpeerinfo` | [] | Connected peers |

---

## 🛠️ Development

### Running Tests

```bash
# Rust tests
cargo test

# E2E tests with debug
./tools/e2e-debug.ps1

# Stack-level validation
./tools/e2e-debug.ps1 -Build -RemoveOrphans
```

### Building from Source

```bash
# Build node
cargo build --release --bin kubercoin

# Build Docker image
docker compose build node

# Restart services
docker compose up -d --force-recreate
```

---

## 🔒 Security Notes

- RPC server currently has **no authentication** (development mode)
- In production:
  - Add Basic Auth to RPC endpoints
  - Use HTTPS/TLS encryption
  - Implement rate limiting
  - Restrict wallet API access

---

## 📦 Port Reference

| Port | Service | Description |
|------|---------|-------------|
| 8080 | Wallet API + UI | Web wallet interface |
| 8332 | JSON-RPC | Bitcoin-compatible RPC |
| 8633 | P2P Network | Node communication |
| 9091 | Metrics | Prometheus endpoint |
| 9092 | Prometheus | Metrics aggregation |
| 3000 | Grafana | Monitoring dashboards |
| 3334 | Stratum | Mining pool (future) |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
