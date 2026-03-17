# KuberCoin — Roadmap to Bitcoin-Grade Rigor

**Generated**: 2025-03-08
**Baseline**: AUDIT_TABLE.md (6 Critical, 25 High, 37 Medium, 19 Low findings)

This roadmap organizes the path from current state to production-grade quality in
four milestones.  Each milestone has an exit gate — a set of conditions that must
all be true before work on the next milestone begins.

---

## Milestone 0 — Consensus Safety  (Chain-Breaker Fixes)

**Goal**: Eliminate every Critical finding so the chain cannot be exploited or
silently diverge from its own rules.

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 0-1 | ~~Define and populate `CHECKPOINTS` with genesis + early blocks~~ | R-01, H-01 | S | **DONE** |
| 0-2 | ~~Add witness commitment (`OP_RETURN` wtxid root) to coinbase in miner & validate in `validate_block_contextual`~~ | V-05, M-04 | M | **DONE** |
| 0-3 | ~~Implement Taproot (witness v1) key-path spend validation in `verify_input_signature`~~ | V-01 | L | **DONE** |
| 0-4 | ~~Implement Tapscript execution mode (OP_SUCCESS semantics, OP_CHECKSIGADD)~~ | V-02, S-09, S-13 | L | **DONE** (OP_CHECKSIGADD added; OP_SUCCESS deferred) |
| 0-5 | ~~Replace `bincode` txid serialization with canonical Bitcoin-style serialization (or define KuberCoin-canonical format and document it)~~ | T-01, T-02, N-11 | XL | **DONE** — `txid()` uses `serialize_no_witness()` (Bitcoin LE wire format); `wtxid()` uses `serialize_with_witness()` with SegWit marker. KuberCoin P2P wire uses bincode by design (own protocol, not Bitcoin-compatible). |

**Exit gate** ✅:
- `cargo test` passes with 0 Critical findings remaining.
- Every newly-added validation path has at least one positive and one negative test vector.
- Witness commitment round-trips through mine → validate → re-mine.

**Milestone 0 COMPLETE** as of 2026-03-14.

---

## Milestone 1 — Feature Completeness (High Findings)

**Goal**: Close all High-severity gaps so the node is functionally comparable to
a pruned Bitcoin Core 24.x node.

### 1A — Script Interpreter

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 1A-1 | ~~Add OP_PUSHDATA2, OP_PUSHDATA4~~ | S-01, S-02 | S | **DONE** |
| 1A-2 | ~~Add OP_1NEGATE~~ | S-03 | S | **DONE** |
| 1A-3 | ~~Accept OP_NOP1–OP_NOP10 as no-ops~~ | S-04, S-10 | S | **DONE** |
| 1A-4 | ~~Add OP_NOTIF~~ | S-05 | S | **DONE** |
| 1A-5 | ~~Explicitly reject disabled opcodes (OP_MUL, OP_CAT, etc.)~~ | S-12 | S | **DONE** |
| 1A-6 | ~~Add OP_PICK, OP_ROLL~~ | S-06, S-07 | S | **DONE** |
| 1A-7 | ~~Add OP_CODESEPARATOR~~ | S-08 | S | **DONE** |
| 1A-8 | ~~Fix opcode byte mappings (ROT/SWAP/TUCK/PICK/ROLL)~~ | S-11 | S | **DONE** |

### 1B — P2P & Network

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 1B-1 | ~~Implement DNS seed resolution (or hardcoded seed IPs)~~ | N-01 | M | **DONE** |
| 1B-2 | ~~Implement service flag negotiation (NODE_WITNESS, NODE_BLOOM)~~ | N-12 | M | **DONE** |
| 1B-3 | ~~Add transaction inventory batching / privacy delay~~ | N-10 | S | **DONE** |
| 1B-4 | ~~Implement addr relay rate-limiting (eclipse-attack mitigation)~~ | N-05 | M | **DONE** |

### 1C — Wallet

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 1C-1 | ~~Wire HD wallet (`ExtendedPrivateKey`) into `node/src/wallet.rs`~~ | W-02 | M | **DONE** |
| 1C-2 | ~~Complete BIP-39 wordlist (2048 words) + strict checksum~~ | W-03, H-02, H-03 | S | **DONE** |
| 1C-3 | ~~Generate P2WPKH (bech32) addresses in wallet~~ | W-01, W-09, AD-03 | M | **DONE** — `generate_key_with_type(P2WPKH)` in wallet, `getnewaddress` RPC supports `bech32` type |
| 1C-4 | ~~Generate P2TR (bech32m) addresses in wallet~~ | AD-04 | M | **DONE** — `generate_key_with_type(P2TR)` with BIP-341 taptweak, `getnewaddress` RPC supports `bech32m` type |
| 1C-5 | ~~Define KuberCoin HRP (`kc1` or `kb1`)~~ | AD-05 | S | **DONE** — HRP is `kb` (mainnet), `tb` (testnet), `kbrt` (regtest) |

### 1D — Chain State

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 1D-1 | Move `blocks: Vec<Block>` to persistent block store (LevelDB / sled / RocksDB) | R-04, SEC-02 | XL |
| 1D-2 | ~~Validate side-chain difficulty correctly during reorg~~ | R-02 | M | **DONE** |
| 1D-3 | Implement BIP-9 version-bits soft-fork activation | P-04 | L |

### 1E — RPC

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 1E-1 | ~~`getnewaddress` RPC~~ | A-01 | S | **DONE** |
| 1E-2 | ~~`listunspent` RPC~~ | A-02 | S | **DONE** |
| 1E-3 | ~~`getbalance` / `getwalletinfo` RPC~~ | A-03 | S | **DONE** |
| 1E-4 | ~~`createrawtransaction` RPC~~ | A-04 | M | **DONE** |
| 1E-5 | ~~`signrawtransactionwithkey` RPC~~ | A-06 | M | **DONE** |

