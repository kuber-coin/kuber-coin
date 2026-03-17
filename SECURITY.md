# Security Policy

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please email **connect@kuber-coin.com** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact assessment
4. Any suggested fixes (optional)

We will acknowledge receipt within **48 hours** and provide a detailed response
within **7 business days**.

## Responsible Disclosure

We ask that you:

- Allow us reasonable time to fix the issue before public disclosure
- Make a good-faith effort to avoid data destruction and privacy violations
- Do not exploit the vulnerability beyond what is necessary to demonstrate it

## Scope

The following are in scope:

| Component | Repository Path |
|-----------|----------------|
| Node binary | `node/`, `chain/`, `consensus/`, `tx/`, `storage/` |
| P2P protocol | `node/src/protocol.rs`, `node/src/discovery.rs` |
| Wallet operations | `node/src/wallet.rs`, `wallet-web/` |
| Mining | `node/src/miner.rs`, `miner/` |
| Cryptographic functions | `tx/src/`, `chain/src/` |
| API endpoints | `node/src/main.rs` (HTTP handlers) |
| Docker images | `Dockerfile`, `docker-compose.yml` |

## Out of Scope

- Third-party dependencies (report upstream; notify us if critical)
- Social engineering attacks
- Denial of service via excessive traffic (unless amplification is involved)
- Issues in development/test configurations

## Vulnerability Intake

Confirmed vulnerabilities should be reported privately to
connect@kuber-coin.com. This repository does not publish guaranteed public
reward amounts in the root security policy.

## Supported Versions

| Version | Status |
|---------|--------|
| 1.0.x | Actively supported |
| < 1.0.0 | Not supported |

## Security Audit Status

- **cargo-audit**: Latest local run on 2026-03-16 scanned 317 dependencies and reported no known exploitable advisories; 3 unmaintained crates remain tracked for replacement: `bincode 1.3.3`, `fxhash 0.2.1`, and `instant 0.1.13`
- **cargo-geiger**: Latest local run on 2026-03-16 scanned the `core/node/Cargo.toml` build graph (179 packages). All first-party crates in that graph (`chain`, `consensus`, `kubercoin-node`, `storage`, `testnet`, `tx`) reported `0` used unsafe items
- **First-party unsafe inventory**: Current source grep finds 2 local `unsafe` call sites, both in test helpers at `core/core/tx/src/opcodes.rs`; they are not reported as used unsafe in the node build graph
- **Audit readiness**: Current findings and audit-readiness notes are summarized in [docs/SECURITY.md](docs/SECURITY.md)
- **Formal audit**: External audit engagement is still pending; audit-readiness materials have been assembled internally for handoff

For the full security policy, vulnerability categories, and detailed program
rules, see [docs/SECURITY.md](docs/SECURITY.md).
