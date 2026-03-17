# Protocol-Core Consumer Inventory

## Purpose

This document captures the verified downstream consumers of the first planned extraction target:

- `tx`
- `chain`
- `consensus`
- `testnet`

The goal is to make the first repo split dependency-driven rather than folder-driven.

Regenerate the current manifest-level view with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scripts\audit_protocol_consumers.ps1 -Format table
```

## Protocol-Core Scope

### Crates that move together in the first cut
- `core/core/tx`
- `core/core/chain`
- `core/core/consensus`
- `core/core/testnet`

### Crates explicitly not moved in the first cut
- `core/core/storage`
- `core/node`
- `core/mining/miner`
- `core/services/faucet`
- `core/services/lightning`

## Verified Consumers

### 1. kubercoin-node
Manifest: [core/node/Cargo.toml](core/node/Cargo.toml)

Direct protocol-core dependencies:
- `chain = { path = "../core/chain" }`
- `consensus = { path = "../core/consensus" }`
- `tx = { path = "../core/tx" }`
- `testnet = { path = "../core/testnet" }`

Notes:
- This is the highest-coupling downstream consumer.
- It also depends on `storage`, which stays in `node-platform` for the first split.
- It is the first runtime crate that must be converted from path dependencies to released protocol-core versions.

### 2. kubercoin-miner
Manifest: [core/mining/miner/Cargo.toml](core/mining/miner/Cargo.toml)

Direct protocol-core dependencies:
- `chain = { path = "../../core/chain" }`
- `consensus = { path = "../../core/consensus" }`

Notes:
- This is the easiest consumer to migrate after `kubercoin-node`.
- It already behaves like an external client over RPC plus a small protocol surface.

### 3. kubercoin-faucet
Manifest: [core/services/faucet/Cargo.toml](core/services/faucet/Cargo.toml)

Direct protocol-core dependencies:
- `tx = { path = "../../core/tx" }`
- `testnet = { path = "../../core/testnet" }`

Notes:
- This service constructs and signs transactions directly, so `tx` remains a strong shared dependency.
- It should move after the node consumer contract is stable.

### 4. kubercoin-lightning
Manifest: [core/services/lightning/Cargo.toml](core/services/lightning/Cargo.toml)

Direct protocol-core dependencies:
- `tx = { path = "../../core/tx" }`
- `chain = { path = "../../core/chain" }`

Related non-protocol dependency:
- `storage = { path = "../../core/storage" }`

Notes:
- This is not a first-wave migration target.
- It crosses both the protocol and storage boundaries, so it should move only after the node-platform boundary is stable.

### 5. kubercoin-fuzz
Manifest: [core/tests/fuzz/Cargo.toml](core/tests/fuzz/Cargo.toml)

Direct protocol-core dependencies:
- `tx = { path = "../../core/core/tx" }`
- `chain = { path = "../../core/core/chain" }`
- `consensus = { path = "../../core/core/consensus" }`

Related runtime dependency:
- `node = { package = "kubercoin-node", path = "../../core/node" }`

Notes:
- Fuzzing should be split into two lanes later:
  - protocol-core fuzz targets that only require protocol crates
  - node/runtime fuzz targets that remain with node-platform

### 6. tx-sender
Manifest: [tools/tx-sender/Cargo.toml](tools/tx-sender/Cargo.toml)

Direct protocol-core dependencies:
- `tx = { path = "../../core/core/tx" }`
- `chain = { path = "../../core/core/chain" }`
- `consensus = { path = "../../core/core/consensus" }`

Notes:
- This is a tooling consumer and should migrate late.
- It is a good candidate to pin to released protocol-core crates as a compatibility check.

## Migration Order

Recommended order for converting consumers away from path dependencies:

1. `kubercoin-node`
2. `kubercoin-miner`
3. `kubercoin-faucet`
4. `kubercoin-fuzz` protocol-only targets
5. `tx-sender`
6. `kubercoin-lightning`

## Compatibility Rules For The First Split

1. `tx`, `chain`, `consensus`, and `testnet` must release together.
2. `kubercoin-node` is the compatibility gate for every protocol-core release.
3. `testnet` ownership stays with protocol-core because genesis and seed configuration are part of the network contract.
4. `storage` does not move in the first split.
5. Wallet and key-management code stays inside `tx` for the first split even though it is a future extraction candidate.

## Pre-Extraction Checklist

Before moving any folders into a new repository:

1. `cargo metadata --no-deps` succeeds from the current root.
2. `cargo build --workspace` succeeds from the current root.
3. `cargo test --workspace` succeeds from the current root.
4. `docker build -t kubercoin:ci -f Dockerfile .` succeeds.
5. Every consumer above is accounted for in the release and migration plan.

## Known Non-Goals For This Batch

- Rewriting stale shell launch automation that no longer matches the current CLI.
- Splitting `storage` from the node platform.
- Extracting a standalone wallet library from `tx`.
- Splitting docs into a standalone repository.