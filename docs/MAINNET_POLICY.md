# Mainnet Policy

**Status:** Pre-launch — this document records the conservative operational policy
under which mainnet will operate. Treat early mainnet as operational hardening,
not as proof of Bitcoin-class maturity.

## Chain Parameters

Full parameter inventory in `docs/CONSENSUS_FREEZE.md`.

| Parameter | Value |
|-----------|-------|
| Max supply | 21 000 000 KUBER |
| Initial block reward | 50 KUBER |
| Halving interval | 210 000 blocks |
| Difficulty adjustment | Every 2016 blocks |
| Target block time | 600 seconds (10 min) |
| Max block weight | 4 000 000 WU |
| Coinbase maturity | 100 blocks |
| Max future block time | 7200 seconds |
| Max block sigops cost | 80 000 |
| Max reorg depth | 100 blocks |
| Dust threshold | 546 satoshis |
| Min relay fee rate | 1000 sat/kB |

Genesis block hash: `0000067aeba8c6ae3383ea38e108651add328687f4d0b6ba6c3ae36d1bddd07de`

No checkpoints are used at launch. Checkpoint support may be added after
sufficient operational history exists.

## Upgrade Policy

### Soft Forks

Soft forks tighten existing rules. They are deployed as:

1. Signal-ready release published with activation parameters.
2. Miner signaling via version bits (BIP 9 style) for at least 2016 blocks.
3. Activation at the first retarget boundary after threshold is met.
4. Minimum 90-day notice between release and earliest possible activation.

### Hard Forks

Hard forks loosen or change existing rules. They require:

1. Public specification document with rationale.
2. Implementation in a release branch with full test coverage.
3. At least 180-day notice before activation height.
4. Explicit opt-in by node operators upgrading to the new binary.
5. Emergency hard forks (consensus bugs) may use a shorter timeline
   but still require public disclosure as soon as a fix is available.

### Consensus Change Control

Any change to files listed in `docs/CONSENSUS_FREEZE.md` requires:

- A dedicated pull request touching only consensus-critical files.
- Review from at least two maintainers.
- Full test suite passing including adversarial tests.
- Explicit documentation update to the consensus freeze document.

## Disclosure and Security

### Vulnerability Reporting

Report vulnerabilities to **connect@kuber-coin.com** per `SECURITY.md`.
Do not open public issues for security vulnerabilities.

| Commitment | Timeline |
|-----------|----------|
| Acknowledge receipt | 48 hours |
| Detailed response | 7 business days |
| Fix deployment | Depends on severity |

### Disclosure Timeline

| Severity | Disclosure Window |
|----------|------------------|
| Critical (consensus, supply, key material) | Coordinated: patch first, disclose after operators upgrade |
| High (DoS, peer manipulation) | 30 days after fix is released |
| Medium/Low | 90 days after fix is released |

### Incident Response

Full playbooks in `docs/INCIDENT_RESPONSE.md`.

| Severity | Response Time | Example |
|----------|---------------|---------|
| P0 Critical | Immediate | Consensus failure, 51% attack, supply bug |
| P1 High | < 1 hour | Chain fork, widespread node crashes |
| P2 Medium | < 4 hours | API outage, performance degradation |
| P3 Low | < 24 hours | UI bugs, documentation errors |

## Hardware Requirements

### Full Node (minimum)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Network | 50 GB/month | 100 GB/month |
| OS | Linux (Ubuntu 22.04+), macOS, Windows | Linux (Ubuntu 22.04 LTS) |

### Mining Node

Higher-spec hardware is recommended for mining. See `docs/MINING_GUIDE.md`.

### Cloud Reference

| Provider | Instance |
|----------|----------|
| AWS | c6i.2xlarge (8 vCPU, 16 GB) |
| DigitalOcean | CPU-optimized 4 vCPU |
| Hetzner | CPX31 (4 vCPU, 8 GB) |

## Supported Node Configuration

### Required Environment Variables (mainnet/testnet)

| Variable | Purpose |
|----------|---------|
| `KUBERCOIN_API_KEYS` | Comma-separated API keys (min 32 chars each) |

### Optional Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KUBERCOIN_HTTP_PORT` | 8080 (mainnet), 18080 (testnet) | HTTP API port |
| `KUBERCOIN_RPC_PORT` | 8332 (mainnet), 18332 (testnet) | RPC port |
| `KUBERCOIN_HTTP_BIND` | 0.0.0.0 | HTTP bind address |
| `KUBERCOIN_RPC_BIND` | 0.0.0.0 | RPC bind address |
| `KUBERCOIN_INITIAL_PEERS` | DNS seeds | Comma-separated peer addresses |
| `KUBERCOIN_API_AUTH_ENABLED` | true (mainnet/testnet) | Require API authentication |

### Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8633 | TCP | P2P (mainnet) |
| 8332 | TCP | RPC (mainnet) |
| 8080 | TCP | HTTP API (mainnet) |
| 9091 | TCP | Metrics (Prometheus) |

## Known Limitations

The following limitations are known and accepted for v1 launch:

1. **No Taproot script-path spending.** Only key-path Taproot is supported.
   Script-path witness spending is explicitly rejected.

2. **No compact block filters (BIP 157/158).** Light clients must use the HTTP API
   or connect to a trusted full node.

3. **No Stratum mining protocol.** The standalone miner uses the HTTP template API.
   Pool operators must implement their own Stratum bridge.

4. **Single-threaded block validation.** Blocks are validated sequentially.
   Parallel validation may be added in a future release.

5. **In-memory UTXO set.** The full UTXO set is held in memory. Nodes with
   very large chains may require more RAM than the minimum specification.

6. **No wallet encryption at rest.** Wallet files are stored as plaintext JSON.
   Operators should use OS-level disk encryption.

7. **Lightning is not included.** The `lightning/` crate is descoped from v1.
   See `docs/V1_SCOPE_AND_DESCOPES.md`.

## Experimental Features

The following features exist in the codebase but are **off by default** on mainnet:

| Feature | Status | Enable With |
|---------|--------|-------------|
| RPC mining (`generatetoaddress`) | Regtest/test-mode only | `KUBERCOIN_TEST_MODE=1` |
| WebSocket subscriptions | Enabled but non-consensus | Default on |
| Compact blocks (BIP 152) | Enabled for relay | Default on |

No experimental features affect consensus behavior.
