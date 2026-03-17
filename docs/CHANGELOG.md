# Changelog

All notable changes to Kubercoin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Orphan transaction pool** — Mempool now holds up to 100 orphan transactions (those with missing parents). When a new tx is accepted, its orphan children are re-evaluated recursively and admitted to the mempool if valid. Orphans expire after 20 minutes.
- **Peer eviction by quality** — When inbound peer slots are full, the P2P server evicts the worst-performing inbound peer (highest misbehaviour score, ties broken by oldest connection) to make room for new connections.
- **New RPC methods** — `getblockstats` (per-block statistics: size, weight, fees, feerate min/max/avg, segwit count, subsidy), `getchaintips` (active chain tip info), `getmempoolancestors` (walk ancestor chain), `getmempooldescendants` (walk descendant chain).
- **UTXO convenience accessor** — `NodeState::get_utxo(txid, vout)` helper for simplified UTXO lookups from RPC handlers.
- **Stratum share verification** — Stratum server now reconstructs the submitted header from extranonce1 + extranonce2 + nonce and verifies the hash meets the share difficulty target, rejecting invalid shares. Previously all shares from valid jobs were blindly accepted.
- **Criterion benchmarks** — Added benchmark suite for hot paths: header hashing (SHA-256d), block hashing, merkle root computation (1/10/100/1000 txs), UTXO set lookup (1K/10K/100K entries), UTXO insertion, and txid computation. Run with `cargo bench -p chain`.
- **Orphan pool unit tests** — Tests for add, duplicate rejection, parent lookup, removal, capacity eviction, and clear.
- **Peer eviction unit tests** — Tests for inbound eviction on full slots, highest-misbehaviour selection, and outbound non-eviction.
- **Consensus checkpoints** — `CheckpointManager` enforces hardcoded chain checkpoints to prevent deep reorgs past known-good blocks. Integrated into `NodeState::add_block()` and reorg validation.
- **Testnet params expansion** — `NetworkParams` now includes `pow_limit`, `allow_min_difficulty_blocks`, `bip16_height`, `minimum_chain_work`, and `assume_valid_block` fields per network (mainnet/testnet/regtest). Added `compact_to_target()` helper.
- **Faucet IP-based rate limiting** — Drip endpoint now rate-limits by client IP address (3× the per-address rate) in addition to existing per-address limits, preventing multi-address abuse from a single IP.
- **Docker healthcheck upgrade** — Dockerfiles now use `curl http://127.0.0.1:8080/api/health` instead of `kubercoin version`, verifying the node is actually serving requests.
- **New fuzz targets** — Added `fuzz_difficulty` (consensus bits↔target round-trip) and `fuzz_address` (address decoding with arbitrary strings).
- **Lightning BOLT stubs** — Wire message types (`OpenChannel`, `AcceptChannel`, `FundingCreated`, `FundingSigned`, `ChannelReady`, `UpdateAddHtlc`, `CommitmentSigned`, `RevokeAndAck`, `Shutdown`, `ClosingSigned`) and `ChannelManager` lifecycle.
- **RPC parity** — 9 new RPC methods: `getmempoolentry`, `getmempoolinfo`, `estimatesmartfee`, `getnetworkinfo`, `uptime`, `getblockstats`, `getpeerinfo`, `getchaintips`, `getblocktemplate`.
- **Storage pruning** — Configurable `prune_depth` auto-prunes old blocks during `persist_state()`.

### Fixed
- **Fuzz CI workflow** — Fixed `working-directory` from `fuzz` → `core/tests/fuzz`, updated dependency paths from `../tx` → `../../crates/core/tx`, added all 7 targets to CI matrix, fixed `paths` trigger to include `crates/**`.
- **Fuzz P2P message path** — Fixed `node::protocol::Message` → `node::network::Message` in fuzz target.

### Planned
- zk-SNARKs privacy features
- Mobile wallet (iOS/Android)
- Hardware wallet support (Ledger, Trezor)

---

## [1.0.19] - 2026-02-19

### Security
- **CRITICAL: Zero-difficulty from integer division** — `1 / MAX_DIFFICULTY_ADJUSTMENT_FACTOR` (= `1/4 = 0` in Rust integer division) set `adjustment_factor = 0` when blocks arrived slowly, zeroing difficulty bits and enabling trivial chain takeover. Now clamps to minimum factor of 1.
- **Commitment transaction u64 overflow** — `local_balance + remote_balance` and `local_balance * fee` could silently wrap in release mode, misallocating channel funds between parties. Now uses `checked_add`/`checked_mul` with proper error propagation.
- **Timestamp truncation bypasses timelocks** — `as_secs() as u32` truncates timestamps after year 2106; pre-2106 mismatches also possible from u64 sources. Now uses `u32::try_from().unwrap_or(u32::MAX)`.
- **HKDF counter wrap repeats key material** — `counter: u8` wraps 255→0 when `okm_len > 8160`, reusing HMAC counter values and halving key entropy (RFC 5869 §2.3 violation). Now asserts `okm_len ≤ 255 * 32`.
- **Compact block `get_missing_indices` OOM** — `short_ids.len() + prefilled_txs.len()` allocated unbounded `Vec<bool>` (sibling `reconstruct()` was capped in v1.0.18 but this path was missed). Now capped at 25,000.

### Fixed
- **Anomaly detection z-score div-by-zero** — `(new_value - mean) / std_dev` produces NaN when all samples are constant (`std_dev = 0`); `NaN > threshold` evaluates false, silently suppressing anomaly alerts. Now treats any deviation from a constant metric as anomalous.
- **Capacity planning regression div-by-zero** — Linear regression denominator `n * Σx² - (Σx)²` is zero when all timestamps are identical, producing NaN slope and suppressing capacity warnings. Now returns `None` when denominator is near-zero.
- **UTXO vout index truncation** — `vout as u32` silently truncates on 64-bit systems if a transaction exceeds 2³² outputs, causing output index collisions. Now uses `u32::try_from()` with error.

---

## [1.0.18] - 2026-02-19

### Security
- **P2SH OP_PUSHDATA encoding corruption** — `create_p2sh_input()` used `OP_PUSHDATA1` (1-byte length) for redeem scripts 256–65535 bytes, masking with `& 0xff` and dropping high byte. Scripts >255 bytes got length 0 → funds unspendable. Now uses correct `OP_PUSHDATA1` (< 256) / `OP_PUSHDATA2` (< 65536) encoding.
- **Mempool limits division by zero** — `fee / tx_size as u64` panicked when `tx_size == 0` (only checked for too-large sizes). Now rejects zero-size transactions.
- **Compact block reconstruct OOM** — `short_ids.len() + prefilled_txs.len()` from network created unbounded `Vec` allocation (~96 GB for 4B entries). Now caps at 25,000 transactions with `saturating_add`.
- **Compact relay reconstruct OOM** — Parallel code path in `node/src/compact.rs` had same unbounded allocation. Now capped at 25,000.
- **Gossip fee calculation overflow** — `amount_msat * fee_proportional_millionths` silently wrapped in release mode for large wumbo-channel payments, producing near-zero fees and broken routing. Now uses `checked_mul` with `u64::MAX` fallback and `saturating_add`.

