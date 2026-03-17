# Launch Checklist

This document is the final pre-launch gate. Every item must be verified
before announcing mainnet availability. Treat early mainnet as operational
hardening with conservative expectations.

Track implementation status and evidence directly in this checklist and the linked source documents before marking checklist rows complete.

## Pre-Launch Verification

### Code Readiness

| # | Check | Status | Verified By |
|---|-------|--------|-------------|
| 1 | `cargo check --workspace` passes | [x] | Local + CI: 2026-03-16, 0 errors |
| 2 | `cargo test --workspace` passes (0 failures) | [x] | Local + CI: 2026-03-16, 1,334/1,334 passed; multi-node convergence: 6/6 passed |
| 3 | `cargo clippy --workspace` passes (0 warnings) | [x] | Local: 2026-03-16, 0 warnings |
| 4 | `cargo deny check` passes (no banned/unmaintained crates) | [x] | Local: 2026-03-16, advisories ok, bans ok, licenses ok |
| 5 | Reproducible build job passes (two builds, same SHA256) | [ ] | CI job configured in `.github/workflows/ci.yml` and tag release workflow `.github/workflows/release.yml` (`reproducible-build`); awaiting first green reviewer-visible run |
| 6 | Upgrade/rollback CI job passes | [ ] | CI job configured in `.github/workflows/ci.yml` and tag release workflow `.github/workflows/release.yml` (`upgrade-rollback`); awaiting first green reviewer-visible run |
| 7 | All adversarial tests pass (`adversarial_tests.rs`, 23 tests) | [x] | CI |
| 8 | Release branch cut from verified commit | [ ] | Maintainer |

### Consensus Freeze

| # | Check | Status |
|---|-------|--------|
| 9 | `docs/CONSENSUS_FREEZE.md` reviewed and current | [x] | Reviewed 2026-03-16: consensus params, genesis values, BIP list verified current |
| 10 | No pending PRs touching consensus-critical files | [x] | Local: no open PRs |
| 11 | Genesis block hash matches documented value | [x] | state.rs CHECKPOINTS match testnet/src/genesis.rs nonces (verified session 4) |
| 12 | Difficulty adjustment verified over >2016 blocks on testnet | [x] | Local: 2026-03-16, `cargo test -p kubercoin-node test_testnet_retarget_changes_bits_after_full_period`, `cargo test -p kubercoin-node test_testnet_min_difficulty_and_recovery_use_candidate_timestamp` |
| 13 | Halving verified at block 210,000 on regtest | [x] | Local: 2026-03-16, `cargo test -p testnet test_regtest_uses_canonical_halving_interval`, `cargo test -p consensus test_validate_block_halved_subsidy_after_210000_blocks`, `cargo test -p consensus test_validate_block_pre_halved_subsidy_rejected_post_halving`, `cargo test --test node_integration test_regtest_halving_schedule_matches_canonical_consensus_boundary` |

### Infrastructure

| # | Check | Status |
|---|-------|--------|
| 14 | Mainnet DNS seeds resolve correctly | [ ] | Pending production DNS provisioning |
| 15 | At least 3 seed nodes operational and reachable | [x] | Multi-node public testnet active 2026-03 |
| 16 | Prometheus + Grafana monitoring operational | [x] | Monitoring stack validated on the active testnet environment |
| 17 | All 10 alert rules loaded and firing correctly on test | [ ] | Alert pack reconciled to 10 live rules on 2026-03-16; `tools/scripts/e2e_live.ps1` now validates the full rule set, but a firing test run is still pending |
| 18 | Bootstrap proof procedure completed on clean node | [ ] | Needs verification |
| 19 | Explorer HTTP API responding on public endpoint | [ ] | In progress |

### Security

| # | Check | Status |
|---|-------|--------|
| 20 | Audit scope package assembled for auditor delivery | [ ] | Audit-readiness materials prepared locally on 2026-03-16; delivery pending external audit engagement |
| 21 | No unresolved critical or high-severity audit findings | [ ] | Pending external audit |
| 22 | API authentication enforced (keys required on mainnet) | [x] | rpc.rs: Bearer token auth enforced when KUBERCOIN_API_KEYS set |
| 23 | Rate limiting active on HTTP and RPC | [x] | rpc.rs: per-IP rate limiting middleware active |
| 24 | Peer ban scoring active | [x] | network/server.rs: misbehaviour scoring + IP ban at threshold 100 |
| 25 | Security contact (connect@kuber-coin.com) monitored | [ ] | Needs ops confirmation |

### Documentation

| # | Check | Status |
|---|-------|--------|
| 26 | `docs/MAINNET_POLICY.md` published | [x] | docs/MAINNET_POLICY.md exists and current |
| 27 | `docs/INCIDENT_RESPONSE.md` reviewed | [x] | Reviewed 2026-03-16, procedures current |
| 28 | `docs/GETTING_STARTED.md` tested by non-author | [ ] | Needs external tester |
| 29 | `docs/MINING_GUIDE.md` tested by non-author | [ ] | Needs external tester |
| 30 | `CHANGELOG.md` updated for release version | [x] | CHANGELOG updated to v1.0.19, 2026-03-16 |

### Release Artifacts

