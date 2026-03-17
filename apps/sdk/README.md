# KuberCoin SDK

Client packages and integration examples for the KuberCoin node API.

## npm Package — `@kubercoin/client`

The official JavaScript/TypeScript client for Node.js and browser environments.

```bash
npm install @kubercoin/client
```

```js
import { KubercoinClient } from '@kubercoin/client';

const client = new KubercoinClient({ url: 'http://localhost:8634', apiKey: 'mykey' });
const height = await client.getBlockCount();
```

See **[packages/js/README.md](packages/js/README.md)** for full API reference and TypeScript types.

## Quick Reference

- [CURL Cheatsheet](examples/CURL_CHEATSHEET.md) — command-line examples for every endpoint
- [JavaScript Example](examples/javascript/kubercoin_example.js) — Node.js client using `fetch`
- [Python Example](examples/python/kubercoin_example.py) — Python client using `requests`

## API Overview

The KuberCoin node exposes a single HTTP server (default **port 8634**):

| Path | Method | Description |
|------|--------|-------------|
| `/` | POST | JSON-RPC 2.0 endpoint |
| `/api/health` | GET | Node health status |
| `/api/info` | GET | Node version and network info |
| `/api/peers` | GET | Connected peer list |
| `/api/balance/:addr` | GET | Address balance |
| `/api/tx` | POST | Submit raw transaction (`{"tx_hex":"..."}`) |
| `/api/tx/:txid` | GET | Get transaction by txid |
| `/ws` | WS | Real-time WebSocket events |
| `/metrics` | GET | Prometheus-format metrics |

## Authentication

Set `KUBERCOIN_API_KEYS` (comma-separated) when starting the node. Pass the key as a Bearer token:

```bash
curl -H "Authorization: Bearer <your-api-key>" http://localhost:8634/api/info
```

## JSON-RPC

```bash
curl -H "Authorization: Bearer <key>" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:8634/ \
     -d '{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}'
```

See `getinfo`, `getblockcount`, `getblock`, `getrawtransaction`, `sendrawtransaction`, and many more — call `help` for a full list.
