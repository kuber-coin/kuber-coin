# KuberCoin Security Quick Start Guide
## Using the New Security Features

This guide covers the security enhancements implemented in Phase 1 of the security hardening process.

---

## 1. API Authentication

### Setup

```bash
# Generate a secure API key (32+ characters)
openssl rand -hex 32

# Set environment variable
export KUBERCOIN_API_KEYS="your-generated-api-key-here"

# Multiple keys (comma-separated)
export KUBERCOIN_API_KEYS="key1,key2,key3"
```

### Usage

```bash
# RPC request with API key
curl -X POST http://localhost:8332/rpc \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "get_balance",
    "params": [],
    "id": 1
  }'
```

### Error Responses

```json
// Missing API key
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Unauthorized: No API key provided"
  },
  "id": null
}

// Invalid API key
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Unauthorized: Invalid API key"
  },
  "id": null
}
```

---

## 2. CORS Configuration

### Development (Default)

No configuration needed. Defaults allow:
- `http://localhost:3000`
- `http://localhost:3200`
- `http://localhost:8080`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3200`
- `http://127.0.0.1:8080`

### Production

```bash
# Whitelist specific domains
export KUBERCOIN_CORS_ORIGINS="https://app.kuber-coin.com,https://wallet.kuber-coin.com"

# Allow all (UNSAFE - development only!)
export KUBERCOIN_CORS_ORIGINS="*"
```

### Testing CORS

```bash
# Preflight request
curl -X OPTIONS http://localhost:8332 \
  -H "Origin: https://app.kuber-coin.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"

# Actual request
curl -X POST http://localhost:8332/rpc \
  -H "Origin: https://app.kuber-coin.com" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"jsonrpc":"2.0","method":"get_blockchain_info","params":[],"id":1}'
```

### CORS Headers Returned

```
Access-Control-Allow-Origin: https://app.kuber-coin.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
Vary: Origin
```

---

## 3. Rate Limiting

### Per-Endpoint Limits

| Endpoint Category | Limit | Burst | Ban After |
|-------------------|-------|-------|-----------|
| Read Operations | 1000/min | +100 | 5 violations |
| Write Operations | 100/min | +10 | 3 violations |
| Sensitive Operations | 10/min | +2 | 2 violations |

### Endpoint Classifications

**Read Operations** (1000/min):
- `get_block`
- `get_transaction`
- `get_balance`
- `get_address_info`
- `get_blockchain_info`

**Write Operations** (100/min):
- `transfer`
- `send_transaction`
- `broadcast_block`

**Sensitive Operations** (10/min):
- `create_wallet`
- `unlock_wallet`
- `export_private_key`

### Rate Limit Responses

```json
// Rate Limited
{
  "jsonrpc": "2.0",
  "error": {
    "code": 429,
    "message": "Rate limit exceeded for endpoint: transfer",
    "data": {
      "retry_after_seconds": 60,
      "violations": 1
    }
  },
  "id": 1
}

// Endpoint Banned
{
  "jsonrpc": "2.0",
  "error": {
    "code": 403,
    "message": "IP banned for endpoint: unlock_wallet",
    "data": {
      "banned_until": "2024-12-01T15:30:00Z"
    }
  },
  "id": 1
}

// Globally Banned
{
  "jsonrpc": "2.0",
  "error": {
    "code": 403,
    "message": "IP globally banned",
    "data": {
      "banned_until": "2024-12-01T17:00:00Z"
    }
  },
  "id": 1
}
```

### Testing Rate Limits

```bash
# Test read endpoint limit (1000/min + 100 burst)
for i in {1..1150}; do
  curl -X POST http://localhost:8332/rpc \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"get_block","params":["hash"],"id":'$i'}' &
done
wait

# Test sensitive endpoint limit (10/min + 2 burst)
for i in {1..15}; do
  curl -X POST http://localhost:8332/rpc \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"unlock_wallet","params":["password"],"id":'$i'}'
  sleep 1
done
```

---

## 4. Input Size Limits

### Configured Limits

```rust
MAX_TRANSACTION_SIZE     = 1 MB      // Individual transaction
MAX_BLOCK_SIZE           = 4 MB      // Block size
MAX_SCRIPT_SIZE          = 10 KB     // Script bytecode
MAX_P2P_MESSAGE_SIZE     = 32 MB     // P2P messages
MAX_RPC_REQUEST_SIZE     = 1 MB      // RPC request body
MAX_TX_INPUTS            = 1,000     // Transaction inputs
MAX_TX_OUTPUTS           = 1,000     // Transaction outputs
MAX_LOOP_ITERATIONS      = 10,000    // Script iterations
MAX_MEMPOOL_SIZE         = 300 MB    // Mempool total
MAX_CACHE_SIZE           = 500 MB    // Cache total
```

