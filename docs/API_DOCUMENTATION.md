# Kubercoin API Documentation
## Version 1.0 - March 13, 2026

Complete reference for Kubercoin RPC, REST, and WebSocket APIs.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [RPC API](#rpc-api)
4. [REST API](#rest-api)
5. [WebSocket API](#websocket-api)
6. [Rate Limits](#rate-limits)
7. [Error Codes](#error-codes)
8. [SDKs & Libraries](#sdks--libraries)

---

## Quick Start

### Installation

```bash
# Start node
kubercoin-node --rpc-addr 127.0.0.1:8634

# With authentication (Bearer token)
KUBERCOIN_API_KEYS=replace_with_generated_api_key kubercoin-node
```

### First Request (cURL)

```bash
# RPC: Get blockchain info
curl -H 'Authorization: Bearer replace_with_generated_api_key' -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}'
```

---

## Authentication

### RPC Authentication

**Bearer Token** (set via `KUBERCOIN_API_KEYS` env var):

```bash
# Set API key(s) on startup (comma-separated for multiple)
export KUBERCOIN_API_KEYS=replace_with_generated_api_key
kubercoin-node

# Use in requests
curl -H 'Authorization: Bearer replace_with_generated_api_key' -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
```

### REST/WebSocket Authentication

**No authentication by default** (read-only endpoints).

**API Keys** (for write operations, future):

```bash
# Header: X-API-Key
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:8634/api/transaction
```

### Rate Limiting Tiers

| Tier | Requests/min |
|---|---|
| Free | 60 |
| Standard | 600 |
| Premium | 6,000 |
| Enterprise | Unlimited |

See [Rate Limits](#rate-limits) for details.

---

## RPC API

### Overview

JSON-RPC 2.0 protocol over HTTP POST.

**Endpoint:** `http://localhost:8634/`  
**Method:** POST  
**Content-Type:** `application/json`

### Request Format

```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": [param1, param2, ...],
  "id": 1
}
```

### Response Format

**Success:**

```json
{
  "jsonrpc": "2.0",
  "result": { ...data... },
  "id": 1
}
```

**Error:**

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid request"
  },
  "id": 1
}
```

### Blockchain Methods

#### `getblockchaininfo`

Get blockchain status and statistics.

**Parameters:** None

**Returns:**

```json
{
  "chain": "main",
  "blocks": 150000,
  "headers": 150000,
  "bestblockhash": "00000000000000000007e9e4...",
  "difficulty": 1234567.89,
  "mediantime": 1706620800,
  "verificationprogress": 0.999999,
  "chainwork": "0000000000000000000000000000...",
  "size_on_disk": 123456789,
  "pruned": false
}
```

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}'
```

---

#### `getblockcount`

Get current block height.

**Parameters:** None

**Returns:** `integer` - Current block height

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": 150000,
  "id": 1
}
```

---

#### `getblockhash`

Get block hash by height.

**Parameters:**
- `height` (integer): Block height

**Returns:** `string` - Block hash (hex)

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblockhash","params":[150000],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": "00000000000000000007e9e4c6277937...",
  "id": 1
}
```

---

#### `getblock`

Get block data by hash.

**Parameters:**
- `blockhash` (string): Block hash (hex)
- `verbosity` (integer, optional): 0=hex, 1=json, 2=json+tx details (default: 1)

**Returns:** Block object or hex string

**Example (JSON):**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getblock","params":["00000000000...","1"],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "hash": "00000000000000000007e9e4...",
    "confirmations": 100,
    "height": 150000,
    "version": 2,
    "merkleroot": "4a5e1e4baab89f3a32518a88...",
    "time": 1706620800,
    "nonce": 2573394689,
    "bits": "1a04e8c7",
    "difficulty": 1234567.89,
    "chainwork": "0000000000000000000000...",
    "tx": [
      "e3bf3d07d4b0375638d5f1adf03819dcd172...",
      "1a6d04b5ef9e1b95b2a0f43ec17b9f9b37a4..."
    ],
    "previousblockhash": "000000000000000000034e...",
    "nextblockhash": "000000000000000000089b..."
  },
  "id": 1
}
```

---

### Transaction Methods

#### `getrawtransaction`

Get raw transaction by ID.

**Parameters:**
- `txid` (string): Transaction ID (hex)
- `verbose` (boolean, optional): false=hex (default), true=json

**Returns:** Transaction hex or object

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getrawtransaction","params":["e3bf3d07...","true"],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "txid": "e3bf3d07d4b0375638d5f1adf03819dcd172...",
    "hash": "e3bf3d07d4b0375638d5f1adf03819dcd172...",
    "version": 1,
    "size": 226,
    "vsize": 226,
    "weight": 904,
    "locktime": 0,
    "vin": [
      {
        "txid": "1a6d04b5ef9e1b95b2a0f43ec17b9f9b...",
        "vout": 0,
        "scriptSig": {
          "asm": "304502210...",
          "hex": "48304502210..."
        },
        "sequence": 4294967295
      }
    ],
    "vout": [
      {
        "value": 50.00000000,
        "n": 0,
        "scriptPubKey": {
          "asm": "OP_DUP OP_HASH160 ...",
          "hex": "76a914...",
          "reqSigs": 1,
          "type": "pubkeyhash",
          "addresses": ["KBC1qg5f6m8djklmnfj..."]
        }
      }
    ],
    "blockhash": "00000000000000000007e9e4...",
    "confirmations": 100,
    "time": 1706620800,
    "blocktime": 1706620800
  },
  "id": 1
}
```

---

#### `sendrawtransaction`

Broadcast raw transaction to network.

**Parameters:**
- `hexstring` (string): Raw transaction (hex)
- `maxfeerate` (number, optional): Max fee rate (KBC/kB)

**Returns:** `string` - Transaction ID

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"sendrawtransaction","params":["0100000001..."],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": "e3bf3d07d4b0375638d5f1adf03819dcd172...",
  "id": 1
}
```

---

### Wallet Methods

#### `getnewaddress`

Generate new receiving address.

**Parameters:**
- `label` (string, optional): Address label
- `address_type` (string, optional): "legacy", "p2sh-segwit", "bech32"

**Returns:** `string` - New address

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getnewaddress","params":["","bech32"],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": "kbc1qg5f6m8djklmnfj48d3v9z2l3r4t5y6u7i8o9p0",
  "id": 1
}
```

---

#### `getbalance`

Get wallet balance.

**Parameters:**
- `minconf` (integer, optional): Minimum confirmations (default: 1)
- `include_watchonly` (boolean, optional): Include watch-only addresses

**Returns:** `number` - Balance in KBC

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getbalance","params":[],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": 123.45678900,
  "id": 1
}
```

---

#### `sendtoaddress`

Send KBC to address.

**Parameters:**
- `address` (string): Recipient address
- `amount` (number): Amount in KBC
- `comment` (string, optional): Note (not on blockchain)
- `subtractfeefromamount` (boolean, optional): Deduct fee from amount

**Returns:** `string` - Transaction ID

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"sendtoaddress","params":["kbc1q...",10.5],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": "e3bf3d07d4b0375638d5f1adf03819dcd172...",
  "id": 1
}
```

