# KuberCoin API Cheatsheet (curl)

The KuberCoin node serves all traffic — REST, JSON-RPC, WebSocket, and metrics — on a
single port (default **8634**). All examples assume the node is running on `localhost:8634`.

## REST API

```bash
# Node info
curl http://localhost:8634/api/info

# Health check
curl http://localhost:8634/api/health

# Get block by hash
curl http://localhost:8634/api/block/<hash>

# Get block by height
curl http://localhost:8634/api/block-by-height/<height>

# Address balance
curl http://localhost:8634/api/balance/1YourAddressHere

# Mempool contents
curl http://localhost:8634/api/mempool

# Connected peers
curl http://localhost:8634/api/peers

# Submit a signed raw transaction (POST)
curl -X POST http://localhost:8634/api/tx \
  -H "Content-Type: application/json" \
  -d '{"tx_hex":"<raw_tx_hex>"}'

# Get transaction by txid
curl http://localhost:8634/api/tx/<txid>
```

## JSON-RPC API

All JSON-RPC calls go to `POST http://localhost:8634/` and require the `X-API-Key` header
when the node is started with `KUBERCOIN_API_KEYS` set.

```bash
# Block count
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'

# Blockchain info
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getblockchaininfo","params":[],"id":1}'

# Get best block hash
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getbestblockhash","params":[],"id":1}'

# Get block by hash (verbosity 1 = object, 0 = hex)
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getblock","params":["BLOCKHASH",1],"id":1}'

# Get block hash for height
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getblockhash","params":[100],"id":1}'

# Mempool info
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getmempoolinfo","params":[],"id":1}'

# Peer info
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getpeerinfo","params":[],"id":1}'

# Get raw transaction (verbose)
curl -X POST http://localhost:8634/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","method":"getrawtransaction","params":["TXID",true],"id":1}'
```

## WebSocket

```bash
# Subscribe to new blocks and transactions (using websocat)
websocat ws://localhost:8634/ws

# Messages received:
# {"type":"block","data":{...}}
# {"type":"transaction","data":{...}}
```

## Prometheus Metrics

```bash
curl http://localhost:8634/metrics
```