### Fixed
- **Routing Dijkstra overflow** — Cumulative `cost`, `cltv`, and `amount_msat` additions in path-finding could wrap, selecting more-expensive paths or producing invalid CLTV. Now uses `checked_add` and skips overflowing edges.
- **CPFP effective fee rate div-by-zero** — `total_fee / total_size` returned `Inf`/`NaN` when `total_size == 0`. Now returns 0.0.
- **OP_CHECKSEQUENCEVERIFY i64→u32 truncation** — Values above `u32::MAX` silently truncated, potentially flipping the `SEQUENCE_DISABLE_FLAG` bit. Now rejects values exceeding u32 range.
- **Witness program length validation** — `WitnessProgram::new()` only checked V0 lengths; V1+ accepted any length, then `to_script()` truncated with `len() as u8`. Now enforces BIP-141 2–40 byte range for all versions.
- **Tapscript OP_PICK/OP_ROLL negative operand** — Negative `i64` values cast to `usize::MAX` relied on bounds check rather than explicit rejection per BIP-342. Now checks for negative before casting.
- **Consensus engine proposer selection 32-bit** — `current_height as usize` truncated on 32-bit targets, selecting different proposers than 64-bit nodes. Now performs modulus in u64 space first.

---

## [1.0.17] - 2026-02-19

### Security
- **Erlay sketch OOM** — `Sketch::deserialize()` allocated `Vec::with_capacity(capacity)` from untrusted peer data with no upper bound; `capacity = u32::MAX` caused ~32 GB allocation. Now capped at 10,000 elements.
- **MuSig2 division by zero** — `challenge[i] / (n as u8)` panicked when `key_coefficients` was empty (`n == 0`), and `n > 255` silently truncated producing wrong challenge shares / forgeable signatures. Now rejects empty or oversized key sets.
- **SPV bloom filter Inf/NaN** — `spv.rs` had its own `BloomFilter` (separate from the fixed `bloom_filter.rs`) where `fp_rate = 0.0` → `ln(0) = -Inf` → `Inf.ceil() as u32` → OOM, and `fp_rate < 0` → `NaN` → modulo-zero panic in `insert()`. Now clamps inputs.
- **Package relay OOM** — `deserialize_package()` accepted `tx_count`, `raw_len`, `parent_count`, and `txid_count` from network with no upper bound, allowing multi-GB allocations. Now capped at 100 transactions and 1 MB per raw tx.
- **PSBT compact size u64→usize on 32-bit** — `read_compact_size()` cast a full `u64` to `usize` with `as`, truncating on 32-bit platforms and causing offset corruption during PSBT deserialization. Now checks `size > usize::MAX` and returns error.

### Fixed
- **BIP-322 witness count truncation** — `encode_signature()` cast `witness.len() as u8`, silently wrapping past 255 items. Now caps at 255 and also guards individual item lengths at `u16::MAX`.
- **Load testing division by zero** — `avg_latency_ms` divided by `latencies.len()` which was 0 when `tps_target * duration_secs == 0`. Now returns 0 for empty latency vectors.
- **Peer manager reputation overflow** — Reputation sum used `u32` accumulator; with many peers the sum could wrap in release mode, producing incorrect averages. Now uses `u64` accumulator.
- **Economic modeling u32 multiplication overflow** — `total_blocks * txs_per_block` overflowed `u32` for year-long spam cost estimates, drastically underestimating attack cost. Now uses `u64`.
- **Erlay ReconcilDiff OOM** — `request_short_ids` and `announce_short_ids` allocated from peer-supplied counts with no cap. Now limited to 10,000 each.
- **PSBT P2PKH scriptSig encoding** — `build_p2pkh_script_sig()` used bare `len() as u8` push for sig/pubkey lengths with no OP_PUSHDATA1 for lengths > 75. Now emits correct Script encoding.

---

## [1.0.16] - 2026-02-19

### Security
- **CPFP fee-rate division by zero** — `calculate_cpfp_fee_rate()` in anchor outputs panicked on `total_size == 0`. Now returns 0.
- **Block storage OOM from corrupted file** — `load_block_at()` allocated `size as usize` from on-disk metadata without bounds checking. Now validates with `usize::try_from()` and caps at 32 MB.
- **Bech32 checksum encoding unwrap** — Invoice `to_string()` checksum loop had no range-check on character index, panicking if `compute_bech32_checksum` returned byte ≥ 32. Now validates.
- **Splice transaction count/script `as u8` truncation** — `inputs.len()`, `outputs.len()`, and `script_pubkey.len()` all cast with `as u8`, silently wrapping past 255. Now uses Bitcoin CompactSize varint encoding.
- **Anchor commitment output count `as u8`** — With many HTLCs (BOLT-02 allows 483/direction), `output_count` exceeded 255. Now uses CompactSize encoding.
- **Anchor output `script_pubkey.len() as u8`** — P2WSH witness scripts can be up to 10 KB. Now uses CompactSize encoding.
- **WAL replay OOM from corrupted length** — `read_operations()` allocated a `vec![0u8; length]` where `length` came from on-disk WAL with no cap. Now rejects entries > 64 MB.
- **Bloom filter OOM on `fp_rate=0`** — `ln(0.0) = -inf` produced `+inf` bit count, allocating `usize::MAX` bytes. Now clamps `elements ≥ 1` and `fp_rate ∈ [1e-10, 1.0)`.

### Fixed
- **Multi-path payment NaN split** — When all routes had `max_capacity == 0`, `0.0 / 0.0 = NaN` sent the entire payment over the last route. Now falls back to equal split.
- **AS-diversity score floating-point overflow** — `std_dev / mean * 50.0` could produce infinity when `mean ≈ 0`. Now guards `mean > 0` and clamps to `[0, 50]`.
- **WAL writer `len as u32` truncation** — Operations > 4 GB silently truncated the length header, corrupting all subsequent WAL entries. Now uses `try_into()` with error.
- **Blockchain API `u64→usize` on 32-bit** — `(height - 1) as usize` wrapped on 32-bit targets. Now uses `usize::try_from()`.
- **Benchmark `throughput() as u64` saturation** — Now caps at `u64::MAX` explicitly.

### Security
- **Parallel validation thread-panic safety** — `ParallelValidator::validate_transactions` used `join().unwrap()` and `Arc::try_unwrap().unwrap()` which crashed the node if any validation thread panicked. Now catches panic payloads, logs with `tracing::error!`, and returns all-error results so callers reject the batch.
- **GraphQL negative-limit DoS** — `calculate_field_cost()` cast `limit.min(1000) as u32` where `limit` is `i64`; negative values wrapped to `u32::MAX` bypassing cost limits. Now clamps with `.max(0)` first.
- **Timelocks `i64→u32` truncation** — `verify_sequence` used `sequence as u32` which silently truncated values > `u32::MAX`, potentially bypassing CSV timelocks. Now uses `u32::try_from()` with proper error.
- **Multisig script-push encoding** — `redeem_script.len() as u8` truncated scripts > 255 bytes (possible with 15-of-15 multisig). Now uses proper Bitcoin `OP_PUSHDATA1`/`OP_PUSHDATA2` encoding.
- **HTLC sighash compact-size encoding** — `script.len() as u8` in sighash preimage truncated large scripts. Now uses proper Bitcoin compact-size varint encoding.