**Exit gate**:
- All High findings resolved.
- HD wallet generates bech32 addresses by default.
- IBD on disk-backed chain state survives 100K+ blocks without OOM.
- DNS seed or seed-IP bootstrap works without manual `peers.json`.
- `cargo test` passes; `cargo clippy -- -D warnings` clean.

---

## Milestone 2 — Hardening & Standards (Medium + Low Findings)

**Goal**: Polish the implementation to match Bitcoin Core behavioral standards
and prepare for third-party auditors.

| # | Task | Audit Ref | Effort |
|---|------|-----------|--------|
| 2-1  | ~~Use Median Time Past for tx lock_time (BIP-113 full)~~ | V-06, R-07 | M | **DONE** |
| 2-2  | ~~Exact sigops counting per-script~~ | V-04 | M | **DONE** — `count_sigops_accurate()` parses OP_1..OP_16 for multisig N; P2SH redeem script counting in block validation |
| 2-3  | ~~CSV time-based lock via MTP instead of ÷600 approx~~ | V-03 | S | **DONE** — removed ÷600 fallback; time-based CSV now requires MTP function |
| 2-4  | P2SH-P2WPKH / P2SH-P2WSH (wrapped SegWit) | V-07 | M |
| 2-5  | Implement SCRIPT_VERIFY_* flag system | V-08 | L |
| 2-6  | addrv2 (BIP-155) for Tor/I2P | N-02 | M |
| 2-7  | Block-relay-only connections | N-06 | M |
| 2-8  | ~~Feeler connections~~ | N-07 | S | **DONE** — `start_feeler_task()` in ConnectionManager; 120s interval, 5s timeout probes |
| 2-9  | Testnet / regtest parameter sets | P-02 | M |
| 2-10 | ~~Genesis block in params~~ | P-03 | S | **DONE** |
| 2-11 | Header-first IBD state machine | R-06 | L |
| 2-12 | assumevalid for IBD speedup | R-05, SEC-01 | M |
| 2-13 | Coin selection: branch-and-bound | W-06 | M |
| 2-14 | Watch-only wallets | W-04 | M |
| 2-15 | Descriptor wallets (`wpkh()`, `tr()`) | W-05 | L |
| 2-16 | Package relay (ancestor/descendant) | F-02 | L |
| 2-17 | Remaining missing RPCs (A-05 through A-20) | A-05–A-20 | L |
| 2-18 | ~~OP_PICK, OP_ROLL, OP_CODESEPARATOR~~ | S-06–S-08 | S | **DONE** (completed in 1A-6, 1A-7) |
| 2-19 | ~~OP_NOP remaining variants~~ | S-10 | S | **DONE** (completed in 1A-3) |
| 2-20 | getblocktemplate long-polling | M-02 | M |
| 2-21 | Wire BIP-157/158 compact block filters to P2P | — | M |
| 2-22 | ~~Transaction version 2 default~~ | T-03 | S | **DONE** — `Transaction::new()` defaults to version 2 (BIP-68 CSV enabled); coinbase stays version 1; version gate in validator |

**Exit gate**:
- All Medium findings resolved; Low findings triaged (fix or wontfix).
- Full BIP-113 MTP enforcement for both blocks and transactions.
- Testnet boots independently with separate genesis and parameters.
- Third-party audit scope document references zero open Critical/High/Medium items.

---

## Milestone 3 — Production Readiness

**Goal**: Operational excellence — the node is deployable, monitorable, and
resilient under adversarial conditions.

| # | Task | Effort |
|---|------|--------|
| 3-1  | Fuzz all script opcodes and deserialization paths | L |
| 3-2  | Property-based tests for consensus (quickcheck / proptest) | L |
| 3-3  | Stress-test reorg with 100-block+ side chains | M |
| 3-4  | Eclipse-attack simulation tests | M |
| 3-5  | ~~CI reproducible-build pipeline (deterministic binaries)~~ | M | **DONE** |
| 3-6  | Pruneblockchain RPC and disk-space management | M |
| 3-7  | ~~Prometheus metrics for all subsystems~~ | S | **DONE** |
| 3-8  | ~~Grafana dashboard templates for operators~~ | S | **DONE** |
| 3-9  | Multi-week public testnet soak with ≥3 independent operators | — |
| 3-10 | Commission external security audit (scope = Milestone 0 + 1 code) | — |

**Exit gate**:
- Fuzzer runs 24 h with zero crashes.
- Public testnet runs ≥4 weeks with no consensus split, restart, or data loss.
- Reproducible builds verified by ≥2 independent builders.
- External audit report received with no unresolved Critical/High findings.

---

## Effort Key

| Label | Approximate Scope |
|-------|-------------------|
| S  | ≤ 1 day; isolated change, well-defined |
| M  | 2–5 days; touches multiple modules or needs new tests |
| L  | 1–2 weeks; new subsystem or significant refactor |
| XL | 2–4 weeks; cross-cutting architectural change |

---

## Cross-Reference

- Detailed per-finding data: [AUDIT_TABLE.md](AUDIT_TABLE.md)
- Launch gate: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- Phase 2 exit criteria: [PHASE2_EXIT_CRITERIA_CHECKLIST.md](PHASE2_EXIT_CRITERIA_CHECKLIST.md)
- Release process: [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md)
- Upgrade procedure: [UPGRADE_PROCEDURE.md](UPGRADE_PROCEDURE.md)
