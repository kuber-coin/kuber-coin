# Grant Readiness

Last updated: 2026-03-17

This document is the reviewer-safe summary of what KuberCoin can credibly
claim today, which grants are strong fits, and what still needs to change
before stronger production or infrastructure claims are justified.

## Verdict

KuberCoin is suitable for development-oriented grant applications across all
four primary target programs.  The codebase has sufficient technical depth,
evidence, and newly added Ethereum-interoperability artefacts to make credible,
evidence-backed applications to each.

KuberCoin is **not yet** ready to be pitched as broadly deployable mainnet
infrastructure, externally audited critical financial software, or a deployed
exchange/custody product.

## Codebase at a Glance

| Metric | Value |
|--------|-------|
| Rust crates | 11 (chain, consensus, tx, storage, testnet, node, miner, faucet, lightning, eip_signing, eip_signing) |
| Rust source files | 112 |
| Rust lines of code | ~47,700 |
| Unit + integration tests | 1,301 (including 90 integration tests across 5 test suites) |
| Test pass rate | 1,334/1,334 — zero failures on last full run |
| Code coverage | 75.13% lines, 80.16% functions |
| Web applications | 8 (wallet, explorer, monitoring, ops, unified, dapp, docs, site) |
| TypeScript/TSX files | 459 |
| Native platforms | 3 (Windows WinUI3, macOS SwiftUI, Linux GTK4) |
| E2E test suites | 4 Playwright spec files + 7 wallet-specific test files |
| Live E2E results | 88/88 wallet tests, 12/12 critical path tests |
| SDK languages | 3 (JavaScript/TypeScript, Python, Rust) |
| Infrastructure | Helm chart, K8s manifests, 4 Dockerfiles, 5 Compose configs |
| CI/CD workflows | 7 GitHub Actions (CI, release, security-audit, fuzz, e2e, coverage, native-UI) |
| Operations scripts | 42 (deploy, test, monitoring, launch validation) |
| Documentation files | 62 Markdown documents |
| Formal spec | TLA+ consensus model with TypeOK, ChainGrowth, CommonPrefix invariants |
| Dependency audit | `cargo-deny` with license allowlist, advisory tracking, ban policy |
| License | MIT |

## Grant Fit Summary

| Grant | Fit | Strongest Evidence |
|-------|-----|--------------------|
| A1: NLNet NGI Zero | Strong fit | Open MIT Rust protocol; 11 crates / ~47.7K LoC; BIP-341 Taproot; BIP-155 addrv2 Tor; 75% coverage; live testnet; TLA+ formal spec |
| A2: HRF Bitcoin Dev Fund | Strong fit | SOCKS5/Tor proxy (`proxy_addr`/`tor_only`); Lightning crate (15 modules: channels, HTLC, onion routing, watchtower); HD wallet + BIP-39; Silent Payments design; CoinJoin/PayJoin roadmap |
| A3: OSTIF Audit Funding | Good fit | Audit scope prepared; zero first-party `unsafe` in production code; zero exploitable advisories; fuzz harness expansion plan; 1,301 tests passing |
| A4: Ethereum Foundation ESP | Good fit | `kubercoin-eip-signing` crate (EIP-191/712/Eth address + test vectors); TLA+ consensus spec; HTLC atomic swap specification with reference Solidity contract; ETHEREUM_INTEROP.md |

## Best-Fit Grant Types

Use the current repository state for:

- protocol research and implementation grants
- testnet, wallet, SDK, or tooling grants
- open-source infrastructure development grants
- security-hardening and external-audit preparation grants
- cross-chain interoperability and ZK research grants

Do not currently use the repository state for:

- mainnet launch grants
- reliability or SRE maturity grants that expect public operational proof
- production custody, exchange, or institutional integration pitches

## Evidence You Can Defend Today