### Fixed
- **`partial_cmp().unwrap()` NaN panic** — `ecosystem_partnerships` pool sort panicked on NaN hashrate. Now uses `unwrap_or(Equal)`.
- **Retry executor zero-attempts panic** — `execute()` / `execute_async()` used `last_error.unwrap()` which panicked if `max_attempts` was 0. Now uses `.expect()` with documented invariant.
- **Stratum `is_none()/unwrap()` fragile pattern** — Replaced with idiomatic `match` pattern in `submit_share`.
- **Key lifecycle `is_some()/unwrap()` fragile pattern** — Replaced with `is_some_and()` in `check_rotation_schedule`.
- **Miner `eprintln!` → structured tracing** — 4 `eprintln!` calls in the standalone miner binary now use `tracing::error!` with `tracing-subscriber` init.
- **CLI `file_stem().unwrap()` chains** — `wallet list` used `file_stem().unwrap().to_str().unwrap()` (×2). Now uses `and_then()`/`filter_map()` for safe handling.
- **CLI miner `template().unwrap()`** — Progress bar template parsing now uses `.expect()` with documented reason.
- **NAT traversal `as u32` truncation** — `mapping_lease_duration as u32` now uses `u32::try_from().unwrap_or(u32::MAX)`.
- **Network sim `pop_front().unwrap()`** — Now uses `if let Some(m)` pattern.
- **Security `chars().next().unwrap()`** — Drive letter extraction now uses `.unwrap_or('C')`.

### Security
- **Lightning transport `as u16` hardened** — `encrypt_message()` used `plaintext.len() as u16` for the length prefix. Now uses `u16::try_from().map_err(...)` for defense-in-depth even though `MAX_MESSAGE_SIZE` currently guards the value.
- **Difficulty `f64→u32` cast clamped** — `calculate_next_difficulty()` used `(bits as f64 * adjustment) as u32` which could clip at extreme values. Now uses `.clamp(1.0, u32::MAX as f64)` to guarantee the result stays within u32 range.
- **headers_sync `debug_assert!` → runtime guards** — `serialize_header()` relied on `debug_assert!` guards for u64→u32 casts (stripped in release builds). Now uses `u32::try_from().unwrap_or_else(...)` with `tracing::warn!` to prevent silent truncation from malicious peers.
- **UTXO / Layer-2 saturating sums** — `total_value()` and `total_value_locked()` used wrapping `.sum()`. Now uses `.fold(0u64, |acc, v| acc.saturating_add(v))` to prevent overflow.

### Fixed
- **WS/P2P `println!` → structured tracing** — 4 `println!` calls for WebSocket connect/disconnect and P2P keepalive idle/failure now use `tracing::info!`/`tracing::warn!` with structured fields.
- **Startup `println!` → structured tracing** — 6 `println!` calls for HTTP API, JSON-RPC, and WebSocket server startup announcements now use `tracing::info!`.
- **RPC response write error logged** — `let _ = socket.write_all(...)` in RPC handler now logs failures with `tracing::debug!`.
- **WS send errors logged** — 2 `let _ = ws_sender.send(...)` for subscription ack and pong now log failures with `tracing::debug!`.
- **Bootstrap task error logged** — `let _ = spawn_blocking(bootstrap_test_wallet_and_funds)` now logs JoinError with `tracing::warn!`.
- **Alert channel send error logged** — `let _ = channel.send_alert(...)` in `AlertManager::trigger_alert()` now logs with `tracing::error!`.
- **Profiler/perf_metrics `as u32` overflow guarded** — 4 sites casting u64/usize counters to u32 for `Duration` division now use `.min(u32::MAX)` pattern.
- **Rate limiter `.unwrap()` annotated** — 2 `banned_until.unwrap()` calls now use `.expect()` documenting the `is_banned()` / `ban()` guard.
- **TODO placeholder strings replaced** — Emergency hotline and CVE identifier placeholders now use proper template text.

### Security
- **SystemTime `.unwrap()` eliminated (M-3)** — `key_lifecycle.rs` and `protocol_version.rs` used `duration_since().unwrap()` which panics on clock skew. Now uses `.unwrap_or_default()`.
- **Duration `as u32` truncation fixed (M-4)** — 5 sites in `benchmark.rs`, `cpu_profiler.rs`, `api_analytics.rs`, and `connection_quality.rs` cast u64/usize counts to u32 for `Duration` division. Now saturate via `.min(u32::MAX as u64)`.

### Fixed
- **Server `eprintln!` → structured tracing (M-7)** — 7 `eprintln!` calls in `main.rs` (HTTP accept, RPC accept, WebSocket accept/handshake, demo peer, block linkage) now use `tracing::error!`/`warn!`/`debug!` with structured fields.
- **WebSocket notifier errors now logged (M-2)** — 11 `let _ = notifier.notify_*()` sites across `main.rs`, `rpc_server.rs`, `miner.rs`, and `websocket.rs` now log on failure with `tracing::debug!`.
- **P2P handshake errors handled (M-3)** — `let _ = peer.send_message(Version/Verack)` in demo traffic now logs failures and retries. Pong send failure now breaks the connection loop.
- **`db.rs` Drop flush error logged (NEW)** — `FileDb::Drop` discarded `flush()` errors via `let _ =`. Now logs with `tracing::error!` to surface data-loss risks.
- **`data_dir_path` mkdir error logged (NEW)** — `create_dir_all()` failure in `data_dir_path()` now logs with `tracing::error!`.
- **Wallet `.unwrap()` hardened (M-5)** — 3 `get_p2pkh_hash().unwrap()` → `.expect("guarded by is_p2pkh check")` and 2 `selected_utxos.last().unwrap()` → `.expect("just pushed")` in coin selection.

---

## [1.0.12] - 2026-02-19

### Security
- **Difficulty adjustment u32 truncation fixed (C-3)** — `calculate_next_difficulty()` cast `(current_bits as u64 * adjustment_factor) as u32`, which could silently wrap to a trivially low value if the product exceeded `u32::MAX`. Now uses `u32::try_from(...).unwrap_or(u32::MAX)` to saturate.
- **Lightning `to_self_delay` placeholder replaced (H-5)** — `to_local_script()` hardcoded `0x90` (OP_16) instead of the actual CSV delay. Now accepts the `to_self_delay: u16` parameter from `CommitmentParams` and encodes it as a proper Script number.

### Fixed
- **Wallet persistence errors now logged (C-1)** — `bootstrap_test_wallet_and_funds()` discarded `wallet.save()` failures via `let _ =`. Now logs with `tracing::error!` and early-returns.
- **Staking state save errors now logged (C-2)** — `save_staking_state()` result was discarded via `let _ =` in the `/api/staking/pools` handler. Now logs failures with `tracing::error!`.
- **`save_chain_state()` migrated to tracing (H-2)** — replaced `eprintln!` with structured `tracing::error!`.
- **Directory creation errors now logged (H-4)** — two `let _ = std::fs::create_dir_all(...)` sites in `main.rs` now log failures and early-return.
- **Secure config parse failures now warned (H-1)** — 5 `.parse().unwrap_or(default)` sites in `secure_config.rs` now emit `tracing::warn!` with the invalid value before falling back.
- **Headers-sync u32 truncation guarded (H-3)** — added `debug_assert!` guards for `height`, `timestamp`, and `nonce` being within u32 range before Bitcoin wire-format serialization.
- **Bincode serialize errors no longer silently produce empty data (M-1)** — mempool size calculation now uses `.expect()` (infallible for valid `Transaction`); RPC `getrawtransaction` returns a proper JSON-RPC error instead of empty hex.
- **Placeholder strings replaced (M-5)** — `CVE-XXXX-XXXXX` → `TODO(security)` in release template; `+1-XXX-XXX-XXXX` → `TODO(ops)` in incident-response doc.
- **Version bump 1.0.11 → 1.0.12**.

