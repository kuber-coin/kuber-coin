// modules/vm.bicep — Reusable Ubuntu VM module for KuberCoin seed nodes
// Provisions: public IP, NIC (with NSG), and a Standard_B1ms Ubuntu 22.04 VM
// with cloud-init startup script.

@description('Azure region')
param location string

@description('Name for the VM and related resources')
param vmName string

@description('VM SKU')
param vmSize string = 'Standard_B1ms'

@description('OS disk size in GB')
param osDiskSizeGB int = 30

@description('Admin username')
param adminUsername string

@description('SSH public key for admin access')
@secure()
param adminSshPublicKey string

@description('Resource ID of the NSG to attach to the NIC')
param nsgId string

@description('Base64-encoded cloud-init script')
@secure()
param cloudInitData string

@description('Tags applied to all resources')
param tags object = {}

// ── Public IP ────────────────────────────────────────────────────────────────

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-01-01' = {
  name: '${vmName}-pip'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: vmName
    }
  }
}

// ── Virtual Network + Subnet ──────────────────────────────────────────────────

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: '${vmName}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'default'
        properties: {
          addressPrefix: '10.0.0.0/24'
          networkSecurityGroup: {
            id: nsgId
          }
        }
      }
    ]
  }
}

// ── Network Interface ─────────────────────────────────────────────────────────

resource nic 'Microsoft.Network/networkInterfaces@2024-01-01' = {
  name: '${vmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: publicIp.id
          }
          subnet: {
            id: vnet.properties.subnets[0].id
          }
        }
      }
    ]
  }
}

// ── Virtual Machine ───────────────────────────────────────────────────────────

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: vmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        diskSizeGB: osDiskSizeGB
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: adminSshPublicKey
            }
          ]
        }
      }
      customData: cloudInitData
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('Allocated public IP address')
output publicIpAddress string = publicIp.properties.ipAddress

@description('VM resource ID')
output vmId string = vm.id
