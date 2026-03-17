# KuberCoin Code Coverage

This document describes the code coverage setup and goals for the KuberCoin project.

## Overview

Code coverage tracking helps ensure that our test suite adequately exercises the codebase. We use `cargo-llvm-cov` for coverage analysis, which is compatible with Windows, Linux, and macOS.

## Coverage Goals

- **Overall Target**: 80%+ code coverage across all critical paths
- **Minimum Acceptable**: 70% coverage for any individual module
- **Critical Modules**: 90%+ coverage required for:
  - `tx` (transaction validation and processing)
  - `chain` (blockchain consensus logic)
  - `crypto` (cryptographic operations)
  - `storage` (persistent storage backend)
  - `node/rpc_server.rs` (RPC API endpoints)
  - `node/errors.rs` (error handling)

## Running Coverage Locally

### Prerequisites

```powershell
# Install cargo-llvm-cov
cargo install cargo-llvm-cov
```

### Generate Coverage Report

```powershell
# Quick script (PowerShell)
.\coverage.ps1

# Or manually:
cargo llvm-cov --all-features --workspace --html

# View report
start target\llvm-cov\html\index.html
```

### Coverage Commands

```bash
# Generate HTML report (opens in browser)
cargo llvm-cov --all-features --workspace --html

# Generate terminal summary
cargo llvm-cov --all-features --workspace

# Generate JSON report
cargo llvm-cov --all-features --workspace --json --output-path coverage.json

# Generate LCOV format (for CI/CD)
cargo llvm-cov --all-features --workspace --lcov --output-path lcov.info

# Run specific package only
cargo llvm-cov -p node --html

# Clean coverage data
cargo llvm-cov clean --workspace
```

## CI/CD Integration

Coverage is automatically generated on every push and pull request via GitHub Actions:

- **Workflow**: `.github/workflows/coverage.yml`
- **Reports**: Uploaded to Codecov when `CODECOV_TOKEN` is configured in the GitHub repository
- **Artifacts**: HTML reports are uploaded by the workflow as GitHub Actions artifacts

Current trust boundary:

- The workflow is present in-repo and configured for LCOV, HTML artifact upload, and a summary step.
- The March 16, 2026 numbers below are from a local measured run, not from a linked public Codecov dashboard in the current repository state.
- Until public green workflow runs and Codecov uploads are reviewer-visible, treat coverage automation as configured evidence rather than published evidence.

### Codecov Setup