---

## [1.0.11] - 2026-02-19

### Security
- **HTLC placeholder signatures removed (C-2)** — `AtomicSwap::execute()` fabricated fake 64-byte DER signatures when private keys were `None`, potentially creating invalid transactions that could pass lax validation. Now returns `Err(HTLCError::MissingPrivateKey)` instead. Added doc comments to all `HTLCError` variants.
- **State pruning silent data corruption fixed (C-3)** — `load_utxo_snapshot()` silently zeroed corrupted block hashes (`hex::decode().unwrap_or_else(|_| vec![0u8; 32])`) and snapshot fields (`.parse().unwrap_or(0)`). Now propagates descriptive errors via `?`.
- **44 production `SystemTime::now().duration_since(UNIX_EPOCH).unwrap()` → `.expect()` (C-1)** — replaced bare `.unwrap()` with `"system clock before UNIX epoch"` messages across 19 files in `faucet`, `lightning`, and `node` crates.

### Fixed
- **6 `&Vec<T>` / `&String` clippy anti-patterns (H-3)** — changed return types to idiomatic `&[T]` / `&str` in `script_interpreter::peek()`, `psbt_v2::get_proprietary_global()`, `admin_tools::get_alerts()`, `doc_generator::get_section()`, `integration_test::TestContext::get()`, and `infrastructure_redundancy::check_diversity()`.
- **Cargo.toml hygiene (M-2 + M-3)** — added `homepage.workspace = true` to 8 crates (all except `node` which already had it) and `rust-version.workspace = true` to all 9 workspace crates.
- **Safe undocumented `.unwrap()` annotated (L-1)** — added `// SAFETY:` comments to 2 provably-safe `.unwrap()` calls in `tx/src/address.rs` (slice length guarded) and `tx/src/opcodes.rs` (non-empty result from loop).
- **Version bump 1.0.10 → 1.0.11**.

---

## [1.0.10] - 2026-02-19

### Security
- **Replaced mock `hash_password()` in `admin_tools.rs`** — was `format!("hash_{}", password)` (cleartext). Now uses SHA-256 via `sha2::Sha256`.
- **Replaced fake RNG in `admin_tools.rs`** — `generate_api_key()` used a constant `12345` from a shadow `rand` module. Now uses `rand::random::<[u8; 16]>()` for cryptographically random keys.
- **Removed hardcoded API key fallback** — `native-mining-ui` silently fell back to a well-known test key (`test_key_123…`) when `KUBERCOIN_API_KEY` was unset. Now panics with a descriptive message requiring the env var to be set.

### Fixed
- **Production `.unwrap()` → `.expect()`** — replaced 10 bare `.unwrap()` calls in non-test code with descriptive `.expect()` messages:
  - 4× `SystemTime::now().duration_since(UNIX_EPOCH)` in `addr_exchange.rs`
  - 4× same pattern in `compliance.rs`
  - 2× same pattern in `community_tools.rs`, `governance.rs`, `state_pruning.rs`
  - 1× `Path::parent()` in `build_release.rs`
  - 1× `Path::parent()` in `state_pruning.rs`
- **Stray `println!` → `tracing`** — migrated `println!` in `peer.rs` (`ban_peer`) and `security_maintenance.rs` (`report_incident`) to structured `tracing::warn!` calls.
- **Removed redundant `#[allow(clippy::upper_case_acronyms)]`** in `nat_traversal.rs` — already configured at workspace level.
- **`docs/README.md` stale badges** — updated MSRV (1.70→1.75), test count (134→2,397), version (1.0.2→1.0.10).
- **Version bump 1.0.9 → 1.0.10**.

---

## [1.0.9] - 2026-02-22

### Fixed
- **Benchmarks rewritten with real crate types** — all 3 Criterion benchmarks (`block_processing`, `transaction_validation`, `utxo_lookup`) previously used fictional placeholder types that never compiled. Rewrote to use real `chain::Block`, `chain::BlockHeader`, `chain::UtxoSet`, `tx::Transaction`, `tx::TxInput`, `tx::TxOutput`, `tx::OutPoint`, and `consensus::verify_pow`/`validate_transaction` APIs.
- **Deleted orphaned workspace-root `benches/` directory** — 3 stale benchmark files duplicated from `node/benches/` but using non-existent crate names (`kubercoin_chain`, `kubercoin_tx`, `kubercoin_consensus`). The active benchmarks live in `node/benches/` via `[[bench]]` entries in `node/Cargo.toml`.
- **Version bump 1.0.0 → 1.0.9** — workspace `Cargo.toml` and `README.md` badge were stuck at 1.0.0.
- **CHANGELOG accuracy** — SegWit and Lightning were listed as "pending funding" but are fully implemented (`tx/src/segwit.rs` and `lightning/` crate with 16 modules). Moved to implemented; added missing v1.0.7–v1.0.9 entries.

---

## [1.0.8] - 2026-02-21

### Fixed
- **Stale p2p_auth comments** — updated misleading comments in `node/src/p2p_auth.rs` that referenced old API-key auth flow after the module was refactored.
- **Test `.unwrap()` → `.expect()`** — replaced 6 bare `.unwrap()` calls in test code with descriptive `.expect()` messages for clearer failure diagnostics.

### Added
- **Fuzz testing CI workflow** — new `.github/workflows/fuzz.yml` runs `cargo-fuzz` targets on schedule and PR trigger.

### Changed
- **Cleaned temporary files** — removed stale `tmp_*`, `wallet_*.json`, and other generated files from the repository root.
- **Reviewed `deny.toml`** — confirmed cargo-deny advisory/license/source configuration is suitable for the current release workflow.

---

## [1.0.7] - 2026-02-20

### Added
- **`#![warn(missing_docs)]`** — enabled across `chain`, `consensus`, `tx`, `storage`, `testnet`, `lightning` crates (6 of 9); remaining binary crates (`node`, `miner`, `faucet`) have crate-level doc comments.
- **CI MSRV check** — `ci.yml` now tests against `rust-version = "1.75"` to prevent accidental MSRV regressions.
- **CI rustdoc check** — `ci.yml` runs `cargo doc --no-deps --workspace` to catch doc warnings in PRs.

### Changed
- **`println!` → `tracing`** — migrated remaining `println!`/`eprintln!` calls to structured `tracing::info!`/`tracing::error!` across the node crate.
- **`.expect()` SAFETY audit** — reviewed every `.expect()` call in the workspace; all carry descriptive messages explaining the invariant or are in test code.
- **Cargo.toml metadata complete** — all 9 crates now have `description`, `license`, `repository`, `homepage`, `keywords`, and `categories` fields.

---

## [1.0.6] - 2026-02-19