| # | Check | Status |
|---|-------|--------|
| 31 | Binary builds for all 5 targets (linux-amd64, linux-arm64, macos-amd64, macos-arm64, windows-amd64) | [ ] | Tag release workflow configured in `.github/workflows/release.yml` (`build` matrix); awaiting first green tagged release |
| 32 | Docker image built and pushed | [ ] | Tag release workflow configured in `.github/workflows/release.yml` (`docker` job pushes `ghcr.io/kubercoin/kubercoin:${tag}` and `latest`); awaiting first green tagged release |
| 33 | `SHA256SUMS` file generated and published | [ ] | Tag release workflow configured in `.github/workflows/release.yml` (`release` job generates combined checksums); awaiting first green tagged release |
| 34 | SLSA attestation attached to release | [ ] | Tag release workflow configured in `.github/workflows/release.yml` via `actions/attest-build-provenance@v2`; awaiting first tagged release artifact proof |
| 35 | GitHub Release created with release notes | [ ] | Tag release workflow configured in `.github/workflows/release.yml` via `softprops/action-gh-release@v2`; awaiting first published tagged release |

## Launch Day Runbook

### T-24 Hours

1. Cut release branch from last green CI commit.
2. Run full test suite locally: `cargo test --workspace -- --test-threads=1`
3. Build release binaries via `scripts/release.ps1` or CI.
4. Verify SHA256 checksums match reproducible build.
5. Deploy release binary to all seed nodes (do not start).
6. Notify core team of launch window.

### T-1 Hour

1. Verify seed node hardware health (disk, RAM, CPU).
2. Verify monitoring stack is operational (Prometheus, Grafana, alerts).
3. Test alert pipeline: manually trigger `KubercoinNodeDown` and verify notification.
4. Confirm incident response contacts are available.
5. Pre-stage rollback binary (previous release) on all seed nodes.

### T-0: Launch

1. Start seed nodes sequentially: seed1, seed2, then seed3.
2. Wait for seeds to peer with each other (verify via `kubercoin_peers` metric).
3. Verify genesis block hash matches across all seeds.
4. Open P2P ports to public network.
5. Announce mainnet availability on published channels.
6. Monitor dashboards continuously for first 4 hours.

### T+1 Hour

1. Verify at least one non-seed node has connected and synced.
2. Verify `kubercoin_block_height` is advancing (mining active).
3. Verify no `KubercoinTipDivergence` alerts.
4. Check mempool is accepting transactions.

### T+24 Hours

1. Review all alert history — no critical alerts should have fired.
2. Verify chain has not stalled (blocks advancing ~6/hour).
3. Verify peer count is growing or stable.
4. Post 24-hour status update.

## Emergency Rollback Procedure

If a critical issue is discovered after launch:

### Severity Assessment

| Condition | Action |
|-----------|--------|
| Consensus bug (wrong blocks accepted/rejected) | Immediate rollback |
| Supply integrity bug (inflation/destruction) | Immediate rollback |
| Crash bug (nodes crash but chain is correct) | Hot-patch, no rollback |
| Performance issue (slow but correct) | Monitor, patch in next release |
| Network isolation (seeds unreachable) | Fix infrastructure, no code rollback |

### Rollback Steps

1. **Announce halt** on all channels: "Mainnet paused for emergency maintenance."
2. **Stop all seed nodes:**
   ```bash
   docker compose down        # if Docker
   systemctl stop kubercoin   # if systemd
   ```
3. **Preserve state** — copy data directories before any changes:
   ```bash
   cp -r /var/lib/kubercoin /var/lib/kubercoin.backup.$(date +%s)
   ```
4. **Deploy rollback binary** — replace with previous known-good release.
5. **Assess chain state:**
   - If chain is valid: restart with rollback binary, resume normal operation.
   - If chain is corrupted: coordinate with operators to roll back to a known-good height
     using `--reindex` or manual state truncation.
6. **Restart seed nodes** with rollback binary.
7. **Verify** seed nodes peer, agree on tip, and chain advances.
8. **Announce resolution** with post-mortem timeline.

### Communication Paths

| Channel | Purpose | Owner |
|---------|---------|-------|
| GitHub Issues | Bug reports, technical discussion | Maintainers |
| connect@kuber-coin.com | Vulnerability reports | Security lead |
| Status page | Operational status | Ops lead |
| Release notes | Patch announcements | Release manager |

## Conservative Operating Posture

For the first 90 days of mainnet operation:

- **Miner expectations:** Start with 1-3 known miners. Do not promise hash rate targets.
- **Operator expectations:** Start with seed nodes only. Welcome external operators
  but do not count on them for network stability.
- **Value expectations:** Make no claims about coin value. This is a technical launch.
- **Feature freezes:** No consensus changes for at least 6 months after launch.
  Non-consensus features may continue development.
- **Monitoring cadence:** Check dashboards at least every 4 hours for the first week,
  then at least twice daily for the first month.
- **Incident readiness:** At least one core developer reachable within 30 minutes
  at all times during the first 30 days.

## Post-Launch Milestones

| Milestone | Criteria | Unlocks |
|-----------|----------|---------|
| 1 week stable | No P0/P1 incidents, chain advancing | Announce to broader community |
| 30 days stable | No consensus issues, >5 peers consistently | Reduce monitoring cadence |
| 90 days stable | No rollbacks, difficulty adjusted multiple times | Consider feature development |
| 6 months stable | No consensus changes needed | Consider exchange listing discussions |