---

### Network Methods

#### `getpeerinfo`

Get connected peer information.

**Parameters:** None

**Returns:** Array of peer objects

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getpeerinfo","params":[],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "id": 1,
      "addr": "192.168.1.100:8633",
      "addrlocal": "192.168.1.50:54321",
      "services": "000000000000040d",
      "lastsend": 1706620800,
      "lastrecv": 1706620799,
      "bytessent": 123456,
      "bytesrecv": 654321,
      "conntime": 1706520000,
      "timeoffset": 0,
      "pingtime": 0.123,
      "version": 70016,
      "subver": "/Kubercoin:1.0.0/",
      "inbound": false,
      "startingheight": 149900,
      "banscore": 0,
      "synced_headers": 150000,
      "synced_blocks": 150000
    }
  ],
  "id": 1
}
```

---

#### `getnetworkinfo`

Get network status.

**Parameters:** None

**Returns:** Network information object

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getnetworkinfo","params":[],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "version": 10000,
    "subversion": "/Kubercoin:1.0.0/",
    "protocolversion": 70016,
    "localservices": "000000000000040d",
    "localrelay": true,
    "timeoffset": 0,
    "networkactive": true,
    "connections": 8,
    "networks": [
      {
        "name": "ipv4",
        "limited": false,
        "reachable": true,
        "proxy": "",
        "proxy_randomize_credentials": false
      }
    ],
    "relayfee": 0.00001000,
    "incrementalfee": 0.00001000,
    "localaddresses": []
  },
  "id": 1
}
```