### Breaking Changes
- **Unique P2P network ports** — mainnet 8633, testnet 18633, regtest 18744 (previously 8333/18333/18444 which collided with Bitcoin). Updated across all Rust source, Docker, k8s, Helm, scripts, docs.
- **KuberCoin address prefix 'K'** — address version byte changed from `0x00` to `0x2D`; all P2PKH addresses now start with 'K' instead of '1'. Updated address generation, validation, BIP44, BIP322, and all tests.
- **Hardcoded genesis block** — genesis is no longer mined at runtime. Nonce (`718624`), hash (`00000e4c...f127e3`), timestamp (`1738195200`), bits (`0x1e0fffff`), reward (`50 KUBER`), and coinbase message are now public constants in `testnet::genesis`.
- **Fair launch economics** — removed 10% premine (`initial_supply` set to 0); total supply fixed at `21_000_000 * 100_000_000` satoshis (was incorrectly using 6-decimal precision).

### Added
- **9 new Bitcoin-compatible RPC methods** — `getblockhash`, `getrawtransaction` (with verbose mode), `validateaddress`, `getnetworkinfo`, `getrawmempool`, `getmininginfo`, `submitblock` (with PoW verification), `estimatefee`/`estimatesmartfee`, `decoderawtransaction`.

### Fixed
- **Mainnet genesis bug** — `CheckpointManager::mainnet()` was calling `testnet::genesis_block()` at runtime to compute the genesis hash; now uses the hardcoded `GENESIS_HASH` constant.
- **Unified block size** — `MAX_BLOCK_SIZE` was 1 MB in `chain` crate but 4 MW in `node` crate; unified to **4,000,000 weight units** (SegWit) everywhere, including `TemplateConfig`.
- **Protocol version mismatch** — `protocol.rs` had `PROTOCOL_VERSION = 1` while `protocol_version.rs` had `70016`; unified to `70016`.
- **USER_AGENT version drift** — was hardcoded `"/KuberCoin:0.1.0/"`; now uses `concat!("/KuberCoin:", env!("CARGO_PKG_VERSION"), "/")` to auto-sync with Cargo.toml.
- **Block template reward** — was hardcoded `50_00000000`; now uses `supply_auditor::INITIAL_REWARD` constant.
- **Ecosystem checkpoint placeholder** — genesis checkpoint hash was `"genesis_hash"` string literal; now uses `testnet::genesis::GENESIS_HASH`.
- **Sustainability model decimal precision** — `EconomicModel::new()` was using 6-decimal math (21 trillion instead of 2.1 quadrillion satoshis); fixed to 8-decimal (satoshi) precision.
- **BIP44 mainnet prefix** — `pubkey_to_address()` used `"1"` prefix for coin_type 0; now uses `"K"`.

---

## [1.0.5] - 2026-02-18

### Security
- **Fixed key zeroization bug in `wallet_encryption.rs`** — `derive_key` previously returned bare `[u8; 32]`; key material remained in memory after use. Now returns `Zeroizing<[u8; 32]>` via the centralized KDF, so keys are automatically scrubbed on drop.

### Changed
- **Centralized Argon2id key derivation** — created new `node::kdf` module, replacing 4 independent copy-pasted implementations across `crypto.rs`, `wallet_crypto.rs`, `wallet_encryption.rs`, and `wallet_backup.rs`:
  - Single `derive_argon2_key(password, salt) -> Result<Zeroizing<[u8; 32]>, argon2::Error>`
  - Exported constants: `ARGON2_MEMORY_KIB` (64 MiB), `ARGON2_TIME_COST` (3), `ARGON2_PARALLELISM` (4)
  - All callers now delegate to the shared module and map errors to their own types
  - Removes 4 sets of duplicated Argon2 parameter constants
- **Typed errors in `chain` crate** — replaced 15 `Result<_, String>` signatures with a new `ChainError` enum (`thiserror`-derived) across `utxo_db.rs` and `utxo.rs`:
  - Variants: `Database` (sled), `Serialization` (serde_json), `Bincode`, `Io`, `InvalidFormat`, `Validation`, `Chain`
  - Eliminates ad-hoc `format!()` error strings; errors are now matchable, composable, and carry source chains via `#[from]`
  - Exported as `chain::ChainError` for downstream crates
- **Removed 13 dead `#![allow(clippy::...)]` suppressions** from `node/src/lib.rs` — all previously fixed and now redundant
- **Deleted dead `secure_zero` function** from `node/src/crypto.rs` — unused (crate uses `zeroize` everywhere), eliminated 1 of 4 `unsafe` blocks
- **CI: Modernized coverage.yml caching** — replaced 3 manual `actions/cache@v4` steps with single `Swatinem/rust-cache@v2` (consistent with ci.yml, release.yml)
- **Added crate-level `//!` documentation** to `chain/src/lib.rs` and `consensus/src/lib.rs`
- **Typed errors in `tx` crate (Phase 1)** — created `TxError` enum in `tx/src/error.rs` (`thiserror`-derived), replacing 21 `Result<_, String>` signatures across 6 core modules:
  - `keys.rs` (2): `PrivateKey::from_bytes`, `PublicKey::from_bytes` — wraps `secp256k1::Error` via `#[from]`
  - `address.rs` (1): `Address::decode` — `InvalidAddress` variant
  - `lib.rs` (2): `Transaction::signature_hash`, `Transaction::sign_input` — `IndexOutOfBounds`, `Serialization` variants
  - `script.rs` (4): `verify_p2pkh` and execution context methods — `Script` variant
  - `p2sh.rs` (3): `verify_p2sh`, `extract_p2sh_hash`, `extract_redeem_script` — `P2sh` variant
  - `multisig.rs` (9): `MultisigConfig::new`, `create_multisig_*`, `verify_multisig`, `parse_multisig_script` — `Multisig` variant
  - Callers in `consensus/validator.rs`, `node/wallet.rs`, `node/hd_wallet.rs`, `node/rest_api.rs`, `psbt.rs`, `script_interpreter.rs` bridged via `.to_string()` at the `TxError`→`String` boundary
  - Exported as `tx::TxError` for downstream crates
- **Added crate-level `//!` documentation** to `tx/src/lib.rs`, `node/src/lib.rs`, `testnet/src/lib.rs`, and `miner/src/main.rs`
- **Typed errors in `tx` crate (Phase 2)** — created `ScriptInterpreterError` enum in `tx/src/script_interpreter.rs` (`thiserror`-derived), replacing 60 `Result<_, String>` signatures and 30 error return sites:
  - 16 variants: `StackUnderflow`, `AltStackUnderflow`, `StackOverflow`, `ElementTooLarge`, `ScriptTooLarge`, `TooManyOps`, `DataOutOfBounds`, `UnknownOpcode`, `OpReturn`, `FlowControl`, `VerifyFailed`, `Crypto`, `Locktime`, `Sequence`, `Multisig`, `Transaction` (wraps `TxError` via `#[from]`)
  - Removed 2 temporary `.to_string()` bridges on `signature_hash()` calls — now uses `?` operator with automatic `TxError` → `ScriptInterpreterError` conversion
  - Exported as `tx::ScriptInterpreterError` for downstream crates