### Error Responses

```json
// Oversized request
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Request size 2000000 exceeds maximum 1048576"
  },
  "id": null
}

// Too many inputs
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Transaction has too many inputs"
  },
  "id": 1
}
```

---

## 5. Wallet Encryption

### Enhanced Security

The wallet now uses **Argon2id** with high-security parameters:

```rust
Memory Cost:  64 MB     // 3.4x stronger than default
Time Cost:    3 iterations
Parallelism:  4 lanes
Algorithm:    Argon2id  // GPU/ASIC resistant
```

### Performance Impact

- **Encryption Time**: ~0.5-1.0 seconds
- **Decryption Time**: ~0.5-1.0 seconds
- **Memory Usage**: 64 MB during operation

### Usage

```rust
// Create and encrypt wallet
let wallet = Wallet::new();
let encrypted_data = wallet.encrypt("strong-password")?;

// Save encrypted wallet
std::fs::write("wallet.dat", &encrypted_data)?;

// Load and decrypt wallet
let encrypted_data = std::fs::read("wallet.dat")?;
let wallet = Wallet::decrypt(&encrypted_data, "strong-password")?;
```

### Password Requirements

Recommended:
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Not based on dictionary words
- Unique to this wallet

With Argon2id:
- 8-character password: ~1 hour to crack (1 million attempts)
- 12-character password: Years to crack
- 16-character password: Centuries to crack

---

## 6. Script Execution Safety

### Loop Bounds

Scripts are limited to **10,000 iterations** to prevent infinite loops:

```rust
const MAX_SCRIPT_ITERATIONS: usize = 10_000;
const MAX_SCRIPT_SIZE: usize = 10 * 1024; // 10 KB
```

### Error Responses

```json
// Iteration limit exceeded
{
  "error": "Script execution exceeded maximum iterations"
}

// Script too large
{
  "error": "Script signature exceeds maximum size"
}
```

### Impact

- Prevents DOS through infinite loops
- Ensures deterministic execution time
- Protects node resources

---

## 7. Error Message Sanitization

### Information Disclosure Prevention

Errors are sanitized to prevent information leakage:

**Before (Vulnerable)**:
```
Error: Invalid signature: secp256k1 error - invalid signature format
Error: Public key too short: expected 33 bytes, got 32
Error: Hash mismatch: expected 1a2b3c..., got 4d5e6f...
```

**After (Secure)**:
```
Error: Script signature validation failed
Error: Script validation failed
Error: Script validation failed
```

### Benefits

- Prevents attackers from probing internals
- No information about expected formats
- No hints about valid/invalid data
- Timing attacks mitigated with constant-time operations

---

## Complete Example: Secure API Call

```bash
#!/bin/bash

# Configuration
API_KEY="your-32-character-api-key-here"
API_URL="https://node.kuber-coin.com:8332/rpc"
ORIGIN="https://app.kuber-coin.com"

# Make authenticated, CORS-compliant request
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  --max-time 30 \
  --retry 3 \
  -d '{
    "jsonrpc": "2.0",
    "method": "get_balance",
    "params": ["address"],
    "id": 1
  }'
```

---

## Monitoring & Debugging

### Enable Debug Logging

```bash
# Set log level
export RUST_LOG=debug

# Start node with logging
./kubercoin --log-level debug
```

### Check Authentication

```bash
# Test authentication
curl -v -X POST http://localhost:8332/rpc \
  -H "Authorization: Bearer test-key" \
  -d '{"jsonrpc":"2.0","method":"ping","params":[],"id":1}'

# Look for:
# < HTTP/1.1 401 Unauthorized  (bad key)
# < HTTP/1.1 200 OK            (good key)
```

### Check Rate Limits

```bash
# Monitor rate limit headers (if implemented)
curl -I http://localhost:8332/rpc \
  -H "Authorization: Bearer your-key"

# Look for:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 95
# X-RateLimit-Reset: 1234567890
```

### Check CORS

```bash
# Verify CORS headers
curl -v -X OPTIONS http://localhost:8332 \
  -H "Origin: https://app.kuber-coin.com"

# Look for:
# < Access-Control-Allow-Origin: https://app.kuber-coin.com
# < Access-Control-Allow-Methods: GET, POST, OPTIONS
```