---

### Mining Methods

#### `getmininginfo`

Get mining statistics.

**Parameters:** None

**Returns:** Mining information object

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"getmininginfo","params":[],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "blocks": 150000,
    "currentblockweight": 4000,
    "currentblocktx": 1234,
    "difficulty": 1234567.89,
    "networkhashps": 123456789012345.67,
    "pooledtx": 4567,
    "chain": "main"
  },
  "id": 1
}
```

---

#### `generatetoaddress`

Mine blocks to address (regtest only).

**Parameters:**
- `nblocks` (integer): Number of blocks to generate
- `address` (string): Coinbase address
- `maxtries` (integer, optional): Max iterations

**Returns:** Array of block hashes

**Example:**

```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' -X POST http://localhost:8634/ \
  -d '{"jsonrpc":"2.0","method":"generatetoaddress","params":[10,"kbc1q..."],"id":1}'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": [
    "00000000000000000007e9e4...",
    "00000000000000000009a1b2...",
    ...
  ],
  "id": 1
}
```

---

## REST API

### Overview

RESTful HTTP API for read-only operations (no authentication).

**Base URL:** `http://localhost:8634/api`  
**Format:** JSON  
**Methods:** GET, POST

### Endpoints

#### `GET /block/latest`

Get latest block.

**Response:**

```json
{
  "hash": "00000000000000000007e9e4...",
  "height": 150000,
  "time": 1706620800,
  "txCount": 1234,
  "size": 123456,
  "weight": 456789,
  "difficulty": 1234567.89
}
```

---

#### `GET /block/:hash`

Get block by hash.

**Parameters:**
- `hash` (path): Block hash

**Response:** (same as `/block/latest`)

---

#### `GET /block/height/:height`

Get block by height.

**Parameters:**
- `height` (path): Block height

**Response:** (same as `/block/latest`)

---

#### `GET /transaction/:txid`

Get transaction by ID.

**Parameters:**
- `txid` (path): Transaction ID

**Response:**

```json
{
  "txid": "e3bf3d07...",
  "block": "00000000...",
  "confirmations": 100,
  "time": 1706620800,
  "inputs": [...],
  "outputs": [...],
  "fee": 0.00001,
  "size": 226
}
```

---

#### `GET /address/:address`

Get address information.

**Parameters:**
- `address` (path): KBC address

**Response:**

```json
{
  "address": "kbc1q...",
  "balance": 123.456,
  "received": 500.789,
  "sent": 377.333,
  "txCount": 42,
  "unspentOutputs": 5
}
```

---

#### `GET /mempool`

Get mempool statistics.

**Response:**

```json
{
  "size": 4567,
  "bytes": 1234567,
  "usage": 234567890,
  "maxmempool": 300000000,
  "mempoolminfee": 0.00001
}
```

---

#### `GET /stats`

Get network statistics.

**Response:**

```json
{
  "blockHeight": 150000,
  "difficulty": 1234567.89,
  "hashrate": 123456789012345.67,
  "peers": 8,
  "mempoolSize": 4567,
  "price": {
    "usd": 45.67,
    "btc": 0.00123456
  }
}
```

