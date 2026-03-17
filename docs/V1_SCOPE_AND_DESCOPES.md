# V1 Scope And Descopes

The first credible release should be a correct, networked, auditable L1 proof-of-work chain.

## In Scope For V1

- [x] multi-node peer discovery and block sync
- [x] canonical cumulative-work chain selection
- [x] one authoritative block-validation path
- [x] real proof-of-work mining
- [x] persistent chain and transaction indexes
- [x] API auth and rate limiting enabled by default outside explicit local-dev mode
- [x] mempool relay policy, fee estimation, and eviction documented and enforced
- [x] documented release, upgrade, rollback, and incident procedures
- [ ] public adversarial testnet before any mainnet discussion

## Out Of Scope For V1

The following are explicitly deferred. They may be reconsidered only after the public testnet meets multi-week stability goals.

### Lightning

Lightning library code (`lightning/` crate) exists but is **not wired into the node runtime**. It remains a standalone library until requalification criteria below are all met.

### Web and dashboard apps

Seven web apps exist (explorer-web, wallet-web, ops-web, monitoring-web, dapp-web, docs-web, web-unified). Only `explorer-web` and `wallet-web` are tested in CI. Feature work on all web apps is **frozen** until L1 testnet stability is confirmed. Bug fixes and security patches remain allowed.

### Other deferred items

- Advanced multisig expansion beyond already-stable paths
- Exchange and ecosystem feature pressure before L1 stability
- Non-essential dashboard, tooling, and side-tool feature work

## Requalification Rules For Deferred Work

Lightning may re-enter scope only when:

- [ ] channel state transitions are complete and restart-safe
- [ ] commitment and revocation flows are tested end-to-end
- [ ] routing is complete and failure-tested
- [ ] persistence and breach handling are proven in multi-node tests

Additional platform work may re-enter scope only after:

- [ ] multi-week public testnet stability
- [ ] no active consensus blockers
- [ ] deterministic release process
- [ ] audit readiness is preserved

## Decision Rule

If a feature competes with networking, consensus correctness, mining correctness, storage correctness, or audit readiness, the feature loses.