1. Sign up at [codecov.io](https://codecov.io)
2. Add KuberCoin repository
3. Add `CODECOV_TOKEN` secret to GitHub repository settings
4. Add a real coverage badge only after the repository is connected and public coverage uploads are verified end to end

## Coverage Exclusions

Some code is intentionally excluded from coverage:

```rust
// Exclude debug/test utilities
#[cfg(not(tarpaulin_include))]
fn debug_helper() { ... }

// Exclude panic handlers
#[cfg(not(coverage))]
panic!("Should never happen");
```

## Improving Coverage

### Identify Gaps

```bash
# See uncovered lines
cargo llvm-cov --all-features --workspace --html
# Open HTML report and look for red/yellow lines
```

### Common Gaps

1. **Error paths**: Add tests for error conditions
2. **Edge cases**: Test boundary conditions
3. **Panic handlers**: Test failure scenarios
4. **Integration flows**: Add end-to-end tests

### Writing Effective Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_happy_path() {
        // Test normal operation
    }

    #[test]
    fn test_error_handling() {
        // Test error conditions
    }

    #[test]
    fn test_edge_cases() {
        // Test boundary values
    }
}
```

## Current Coverage Status

**Last measured:** March 16, 2026 — `cargo llvm-cov --workspace --summary-only`  
**Total workspace: 75.13% lines | 80.16% functions | 76.17% regions** (58,994 lines instrumented)

These figures are currently the safest reviewer-facing numbers to cite because they are tied to a dated local measurement and can be regenerated with `./coverage.ps1`.

### By Crate

| Crate | Key Files | Line Coverage | Status | Target |
|-------|-----------|---------------|--------|--------|
| `chain` | block, utxo, utxo_db, compact_blocks, header | ~95% | ✅ | 90%+ |
| `consensus` | checkpoints, difficulty, pow, sig_cache | ~76% | ✅ | 70%+ |
| `consensus/validator` | validator.rs (2,353 lines) | 61.50% | ⚠️ | 70%+ |
| `tx` | address, bip39/44/84/86, keys, musig2, opcodes | ~88% | ✅ | 90%+ |
| `tx/lib.rs` | Script interpreter core | 51.67% | ⚠️ | 70%+ |
| `storage` | rocksdb_backend.rs | 94.46% | ✅ | 90%+ |
| `testnet` | lib.rs | 86.78% | ✅ | 80%+ |
| `node/state` | state.rs (ChainState) | 79.63% | ✅ | 80%+ |
| `node/rpc` | rpc.rs (main dispatch + REST) | 72.98% | ✅ | 70%+ |
| `node/network` | message, peer, v2_transport | 80–99% | ✅ | 70%+ |
| `node/network/server` | server.rs | 58.72% | ⚠️ | 70%+ |
| `node/rpc_chain` | rpc_chain.rs (1,781 lines) | 12.41% | 🔴 | 70%+ |
| `node/rpc_wallet` | rpc_wallet.rs (2,638 lines) | 19.71% | 🔴 | 70%+ |
| `node/rpc_network` | rpc_network.rs | 19.56% | 🔴 | 70%+ |
| `node/rpc_mining` | rpc_mining.rs | 34.42% | ⚠️ | 70%+ |
| `faucet` | lib.rs | 71.04% | ✅ | 70%+ |
| `lightning` | channel, htlc, invoice, routing, backup | 85–100% | ✅ | 80%+ |
| `miner` (binary) | main.rs | 0% | ℹ️ | N/A (binary) |

### Notes on Low-Coverage Modules

- **rpc_chain.rs / rpc_wallet.rs / rpc_network.rs** — These handler modules now have router-level integration coverage through `core/tests/integration/rpc_api.rs`, including `getblockhash`, `getbestblockhash`, `getblock`, `getnetworkinfo`, `getpeerinfo`, `getconnectioncount`, locked-wallet `getnewaddress`, locked-wallet `sendtoaddress`, and filtered `listunspent`. That improved the split-module baseline materially, but these files are still far below the 70% target and need a broader second wave of handler tests.
- **consensus/validator.rs** — 2,353 lines, many branches covering Taproot script-path paths that are currently rejected structurally rather than fully executed. Adversarial test coverage fills the common paths; the remaining 38.5% are Taproot script interpreter branches deferred for v2.
- **tx/lib.rs** — 51.67% covers the signature hash and script interpreter core. Low coverage here stems from Taproot sighash branches and `OP_CODESEPARATOR` paths. BIP-143 and BIP-341 key-path paths are covered.
- **node/network/server.rs** — 58.72%; connection-handling branches that require live TCP pairs are not covered in the unit tests. The 10-test network suite covers the core paths.

*Run `.\coverage.ps1` to regenerate this table with the latest numbers. If you use the result in reviewer-facing material, update the date and totals above in the same change.*

## Best Practices

1. **Run coverage locally** before pushing code
2. **Aim for 80%+** coverage on new code
3. **Focus on critical paths** first (crypto, consensus, storage)
4. **Don't chase 100%** - some code (debug utils, panic handlers) doesn't need coverage
5. **Review coverage reports** in CI/CD artifacts
6. **Fix regressions** - don't let coverage drop below baseline

## Troubleshooting

### cargo-llvm-cov not found

```powershell
cargo install cargo-llvm-cov
```

### Tests fail during coverage

```bash
# Run tests normally first
cargo test --all-features --workspace

# Check which test fails
cargo test --all-features --workspace -- --nocapture
```

### Coverage data stale

```bash
# Clean and regenerate
cargo llvm-cov clean --workspace
cargo llvm-cov --all-features --workspace --html
```

### Slow coverage generation

```bash
# Run specific package
cargo llvm-cov -p node --html

# Skip doc tests
cargo llvm-cov --all-features --workspace --html --no-doc
```

## Resources

- [cargo-llvm-cov Documentation](https://github.com/taiki-e/cargo-llvm-cov)
- [Codecov Documentation](https://docs.codecov.io/)
- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)

## Maintenance

- **Weekly**: Review coverage workflow output and Codecov trends if repository integration is enabled
- **Before Release**: Ensure all modules meet minimum coverage
- **After Major Changes**: Regenerate coverage and update this document
- **Quarterly**: Update coverage goals based on project growth
