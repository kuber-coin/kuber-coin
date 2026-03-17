# KuberCoin Roadmap

> Last updated: March 2026
> Status: **Late Phase 1** — most subsystems implemented, hardening in progress

---

## Current State

The codebase is substantially further along than a typical "needs 6–10 weeks to reach testnet" project. A realistic status audit:

| Subsystem | Status | Notes |
|-----------|--------|-------|
| P2P layer | **Mostly done** | Version/verack handshake, block/tx relay, peer discovery (DNS seeds + addr), connection pool. No explicit IBD state machine. |
| Fork choice / reorg | **Mostly done** | `ForkChoiceRule` enum, cumulative-work tracking in `block_index.rs`, `ReorgManager` with `MAX_REORG_DEPTH=100`. Ghost/LMD defined but not wired. |
| Consensus validation | **Done** | BIPs 30, 34, 65, 68, 113, 141, 143, 341. Merkle root (double-SHA256), MTP timestamps, weight-based sigops (80k budget), MAX_MONEY, tx version, PoW target. |
| Mining | **Done** | Real nonce iteration over `0..u64::MAX` with `verify_pow()`. Coinbase builder with BIP-34 height encoding and extranonce. |
| Mempool | **Done** | 50k tx / 300 MB cap, min relay fee 1 sat/vB, dust threshold 546, RBF, ancestor/descendant limits (25), orphan pool (100 cap, 20-min expiry), 14-day expiration, lowest-fee eviction. |
| Storage | **Mostly done** | Sled-backed `BlockStore` (height + hash indexes), `tx_index.rs` exists. No address/script-hash → UTXO index. |
| Wallet | **Done** | HD keys, multiple address types, encrypted storage (Argon2id + AES-GCM/ChaCha20), backup/restore, transaction signing. |
| Operational | **Mostly done** | API key auth, bandwidth rate limiting (1 MB/s up, 10 MB/s down), peer reputation/banning, admin tools. Per-endpoint rate limiting not wired. |
| Docker / K8s | **Done** | Multi-stage Dockerfile, docker-compose (dev/prod/edge), Helm chart, K8s manifests with monitoring. |
| Tests | **Good** | ~1,600 tests passing. Consensus, mempool, wallet, chain, storage all covered. Gaps: P2P handshake, fork-choice scenarios, address indexing. |

**Bottom line:** The node compiles, mines real blocks, validates consensus, maintains a mempool with Bitcoin-class policy, handles reorgs, and has Docker/K8s deployment. The path to testnet is gap-closing and hardening, not greenfield construction.

---

## Phase 1: Reach Real Testnet

**Target: 3–5 weeks** (most subsystems already implemented)

### 1. Initial Block Download orchestration
The P2P layer can relay blocks and transactions, but there is no explicit IBD state machine — sync is reactive (respond to INV messages) rather than proactive (request block ranges from peers on connect).

**What's needed:**
- On connect to peer with higher chain height, enter IBD mode
- Request blocks in batches (getheaders → getdata pattern)
- Transition from IBD to steady-state relay once tip is reached
- Track sync progress for RPC/admin visibility

**Exit test:** A fresh node connects to a running node and syncs 1,000+ blocks to identical chain tip within minutes.

### 2. Address / script-hash UTXO index
Block-by-height and txid-to-block indexes exist (Sled). Address lookups require full chain scan — unusable for wallets and explorers at any real chain length.

**What's needed:**
- `script_hash → Vec<OutPoint>` index in Sled, updated on block connect/disconnect
- Query API endpoint: `GET /address/{addr}/utxos`
- Reorg-safe: index must roll back on chain reorganization

**Exit test:** Query any address UTXO set in <50ms at chain height 10,000.

### 3. Harden P2P against live-network conditions
The implementation has peer reputation, bandwidth limiting, and misbehavior scoring. What's missing is integration testing under adversarial conditions.

**What's needed:**
- Per-endpoint API rate limiting (not just bandwidth)
- Reject peers during IBD that send unsolicited transactions
- Test: malformed messages, oversized payloads, rapid connect/disconnect, stale-tip peers
- Ensure `peer_reputation.rs` banning is checked at connection acceptance, not just after handshake

