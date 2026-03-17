// modules/nsg.bicep — Network Security Group for KuberCoin seed nodes
// Opens only the ports required for P2P, RPC, HTTP API, and optional monitoring.

@description('Azure region for the NSG')
param location string

@description('Name for the NSG resource')
param nsgName string = 'nsg-kubercoin-seed'

@description('Open monitoring ports (3000 Grafana, 9092 Prometheus) — only for seed2')
param enableMonitoring bool = false

@description('Tags to apply to the NSG')
param tags object = {}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: nsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      // ── Management ──────────────────────────────────────────────────────
      {
        name: 'allow-ssh'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '22'
          description: 'SSH management access'
        }
      }
      // ── KuberCoin P2P ────────────────────────────────────────────────────
      {
        name: 'allow-p2p'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '18633'
          description: 'KuberCoin testnet P2P'
        }
      }
      // ── RPC API ──────────────────────────────────────────────────────────
      {
        name: 'allow-rpc'
        properties: {
          priority: 120
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '8332'
          description: 'KuberCoin JSON-RPC'
        }
      }
      // ── HTTP REST API ─────────────────────────────────────────────────────
      {
        name: 'allow-http-api'
        properties: {
          priority: 130
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '8080'
          description: 'KuberCoin HTTP REST API'
        }
      }
      // ── Prometheus metrics scrape ─────────────────────────────────────────
      {
        name: 'allow-metrics'
        properties: {
          priority: 140
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '9091'
          description: 'KuberCoin Prometheus metrics endpoint'
        }
      }
      // ── Monitoring stack (seed2 only) ─────────────────────────────────────
      {
        name: 'allow-grafana'
        properties: {
          priority: 150
          direction: 'Inbound'
          access: enableMonitoring ? 'Allow' : 'Deny'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '3000'
          description: 'Grafana dashboard'
        }
      }
      {
        name: 'allow-prometheus'
        properties: {
          priority: 160
          direction: 'Inbound'
          access: enableMonitoring ? 'Allow' : 'Deny'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '9092'
          description: 'Prometheus UI'
        }
      }
    ]
  }
}

@description('Resource ID of the created NSG')
output nsgId string = nsg.id