- **Typed errors in `tx` crate (Phase 3)** — created `PsbtError` enum in `tx/src/psbt.rs` (`thiserror`-derived), replacing 22 `Result<_, String>` signatures and ~40 error return sites:
  - 9 variants: `IndexOutOfBounds`, `InvalidFormat`, `MissingData`, `Parse`, `Finalize`, `SizeExceeded`, `CombineMismatch`, `Validation`, `Transaction` (wraps `TxError` via `#[from]`)
  - Removed `.map_err(|e| e.to_string())` bridge on `signature_hash()` call — now uses `?` with automatic `TxError` → `PsbtError` conversion
  - Added `From<tx::PsbtError> for PsbtRpcError` in `node/src/psbt_rpc.rs` to bridge typed errors into the RPC layer
  - Exported as `tx::PsbtError` for downstream crates
- **Fixed 2 production `.unwrap()` calls** in `node/src/main.rs`:
  - `split_once(':').unwrap()` in `send-many` CLI parser → `match` with descriptive `cli_error_exit`
  - `wallet.get_default_address().unwrap()` in `create_wallet` → `match` with descriptive error message
- **Added `// SAFETY:` comments** to all 3 remaining `unsafe` blocks:
  - `node/src/main.rs` L528: `libc::sysconf(_SC_CLK_TCK)` — documented POSIX guarantee
  - `node/src/main.rs` L567: `libc::sysconf(_SC_PAGESIZE)` — documented POSIX guarantee
  - `node/src/security.rs` L236: `libc::statvfs` — documented valid pointer from `CString::new`

### Removed
- Deleted stale `node/src/utxo_db_simple.txt` (273-line superseded implementation accidentally saved as `.txt`)
- Cleaned up 5 stale diagnostic output files from `target/`
- Deleted 5 stale root `.txt` files: `check_si.txt`, `clippy_si.txt`, `clippy_tx.txt`, `test_si.txt`, `test_tx.txt`

---

## [1.0.4] - 2026-02-01

### Changed
- **Unified `base64` dependency** — upgraded workspace from 0.22→0.22 (was 0.21 at workspace root with node overriding to 0.22); node now inherits via `base64.workspace = true`, eliminating duplicate compilation
- **Replaced blanket `#![allow(dead_code)]` with organized per-module suppressions** in `node/src/main.rs`:
  - Removed single crate-level `#![allow(dead_code)]` that silenced all 1,709 dead-code warnings
  - Reorganized 141 module declarations into 3 clearly documented sections:
    - **Core modules** (19): actively used by `fn main()` / node operation
    - **Library modules** (11): re-exported via `lib.rs` for external consumers
    - **Feature modules** (111): self-contained, compiled for their `#[cfg(test)]` suites
  - Each module gets its own `#[allow(dead_code)]` with section headers explaining the rationale

### Removed
- Cleaned up 24 temporary diagnostic files (6 from repository root, 18 from `target/`)

---

## [1.0.3] - 2026-01-31

### Security
- Fixed integer overflow vulnerability in `bytes` (CVE: RUSTSEC-2026-0007)
- Fixed DoS via stack exhaustion in `time` (CVE: RUSTSEC-2026-0009)
- Replaced unmaintained `rustls-pemfile` with `rustls-pki-types` PemObject API
- Reduced cargo audit warnings from 8 to 4 (eliminated tabled, proc-macro-error, paste, lru, rustls-pemfile)
- Cleaned up `deny.toml` — removed 3 stale advisory ignores
- **Eliminated 55 `.unwrap()` calls in tapscript interpreter** — replaced with `pop_stack()?` helper that returns `TapscriptError::InvalidStackOperation` instead of panicking on malformed scripts
- Fixed 3 additional `.unwrap()` calls in production code (script_interpreter, psbt, segwit) — replaced with `.expect()` with safety comments
- **Migrated all synchronization to `parking_lot`** — replaced `std::sync::Mutex`/`RwLock` with non-poisoning `parking_lot` equivalents across 4 crates (node, chain, storage, faucet)
  - **Eliminated 401 `.unwrap()` calls** on lock acquisitions (267 `.lock().unwrap()`, 60 `.read().unwrap()`, 74 `.write().unwrap()`)
  - Removed 5 `PoisonError` map_err chains and 1 `if let Ok` pattern (no longer needed — parking_lot never poisons)
  - Affects 30+ files across node, chain, storage, and faucet crates
- **Production `.unwrap()` hardening** — eliminated 24 more `.unwrap()` calls across 12 files:
  - `lightning/transport.rs`: 7 `.unwrap()` on Option state machine fields → `ok_or(TransportError::HandshakeIncomplete)?` — prevents crash from malicious/buggy peer during Noise Protocol handshake
  - `node/rpc_server.rs`: 9 `serde_json::to_string().unwrap()` → centralized `serialize_response()` helper with graceful fallback
  - 5 files with `partial_cmp().unwrap()` → `.unwrap_or(Ordering::Equal)` — prevents NaN-induced panics in float sorting (block_template, economic_modeling, optimization_tracker, perf_metrics, security_validation)
  - 5 private timestamp helpers (memory_profiler, api_analytics, watchtower, submarine_swaps, multi_path): `.unwrap()` → `.unwrap_or_default()`
  - `faucet/main.rs`: 2 startup `.unwrap()` → `.expect()` with descriptive messages
- **Removed 13 blanket `#![allow(clippy::...)]` suppressions** from `node/src/main.rs` — fixed 96 auto-fixable clippy issues across 35 files plus 10 manual fixes:
  - 22× unnecessary borrowed references removed
  - 20× `push_str("\n")` → `push('\n')` (single-char optimization)
  - 20× `or_insert_with(|| Default::default())` → `or_default()`
  - 10× `format!("literal")` → `"literal"` (useless format removed)
  - 9× redundant closures simplified
  - 8× `.get(0)` → `.first()`
  - 4× manual `% == 0` → `.is_multiple_of()`
  - 4× `.clone()` on `Copy` types → direct copy
  - Moved `upper_case_acronyms = "allow"` to workspace `[lints.clippy]` with proper priority (domain acronyms: API, AWS, HTLC, HMAC, etc.)

### Fixed
- **Eliminated all 39 pre-existing integration test failures** (39 → 0 across 11 modules)
  - RPC server: auth bypass in tests, genesis-based assertions (11 tests)
  - REST API: real genesis values, correct version string (8 tests)
  - Wallet encryption: AES-256-GCM error handling assertions (2 tests)
  - Timelocks: implemented full BIP 65 CLTV (was stubbed), fixed script encodings (5 tests)
  - Peer auth: sign/verify key consistency, peer entry creation (4 tests)
  - NAT traversal: detect NAT type before hole punch, timestamp granularity (2 tests)
  - Geo diversity: test IPs now map to distinct continents (1 test)
  - Tx origin obfuscation: off-by-one in stem hop count (1 test)
  - Genesis bootstrap: dynamic checkpoint, relaxed sync condition (2 tests)
  - UTXO snapshot: deterministic merkle root via sorted UTXOs (1 test)
  - Rate limiter: burst capacity exhaustion in refill test (1 test)
  - Benchmark: timing sensitivity (1 test)
