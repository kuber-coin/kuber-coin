// main.bicep — KuberCoin testnet root deployment
// Provisions two seed VMs in different regions (East US + West Europe)
// with public IPs, NSGs, cloud-init startup scripts, and a User-Assigned
// Managed Identity. Complies with azd mandatory deployment rules.
//
// Deploy:
//   azd env new kubercoin-testnet
//   azd up

targetScope = 'subscription'

// ── azd-required parameters ───────────────────────────────────────────────────
@description('azd environment name — injected automatically by azd as AZURE_ENV_NAME')
param environmentName string

@description('Primary Azure region — injected automatically by azd as AZURE_LOCATION')
param location string = 'eastus'

@description('Primary resource group name')
param resourceGroupName string = 'rg-${environmentName}'

// ── Operational parameters ────────────────────────────────────────────────────
@description('Secondary Azure region for seed2 + monitoring stack')
param location2 string = 'westeurope'

@description('VM SKU for both seed nodes')
param vmSize string = 'Standard_B1ms'

@description('OS disk size in GB')
param osDiskSizeGB int = 30

@description('SSH admin username')
param adminUsername string = 'kubercoin'

@description('SSH public key for admin access')
@secure()
param adminSshPublicKey string

@description('Additional resource tags')
param tags object = {
  project: 'kubercoin'
  managedBy: 'azd'
}

// ── Computed tags ─────────────────────────────────────────────────────────────

var allTags = union(tags, { network: environmentName })

// ── Primary resource group (azd-env-name tag mandatory on RG only) ───────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: union(allTags, { 'azd-env-name': environmentName })
}

// ── User-Assigned Managed Identity (mandatory azd rule) ───────────────────────

module identity 'modules/identity.bicep' = {
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    tags: allTags
  }
}

// ── Cloud-init content (base64-encoded) ──────────────────────────────────────

var cloudInitSeed1 = loadFileAsBase64('cloud-init.sh')
var cloudInitSeed2 = loadFileAsBase64('cloud-init-monitoring.sh')

// ── Seed 1 (East US — P2P seed only) ─────────────────────────────────────────

module nsg1 'modules/nsg.bicep' = {
  scope: rg
  params: {
    location: location
    nsgName: 'nsg-kubercoin-seed1'
    enableMonitoring: false
    tags: allTags
  }
}

module vm1 'modules/vm.bicep' = {
  scope: rg
  params: {
    location: location
    vmName: 'kubercoin-seed1'
    vmSize: vmSize
    osDiskSizeGB: osDiskSizeGB
    adminUsername: adminUsername
    adminSshPublicKey: adminSshPublicKey
    nsgId: nsg1.outputs.nsgId
    cloudInitData: cloudInitSeed1
    tags: union(allTags, { role: 'seed1' })
  }
}

// ── Seed 2 (West Europe — seed + Prometheus + Grafana) ───────────────────────

module nsg2 'modules/nsg.bicep' = {
  scope: rg
  params: {
    location: location2
    nsgName: 'nsg-kubercoin-seed2'
    enableMonitoring: true
    tags: allTags
  }
}

module vm2 'modules/vm.bicep' = {
  scope: rg
  params: {
    location: location2
    vmName: 'kubercoin-seed2'
    vmSize: vmSize
    osDiskSizeGB: osDiskSizeGB
    adminUsername: adminUsername
    adminSshPublicKey: adminSshPublicKey
    nsgId: nsg2.outputs.nsgId
    cloudInitData: cloudInitSeed2
    tags: union(allTags, { role: 'seed2-monitoring' })
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Resource Group resource ID — required by azd')
output RESOURCE_GROUP_ID string = rg.id

@description('Public IP address of seed node 1 (East US)')
output seed1PublicIp string = vm1.outputs.publicIpAddress

@description('Public IP address of seed node 2 (West Europe)')
output seed2PublicIp string = vm2.outputs.publicIpAddress

@description('DNS A record to create: testnet-seed.kuber-coin.com → seed1PublicIp')
output dnsSeed1Instruction string = 'Add A record: testnet-seed.kuber-coin.com → ${vm1.outputs.publicIpAddress}'

@description('DNS A record to create: testnet2.kuber-coin.com → seed2PublicIp')
output dnsSeed2Instruction string = 'Add A record: testnet2.kuber-coin.com → ${vm2.outputs.publicIpAddress}'

@description('Grafana dashboard URL (seed2)')
output grafanaUrl string = 'http://${vm2.outputs.publicIpAddress}:3000'

@description('Prometheus URL (seed2)')
output prometheusUrl string = 'http://${vm2.outputs.publicIpAddress}:9092'
