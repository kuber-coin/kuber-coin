# Open-Source Boundary

This repository is intended to keep trust-critical cryptocurrency components public while treating operator-only tooling and deployment infrastructure as a separate review surface.

## Public By Default

These areas should remain open-source because users, auditors, exchanges, and integrators need to verify correctness and key-handling behavior:

- `core/core/chain/` — canonical chain and UTXO state
- `core/core/consensus/` — consensus rules, difficulty, checkpoints, version bits
- `core/core/tx/` — transactions, scripts, signatures, wallet primitives
- `core/core/storage/` — persistence for chain state and UTXO data
- `core/node/src/` — full node, RPC, networking, mempool, mining
- `apps/web/wallet/` — user-facing wallet code
- `apps/web/explorer/` — explorer UI and related chain presentation logic
- `apps/sdk/packages/js/` — public SDK surface for downstream apps
- `core/services/eip_signing/` and `core/services/lightning/` — protocol-facing extension services
- `specs/` — formal and protocol specifications

## Public After Sanitization

These areas can stay public if they are presented as templates or examples and do not expose operator assumptions, weak defaults, or internal-only workflow details:

- `infra/azure/`
- `infra/k8s/`
- `infra/helm/`
- `infra/caddy/`
- `docker-compose*.yml`
- `tools/scripts/launch_mainnet.*`
- `tools/scripts/genesis_ceremony.*`
- `docs/SEED_INFRASTRUCTURE.md`

Required sanitization rules:

- Do not commit secrets, keys, passwords, access tokens, or private credentials.
- Use placeholders or environment variables for deployment-time secrets.
- Avoid default credentials that could be copied into public deployments.
- Prefer neutral/example hostnames where a live topology is not required.
- Mark operator-only scripts and dashboards clearly so they are not mistaken for end-user products.

## Internal Or Operator-Only Surfaces

These areas are not part of the public trust boundary and should either stay private or be published only with explicit internal/example labeling:

- `apps/web/ops/` — operator dashboard and internal RPC/metrics tooling
- deployment remediation scripts under `infra/azure/` and `tools/scripts/`
- backup/restore automation that reveals provider-specific operational assumptions

## Publication Checklist

Before a public release:

1. Verify all trust-critical components remain public and buildable.
2. Verify no committed file contains secrets or machine-local credentials.
3. Review deployment examples for weak defaults and remove them.
4. Confirm operator-only surfaces are clearly labeled or excluded.
5. Normalize repository references, org names, and example placeholders.