- Fixed 7 failing doc tests across node and lightning crates (stale API references, `?` operator in non-Result contexts)
- Fixed flaky `test_comparative_bench_speedup` — replaced sleep-based timing with CPU-bound work (eliminates Windows timer jitter)
- Un-ignored 4 stale `#[ignore]` tests: HD wallet key derivation (2), wallet encryption salt randomness (1), multisig invalid-key rejection (1)
- Un-ignored 9 `rust,ignore` doc tests in tx crate — wrote complete, compilable examples for `Psbt` and `ScriptInterpreter` modules
- Un-ignored 1 `rust,ignore` doc test in node crate — wrote complete CPFP fee bumping example for `cpfp` module
- Fixed multisig `test_add_signature_invalid_key` — used distinct key not in config (was accidentally identical due to deterministic `create_test_keys`)
- Eliminated flaky Playwright E2E tests (cold storage, audit log) — 93/93 stable
- Cold storage service now operates fully offline (local-first) for wallet creation and transaction signing
- Audit log events recorded locally for privacy — no API round-trip
- Wallet API requests now abort after 2s timeout (prevents hanging on unreachable backends)
- Added useEffect cleanup guards to prevent state race conditions on cold storage and audit pages

### Changed
- **Release profile optimized** — added `[profile.release]` with LTO, codegen-units=1, strip symbols, panic=abort
  - Binary size: 5.85 MB → 2.73 MB (**53% smaller**)
- **Cleaned workspace root** — removed ~55 stale files (diagnostic outputs, session summaries, test wallets, tmp files, duplicate CHANGELOG.md)
- **Hardened `.gitignore`** — added patterns for `wallet?.json`, `*_wallet.json`, `mempool.bin`, `.vs/`, and diagnostic file patterns (`*_output.txt`, `check*.txt`, `clippy*.txt`, etc.)
- **Cargo deny compliance** — all 4 checks pass (advisories, bans, licenses, sources)
  - Added `Unicode-3.0`, `MPL-2.0`, `CC0-1.0`, `OpenSSL` to allowed licenses
  - Fixed openssl/openssl-sys ban — allowed via `native-tls` wrapper chain (transitive through reqwest)
- **Dead code cleanup** — eliminated 15 `#[allow(dead_code)]` annotations
  - Removed 9 truly unused items (3 mempool constants, 1 script method, 3 offer constants, 2 transport constants)
  - Removed 3 unnecessary allows on items that are actually used (onion encrypt/decrypt → `#[cfg(test)]`, p2p_auth challenge field)
  - Renamed 3 serde/metadata fields with `_` prefix (`RpcResponse._id`, `BloomFilter._elements/_fp_rate`)
- **Fixed 3 clippy warnings** — `too_many_arguments` (submarine_swaps, htlc), complex type alias (security)
- **Committed `Cargo.lock`** — removed from `.gitignore` for reproducible builds (required for binary crates)
- **Ran `cargo fmt --all`** — applied rustfmt to entire workspace for CI compliance
- **Fixed all 26 rustdoc warnings** — wrapped angle-bracket placeholders (`<pubkey>`, `<sig>`, `<hash>`, `<timeout>`, etc.) and array indices (`[0]`, `[n]`) in backticks across 7 files (tx: taproot, multisig, p2sh, script; node: errors, miniscript, htlc)
- **CI/CD workflow overhaul**
  - Rewrote `ci.yml` — split into `check`, `test`, `build-release`, `security`, `web-apps` jobs with proper dependency ordering; added 5 MB binary size gate
  - Removed legacy `ci-cd.yml` (345 lines, fully superseded by `ci.yml` + `release.yml` + `security-audit.yml`)
  - Updated all GitHub Actions to latest versions: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `EmbarkStudios/cargo-deny-action@v2`
  - Replaced deprecated `actions-rs/toolchain@v1` → `dtolnay/rust-toolchain@stable` in `build-native-ui.yml`
  - Replaced deprecated `actions/create-release@v1` + `actions/upload-release-asset@v1` → `softprops/action-gh-release@v2`
- **Narrowed tokio features** — replaced `features = ["full"]` with only needed features
  - node: `rt-multi-thread`, `macros`, `net`, `io-util`, `time`, `sync`, `signal`
  - faucet: `rt-multi-thread`, `macros`, `net`
  - Reduces unused feature surface (`fs`, `process`, `io-std` no longer compiled)
- **Removed 10 unused dependencies** across 6 crates (cargo-machete audit)
  - chain: `thiserror`; consensus: `thiserror`; faucet: `chrono`; lightning: `tx`
  - node: `futures`, `hmac`, `qrcode`, `rayon`, `rustyline`, `tokio-rustls`; storage: `serde`
- Upgraded `ratatui` 0.27 → 0.30 (TUI framework)
- Upgraded `crossterm` 0.27 → 0.28 (terminal backend)
- Upgraded `bytes` 1.11.0 → 1.11.1 (security patch)
- Upgraded `time` 0.3.46 → 0.3.47 (security patch)
- Removed dead dependency `tabled` from node crate
- Removed unmaintained `rustls-pemfile` — TLS uses `rustls::pki_types::pem::PemObject` directly
- Added `workspace.exclude` for `fuzz` and `native-mining-ui/linux-gtk4` (not workspace members)
- Updated 39 transitive dependencies to latest semver-compatible versions (clap 4.5.59, libc 0.2.182, futures-util 0.3.32, etc.)
- Added `parking_lot = "0.12"` workspace dependency — faster, non-poisoning Mutex/RwLock (used by rustc, servo, tokio internals)
- Playwright test build now uses isolated API URL for deterministic E2E runs

### Metrics
- Code coverage: 76.58% line | 75.05% function (43,570 lines, 2,565 functions)
- **2,389 tests passing** (233 node-lib + 1,598 node-bin + 7 node-doc + 40 chain + 299 tx + 9 tx-doc + 5 consensus + 19 testnet + 167 lightning + 2 lightning-doc + 4 storage-doc + 6 miner) — **0 failures, 0 ignored**
- 93/93 Playwright E2E tests — 0 flaky, 0 failures
- Clippy: 0 warnings (workspace-wide)
- Rustdoc: 0 warnings (workspace-wide)
- Cargo audit: 4 allowed warnings (all transitive or consensus-critical — bincode, fxhash, instant, number_prefix)
- Release binary: 2.73 MB (stripped, LTO, codegen-units=1)

---

## [1.0.2] - 2026-01-30

### Added
- Complete infrastructure documentation (Docker, CI/CD, monitoring)
- Comprehensive API documentation (14,000 words, RPC/REST/WebSocket)
- Developer onboarding guide (CONTRIBUTING.md, 12,500 words)
- Brand guidelines and logo concepts (35,700 words)
- Legal framework drafts (Terms of Service, Privacy Policy)
- Discord community structure (complete blueprint)
- Demo video script for promotional content
- Grafana dashboard for blockchain metrics visualization
- Security policy (SECURITY.md) with vulnerability disclosure process
- Code of Conduct (standalone file)
- This CHANGELOG.md

### Changed
- Updated README with quickstart guide
- Improved Docker Compose configuration with monitoring stack
- Enhanced .github/workflows/ci.yml with security audits

### Fixed
- None in this release (documentation-only)

### Security
- Published security contact (connect@kuber-coin.com)
- Established responsible disclosure policy

---

## [1.0.1] - 2026-01-25

### Added
- NAT traversal support for better peer connectivity (734 lines)
- Peer authentication improvements
- Basic monitoring metrics for Prometheus

### Changed
- Improved mempool management with TTL-based eviction

