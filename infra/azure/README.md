# Azure Testnet Template

This folder contains example Azure infrastructure for a KuberCoin testnet-style
deployment using Azure Developer CLI (`azd`) and Bicep.

It is intended as a sanitized reference template, not as a production-ready or
internal-ops source of truth.

## Boundary Rules

- Do not commit secrets, passwords, SSH private keys, or live credentials.
- Keep deployment-time secrets in the environment or in secure operator-managed
  secret stores.
- Treat cloud-init and repair scripts here as examples that require operator
  review before use.
- Keep hostnames and DNS instructions generic unless a public hostname is
  intentionally part of the published protocol surface.

## Generated Artifacts

The compiled ARM template `main.json` is intentionally not tracked. Regenerate
it locally if needed:

```bash
az bicep build --file infra/azure/main.bicep --outfile infra/azure/main.json
```

## Deploy

```bash
azd env new kubercoin-testnet
azd up
```

Before deploying, review:

- `main.bicepparam`
- `cloud-init.sh`
- `cloud-init-monitoring.sh`
- `fix_seed1.sh`
- `fix_seed2.sh`