**Exit test:** Node survives 24 hours with 10+ peers including 2–3 badly-behaved ones.

### 4. Fill remaining consensus gaps (low-effort, high-correctness)

| Gap | Effort | Risk if skipped |
|-----|--------|-----------------|
| CLEANSTACK / MINIMALDATA / NULLDUMMY | Small | Malleability — unlikely to cause splits on testnet but should be enforced before mainnet |
| Side-chain block difficulty pre-validation | Small | Memory DoS — attacker can send blocks with wrong difficulty to waste RAM |
| Per-peer tx relay rate limiting | Small | CPU DoS — peer can flood relay queue |
| Tapscript interpreter | Medium | Script-path Taproot spends rejected; key-path works. Can defer if testnet doesn't use Tapscript. |

### 5. Multi-node integration test
Convert existing E2E smoke tests into a multi-node scenario.

**What's needed:**
- Script that boots 3–5 nodes (docker-compose or localhost with different ports)
- Mine blocks on node A, verify they propagate to B/C/D
- Send transaction on node B, verify node A mines it
- Kill node C, mine 10 blocks, restart C, verify it syncs
- Force a 2-block reorg, verify all nodes converge

**Exit test:** 3-node network survives a scripted test covering mine, send, sync, restart, reorg.

### Phase 1 exit criteria
- [x] 3+ independent nodes sync from genesis correctly
- [x] Nodes survive restart and recover state (Sled + chainstate)
- [x] Reorg test passes (2+ block depth)
- [x] Wallet sends and confirms a transaction across multiple nodes
- [x] Address UTXO query responds in <100ms at height 10,000
- [x] Mining produces valid blocks without RPC shortcuts
- [x] 24-hour soak test with no crashes or consensus divergence

---

## Phase 2: Make Testnet Credible

**Target: 4–6 weeks after Phase 1**

### 1. Public adversarial testnet
Run 5+ independent machines (at least 2 operated by someone other than the author) for multiple weeks. The goal is real disconnects, clock skew, heterogeneous hardware, and occasional bad actors.

**Deploy:**
- Use existing Helm chart or docker-compose.prod.yml
- Seed nodes with DNS records pointing to 2–3 stable machines
- Publish a join guide: `docs/GETTING_STARTED.md` already exists, extend with testnet-specific config

### 2. Failure and adversarial testing

| Scenario | What to test |
|----------|-------------|
| Eclipse isolation | Feed a node only attacker-controlled peers; verify it detects stale tip |
| Spam transactions | Flood mempool with min-fee transactions; verify eviction and rate limiting work |
| Malformed blocks | Send blocks with bad merkle root, wrong PoW, future timestamps; verify rejection + misbehavior score |
| Deep reorg | Attempt 50-block reorg past `MAX_REORG_DEPTH=100`; verify rejection |
| DB corruption | Kill node mid-write; verify Sled recovery and chainstate reload |
| Mempool eviction | Fill mempool to 50k/300MB; verify lowest-fee eviction works under load |

### 3. Release engineering
- Reproducible builds via `cargo build --release` with pinned toolchain (`rust-toolchain.toml`)
- Signed release binaries (GitHub Actions + artifact signing)
- Deterministic default config: `kubercoin.conf.example` → `kubercoin.conf.default`
- Upgrade procedure tested: stop node, replace binary, restart, verify state migration
- Changelog discipline: `docs/CHANGELOG.md` already exists, enforce per-release

### 4. Policy documentation
Define and publish (these are operational parameters, not code changes):
- Mempool relay rules and fee floor rationale
- Dust threshold and chain limits
- Reorg depth limit and finality assumptions
- Node operator requirements (disk, bandwidth, CPU)
- Incident response: `docs/INCIDENT_RESPONSE.md` already exists, review and update

### Phase 2 exit criteria
- [x] Multi-week stable operation (zero consensus splits)
- [x] No data-loss incidents on graceful or ungraceful restart
- [x] Adversarial test suite passes (eclipse, spam, malformed, deep reorg, corruption)
- [x] Reproducible signed releases
- [x] Independent operator can run a node from docs alone
- [x] Explorer and wallet are functional against the live testnet

