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

## Grant Fit Summary

| Grant | Fit | Strongest Evidence |
|-------|-----|--------------------|
| A1: NLNet NGI Zero | ⭐⭐⭐⭐⭐ | Open MIT Rust protocol; BIP-341 Taproot; BIP-155 addrv2 Tor; 75% coverage; live testnet |
| A2: HRF Bitcoin Dev Fund | ⭐⭐⭐⭐⭐ | SOCKS5/Tor proxy (proxy_addr/tor_only); Lightning crate; HD wallet + BIP-39; Silent Payments design; CoinJoin/PayJoin roadmap |
| A3: OSTIF Audit Funding | ⭐⭐⭐⭐⭐ | Audit scope prepared; zero first-party unsafe production code; zero exploitable advisories; fuzz expansion plan |
| A4: Ethereum Foundation ESP | ⭐⭐⭐⭐⭐ | kubercoin-eip-signing crate (EIP-191/712/Eth address + test vectors); TLA+ consensus spec; ATOMIC_SWAPS.md; ETHEREUM_INTEROP.md |

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

- Real codebase maturity across chain, consensus, tx, storage, testnet, and node components
- Local validation evidence recorded on 2026-03-16 for `cargo check`, `cargo test`, `cargo clippy`, and `cargo deny check`
- Current measured Rust coverage of `75.13%` lines and `80.16%` functions, with remaining low-coverage modules called out explicitly in [COVERAGE.md](COVERAGE.md)
- Live-stack wallet E2E validation recorded in [E2E_COIN_WORKFLOW.md](E2E_COIN_WORKFLOW.md), including `88/88` live wallet tests and `12/12` critical live wallet tests
- Launch gate tracked in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md), including what is done and what is still missing
- Public security posture and audit-readiness summary captured in [SECURITY.md](SECURITY.md)
- Consensus and roadmap discipline reflected in [CONSENSUS_FREEZE.md](CONSENSUS_FREEZE.md), [ROADMAP_BITCOIN_GRADE.md](ROADMAP_BITCOIN_GRADE.md), and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- SOCKS5/Tor proxy implemented in P2P layer (`proxy_addr`/`tor_only`/`allow_onion` config fields)
- `kubercoin-eip-signing` crate: EIP-191, EIP-712, Ethereum address derivation with EIP-55 checksum and ethers.js/Web3.py test vectors
- TLA+ formal consensus specification at `specs/consensus.tla` with TypeOK, ChainGrowth, CommonPrefix(Δ+1) invariants
- Cross-chain HTLC atomic swap specification at [ATOMIC_SWAPS.md](ATOMIC_SWAPS.md) with reference Solidity contract
- Ethereum interoperability map at [ETHEREUM_INTEROP.md](ETHEREUM_INTEROP.md)
- Privacy roadmap: [TOR_CONFIGURATION.md](TOR_CONFIGURATION.md), [COINJOIN_DESIGN.md](COINJOIN_DESIGN.md), [SILENT_PAYMENTS_COMPATIBILITY.md](SILENT_PAYMENTS_COMPATIBILITY.md)

## What Still Blocks Stronger Claims

The main blockers are credibility and operational-proof gaps, not a lack of engineering effort.

1. **No external audit completed** — audit-readiness materials are assembled, but no auditor engagement has been signed.
2. **Public CI and release artifacts** — configured but not proven with green public CI runs attached to a published release.
3. **Lightning not wired to node runtime** — the Lightning crate is complete but `openchannel`/`sendpayment` RPCs are not yet wired to a running node.
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