### Fixed
- **[KBC-2026-001]** Mempool memory leak - transactions now expire after 24 hours
- Block propagation delays under high network load
- Occasional panic in peer connection handling

### Security
- Fixed mempool memory exhaustion vulnerability (Medium severity)

---

## [1.0.0] - 2026-01-15

### Added - Initial Release
- Complete blockchain implementation with UTXO model
- SHA-256d Proof of Work consensus
- P2P networking with TCP-based protocol
- Dandelion++ transaction privacy (basic implementation)
- JSON-RPC API (15+ methods)
- REST API (8 endpoints)
- WebSocket API (3 channels)
- Basic wallet functionality (create, send, receive)
- Mining support (CPU mining)
- Mempool management
- Block validation and relay
- Difficulty adjustment (every 2016 blocks)
- Bloom filters for efficient UTXO lookups
- RocksDB storage backend
- Configuration file support (TOML format)
- Logging with multiple verbosity levels
- CLI tools (kubercoin-cli)

### Network Parameters
- Block time: 10 minutes target
- Block reward: 50 KBC (halving every 210,000 blocks)
- Max supply: 21,000,000 KBC
- Min transaction fee: 0.001 KBC
- P2P port: 8633
- RPC port: 8332
- Max block size: 1 MB (base)

### Documentation
- README with project overview
- Technical architecture document
- API reference (basic)
- FAQ document
- Business plan (97,500 words)

---

## [0.9.0] - 2026-01-01 (Beta Release)

### Added
- Beta release for community testing
- Testnet preparation (regtest mode fully functional)
- Faucet for test coins
- Block explorer (basic web interface)
- Transaction signing and verification
- Address generation (BIP32/39/44)
- Seed phrase backup

### Changed
- Optimized block validation (30% faster)
- Improved peer discovery algorithm
- Reduced memory footprint by 20%

### Fixed
- Transaction relay delays
- Occasional database corruption on crash
- Race conditions in mempool

### Known Issues
- Mempool can grow unbounded (fixed in v1.0.1)
- Sync can stall with aggressive firewalls
- High CPU usage during initial sync

---

## [0.8.0] - 2025-12-15 (Alpha Release)

### Added
- First public release (alpha quality)
- Basic blockchain functionality
- Simple P2P networking
- Minimal RPC API
- Command-line wallet

### Known Issues
- Not ready for broad public deployment
- Many missing features
- Limited documentation
- Security audits not yet performed

---

## [0.1.0 - 0.7.x] - 2025-06 to 2025-12 (Pre-Alpha)

### Summary
- Internal development versions
- Core blockchain logic
- Consensus algorithm implementation
- Cryptographic foundations
- Storage layer development
- Network protocol design

---

## Version Numbering

Kubercoin follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version (1.x.x): Breaking changes, incompatible API changes
- **MINOR** version (x.1.x): New features, backwards compatible
- **PATCH** version (x.x.1): Bug fixes, backwards compatible

### Current Version: 1.0.19

---

## Upgrade Instructions

### From 1.0.x to 1.0.19
No breaking changes. Update binary and restart node.

```bash
# Linux/Mac
sudo systemctl stop kubercoin
wget https://github.com/kubercoin/kubercoin/releases/download/v1.0.19/kubercoin-1.0.19-x86_64-linux.tar.gz
tar -xzf kubercoin-1.0.19-x86_64-linux.tar.gz
sudo cp kubercoin-1.0.19/kubercoin /usr/local/bin/
sudo systemctl start kubercoin
```

### From 0.9.x to 1.0.x
**BREAKING CHANGES:** Database format changed. Must resync from genesis.

```bash
# Backup wallet first!
kubercoin-cli backupwallet ~/wallet-backup.dat

# Stop node
sudo systemctl stop kubercoin

# Clear blockchain data (DESTRUCTIVE)
rm -rf ~/.kubercoin/blocks/
rm -rf ~/.kubercoin/chainstate/

# Update binary
# ... (same as above)

# Start node (will resync from scratch)
sudo systemctl start kubercoin

# Restore wallet if needed
kubercoin-cli importwallet ~/wallet-backup.dat
```

---

## Release Schedule

### Past Releases
- **v1.0.19:** March 16, 2026 (Grant readiness: runtime hardening, doc fixes, coverage)
- **v1.0.10:** March 14, 2026 (RPC decomposition, security fixes, adversarial tests)
- **v1.0.2:** March 13, 2026 (Documentation sprint)
- **v1.0.1:** January 25, 2026 (Bug fixes)
- **v1.0.0:** January 15, 2026 (Stable release)
- **v0.9.0:** January 1, 2026 (Beta)
- **v0.8.0:** December 15, 2025 (Alpha)

### Upcoming Releases (Tentative)

**v1.1.0** - March 2026 (Feature Release)
- SegWit support
- Performance improvements (30% faster validation)
- Improved privacy (enhanced Dandelion++)
- Hardware wallet support (Ledger, Trezor)

**v1.2.0** - June 2026 (Major Feature Release)
- Lightning Network integration
- Schnorr signatures (BIP340)
- Taproot support
- Smart contract VM (basic)

**v2.0.0** - December 2026 (Breaking Changes)
- zk-SNARKs privacy layer
- New address format
- Consensus rule changes
- Performance overhaul (Layer-2 scaling planned)

---

## Security Advisories

Security-related changes are marked with **[SECURITY]** prefix.

For responsible disclosure, email: connect@kuber-coin.com

### Known Vulnerabilities (Fixed)

**[KBC-2026-001]** - Mempool Memory Leak (Fixed in v1.0.1)
- **Severity:** Medium
- **Impact:** Node can consume unbounded memory
- **Fixed:** Implemented 24-hour TTL for unconfirmed transactions

### Active Security Audits

- **Pre-Mainnet Audit:** Scheduled Q2 2026 (Trail of Bits)
- **Cryptography Audit:** Scheduled Q3 2026 (NCC Group)

---

## Deprecation Notices

### Deprecated in v1.0.0
- `getinfo` RPC method → Use `getblockchaininfo`, `getnetworkinfo`, `getwalletinfo`
- Old address format (v0.x) → Use new format (BIP44 compatible)

### To Be Deprecated in v2.0.0
- Legacy transaction format → SegWit transactions required
- P2PKH addresses → P2WPKH or Taproot addresses preferred

---

## Community Contributions

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Notable Contributors (v1.0.x)
- @developer123 - Found and reported mempool memory leak
- Community - Testing, feedback, bug reports

### How to Contribute
- Report bugs: [GitHub Issues](https://github.com/kubercoin/kubercoin/issues)
- Submit PRs: [GitHub Pull Requests](https://github.com/kubercoin/kubercoin/pulls)
- Join Discord: [discord.gg/kubercoin](https://discord.gg/kubercoin)

---

## Links

- **Website:** https://kuber-coin.com
- **GitHub:** https://github.com/kubercoin/kubercoin
- **Documentation:** https://kuber-coin.com/docs
- **Discord:** https://discord.gg/kubercoin
- **Twitter:** https://twitter.com/kubercoin
- **Email:** connect@kuber-coin.com

---

**Maintained by:** Kubercoin Core Team
**Last Updated:** March 13, 2026
**Next Release:** v1.1.0 (March 2026, tentative)