---

## WebSocket API

### Overview

Real-time updates via WebSocket connections.

**Endpoint:** `ws://localhost:9090/ws`  
**Protocol:** JSON messages

### Connection

```javascript
const ws = new WebSocket('ws://localhost:9090/ws');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('Error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

### Subscription

**Subscribe to channel:**

```json
{
  "type": "subscribe",
  "channel": "blocks"
}
```

**Unsubscribe:**

```json
{
  "type": "unsubscribe",
  "channel": "blocks"
}
```

### Channels

#### `blocks`

New block notifications.

**Subscribe:**

```json
{"type":"subscribe","channel":"blocks"}
```

**Events:**

```json
{
  "channel": "blocks",
  "data": {
    "hash": "00000000...",
    "height": 150001,
    "time": 1706620810,
    "txCount": 1235
  }
}
```

---

#### `transactions`

New transaction notifications.

**Subscribe:**

```json
{"type":"subscribe","channel":"transactions"}
```

**Filter by address (optional):**

```json
{
  "type": "subscribe",
  "channel": "transactions",
  "filter": {
    "address": "kbc1q..."
  }
}
```

**Events:**

```json
{
  "channel": "transactions",
  "data": {
    "txid": "e3bf3d07...",
    "inputs": [...],
    "outputs": [...],
    "fee": 0.00001
  }
}
```

---

#### `mempool`

Mempool updates.

**Subscribe:**

```json
{"type":"subscribe","channel":"mempool"}
```

**Events:**

```json
{
  "channel": "mempool",
  "data": {
    "added": ["txid1", "txid2"],
    "removed": ["txid3"],
    "size": 4568
  }
}
```

---

## Rate Limits

### Limits by Tier

| Tier | Requests/min | Burst |
|---|---|---|
| Free | 60 | 10 |
| Standard | 600 | 100 |
| Premium | 6,000 | 1,000 |
| Enterprise | Unlimited | Unlimited |

### Headers

Rate limit info is returned in headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1706620860
```

### Exceeded Limit

**Status Code:** 429 Too Many Requests

**Response:**

```json
{
  "error": "Rate limit exceeded",
  "limit": 60,
  "remaining": 0,
  "resetAt": 1706620860
}
```

---

## Error Codes

### RPC Error Codes

| Code | Message |
|---|---|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -1 | Misc error |
| -3 | Invalid amount |
| -4 | Out of memory |
| -5 | Invalid address |
| -6 | Insufficient funds |
| -8 | Block not found |
| -25 | Tx rejected |

### REST Error Codes

| HTTP Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service unavailable |

---

## SDKs & Libraries

### Official SDKs

**JavaScript/TypeScript:**

```bash
npm install kubercoin-js
```

```javascript
const Kubercoin = require('kubercoin-js');

const client = new Kubercoin({
  host: 'localhost',
  port: 8634,
  username: 'admin',
  password: 'secret123'
});

const info = await client.getBlockchainInfo();
console.log(info);
```

**Python:**

```bash
pip install kubercoin
```

```python
from kubercoin import KubercoinRPC

client = KubercoinRPC('admin', 'secret123', 'localhost', 8634)
info = client.getblockchaininfo()
print(info)
```

**Go:**

```bash
go get github.com/kubercoin/kubercoin-go
```

```go
package main

import (
    "github.com/kubercoin/kubercoin-go"
)

func main() {
    client := kubercoin.NewClient("localhost:8634", "admin", "secret123")
    info, err := client.GetBlockchainInfo()
    if err != nil {
        panic(err)
    }
    fmt.Println(info)
}
```

---
## Support

- **Documentation:** https://kuber-coin.com/docs
- **Discord:** https://discord.gg/kubercoin
- **GitHub:** https://github.com/kubercoin/kubercoin
- **Email:** connect@kuber-coin.com

---

**Version:** 1.0  
**Last Updated:** March 13, 2026  
**License:** MIT
