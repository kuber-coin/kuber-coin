# Contributing to KuberCoin

Thanks for your interest in contributing! This document gets you started quickly.

For the full developer onboarding guide, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Quick Setup

```bash
git clone https://github.com/kubercoin/kubercoin.git
cd kubercoin
cargo build --release --bin kubercoin
cargo test --workspace
```

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes with tests
4. Run the test suite: `cargo test --workspace`
5. Run clippy: `cargo clippy --workspace`
6. Format: `cargo fmt --all`
7. Open a pull request against `main`

## Testing

```bash
# Unit tests (all crates)
cargo test --workspace

# E2E smoke test (requires running node)
powershell -ExecutionPolicy Bypass -File scripts/e2e_smoke.ps1

# Playwright E2E (wallet-web)
cd wallet-web && npm run test:e2e
```

## Project Structure

| Crate | Purpose |
|-------|---------|
| `chain/` | Block structure, Merkle trees |
| `consensus/` | Consensus rules |
| `tx/` | Transactions, signatures, addresses |
| `storage/` | Persistent chain storage |
| `node/` | Full node: P2P, mining, API, CLI |
| `testnet/` | Genesis block, test utilities |

## Code Standards

- `cargo fmt` before committing
- `cargo clippy` must pass with no warnings
- All public items need doc comments (`///`)
- New features need tests

## Reporting Issues

- Bugs: [GitHub Issues](https://github.com/kubercoin/kubercoin/issues)
- Security: See [SECURITY.md](SECURITY.md)
- Questions: Open a Discussion

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
