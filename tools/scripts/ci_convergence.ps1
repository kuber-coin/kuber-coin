param()

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

Push-Location $RepoRoot
try {
  & $Cargo test --test node_integration multi_node_convergence
  if ($LASTEXITCODE -ne 0) {
    throw 'Multi-node convergence test failed'
  }
} finally {
  Pop-Location
}