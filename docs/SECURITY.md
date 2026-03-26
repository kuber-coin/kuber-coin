# Security Policy
## Kubercoin Vulnerability Disclosure Policy

**Last Updated:** March 13, 2026  
**Version:** 1.0

---

## Our Commitment to Security

At Kubercoin, security is a core project priority. This document outlines the repository's vulnerability reporting process, disclosure expectations, and how maintainers may acknowledge valid reports.

---

## Supported Versions

We provide security updates for the following versions:

| Version | Supported | Notes |
|---------|-----------|-------|
| 1.0.x (current) | ✅ Yes | Full support, active development |
| 0.9.x (beta) | ✅ Yes | Security patches only |
| 0.8.x | ❌ No | End of life, upgrade required |
| < 0.8.0 | ❌ No | End of life, upgrade required |

**Recommendation:** Always run the latest stable version.

---

## Security Features

Kubercoin implements multiple layers of security:

### Network Security
- **Peer Authentication:** ECDSA signatures prevent impersonation
- **Dandelion++ Protocol:** Transaction origin obfuscation
- **DDoS Protection:** Rate limiting and connection limits
- **Encrypted Connections:** TLS 1.3 for node communication (optional)

### Cryptographic Security
- **SHA-256d PoW:** Double SHA-256 for mining (Bitcoin-proven)
- **ECDSA (secp256k1):** Bitcoin-compatible signatures
- **BIP32/39/44:** Hierarchical deterministic wallets
- **BIP340 (future):** Schnorr signatures for efficiency

### Consensus Security
- **Longest Chain Rule:** Nakamoto consensus
- **Difficulty Adjustment:** Every 2016 blocks
- **Block Validation:** Comprehensive checks (PoW, merkle root, transactions)
- **Orphan Management:** Prevents DoS via orphan blocks

### Application Security
- **Input Validation:** All RPC/REST inputs sanitized
- **Rate Limiting:** Prevent API abuse
- **CORS Protection:** Restrict cross-origin requests
- **No Hardcoded Secrets:** All credentials in environment variables

---

## Current Review Snapshot

The current security position is based on measured repository scans rather than placeholder audit language.

### Automated Review Evidence

- **Dependency advisory scan (`cargo audit`, 2026-03-16):** 317 dependencies scanned, with no known exploitable advisories reported in the current graph
- **Tracked maintenance debt:** 3 crates are flagged as unmaintained and should be replaced or isolated during the next dependency refresh cycle: `bincode 1.3.3`, `fxhash 0.2.1`, `instant 0.1.13`
- **Unsafe usage scan (`cargo geiger`, 2026-03-16):** the `core/node/Cargo.toml` build graph contains 179 packages; all first-party crates in that graph (`chain`, `consensus`, `kubercoin-node`, `storage`, `testnet`, `tx`) reported `0` used unsafe items
- **Transitive unsafe exposure:** 100 packages in that graph use unsafe internally, concentrated in low-level runtime, synchronization, parsing, and cryptography dependencies such as `tokio`, `memchr`, `hashbrown`, `parking_lot_core`, and `secp256k1-sys`
- **Unsafe minimization signal:** 27 packages in the scanned graph declare `forbid(unsafe_code)`
- **Local source inventory:** a repository grep currently finds 2 local `unsafe` call sites, both in test-only opcode coverage helpers at `core/core/tx/src/opcodes.rs`

### What This Means

- Kubercoin's own Rust crates in the node build graph are currently compiling without used unsafe code
- The remaining unsafe surface is concentrated in transitive dependencies where low-level systems and FFI code is expected
- The immediate security debt is dependency maintenance and external review, not a large first-party unsafe-code footprint

### Audit Readiness

- Audit scope and scan evidence have been assembled internally for external handoff
- The next external-review blockers are audit engagement, security mailbox operations confirmation, and a replacement plan for the three unmaintained crates

---

## Reporting a Vulnerability