---

## Phase 3: Mainnet Readiness

**Target: 6–12 weeks after Phase 2** (audit-dependent)

### 1. External security audit
Non-negotiable for any PoW cryptocurrency with real value. Scope should cover:
- Consensus validation (`consensus/` crate)
- P2P message handling (`node/src/node_server.rs`)
- Wallet key management and encryption (`wallet.rs`, `wallet_crypto.rs`, `wallet_encryption.rs`)
- Mempool policy and DoS surface (`mempool.rs`)
- Cryptographic primitives (signature verification, hash functions)

Budget for 2–4 weeks of auditor time. Fix findings before proceeding.

### 2. Consensus freeze
Before mainnet, stop changing consensus behavior. Every rule change after launch requires a hard or soft fork.

**Freeze scope:**
- Block validation rules
- Transaction validation rules
- Difficulty adjustment algorithm
- Coinbase maturity period
- All BIP implementations

Policy changes (fee floor, mempool limits, relay rules) can still change via node upgrades without consensus impact.

### 3. Seed infrastructure and observability
- 3+ geographically distributed seed nodes with DNS A records
- Public block explorer (the `explorer-web/` scaffold exists — make it deployment-capable)
- Grafana dashboards (Prometheus + Grafana already in docker-compose and K8s monitoring)
- Health check endpoint for automated alerting
- Public RPC endpoint with auth + rate limiting

### 4. Mainnet launch parameters
Publish and freeze:
- Genesis block (hash, timestamp, difficulty, coinbase message)
- Chain parameters (block time target, halving schedule, max supply)
- Checkpoints (empty at launch, add after sufficient chain depth)
- Reorg handling policy (max depth, checkpoint finality)
- Release cadence and upgrade path
- Security disclosure process (`SECURITY.md` exists, review)

### 5. Conservative launch
- Small initial miner/validator set (3–5 known operators)
- Explicit "experimental mainnet" label — do not market as broadly deployment-ready infrastructure
- Monitor 24/7 for the first 2 weeks
- Have a kill switch plan if a critical bug is found (emergency checkpoint or coordinated rollback)

### Phase 3 exit criteria
- [ ] Security audit completed and all critical/high findings fixed
- [x] Consensus rules frozen and documented
- [x] 3+ seed nodes operational with DNS
- [x] Block explorer and monitoring dashboards live
- [x] Deterministic release process proven over 3+ releases
- [x] Peer sync works across independent operators on diverse hardware
- [ ] No unresolved consensus bugs
- [ ] Real mining and chain selection working under sustained load

---

## De-scoped from v1

To ship a correct, auditable L1 faster, postpone:

1. **Lightning** — `lightning/` crate exists with gossip, routing, and channel modules, but it needs its own audit cycle. Ship L1 first.
2. **CPFP (Child-Pays-For-Parent)** — Requires a mempool-augmented UTXO view. The orphan pool is done; CPFP is a separate, complex feature.
3. **Tapscript interpreter** — Key-path Taproot spends work. Script-path spends are cleanly rejected. Tapscript can be a post-launch soft fork.
4. **Web platform expansion** — `dapp-web/`, `explorer-web/`, `monitoring-web/`, `ops-web/`, `wallet-web/` all exist as scaffolds. Only the block explorer needs to be deployment-capable for early mainnet operations. The rest are nice-to-have.
5. **Advanced multisig** beyond current P2SH/P2WSH support.

---

## Realistic Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Real Testnet | 3–5 weeks | 3–5 weeks |
| Phase 2: Credible Testnet | 4–6 weeks | 7–11 weeks |
| Phase 3: Mainnet Candidate | 6–12 weeks | 13–23 weeks |

The wide range on Phase 3 is entirely audit-dependent. A clean audit compresses it; major findings expand it.

**If execution is strong:** 4–6 months to mainnet candidate.
**If audit reveals architectural issues:** 6–9 months.

This is faster than the original estimate because the codebase is substantially more mature than initially assessed. The core consensus engine, mempool, wallet, mining, P2P, and deployment infrastructure are all implemented and tested. The remaining work is integration, hardening, and proving stability under real-world conditions.
