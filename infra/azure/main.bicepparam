// main.bicepparam — KuberCoin testnet example deployment parameters
// Usage: azd up  (azd reads this and injects AZURE_ENV_NAME / AZURE_LOCATION automatically)
//
// IMPORTANT: Set adminSshPublicKey before deploying.
// Run: ssh-keygen -t ed25519 -C "kubercoin-testnet"
//      Then paste the contents of ~/.ssh/id_ed25519.pub below.
//
// This parameter file is safe to publish because it contains no secrets.

using 'main.bicep'

// azd injects these automatically — keep as-is
param environmentName = readEnvironmentVariable('AZURE_ENV_NAME', 'kubercoin-testnet')
param location = readEnvironmentVariable('AZURE_LOCATION', 'eastus')
param resourceGroupName = 'rg-${readEnvironmentVariable('AZURE_ENV_NAME', 'kubercoin-testnet')}'

// Operational settings
param location2 = 'westeurope'
param vmSize = 'Standard_B1ms'
param osDiskSizeGB = 30
param adminUsername = 'azureuser'

// REQUIRED — paste your SSH public key here before running azd up
// Example: 'ssh-ed25519 AAAA... user@host'
param adminSshPublicKey = ''

param tags = {
  project: 'kubercoin'
  managedBy: 'azd'
  environment: 'testnet'
}