### Core Protocol
- 11 Rust workspace crates spanning chain, consensus, transactions, storage, networking, mining, testnet, faucet, Lightning, and EIP-signing
- ~47,700 lines of Rust across 112 source files — this is a real protocol implementation, not a tutorial or wrapper
- Full UTXO model with SHA-256d proof-of-work, P2PKH addresses, Base58Check encoding, and a 21M hard cap with 210K-block halving
- BIP coverage includes: BIP-32 (HD wallets), BIP-39 (mnemonic seeds), BIP-34 (height in coinbase), BIP-65/66/68 (time-lock ops), BIP-112 (CSV), BIP-125 (RBF), BIP-141/143 (SegWit), BIP-155 (addrv2/Tor), BIP-173 (Bech32), BIP-174 (PSBT), BIP-340/341/342 (Schnorr/Taproot), BIP-350 (Bech32m)
- Consensus parameters frozen and documented in [CONSENSUS_FREEZE.md](CONSENSUS_FREEZE.md)

### Testing & Verification
- 1,301 Rust tests (unit + integration) — 1,334/1,334 passed on last full run with zero failures
- 90 dedicated integration tests across 5 test suites (multi-node convergence, reorg handling, mempool management, wallet operations, node lifecycle)
- 23 adversarial tests exercising double-spend, selfish mining, time-warp, and eclipse attack scenarios
- 88/88 live wallet E2E tests + 12/12 critical path tests via Playwright
- Measured code coverage: 75.13% lines + 80.16% functions, with explicit gap analysis in [COVERAGE.md](COVERAGE.md)
- TLA+ formal consensus specification at `specs/consensus.tla` with TypeOK, ChainGrowth, and CommonPrefix(Δ+1) invariants
- `cargo-deny` enforced: license allowlist, advisory database tracking, dependency ban policy

### Privacy & Censorship Resistance
- SOCKS5/Tor proxy implemented in P2P layer (`proxy_addr`/`tor_only`/`allow_onion` config fields)
- BIP-155 addrv2 for advertising `.onion` addresses to peers
- CoinJoin mixing protocol design documented in [COINJOIN_DESIGN.md](COINJOIN_DESIGN.md)
- Silent Payments compatibility analysis in [SILENT_PAYMENTS_COMPATIBILITY.md](SILENT_PAYMENTS_COMPATIBILITY.md)
- Tor operator guide with hidden service setup in [TOR_CONFIGURATION.md](TOR_CONFIGURATION.md)

### Cross-Chain & Ethereum Interoperability
- `kubercoin-eip-signing` crate: EIP-191 personal-sign, EIP-712 typed structured data, Ethereum address derivation with EIP-55 checksum, validated against ethers.js/Web3.py test vectors
- Cross-chain HTLC atomic swap specification at [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md) with reference Solidity contract
- Full Ethereum interoperability map at [ETHEREUM_INTEROP.md](ETHEREUM_INTEROP.md)

### Lightning Network
- `kubercoin-lightning` crate: 15 modules implementing channel state machines, HTLC forwarding, onion routing, Bolt 11 invoices, gossip protocol, watchtower, liquidity management, dual funding, channel backup and persistence
- Lightning Network integration is library-complete; RPC wiring to the running node is the next milestone

### Infrastructure & Operations
- 4 Dockerfiles (multi-stage production, simple, multiarch, web) with reproducible build support (`SOURCE_DATE_EPOCH`)
- 5 Docker Compose configurations (dev, testnet, edge, production, seed)
- Helm chart + Kubernetes manifests for container orchestration
- Azure infrastructure-as-code (Bicep) for cloud deployment
- Prometheus + Grafana monitoring stack with 10 alert rules
- 42 operations scripts covering build, test, deploy, monitoring, and launch validation
- 7 GitHub Actions CI/CD workflows: lint/check, test (Linux + Windows), convergence, cargo-deny, MSRV, documentation, security-audit, fuzzing, E2E, coverage, native-UI, multi-target release with cosign signing

