# Contributing to Kubercoin
## Developer Onboarding Guide

Welcome to the Kubercoin project! We're excited to have you contribute to building the next-generation privacy-focused, high-performance blockchain.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Environment](#development-environment)
3. [Project Architecture](#project-architecture)
4. [Code Standards](#code-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Issue Guidelines](#issue-guidelines)
8. [Communication](#communication)
9. [Code of Conduct](#code-of-conduct)

---

## Quick Start

### Prerequisites

- **Rust 1.70+** ([install from rustup.rs](https://rustup.rs))
- **Git** (version control)
- **A code editor** (VS Code, IntelliJ IDEA, or Vim)
- **Docker** (optional, for testing)

### 5-Minute Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/kubercoin.git
cd kubercoin

# 2. Build the project
cargo build

# 3. Run tests
cargo test

# 4. Run the node (regtest mode)
cargo run --bin kubercoin -- start --regtest

# 5. Create a branch for your work
git checkout -b feature/my-awesome-feature
```

**You're ready to contribute!** 🎉

---

## Development Environment

### Required Tools

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install development components
rustup component add rustfmt clippy

# Install cargo tools (optional but recommended)
cargo install cargo-watch    # Auto-rebuild on file changes
cargo install cargo-edit     # Manage dependencies easily
cargo install cargo-outdated # Check for outdated dependencies
cargo install cargo-audit    # Security vulnerability scanning
```

### Recommended IDE Setup

**VS Code:**
```json
{
  "extensions": [
    "rust-lang.rust-analyzer",
    "vadimcn.vscode-lldb",
    "serayuzgur.crates",
    "tamasfe.even-better-toml"
  ],
  "rust-analyzer.checkOnSave.command": "clippy",
  "editor.formatOnSave": true
}
```

**IntelliJ IDEA:**
- Install Rust plugin from JetBrains marketplace
- Enable "Rustfmt" on save
- Enable "Clippy" lints

### Build Modes

```bash
# Debug build (fast compile, slow runtime)
cargo build

# Release build (slow compile, fast runtime)
cargo build --release

# Run with optimizations
cargo run --release

# Build specific crate
cargo build -p chain
```

### Useful Cargo Commands

```bash
# Watch mode (auto-rebuild on changes)
cargo watch -x build

# Check code without building
cargo check

# Run benchmarks
cargo bench

# Generate documentation
cargo doc --open

# Update dependencies
cargo update

# Check for security vulnerabilities
cargo audit
```

---

## Project Architecture

### Repository Structure

```
kubercoin/
├── node/              # Main node implementation
│   ├── src/
│   │   ├── main.rs    # Entry point
│   │   ├── api/       # RPC/REST/WebSocket APIs
│   │   ├── network/   # P2P networking
│   │   ├── storage/   # Database layer
│   │   └── ...        # Other modules
│   └── Cargo.toml
├── chain/             # Blockchain structures
│   ├── src/
│   │   ├── block.rs   # Block structure
│   │   ├── merkle.rs  # Merkle trees
│   │   └── utxo.rs    # UTXO set
│   └── Cargo.toml
├── consensus/         # Consensus rules
│   ├── src/
│   │   ├── pow.rs     # Proof of Work
│   │   └── validate.rs
│   └── Cargo.toml
├── tx/                # Transaction logic
│   ├── src/
│   │   ├── script.rs  # Script interpreter
│   │   ├── signer.rs  # Transaction signing
│   │   └── ...
│   └── Cargo.toml
├── storage/           # Storage backends
├── testnet/           # Testnet utilities
├── tools/             # CLI tools
├── docs/              # Documentation
├── .github/           # CI/CD workflows
├── Cargo.toml         # Workspace root
└── README.md
```

### Module Overview

| Module | Purpose | Key Files |
|--------|---------|-----------|
| **node** | Main binary, API, networking | `main.rs`, `rpc.rs`, `p2p.rs` |
| **chain** | Blockchain data structures | `block.rs`, `merkle.rs` |
| **consensus** | Validation and consensus | `pow.rs`, `validate.rs` |
| **tx** | Transaction processing | `script.rs`, `signer.rs` |
| **storage** | Database abstraction | `db.rs`, `index.rs` |

### Key Concepts

**1. UTXO Model**
- Unspent Transaction Outputs (Bitcoin-style)
- Each output can only be spent once
- Inputs reference previous outputs

**2. Proof of Work**
- SHA-256d hashing (double SHA-256)
- Difficulty adjustment every 2016 blocks
- Target block time: 10 minutes

**3. Script System**
- Stack-based execution (Bitcoin-like)
- P2PKH (Pay to Public Key Hash)
- Future: P2SH, SegWit, Taproot

**4. Networking**
- TCP-based P2P protocol
- Gossip protocol for block/tx propagation
- Dandelion++ for transaction privacy

### Data Flow

```
User Transaction
    ↓
Wallet Creates & Signs TX
    ↓
Broadcast to Mempool
    ↓
Miner Includes in Block
    ↓
Block Propagated to Network
    ↓
Nodes Validate & Store
    ↓
TX Confirmed
```

---

## Code Standards

### Rust Style Guide

We follow the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) and enforce them with `rustfmt` and `clippy`.

**Formatting:**
```bash
# Format all code
cargo fmt

# Check formatting
cargo fmt -- --check
```

**Linting:**
```bash
# Run clippy
cargo clippy -- -D warnings

# Fix clippy suggestions automatically
cargo clippy --fix
```

### Naming Conventions

```rust
// ✅ Good
pub struct BlockHeader { ... }
pub fn validate_block(block: &Block) -> Result<(), Error> { ... }
const MAX_BLOCK_SIZE: usize = 1_000_000;

// ❌ Bad
pub struct blockHeader { ... }  // Wrong case
pub fn ValidateBlock(...) { ... }  // Wrong case
const maxBlockSize: usize = 1000000;  // Wrong case, no separator
```

### Error Handling

**Use `Result<T, E>` for recoverable errors:**

```rust
// ✅ Good
pub fn parse_block(data: &[u8]) -> Result<Block, ParseError> {
    if data.len() < 80 {
        return Err(ParseError::InvalidLength);
    }
    // ...
}

// ❌ Bad
pub fn parse_block(data: &[u8]) -> Block {
    assert!(data.len() >= 80);  // Don't panic in library code
    // ...
}
```

**Use custom error types:**

```rust
#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Invalid block hash: expected {expected}, got {actual}")]
    InvalidHash { expected: String, actual: String },
    
    #[error("Block too large: {size} bytes (max {max})")]
    BlockTooLarge { size: usize, max: usize },
}
```

### Documentation

**All public APIs must be documented:**

```rust
/// Validates a block according to consensus rules.
///
/// This checks:
/// - Block size limits
/// - Proof of Work difficulty
/// - Merkle root correctness
/// - Transaction validity
///
/// # Arguments
/// * `block` - The block to validate
/// * `prev_header` - Previous block header for difficulty check
///
/// # Errors
/// Returns `ValidationError` if block is invalid.
///
/// # Examples
/// ```
/// use kubercoin::consensus::validate_block;
///
/// let block = Block::new(...);
/// let prev_header = get_previous_header();
/// validate_block(&block, &prev_header)?;
/// ```
pub fn validate_block(
    block: &Block,
    prev_header: &BlockHeader
) -> Result<(), ValidationError> {
    // Implementation
}
```

### Performance Guidelines

**1. Avoid Allocations in Hot Paths**

```rust
// ✅ Good - reuse buffer
let mut buffer = Vec::with_capacity(1000);
for item in items {
    buffer.clear();
    serialize_into(&mut buffer, item)?;
    send(&buffer)?;
}

// ❌ Bad - allocates every iteration
for item in items {
    let buffer = serialize(item)?;  // New allocation
    send(&buffer)?;
}
```

**2. Use `&str` and `&[u8]` Over Owned Types**

```rust
// ✅ Good
pub fn hash_data(data: &[u8]) -> Hash { ... }

// ❌ Bad (unless ownership needed)
pub fn hash_data(data: Vec<u8>) -> Hash { ... }
```

**3. Profile Before Optimizing**

```rust
// Use criterion for benchmarks
#[bench]
fn bench_block_validation(b: &mut Bencher) {
    let block = create_test_block();
    b.iter(|| validate_block(&block));
}
```

### Concurrency

**Use `Arc<RwLock<T>>` for shared mutable state:**

```rust
use std::sync::{Arc, RwLock};

pub struct Mempool {
    transactions: Arc<RwLock<HashMap<TxId, Transaction>>>,
}

impl Mempool {
    pub fn add(&self, tx: Transaction) -> Result<(), Error> {
        let mut txs = self.transactions.write().unwrap();
        txs.insert(tx.id(), tx);
        Ok(())
    }
    
    pub fn get(&self, id: &TxId) -> Option<Transaction> {
        let txs = self.transactions.read().unwrap();
        txs.get(id).cloned()
    }
}
```

### Sprint Discipline (Legacy)

**Note:** Sprint 1 was completed. These rules are historical reference:
- ~~Sprint 1 is **locked**. Do not add networking, RocksDB, or complex abstractions~~
- Current focus: Building out full feature set per roadmap
- When in doubt, discuss in Discord (#dev-discussion) before implementing

---

## Testing Guidelines

### Test Structure

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_block_validation_success() {
        let block = create_valid_block();
        assert!(validate_block(&block).is_ok());
    }
    
    #[test]
    fn test_block_validation_invalid_hash() {
        let mut block = create_valid_block();
        block.header.hash = Hash::zero();
        assert_eq!(
            validate_block(&block).unwrap_err(),
            ValidationError::InvalidHash { ... }
        );
    }
}
```

### Test Coverage

**Aim for 80%+ code coverage:**

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin --out Html --output-dir coverage
```

### Test Types

**1. Unit Tests** (in same file)
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_addition() {
        assert_eq!(2 + 2, 4);
    }
}
```

**2. Integration Tests** (`tests/` directory)
```rust
// tests/blockchain_integration.rs
use kubercoin::*;

#[test]
fn test_full_blockchain_sync() {
    let node1 = Node::new();
    let node2 = Node::new();
    // Test full sync process
}
```

**3. Benchmarks** (`benches/` directory)
```rust
// benches/validation_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_validate_block(c: &mut Criterion) {
    let block = create_test_block();
    c.bench_function("validate_block", |b| {
        b.iter(|| validate_block(black_box(&block)))
    });
}

criterion_group!(benches, bench_validate_block);
criterion_main!(benches);
```

### Test Fixtures

**Create reusable test data:**

```rust
// tests/fixtures/mod.rs
pub fn create_test_block() -> Block {
    Block {
        header: BlockHeader {
            version: 1,
            prev_block: Hash::zero(),
            merkle_root: Hash::zero(),
            timestamp: 1706620800,
            bits: 0x1d00ffff,
            nonce: 0,
        },
        transactions: vec![create_coinbase_tx()],
    }
}
```

### Mocking

**Use `mockall` for mocking traits:**

```rust
use mockall::*;

#[automock]
trait Database {
    fn get_block(&self, hash: &Hash) -> Result<Block, Error>;
}

#[test]
fn test_with_mock_db() {
    let mut mock_db = MockDatabase::new();
    mock_db.expect_get_block()
        .returning(|_| Ok(create_test_block()));
    
    let result = process_with_db(&mock_db);
    assert!(result.is_ok());
}
```

---

## Pull Request Process

### Before Opening a PR

**1. Create an Issue (for non-trivial changes)**
- Describe the problem or feature
- Discuss approach with maintainers
- Get feedback before implementing

**2. Create a Feature Branch**
```bash
git checkout -b feature/add-segwit-support
# or
git checkout -b fix/mempool-memory-leak
```

**3. Make Your Changes**
- Write code following our style guide
- Add tests (maintain or improve coverage)
- Update documentation
- Run tests locally

**4. Self-Review**
```bash
# Format code
cargo fmt

# Check for errors
cargo clippy -- -D warnings

# Run all tests
cargo test --all-features

# Check documentation
cargo doc --no-deps --open

# Run benchmarks (if performance-critical)
cargo bench
```

### Opening a PR

**Title Format:**
- `feat: Add SegWit transaction support`
- `fix: Resolve mempool memory leak`
- `docs: Update API documentation for RPC methods`
- `refactor: Simplify block validation logic`
- `test: Add integration tests for P2P sync`

**Description Template:**

```markdown
## Description
Brief description of what this PR does.

## Motivation
Why is this change needed? What problem does it solve?

## Changes
- Added X feature
- Fixed Y bug
- Refactored Z module

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Benchmarks run (if applicable)
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed the code
- [ ] Commented hard-to-understand areas
- [ ] Updated documentation
- [ ] No breaking changes (or documented if necessary)
- [ ] Tested on multiple platforms (if applicable)

## Related Issues
Closes #123
```

### Review Process

**1. Automated Checks**
- CI/CD pipeline runs (format, lint, test, build)
- Code coverage report generated
- Security audit performed

**2. Code Review**
- At least 1 approval required from core team
- Address all reviewer comments
- Update PR based on feedback

**3. Merge**
- Squash and merge (for clean history)
- Delete branch after merge

### PR Size Guidelines

**Keep PRs small and focused:**
- ✅ **Small:** < 200 lines changed
- ⚠️ **Medium:** 200-500 lines changed
- ❌ **Large:** > 500 lines changed (split into multiple PRs)

---

## Issue Guidelines

### Bug Reports

**Template:**

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Run node with '...'
2. Execute command '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment**
- OS: [e.g., Ubuntu 22.04]
- Rust version: [e.g., 1.70.0]
- Kubercoin version: [e.g., 1.0.0]

**Logs**
```
Paste relevant logs here
```

**Additional context**
Any other relevant information.
```

### Feature Requests

**Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context, mockups, or examples.
```

### Good First Issues

Look for issues labeled `good first issue` or `help wanted`:
- Clear scope and requirements
- Mentorship available
- Good learning opportunities

---

## Communication

### Where to Ask Questions

**Discord (Fastest Response):**
- `#dev-discussion` - Technical discussions
- `#dev-help` - Help with setup or bugs
- `#general` - General questions

**GitHub Discussions:**
- Design proposals
- Architecture discussions
- Long-form technical debates

**GitHub Issues:**
- Bug reports
- Feature requests
- Specific actionable items

### Weekly Calls

**Developer Call (Wednesday, 3pm UTC):**
- Sprint planning
- PR reviews
- Technical discussions
- Join via Discord voice channel

**Community Call (Friday, 6pm UTC):**
- Project updates
- Community Q&A
- Demo new features

### Response Time Expectations

- **Critical bugs:** < 24 hours
- **Pull requests:** < 3 days for initial review
- **Issues:** < 1 week for triage
- **Discussions:** Best effort

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of:
- Age, body size, disability, ethnicity
- Gender identity and expression
- Experience level
- Nationality, personal appearance, race, religion
- Sexual identity and orientation

### Expected Behavior

- **Be respectful** - Treat others with respect and consideration
- **Be collaborative** - Work together to solve problems
- **Be patient** - Help newcomers learn and grow
- **Be constructive** - Provide helpful feedback
- **Be inclusive** - Welcome diverse perspectives

### Unacceptable Behavior

- Harassment, intimidation, or discrimination
- Trolling, insulting, or derogatory comments
- Personal or political attacks
- Publishing others' private information
- Other conduct inappropriate in a professional setting

### Enforcement

Violations will result in:
1. **Warning** - First offense, good faith mistake
2. **Temporary ban** - Repeated violations
3. **Permanent ban** - Severe or ongoing violations

Report violations to: connect@kuber-coin.com

---

## Development Workflow

### Daily Workflow

```bash
# Morning: Pull latest changes
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit frequently
git add .
git commit -m "feat: Add initial implementation"

# Keep branch updated
git fetch origin
git rebase origin/main

# Push and open PR
git push origin feature/my-feature
# Open PR on GitHub
```

### Commit Message Format

**Follow Conventional Commits:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(consensus): Add SegWit validation rules

Implement BIP141 and BIP143 validation for SegWit transactions.
Includes witness commitment validation and weight calculation.

Closes #234
```

```
fix(mempool): Resolve memory leak in transaction cache

The cache was not properly evicting old transactions, causing
memory usage to grow unbounded. Now evicts transactions older
than 24 hours.

Fixes #456
```

### Release Process

**Versioning (SemVer):**
- `MAJOR.MINOR.PATCH`
- `1.0.0` - Major release (breaking changes)
- `1.1.0` - Minor release (new features)
- `1.0.1` - Patch release (bug fixes)

**Release Checklist:**
1. Update `CHANGELOG.md`
2. Bump version in `Cargo.toml`
3. Create release branch: `release/v1.1.0`
4. Run full test suite
5. Tag release: `git tag v1.1.0`
6. Push tag: `git push origin v1.1.0`
7. CI/CD creates GitHub release with binaries
8. Announce on Discord, Twitter, blog

---

## Resources

### Documentation

- [README.md](README.md) - Project overview
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) - API reference
- [FAQ.md](docs/FAQ.md) - Frequently asked questions

### Learning Resources

**Rust:**
- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rustlings](https://github.com/rust-lang/rustlings/) - Interactive exercises

**Blockchain:**
- [Bitcoin Developer Guide](https://bitcoin.org/en/developer-guide)
- [Mastering Bitcoin](https://github.com/bitcoinbook/bitcoinbook) - Free ebook
- [Bitcoin Improvement Proposals (BIPs)](https://github.com/bitcoin/bips)

**Cryptography:**
- [Practical Cryptography for Developers](https://cryptobook.nakov.com/)
- [Applied Cryptography](https://www.schneier.com/books/applied-cryptography/) - Classic reference

### Tools

- [Rust Playground](https://play.rust-lang.org/) - Test Rust code online
- [crates.io](https://crates.io/) - Rust package registry
- [docs.rs](https://docs.rs/) - Rust documentation hosting

---

## FAQ

**Q: I'm new to Rust. Can I still contribute?**  
A: Yes! Start with `good first issue` labels and ask for help in Discord.

**Q: How long does PR review take?**  
A: Usually 1-3 days for initial review. Complex PRs may take longer.

**Q: Can I work on an issue someone else started?**  
A: Ask first. If there's no activity for 2 weeks, it's fair game.

**Q: Do I need to sign a CLA?**  
A: No. Kubercoin is MIT licensed with no CLA required.

**Q: How do I become a core contributor?**  
A: Contribute consistently for 3-6 months, show good judgment, and maintainers will invite you.

**Q: What if my PR is rejected?**  
A: Don't take it personally. We'll explain why and suggest alternatives.

---

## Thank You! 🙏

Thank you for contributing to Kubercoin! Every contribution, no matter how small, makes a difference.

**Questions?** Ask in Discord (#dev-help) or open a GitHub Discussion.

**Happy coding!** 🚀

---

**Version:** 1.0  
**Last Updated:** March 13, 2026  
**Maintainers:** @kubercoin/core-team