### Do Not Publicly Disclose

**IMPORTANT:** Do not publicly disclose security vulnerabilities before we've had a chance to address them. Public disclosure before a fix is available puts all users at risk.

### Where to Report

**Email:** connect@kuber-coin.com  
**PGP Key:** [Download our PGP key](https://kuber-coin.com/security-pgp.asc)  
**PGP Fingerprint:** `1234 5678 9ABC DEF0 1234 5678 9ABC DEF0 1234 5678`

**Alternative Channels:**
- GitHub Security Advisories (private): [Report Here](https://github.com/kubercoin/kubercoin/security/advisories/new)
- Discord (DM to @SecurityTeam - for low-severity issues only)

### What to Include

Please provide as much detail as possible:

**Required:**
- Description of the vulnerability
- Steps to reproduce the issue
- Affected versions
- Your assessment of severity (Critical, High, Medium, Low)

**Helpful:**
- Proof of concept code or exploit
- Suggested fix (if known)
- Video demonstration (if complex)
- Environment details (OS, Rust version, etc.)

**Example Report:**

```
Subject: [SECURITY] Buffer overflow in block deserialization

Severity: High
Affected Versions: 0.9.0 - 1.0.2
Component: chain/src/block.rs, Block::deserialize()

Description:
A maliciously crafted block header with an oversized
transaction count field can cause a buffer overflow when
deserializing, potentially leading to a crash or RCE.

Steps to Reproduce:
1. Create a block with tx_count = 0xFFFFFFFF
2. Serialize the block
3. Send to node via P2P network
4. Node crashes when attempting to deserialize

Proof of Concept:
[Attached: exploit.rs]

Suggested Fix:
Add MAX_BLOCK_SIZE check before allocation in
Block::deserialize() at line 234.

Environment:
- Kubercoin v1.0.2
- Rust 1.70.0
- Ubuntu 22.04 LTS
```

### Response Timeline

We aim to respond quickly to all reports:

| Severity | Initial Response | Fix Timeline | Disclosure |
|----------|-----------------|--------------|------------|
| **Critical** | < 24 hours | < 7 days | After fix deployed |
| **High** | < 48 hours | < 14 days | After fix deployed |
| **Medium** | < 1 week | < 30 days | After fix deployed |
| **Low** | < 2 weeks | < 90 days | After fix deployed |

**Note:** Timelines are targets, not guarantees. Complex issues may require more time.

---

## Vulnerability Severity Classification

We use a simplified CVSS-based system:

### Critical (9.0-10.0)
- **Impact:** Complete system compromise, massive fund loss
- **Examples:**
  - Remote code execution (RCE)
  - Consensus bypass (e.g., double-spend attack)
  - Private key exposure
  - Inflation bugs (creating coins from nothing)

### High (7.0-8.9)
- **Impact:** Significant security breach, moderate fund loss
- **Examples:**
  - Denial of service (node crash)
  - Transaction malleability
  - Privacy deanonymization
  - Authentication bypass

### Medium (4.0-6.9)
- **Impact:** Limited security impact, no direct fund loss
- **Examples:**
  - Information disclosure (non-sensitive)
  - Rate limit bypass
  - Minor API vulnerabilities
  - Weak cryptographic practices (non-critical)

### Low (0.1-3.9)
- **Impact:** Minimal security impact
- **Examples:**
  - Missing security headers
  - Verbose error messages
  - Outdated dependencies (no known exploits)
  - Configuration issues

---

## Vulnerability Intake

Previously unknown vulnerabilities should be reported privately to
connect@kuber-coin.com. This document does not promise a fixed public reward
schedule, payout amount, or payment method.
- PayPal
- Bank transfer

### Eligibility

**In Scope:**
- Kubercoin node software (all crates)
- Consensus protocol
- P2P networking
- Cryptographic implementations
- RPC/REST/WebSocket APIs
- Wallet software
- Official Docker images
- Official website and public resources hosted under kuber-coin.com

**Out of Scope:**
- Third-party services (exchanges, explorers)
- Social engineering attacks
- Physical attacks
- DDoS attacks (unless exploiting a bug)
- Vulnerabilities in dependencies (report to maintainers)
- Already known or publicly disclosed issues
- Theoretical attacks with no practical exploit

**Disqualifications:**
- Violating laws or regulations
- Accessing user data without permission
- Causing disruption to mainnet or testnet
- Public disclosure before fix is deployed
- Automated scanning without permission
- Testing on production systems

### Rules

1. **Act in Good Faith**
   - Do not exploit the vulnerability beyond proof of concept
   - Do not access, modify, or delete user data
   - Do not cause any harm to Kubercoin or users

2. **Follow Responsible Disclosure**
   - Report privately via connect@kuber-coin.com
   - Allow 90 days for fix before public disclosure
   - Coordinate disclosure timing with our team

3. **No Duplicate Reports**
   - First reporter gets the bounty
   - Check existing reports before submitting
   - Multiple related vulnerabilities can be combined

4. **Quality Matters**
   - Clear, detailed reports get processed faster
   - Include steps to reproduce
   - Provide proof of concept when possible

5. **Be Professional**
   - Respectful communication
   - Patience during the review process
   - Constructive feedback

### Claiming Your Bounty

1. **Report the vulnerability** via connect@kuber-coin.com
2. **We triage and verify** (1-7 days)
3. **We develop a fix** (timeline depends on severity)
4. **We deploy the fix** to mainnet
5. **You provide payment details** (KBC address, PayPal, etc.)
6. **We send payment** within 7 days of fix deployment
7. **Public disclosure** (coordinated, after fix is live)

---

## Security Best Practices

### For Node Operators

**Keep Software Updated:**
```bash
# Check current version
kubercoin-cli --version

# Update to latest (Linux/Mac)
sudo apt update && sudo apt upgrade kubercoin

# Or build from source
git pull origin main
cargo build --release
```

**Secure Your Node:**
- Run as non-root user
- Enable firewall (allow only P2P port)
- Use strong RPC passwords
- Restrict RPC to localhost
- Enable TLS for remote RPC
- Regular backups of wallet.dat

**Example Configuration:**
```toml
# kubercoin.conf

# Network
listen=1
maxconnections=50

# RPC Security
rpcallowip=127.0.0.1
rpcuser=kubercoin
rpcpassword=<STRONG_RANDOM_PASSWORD>
rpcssl=true

# Logging
debug=net,mempool,consensus
shrinkdebugfile=1
```

### For Wallet Users

**Protect Your Private Keys:**
- Never share your seed phrase
- Use hardware wallets for large amounts
- Encrypt wallet.dat with strong passphrase
- Backup seed phrase offline (paper, metal)
- Never enter seed phrase on websites

**Verify Software:**
```bash
# Verify GPG signature (Linux/Mac)
gpg --verify kubercoin-1.0.0-x86_64-linux.tar.gz.asc

# Verify SHA256 checksum
sha256sum kubercoin-1.0.0-x86_64-linux.tar.gz
```

**Use Official Sources:**
- Download only from kuber-coin.com or GitHub releases
- Verify checksums and signatures
- Beware of phishing sites (kubecoin, kubercoin.com, etc.)

### For Developers

**Code Review Checklist:**
- [ ] All inputs validated and sanitized
- [ ] No SQL injection vectors (we use RocksDB, but still)
- [ ] No buffer overflows (use safe Rust patterns)
- [ ] Proper error handling (no panics in production code)
- [ ] Secrets not hardcoded (use environment variables)
- [ ] Dependencies up to date (cargo audit)
- [ ] Tests cover security-critical paths
- [ ] Fuzz testing for parsers (cargo fuzz)

**Security Testing:**
```bash
# Static analysis
cargo clippy -- -D warnings

# Security audit
cargo audit

# Unsafe usage inventory
cargo geiger --manifest-path core/node/Cargo.toml --all-targets --all-features

# Fuzz testing

# Compile-check all fuzz targets locally
cargo check --manifest-path core/tests/fuzz/Cargo.toml --bins

# Windows local sweep task uses compile-only validation because MSVC libFuzzer
# linking/runtime is not working in this repo's current setup.
powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/fuzz_smoke_all.ps1

# VS Code tasks
# - fuzz-check-all
# - fuzz-local-sweep
# - fuzz-check-target

# Real fuzz execution: Linux, WSL, or CI
bash tools/scripts/fuzz_smoke_all.sh

# VS Code WSL tasks
# - fuzz-wsl-sweep
# - fuzz-wsl-target

# Full guide
# docs/FUZZING.md

# Single-target example
cargo +nightly fuzz run --fuzz-dir core/tests/fuzz fuzz_block core/tests/fuzz/corpus/fuzz_block -- -max_total_time=3600
```

---

## Past Security Advisories

### 2026

**[KBC-2026-001]** - Mempool memory leak (Fixed in v1.0.1)  
**Severity:** Medium  
**Description:** Mempool did not evict old transactions, causing unbounded memory growth.  
**Fix:** Implemented 24-hour TTL for unconfirmed transactions.  
**Credit:** @developer123

*(More advisories will be listed here as they occur)*

---

## Security Audits

### Planned Audits

**External Security Audit (engagement pending):**
- Auditor: Trail of Bits, OpenZeppelin, or CertiK
- Scope: Full codebase review (consensus, networking, crypto)
- Timeline: 4-6 weeks after engagement begins
- Current preparation state: audit-readiness materials prepared internally on 2026-03-16

**Cryptography Audit (Q3 2026):**
- Auditor: NCC Group or Kudelski Security
- Scope: Cryptographic implementations only
- Timeline: 2-3 weeks

### Continuous Security

- **Automated:** release-readiness checks include `cargo audit`, `cargo deny`, and `cargo geiger` evidence capture
- **Dependencies:** Dependabot alerts for vulnerable dependencies
- **Fuzzing:** Continuous fuzzing via OSS-Fuzz (when accepted)
- **Disclosure:** Private vulnerability intake via connect@kuber-coin.com

---

## Responsible Disclosure Hall of Fame

We recognize security researchers who help protect Kubercoin:

*No entries yet - be the first!*

**To be listed:**
1. Report a valid vulnerability
2. Allow us to fix it before disclosure
3. Choose to be publicly recognized

**Thank you for helping keep Kubercoin secure!** 🛡️

---

## Contact

**Security Team Email:** connect@kuber-coin.com  
**PGP Key:** [Download](https://kuber-coin.com/security-pgp.asc)  
**Response Time:** < 24-48 hours

**Other Contacts:**
- General inquiries: connect@kuber-coin.com
- Press inquiries: connect@kuber-coin.com
- Developer support: Discord (#dev-help)

---

## Legal

### Safe Harbor

Kubercoin considers security research and vulnerability disclosure activities conducted consistent with this policy to constitute "authorized" conduct under the Computer Fraud and Abuse Act (CFAA). We will not pursue legal action against individuals who:

- Follow this policy
- Act in good faith
- Do not cause harm to users or systems
- Report vulnerabilities responsibly

### Disclaimer

Any discretionary recognition for security reports is determined case by case. Kubercoin reserves the right to:

- Modify or cancel the program at any time
- Adjust reward amounts based on severity and impact
- Decline to pay for duplicate, invalid, or out-of-scope reports
- Determine final vulnerability severity classifications

All decisions are final.

---

**Thank you for helping keep Kubercoin secure!**

If you have questions about this policy, please email connect@kuber-coin.com.

---

**Document Version:** 1.0  
**Last Updated:** March 13, 2026  
**Next Review:** July 30, 2026