---

## Troubleshooting

### Authentication Issues

**Problem**: "Unauthorized: No API key provided"  
**Solution**: Ensure `Authorization: Bearer <key>` header is set

**Problem**: "Unauthorized: Invalid API key"  
**Solution**: Verify `KUBERCOIN_API_KEYS` environment variable is set correctly

**Problem**: API key rejected after setting environment variable  
**Solution**: Restart the node to reload environment variables

### CORS Issues

**Problem**: "CORS policy: No 'Access-Control-Allow-Origin' header"  
**Solution**: Add your origin to `KUBERCOIN_CORS_ORIGINS`

**Problem**: CORS works in development but not production  
**Solution**: Ensure `KUBERCOIN_CORS_ORIGINS` includes production domain with `https://`

**Problem**: Preflight request fails  
**Solution**: Ensure server handles OPTIONS method

### Rate Limiting Issues

**Problem**: Rate limited too quickly  
**Solution**: Check if multiple services share same IP. Consider increasing limits.

**Problem**: Ban not expiring  
**Solution**: Manually unban via admin interface or wait for ban duration

**Problem**: Different endpoints sharing limits  
**Solution**: They shouldn't - verify `EnhancedRateLimiter` is being used

### Performance Issues

**Problem**: Wallet encryption/decryption slow  
**Solution**: This is expected (~0.5-1s). It's a security feature. Consider caching decrypted wallet.

**Problem**: Script validation slow  
**Solution**: Ensure scripts are within size limits. Consider optimizing script complexity.

---

## Security Checklist

### Before Deployment

- [ ] Strong API keys generated (32+ characters)
- [ ] `KUBERCOIN_API_KEYS` environment variable set
- [ ] `KUBERCOIN_CORS_ORIGINS` configured for production domains
- [ ] TLS/HTTPS enabled (required for API key security)
- [ ] Rate limits tested with expected load
- [ ] Wallet encryption tested
- [ ] Error messages sanitized (no sensitive info)
- [ ] Monitoring and logging configured

### After Deployment

- [ ] Monitor authentication failures
- [ ] Track rate limit violations
- [ ] Review banned IPs
- [ ] Test CORS from production domains
- [ ] Verify wallet encryption performance
- [ ] Check error logs for information disclosure
- [ ] Regular security audits

---

## API Key Management

### Generation

```bash
# Strong random key
openssl rand -hex 32

# Or use Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Storage

```bash
# Store in environment file
echo "KUBERCOIN_API_KEYS=your-key-here" >> .env

# Load from file
export $(cat .env | xargs)

# Or use systemd environment file
# /etc/systemd/system/kubercoin.service.d/override.conf
[Service]
Environment="KUBERCOIN_API_KEYS=your-key-here"
```

### Rotation

```bash
# Add new key while keeping old
export KUBERCOIN_API_KEYS="old-key,new-key"

# Update clients to use new key

# Remove old key after migration
export KUBERCOIN_API_KEYS="new-key"
```

---

## Best Practices

### API Keys
1. Generate keys with cryptographic random number generator
2. Minimum 32 characters (256 bits entropy)
3. Store in environment variables, not in code
4. Rotate keys regularly (e.g., every 90 days)
5. Use different keys for different services/environments
6. Never commit keys to version control

### CORS
1. Use specific origins, not wildcards in production
2. Include protocol (https://) in origin
3. Test from actual production domains
4. Don't use `*` in production

### Rate Limiting
1. Monitor violation patterns
2. Adjust limits based on legitimate usage
3. Whitelist known good IPs if needed
4. Set up alerts for repeated bans

### Wallet Security
1. Use strong passwords (12+ characters)
2. Store encrypted wallets in secure locations
3. Back up wallet files
4. Never share wallet passwords
5. Consider hardware wallet integration

---

## Additional Resources

- [SECURITY_HARDENING_GUIDE.md](SECURITY_HARDENING_GUIDE.md) - Hardening controls and implementation guidance
- [SECURITY.md](SECURITY.md) - Security policy and reporting
- [docs/SECURITY_HARDENING_GUIDE.md](docs/SECURITY_HARDENING_GUIDE.md) - Comprehensive hardening guide
- [docs/SECURITY_AWARENESS.md](docs/SECURITY_AWARENESS.md) - Security awareness training

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Status**: Complete - Phase 1 Security Features
