# Protocol-Core Migration Checklist

## Purpose

Convert the first split from a crate list into an executable migration order based on actual API usage.

Use these sources together:

- [docs/PROTOCOL_CORE_CONSUMERS.md](docs/PROTOCOL_CORE_CONSUMERS.md)
- [tools/scripts/audit_protocol_consumers.ps1](tools/scripts/audit_protocol_consumers.ps1)
- [tools/scripts/audit_protocol_api_usage.ps1](tools/scripts/audit_protocol_api_usage.ps1)

Regenerate the module-level usage view with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scripts\audit_protocol_api_usage.ps1 -Format table
```

## First Split Boundary

Move together:

- `core/core/tx`
- `core/core/chain`
- `core/core/consensus`
- `core/core/testnet`

Keep in the current repo for the first cut:

- `core/core/storage`
- `core/node`
- `core/mining/miner`
- `core/services/faucet`
- `core/services/lightning`

## Consumer Migration Order

1. `core/node`
2. `core/mining/miner`
3. `core/services/faucet`
4. `core/tests/fuzz`
5. `tools/tx-sender`
6. `core/services/lightning`

## Node Migration Checklist

`core/node` is the first and hardest consumer because it uses all four protocol crates directly and spreads those references across runtime, mempool, RPC, mining, and wallet-adjacent paths.

### Node modules with high protocol coupling

#### `core/node/src/state.rs`
Uses:
- `chain::Block`, `chain::UtxoSet`, UTXO serialization helpers, undo data
- `consensus::validator`, checkpoint logic, difficulty and work functions
- `testnet::NetworkParams`, `testnet::genesis_block`, `testnet::genesis_hash`
- `tx::Transaction`, `tx::OutPoint`, `tx::Address`

Migration meaning:
- this file is the main compatibility gate for the first split
- if protocol-core versions are wrong, this file breaks first

Checklist:
1. Make `state.rs` compile cleanly against released protocol-core versions.
2. Verify genesis loading, work comparison, and UTXO serialization still match runtime expectations.
3. Verify all chain tip, reorg, and checkpoint tests before moving on.

#### `core/node/src/rpc_wallet.rs`
Uses:
- `tx::wallet::*`
- `tx::PrivateKey`
- `tx::Address`
- `tx::Transaction`, `TxInput`, `TxOutput`, `Witness`
- `tx::psbt`, `tx::descriptors`, `tx::bip39`

Migration meaning:
- this is the strongest evidence that `tx` currently contains both protocol and wallet concerns
- for the first split, keep that combined surface intact and version-locked

Checklist:
1. Do not try to extract wallet code from `tx` during the first repo split.
2. Treat wallet RPC as a downstream consumer of the full `tx` crate.
3. Verify wallet RPC tests after converting dependency sources.

#### `core/node/src/rpc_mining.rs`
Uses:
- `chain::Block`, `BlockHeader`, `UtxoSet`
- `consensus::verify_pow`, validator functions, subsidy and difficulty helpers
- `testnet::NetworkParams`
- `tx::Transaction`, `TxOutput`, `Witness`, `Address`

Migration meaning:
- mining APIs are another compatibility gate after `state.rs`
- `testnet` is runtime-critical here, not just configuration data

Checklist:
1. Verify template generation and submission against released protocol-core crates.
2. Verify testnet/regtest-only mining paths still work.

#### `core/node/src/rpc_chain.rs`
Uses:
- transaction decoding and creation from `tx`
- block and difficulty views from `chain` and `consensus`

Checklist:
1. Verify chain query endpoints and raw transaction helpers.
2. Re-run chain/RPC smoke coverage after dependency conversion.

#### `core/node/src/mempool.rs`
Uses:
- `tx::Transaction`
- `chain::UtxoSet`, `chain::Block`
- `consensus::validator` policy helpers

Checklist:
1. Verify mempool validation and block-removal behavior after protocol-core version changes.

#### `core/node/src/main.rs` and `core/node/src/rpc.rs`
Uses:
- `tx::wallet::WalletManager`
- `tx::wallet::WalletFile`
- transaction deserialization via `tx::Transaction`

Checklist:
1. Keep these consumers pinned to the same protocol-core version as `state.rs` and `rpc_wallet.rs`.

## Miner Migration Checklist

`core/mining/miner` has a small protocol surface.

Current direct usage:
- `chain::Block`
- `consensus::verify_pow`

Checklist:
1. Convert to released protocol-core dependencies after `core/node` succeeds.
2. Re-run miner build and smoke validation.

## Faucet Migration Checklist

`core/services/faucet` depends on:
- `tx` transaction and key primitives
- `testnet` network-specific behavior

Checklist:
1. Keep faucet on the same protocol-core version line as node.
2. Verify transaction construction/signing against the released `tx` crate.

## Lightning Migration Checklist

`core/services/lightning` depends on:
- `tx`
- `chain`
- `storage`

Checklist:
1. Migrate this last among runtime consumers.
2. Do not split its `storage` dependency during the first protocol move.

## Completion Gates

Before declaring protocol-core extraction ready:

1. `cargo metadata --no-deps` succeeds.
2. `cargo build --workspace` succeeds.
3. `cargo test --workspace` succeeds.
4. `tools/scripts/audit_protocol_consumers.ps1` and `tools/scripts/audit_protocol_api_usage.ps1` both run cleanly.
5. The `core/node` compatibility gates are verified first, then miner and faucet, then lightning.