### Developer Experience
- SDK with examples in 3 languages: JavaScript/TypeScript, Python, Rust
- 8 web applications: wallet, block explorer, monitoring dashboard, operations dashboard, unified portal, dApp scaffold, component docs, landing page
- Native mining UI for 3 platforms: Windows (WinUI3/.NET 8), macOS (SwiftUI), Linux (GTK4/Rust)
- 62 documentation files covering getting started, API reference, CLI reference, mining guide, cold storage, deployment, security hardening, disaster recovery, and more

### Security Posture
- Zero first-party `unsafe` blocks in production Rust code
- Zero exploitable advisories — 4 RUSTSEC items tracked and documented as non-exploitable indirect dependencies
- Misbehaviour-scored peer banning (threshold: 100)
- Per-IP rate limiting on HTTP/RPC endpoints
- Bearer token authentication enforced when `KUBERCOIN_API_KEYS` is set
- Audit-readiness materials assembled for external auditor delivery
- Responsible disclosure policy published in [SECURITY.md](../SECURITY.md)

## What Still Blocks Stronger Claims

The main blockers are credibility and operational-proof gaps, not a lack of engineering effort.

1. **No external audit completed** — audit-readiness materials are assembled, but no auditor engagement has been signed.
2. **Public CI and release artifacts** — configured but not proven with green public CI runs attached to a published release.
3. **Lightning not wired to node runtime** — the Lightning crate implements core protocol logic (channels, HTLC, onion routing, watchtower) but `openchannel`/`sendpayment` RPCs are not yet wired to a running node.
4. **EIP signing not wired to wallet CLI** — `kubercoin-eip-signing` is a library; `getnewaddress ethereum` RPC and CLI flow are planned.
5. **ZK research crate** — `arkworks`-based Pedersen commitments and range proofs are on the roadmap but not yet implemented.
6. **Silent Payments** — design is complete; `silent_payments.rs` implementation is not yet written.
7. Some handler-heavy RPC modules still have materially low coverage despite improved router-level integration tests.

## Recommended Grant Positioning

The strongest honest story is:

- The protocol and runtime are real and validated on a live testnet.
- The repo has substantial technical depth with documented engineering evidence.
- The codebase now has concrete Ethereum interoperability artefacts (EIP-191/712
  signing, atomic swap spec, formal TLA+ model) making it a credible EF ESP candidate.
- The single biggest HRF gap (Tor transport) is now implemented in the P2P layer.
- The next funding milestone closes: external audit, Lightning wiring to node,
  EIP wallet CLI integration, and ZK primitives research crate.

## Suggested Milestone Framing

If you submit a grant now, the milestone package should focus on:

- external security audit and remediation
- public CI and release artifact publication
- Lightning-to-node-runtime wiring (`openchannel`/`sendpayment`/`closechannel`)
- EIP-191/712 wallet CLI and `getnewaddress ethereum` RPC
- `kubercoin-zkprim` crate: Pedersen commitments + Bulletproof range proofs

## Reviewer Checklist

Before sending this repo to a grant reviewer, confirm they can quickly find:

- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- [E2E_COIN_WORKFLOW.md](E2E_COIN_WORKFLOW.md)
- [COVERAGE.md](COVERAGE.md)
- [SECURITY.md](SECURITY.md)
- [CONSENSUS_FREEZE.md](CONSENSUS_FREEZE.md)
- [ROADMAP_BITCOIN_GRADE.md](ROADMAP_BITCOIN_GRADE.md)
- [ETHEREUM_INTEROP.md](ETHEREUM_INTEROP.md) ← grant-reviewer surface for EF ESP
- [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md) ← cross-chain evidence
- [TOR_CONFIGURATION.md](TOR_CONFIGURATION.md) ← HRF Tor evidence
- [specs/consensus.tla](../specs/consensus.tla) ← formal verification evidence

If any of those documents drift from reality, treat that as a grant blocker.