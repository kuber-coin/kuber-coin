// modules/identity.bicep — User-Assigned Managed Identity for KuberCoin testnet
// Required by azd mandatory deployment rules.
// v1.0

@description('Azure region for the managed identity')
param location string

@description('Environment name — used to name the identity')
param environmentName string

@description('Tags to apply')
param tags object = {}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-kubercoin-${environmentName}'
  location: location
  tags: tags
}

@description('Resource ID of the managed identity')
output identityId string = managedIdentity.id

@description('Client ID of the managed identity')
output identityClientId string = managedIdentity.properties.clientId

@description('Principal ID of the managed identity')
output identityPrincipalId string = managedIdentity.properties.principalId
