# @kubercoin/client

Official JavaScript/TypeScript client for the [KuberCoin](https://github.com/kubercoin/kubercoin) node JSON-RPC and REST API.

[![npm version](https://img.shields.io/npm/v/@kubercoin/client.svg)](https://www.npmjs.com/package/@kubercoin/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @kubercoin/client
```

Or from the local repo:

```bash
npm install /path/to/kubercoin/apps/sdk/packages/js
```

## Requirements

- Node.js ≥ 18 (uses native `fetch`)
- A running KuberCoin node (`kubercoin-node`) at the configured RPC address

## Quick Start

```js
import { KubercoinClient } from '@kubercoin/client';

const client = new KubercoinClient({
  url: 'http://localhost:8634',
  apiKey: process.env.KUBERCOIN_API_KEY,  // omit if no auth configured
});

// Get current chain height
const height = await client.getBlockCount();
console.log('Chain height:', height);

// Get best block
const hash = await client.getBestBlockHash();
const block = await client.getBlock(hash);
console.log('Latest block:', block);

// Check mempool
const mempool = await client.getMempoolInfo();
console.log('Mempool size:', mempool.size);
```

## API Reference

### `new KubercoinClient(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'http://localhost:8634'` | Node RPC URL |
| `apiKey` | `string` | `undefined` | Bearer auth token |
| `timeoutMs` | `number` | `30000` | Request timeout (ms) |

### Blockchain

| Method | Returns | Description |
|---|---|---|
| `getBlockCount()` | `Promise<number>` | Current chain height |
| `getBestBlockHash()` | `Promise<string>` | Hex hash of the tip block |
| `getBlockchainInfo()` | `Promise<BlockchainInfo>` | Full chain statistics |
| `getBlockHash(height)` | `Promise<string>` | Block hash at given height |
| `getBlock(hash)` | `Promise<BlockInfo>` | Block data by hash |
| `getBlockByHeight(height)` | `Promise<BlockInfo>` | Block data by height |
| `getRawTransaction(txid, verbose?)` | `Promise<string\|object>` | Transaction data |

### Mempool

| Method | Returns | Description |
|---|---|---|
| `getMempoolInfo()` | `Promise<MempoolInfo>` | Size and byte count |
| `getRawMempool()` | `Promise<string[]>` | All txids in mempool |
| `sendRawTransaction(hex)` | `Promise<string>` | Submit raw transaction, returns txid |

### Network

| Method | Returns | Description |
|---|---|---|
| `getConnectionCount()` | `Promise<number>` | Number of connected peers |
| `getPeerInfo()` | `Promise<PeerInfo[]>` | Peer details |

### REST

| Method | Returns | Description |
|---|---|---|
| `health()` | `Promise<{status}>` | Node health (no auth required) |
| `info()` | `Promise<object>` | Version, network, height, peers |
| `getBalance(address)` | `Promise<{total, spendable, immature}>` | Address balance |
| `getAddressTxs(address)` | `Promise<object[]>` | Transaction history |

### Low-level

| Method | Description |
|---|---|
| `rpc(method, params?)` | Raw JSON-RPC call |
| `rest(path)` | Raw REST GET call |

## Error Handling

All errors throw a `KubercoinError`:

```js
import { KubercoinClient, KubercoinError } from '@kubercoin/client';

try {
  await client.getBlock('0000000000000000000invalid');
} catch (err) {
  if (err instanceof KubercoinError) {
    console.error(`[${err.type}] ${err.message} (code: ${err.code})`);
    // err.type: 'network' | 'auth' | 'rateLimit' | 'http' | 'rpc'
  }
}
```

## TypeScript

Types are included — no `@types` package needed:

```ts
import { KubercoinClient, type BlockInfo, type ClientOptions } from '@kubercoin/client';
```

## Node.js Authentication

Start your node with an API key:

```bash
KUBERCOIN_API_KEYS=replace_with_generated_api_key kubercoin-node
```

Then pass it to the client:

```js
const client = new KubercoinClient({
  url: 'http://localhost:8634',
  apiKey: 'replace_with_generated_api_key',
});
```

## License

MIT — see [LICENSE](../../LICENSE) in the repository root.
